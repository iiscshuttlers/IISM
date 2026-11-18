import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRegisterSW } from "virtual:pwa-register/react";
import { CloudOff, Download, RefreshCw, Share, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { flushOutbox, outbox, useOutbox } from "../lib/outbox";
import { applyUpdate } from "../lib/swUpdate";
import { Button, Card, Sheet, cx } from "./ui";

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

/** Interactive bar under header: offline notice, sync status, and tap-to-inspect outbox drawer. */
export function ConnectionBar({ campId }: { campId: string }) {
  const online = useOnline();
  const pending = useOutbox(campId);
  const waiting = pending.filter((p) => !p.error).length;
  const failed = pending.filter((p) => !!p.error).length;
  const [openDrawer, setOpenDrawer] = useState(false);
  const [syncing, setSyncing] = useState(false);

  if (online && pending.length === 0) return null;

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const n = await flushOutbox();
      if (n > 0) {
        toast.success(`${n} queued match result${n === 1 ? "" : "s"} synced successfully!`);
      } else {
        toast.info("All local changes are synced");
      }
    } catch {
      toast.error("Could not sync - check internet connection");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpenDrawer(true)}
        className="flex items-center justify-between gap-2 bg-status-warn-bg px-4 py-1.5 text-xs font-semibold text-status-warn-text border-b border-status-warn-border cursor-pointer hover:opacity-90 transition select-none"
      >
        <div className="flex items-center gap-2 truncate">
          <CloudOff size={14} className="shrink-0" />
          <span className="truncate">
            {online
              ? `Sync Queue: ${waiting} waiting${failed ? `, ${failed} need retry` : ""}`
              : `Offline · ${pending.length} match${pending.length === 1 ? "" : "es"} saved locally on phone`}
          </span>
        </div>
        <span className="shrink-0 text-[11px] font-bold underline underline-offset-2">View queue →</span>
      </div>

      <Sheet open={openDrawer} onClose={() => setOpenDrawer(false)} title="Local Changes & Sync Queue">
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-line">
            <div className="flex items-center gap-2">
              <span className={cx("h-2.5 w-2.5 rounded-full", online ? "bg-status-success-text" : "bg-status-warn-text")} />
              <span className="text-xs font-bold text-ink">
                {online ? "Internet Connected" : "Working Offline (Courtside Mode)"}
              </span>
            </div>
            {online && (
              <Button size="sm" onClick={handleManualSync} disabled={syncing}>
                <RefreshCw size={13} className={cx("mr-1", syncing && "animate-spin")} />
                <span>{syncing ? "Syncing…" : "Sync Now"}</span>
              </Button>
            )}
          </div>

          <p className="text-xs text-ink-soft">
            Matches recorded courtside without internet are safely preserved in phone storage. They sync automatically as soon as connection is detected.
          </p>

          {pending.length === 0 ? (
            <p className="text-center py-6 text-xs text-ink-soft border border-dashed border-line rounded-xl">
              All results are fully synced with the camp database.
            </p>
          ) : (
            <div className="space-y-2">
              {pending.map((p) => (
                <div key={p.clientId} className="p-3 rounded-xl border border-line bg-surface space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-brand uppercase">{p.input.category} Match</span>
                    <span className={cx(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                      p.error
                        ? "bg-status-danger-bg text-status-danger-text border-status-danger-border"
                        : "bg-status-warn-bg text-status-warn-text border-status-warn-border"
                    )}>
                      {p.error ? "Sync Error" : "Waiting for signal"}
                    </span>
                  </div>

                  <p className="text-xs text-ink font-mono">
                    Scores: {p.input.games?.join(", ") || "Winner only"} · Winner: Side {p.input.winner}
                  </p>

                  <p className="text-[11px] text-ink-soft">
                    Saved locally: {new Date(p.queuedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </p>

                  {p.error && (
                    <p className="text-xs text-status-danger-text font-medium bg-status-danger-bg/50 p-2 rounded-lg">
                      {p.error}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-line/60">
                    {p.error && (
                      <Button size="sm" variant="secondary" onClick={() => outbox.retry(p.clientId)}>
                        Retry
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => outbox.remove(p.clientId)}
                      className="text-status-danger-text hover:bg-status-danger-bg"
                    >
                      Discard
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Sheet>
    </>
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
      .on("postgres_changes", { event: "*", schema: "public", table: "activity", filter: `camp_id=eq.${campId}` },
        () => schedule("activity"))
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `camp_id=eq.${campId}` },
        () => schedule("sessions"))
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => schedule("attendance"))
      // Shared camp features (0004): coaches' notices, courts and plans appear on every phone.
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements", filter: `camp_id=eq.${campId}` },
        () => schedule("announcements"))
      .on("postgres_changes", { event: "*", schema: "public", table: "court_allocations", filter: `camp_id=eq.${campId}` },
        () => schedule("courts"))
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_plans", filter: `camp_id=eq.${campId}` },
        () => schedule("venuePlan"))
      .on("postgres_changes", { event: "*", schema: "public", table: "next_session_focus", filter: `camp_id=eq.${campId}` },
        () => schedule("nextFocus"))
      .on("postgres_changes", { event: "*", schema: "public", table: "injury_reports", filter: `camp_id=eq.${campId}` },
        () => schedule("injuries"))
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment", filter: `camp_id=eq.${campId}` },
        () => schedule("equipment"))
      .on("postgres_changes", { event: "*", schema: "public", table: "player_goals", filter: `camp_id=eq.${campId}` },
        () => schedule("goals"))
      // Leave the admin marks (0010): attendance and the pairing helper update on every phone.
      .on("postgres_changes", { event: "*", schema: "public", table: "player_leave", filter: `camp_id=eq.${campId}` },
        () => schedule("leave"))
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
  const [updating, setUpdating] = useState(false);
  const { needRefresh: [needRefresh, setNeedRefresh] } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Look for a new version every hour while the app stays open.
      if (reg) setInterval(() => { reg.update().catch(() => undefined); }, 60 * 60 * 1000);
    },
  });
  if (!needRefresh) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-md rounded-xl border border-line bg-surface p-3 shadow-lg">
      <div className="flex items-center gap-3">
        <RefreshCw size={18} className={cx("shrink-0 text-brand", updating && "motion-safe:animate-spin")} />
        <p className="flex-1 text-sm font-medium text-ink">
          {updating ? "Updating the camp app…" : "A new version of the camp app is ready."}
        </p>
        {!updating && <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>Later</Button>}
        <Button
          size="sm"
          disabled={updating}
          onClick={() => {
            setUpdating(true);
            applyUpdate().catch(() => window.location.reload());
          }}
        >
          {updating ? "Updating…" : "Refresh"}
        </Button>
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
