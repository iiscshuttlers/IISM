// send-push: delivers phone alerts (Web Push).
//
// The database calls this through pg_net (see supabase/migrations/0006_push.sql) after a match
// alert, a new announcement or the squad being published. The call says who should be alerted
// and what the alert says; this function looks up their phones, sends to each one, and forgets
// phones the push service says are gone (404/410).
//
// Secrets (supabase secrets set …): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
// PUSH_WEBHOOK_SECRET. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// Deploy with --no-verify-jwt: the database authenticates with the x-push-secret header instead.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildPushRequest, isPushEndpoint, timingSafeEqual, type PushOptions, type VapidKeys } from "./webpush.ts";

interface Alert {
  camp_id: string;
  recipients: string[];
  title: string;
  body: string;
  url: string;
  tag: string | null;
  urgency: NonNullable<PushOptions["urgency"]>;
  ttl: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URGENCIES = ["very-low", "low", "normal", "high"] as const;

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function parseAlert(raw: unknown): Alert | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const recipients = Array.isArray(a.recipients)
    ? [...new Set(a.recipients.filter((r): r is string => typeof r === "string" && UUID.test(r)))]
    : [];
  const title = text(a.title, 120);
  const url = text(a.url, 300);
  if (!recipients.length || recipients.length > 1000 || !title || !url.startsWith("/")) return null;
  const urgency = URGENCIES.find((u) => u === a.urgency) ?? "normal";
  const ttl = typeof a.ttl === "number" && a.ttl >= 0 ? Math.min(a.ttl, 7 * 86400) : 86400;
  return {
    camp_id: text(a.camp_id, 36),
    recipients,
    title,
    body: text(a.body, 400),
    url,
    tag: text(a.tag, 100) || null,
    urgency,
    ttl,
  };
}

const env = (name: string) => Deno.env.get(name)?.trim() ?? "";
const NEEDED = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = env("PUSH_WEBHOOK_SECRET");
  if (!secret) return json({ error: "PUSH_WEBHOOK_SECRET is not set" }, 500);
  if (!timingSafeEqual(req.headers.get("x-push-secret") ?? "", secret)) return json({ error: "unauthorized" }, 401);

  let alert: Alert | null = null;
  try { alert = parseAlert(await req.json()); } catch { /* not JSON */ }
  if (!alert) return json({ error: "bad_request" }, 400);

  const missing = NEEDED.filter((k) => !env(k));
  if (missing.length) {
    console.error(`Missing function secrets: ${missing.join(", ")}`);
    return json({ error: `Missing function secrets: ${missing.join(", ")}` }, 500);
  }
  const vapid: VapidKeys = { publicKey: env("VAPID_PUBLIC_KEY"), privateKey: env("VAPID_PRIVATE_KEY"), subject: env("VAPID_SUBJECT") };
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  const { data: phones, error } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("person_id", alert.recipients);
  if (error) {
    console.error("loading subscriptions failed", error.message);
    return json({ error: error.message }, 500);
  }

  const payload = JSON.stringify({ title: alert.title, body: alert.body, url: alert.url, tag: alert.tag });
  const results = await Promise.all((phones ?? []).map(async (p) => {
    if (!isPushEndpoint(p.endpoint)) return { id: p.id, outcome: "skipped" as const };
    try {
      const { url, init } = await buildPushRequest(p, payload, vapid, { ttl: alert.ttl, urgency: alert.urgency });
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
      if (res.ok) return { id: p.id, outcome: "sent" as const };
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      // 404/410: the browser unsubscribed or the app was removed. Anything else may be temporary.
      if (res.status === 404 || res.status === 410) return { id: p.id, outcome: "gone" as const };
      console.warn(`push to ${new URL(p.endpoint).host} failed: ${res.status} ${detail}`);
      return { id: p.id, outcome: "failed" as const };
    } catch (e) {
      console.warn(`push to ${new URL(p.endpoint).host} failed: ${String(e)}`);
      return { id: p.id, outcome: "failed" as const };
    }
  }));

  const gone = results.filter((r) => r.outcome === "gone").map((r) => r.id);
  if (gone.length) {
    const { error: delError } = await db.from("push_subscriptions").delete().in("id", gone);
    if (delError) console.error("removing gone subscriptions failed", delError.message);
  }
  const count = (o: string) => results.filter((r) => r.outcome === o).length;
  return json({
    camp_id: alert.camp_id,
    phones: results.length,
    sent: count("sent"),
    removed: gone.length,
    failed: count("failed"),
    skipped: count("skipped"),
  });
});
