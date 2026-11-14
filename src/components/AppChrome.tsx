import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRegisterSW } from "virtual:pwa-register/react";
import { CloudOff, Download, RefreshCw, Share, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { flushOutbox, useOutbox } from "../lib/outbox";
import { Button, Card } from "./ui";

// ───────── Online status ─────────

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return online;
}

/** Thin bar under the header: offline notice and results waiting to sync. */
export function ConnectionBar({ campId }: { campId: string }) {
  const online = useOnline();
  const pending = useOutbox(campId);
  const waiting = pending.filter((p) => !p.error).length;
  if (online && waiting === 0) return null;
  return (
    <div role="status" className="flex items-center gap-2 bg-amber-100 px-4 py-1.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
      <CloudOff size={14} />
      {online
        ? `Sending ${waiting} saved result${waiting === 1 ? "" : "s"}…`
        : waiting
          ? `Offline · ${waiting} result${waiting === 1 ? "" : "s"} saved on this phone, will send when back online`
          : "Offline · showing saved data. New results are kept on this phone until you're back online."}
    </div>
  );
}

// ───────── Sync engine: outbox + realtime ─────────

/** Sends queued results when the connection returns, and refreshes when others record. */
export function SyncEngine({ campId }: { campId: string }) {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    const flush = async () => {
      const n = await flushOutbox();
      if (n > 0) {
        toast.success(`${n} saved result${n === 1 ? "" : "s"} sent`);
        refresh("matches", "standings", "activity");
      }
    };
    flush();
    const onVisible = () => { if (document.visibilityState === "visible") flush(); };
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", onVisible);
    const iv = setInterval(flush, 30_000);
    return () => {
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(iv);
    };
  }, [qc]);

  useEffect(() => {
    // Batch bursts (e.g. a coach logging attendance for 16 players) into one refresh.
    const pending = new Set<string>();
    const schedule = (...keys: string[]) => {
      keys.forEach((k) => pending.add(k));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        pending.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
        pending.clear();
      }, 600);
    };
    const channel = supabase
      .channel(`camp-${campId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `camp_id=eq.${campId}` },
        () => schedule("matches", "standings", "activity"))
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `camp_id=eq.${campId}` },
        () => schedule("sessions"))
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => schedule("attendance"))
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [campId, qc]);

  return null;
}

// ───────── Service worker update ─────────

export function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Look for a new version every hour while the app stays open.
      if (reg) setInterval(() => { reg.update().catch(() => undefined); }, 60 * 60 * 1000);
    },
  });
  if (!needRefresh) return null;
  return (
    <div className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-md rounded-xl border border-line bg-surface p-3 shadow-lg">
      <div className="flex items-center gap-3">
        <RefreshCw size={18} className="shrink-0 text-brand" />
        <p className="flex-1 text-sm font-medium text-ink">A new version of the camp app is ready.</p>
        <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>Later</Button>
        <Button size="sm" onClick={() => updateServiceWorker(true)}>Refresh</Button>
      </div>
    </div>
  );
}

// ───────── Install ─────────

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "install.dismissed";
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);

/** "Install the app" card: native prompt on Android/desktop Chrome, instructions on iPhone. */
export function InstallCard() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BeforeInstallPromptEvent); };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  };

  if (installed || dismissed || (!evt && !isIos())) return null;
  return (
    <Card className="flex items-start gap-3 p-3">
      <Download size={18} className="mt-0.5 shrink-0 text-brand" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-ink">Install the camp app</p>
        {evt ? (
          <p className="text-xs text-ink-soft">Opens full-screen from your home screen and works courtside with no signal.</p>
        ) : (
          <p className="text-xs text-ink-soft">
            In Safari, tap <Share size={12} className="inline align-text-top" /> Share, then <b>Add to Home Screen</b>.
          </p>
        )}
        {evt && (
          <Button size="sm" className="mt-2" onClick={async () => {
            await evt.prompt();
            const { outcome } = await evt.userChoice;
            if (outcome === "accepted") setInstalled(true);
            setEvt(null);
          }}>Install</Button>
        )}
      </div>
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="rounded p-1 text-ink-soft hover:bg-surface-2"><X size={16} /></button>
    </Card>
  );
}

// ───────── Outdoor (high-contrast) mode ─────────

const CONTRAST_KEY = "display.outdoor";

export function readOutdoor(): boolean {
  try { return localStorage.getItem(CONTRAST_KEY) === "1"; } catch { return false; }
}

export function applyOutdoor(on: boolean) {
  document.documentElement.toggleAttribute("data-outdoor", on);
  try { localStorage.setItem(CONTRAST_KEY, on ? "1" : "0"); } catch { /* ignore */ }
}
