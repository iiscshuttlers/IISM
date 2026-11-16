import { useEffect } from "react";
import { navigate } from "wouter/use-browser-location";
import { supabase } from "./supabase";

/** Public VAPID key (base64url). Without it the phone-alerts switch is hidden. */
export const VAPID_PUBLIC_KEY = ((import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? "").trim();

/** What the phone-alerts switch can do on this device. */
export type PushSupport = "not-configured" | "needs-install" | "unsupported" | "ok";
/** Whether this phone gets alerts for the signed-in person. */
export type PushState = "on" | "off" | "blocked";

export interface PushEnv {
  vapidKey: string;
  userAgent: string;
  maxTouchPoints: number;
  /** Opened from the Home Screen (installed), not a browser tab. */
  standalone: boolean;
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
}

/** iPhone, iPod or iPad (iPadOS reports itself as a Mac with a touch screen). */
export function isIosDevice(userAgent: string, maxTouchPoints = 0): boolean {
  return /iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

export function pushSupport(env: PushEnv): PushSupport {
  if (!env.vapidKey) return "not-configured";
  // On iPhone and iPad, Web Push works only in the app added to the Home Screen (iOS 16.4+).
  if (isIosDevice(env.userAgent, env.maxTouchPoints) && !env.standalone) return "needs-install";
  return env.serviceWorker && env.pushManager && env.notification ? "ok" : "unsupported";
}

export function currentPushEnv(): PushEnv {
  const hasWindow = typeof window !== "undefined";
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return {
    vapidKey: VAPID_PUBLIC_KEY,
    userAgent: nav?.userAgent ?? "",
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    standalone: hasWindow && (window.matchMedia?.("(display-mode: standalone)").matches
      || (nav as { standalone?: boolean } | undefined)?.standalone === true),
    serviceWorker: !!nav && "serviceWorker" in nav,
    pushManager: hasWindow && "PushManager" in window,
    notification: hasWindow && "Notification" in window,
  };
}

export function base64UrlToBytes(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Whether a subscription was made with this server key (false after the keys are rotated). */
export function sameKey(current: ArrayBuffer | null | undefined, key: Uint8Array): boolean {
  if (!current) return false;
  const a = new Uint8Array(current);
  return a.length === key.length && a.every((b, i) => b === key[i]);
}

// The endpoint this phone last saved, and for whom, so a rotated subscription can be re-saved.
const SAVED_KEY = "push.saved";
type Saved = { person: string; endpoint: string };
function readSaved(): Saved | null {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "null") as Saved | null; } catch { return null; }
}
function writeSaved(v: Saved | null) {
  try {
    if (v) localStorage.setItem(SAVED_KEY, JSON.stringify(v));
    else localStorage.removeItem(SAVED_KEY);
  } catch { /* storage unavailable */ }
}

const NOT_READY = "The app is still installing on this phone. Wait a few seconds and try again.";

async function registration(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(NOT_READY)), 10_000); });
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function subscribe(reg: ServiceWorkerRegistration): Promise<PushSubscription> {
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) as BufferSource });
}

function save(sub: PushSubscription, personId: string, campId: string) {
  const keys = sub.toJSON().keys ?? {};
  return supabase.from("push_subscriptions").upsert(
    { person_id: personId, camp_id: campId, endpoint: sub.endpoint, p256dh: keys.p256dh ?? "", auth: keys.auth ?? "" },
    { onConflict: "endpoint" },
  );
}

function friendly(e: unknown): Error {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (msg.includes("too_many_devices")) {
    return new Error("Alerts are already on for 10 phones. Turn them off on a phone you no longer use.");
  }
  return e instanceof Error ? e : new Error(msg);
}

/**
 * Turns alerts on for this phone. Call straight from the tap: iPhones only show the permission
 * prompt for a direct user action, so this asks before doing anything else.
 */
export async function turnOnPush(personId: string, campId: string): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "blocked";
  if (permission !== "granted") return "off";
  try {
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub.options.applicationServerKey, base64UrlToBytes(VAPID_PUBLIC_KEY))) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await subscribe(reg);
    let { error } = await save(sub, personId, campId);
    if (error && (error.code === "42501" || error.code === "23505")) {
      // Someone else turned alerts on with this phone before: start a fresh registration.
      await sub.unsubscribe();
      sub = await subscribe(reg);
      ({ error } = await save(sub, personId, campId));
    }
    if (error) throw error;
    writeSaved({ person: personId, endpoint: sub.endpoint });
    return "on";
  } catch (e) {
    throw friendly(e);
  }
}

/** Turns alerts off for this phone. Always succeeds locally; the camp database copy is removed
 *  now if online, or by the send-push function the next time it gets "gone" for this phone. */
export async function turnOffPush(): Promise<void> {
  writeSaved(null);
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint).then(() => undefined, () => undefined);
  await sub.unsubscribe().catch(() => false);
}

/** Current state for the switch: on only if this phone is subscribed and saved for this person. */
export async function readPushState(personId: string): Promise<PushState> {
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "off";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return "off";
  const { data, error } = await supabase.from("push_subscriptions").select("endpoint").eq("endpoint", sub.endpoint).maybeSingle();
  if (error) {
    // Offline: trust what this phone saved last.
    const saved = readSaved();
    return saved?.person === personId && saved.endpoint === sub.endpoint ? "on" : "off";
  }
  return data ? "on" : "off";
}

/**
 * Keeps an opted-in phone's registration current: browsers occasionally replace it, the site's
 * key may be rotated, and the service worker can't save a new one itself (it isn't signed in).
 * Runs once per app start.
 */
export function useKeepPushSubscription(personId: string | null | undefined, campId: string | undefined) {
  useEffect(() => {
    if (!personId || !campId || pushSupport(currentPushEnv()) !== "ok") return;
    const saved = readSaved();
    if (saved?.person !== personId || Notification.permission !== "granted") return;
    (async () => {
      const reg = await registration();
      let sub = await reg.pushManager.getSubscription();
      // The site's VAPID key changed: the old registration no longer works.
      if (sub && !sameKey(sub.options.applicationServerKey, base64UrlToBytes(VAPID_PUBLIC_KEY))) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await subscribe(reg);
      if (sub.endpoint === saved.endpoint) return;
      const { error } = await save(sub, personId, campId);
      if (!error) writeSaved({ person: personId, endpoint: sub.endpoint });
    })().catch(() => undefined);
  }, [personId, campId]);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The match a match alert points at (`/matches?match=<id>`), or null. */
export function alertedMatchId(search: string): string | null {
  const id = new URLSearchParams(search).get("match")?.trim();
  return id && UUID.test(id) ? id.toLowerCase() : null;
}

/** Tapping an alert while the app is open: the service worker asks the app to go there. */
export function listenForAlertTaps() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (e: MessageEvent) => {
    const d = e.data as { type?: string; url?: string } | null;
    if (d?.type !== "push-open" || typeof d.url !== "string") return;
    const u = new URL(d.url, window.location.href);
    if (u.origin === window.location.origin) navigate(u.pathname + u.search + u.hash);
  });
}
