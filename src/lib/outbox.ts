import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import type { MatchInput } from "./api";

/**
 * Offline outbox for match results. Each submission gets a client id once; the server's
 * record_match() treats a repeated client id from the same recorder as the same match, so a
 * retry after a dropped connection can never create a duplicate.
 */
export interface OutboxItem {
  clientId: string;
  campId: string;
  input: MatchInput;
  queuedAt: string;
  /** Set when the server rejected it (not a network problem); needs the user's attention. */
  error?: string;
}

const KEY = "outbox.matches.v1";
const listeners = new Set<() => void>();
let cache: OutboxItem[] | null = null;

function read(): OutboxItem[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed) ? (parsed as OutboxItem[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(items: OutboxItem[]) {
  cache = items;
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage full or blocked */ }
  listeners.forEach((l) => l());
}

export const outbox = {
  all: read,
  add(item: OutboxItem) { write([...read().filter((i) => i.clientId !== item.clientId), item]); },
  remove(clientId: string) { write(read().filter((i) => i.clientId !== clientId)); },
  retry(clientId: string) { write(read().map((i) => (i.clientId === clientId ? { ...i, error: undefined } : i))); },
  clear() { write([]); },
  subscribe(l: () => void) {
    listeners.add(l);
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; l(); } };
    window.addEventListener("storage", onStorage);
    return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
  },
};

export function useOutbox(campId: string | undefined): OutboxItem[] {
  const all = useSyncExternalStore(outbox.subscribe, outbox.all, outbox.all);
  return campId ? all.filter((i) => i.campId === campId) : all;
}

/** True when the failure means "couldn't reach the server", not "the server said no". */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = String((e as { message?: string })?.message ?? e);
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|timeout/i.test(msg);
}

export const newClientId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));

export const recordArgs = (campId: string, m: MatchInput, clientId: string) => ({
  p_camp: campId,
  p_played_on: m.playedOn,
  p_category: m.category,
  p_t1_p1: m.slots[0],
  p_t1_p2: m.slots[1] ?? null,
  p_t2_p1: m.slots[2],
  p_t2_p2: m.slots[3] ?? null,
  p_games: m.games ?? [],
  p_winner_side: m.winner,
  p_client_id: clientId,
});

let flushing = false;

/** Sends queued results in order. Returns how many were saved. */
export async function flushOutbox(): Promise<number> {
  if (flushing || (typeof navigator !== "undefined" && navigator.onLine === false)) return 0;
  flushing = true;
  let saved = 0;
  try {
    for (const item of read()) {
      if (item.error) continue;
      const { error } = await supabase.rpc("record_match", recordArgs(item.campId, item.input, item.clientId));
      if (!error) { outbox.remove(item.clientId); saved++; continue; }
      if (isNetworkError(error)) break;
      write(read().map((i) => (i.clientId === item.clientId ? { ...i, error: error.message } : i)));
    }
  } finally {
    flushing = false;
  }
  return saved;
}
