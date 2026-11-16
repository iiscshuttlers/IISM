import { createClient } from "@supabase/supabase-js";
import { readAuthRedirect, readEmailLink } from "./password";

/** Accepts "abc.supabase.co" as well as "https://abc.supabase.co"; returns null if unusable. */
export function normalizeSupabaseUrl(raw: string | undefined): string | null {
  const v = raw?.trim().replace(/\/+$/, "");
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    // Needs a real host (e.g. abc.supabase.co or localhost), not a stray "https:".
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.origin;
  } catch {
    return null;
  }
}

const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const supabaseConfigured = Boolean(url && anonKey);

/**
 * Read before the client below takes the session out of the address bar: whether this page was
 * opened from a password-reset link, or from an email link that failed.
 */
export const authRedirect = readAuthRedirect(typeof window === "undefined" ? "" : window.location.hash);
/** An unused sign-up or reset link this page was opened from (see readEmailLink). */
export const emailLinkInUrl = readEmailLink(typeof window === "undefined" ? "" : window.location.search);

// Placeholder values keep the app renderable (it shows a setup screen) before .env exists.
export const supabase = createClient(url || "http://localhost:54321", anonKey || "missing-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const FRIENDLY: Record<string, string> = {
  forbidden: "You don't have permission to do that.",
  not_signed_in: "Please sign in again.",
  camp_closed: "This camp is closed.",
  category_gender_mismatch: "Players don't match the category.",
  winner_does_not_match_games: "The winner doesn't match the game scores.",
  duplicate_player: "A player appears twice.",
  player_not_in_camp: "Every player must be on the camp roster as a player.",
  invalid_games: "Check the game scores.",
  doubles_needs_partners: "Doubles needs four players.",
  singles_has_partner: "Singles can't have partners.",
  not_disputable: "This match can no longer be disputed.",
  dispute_window_closed: "The 24-hour dispute window has closed.",
  reason_required: "Please give a reason.",
  selection_locked: "The squad is locked. Unlock it first.",
  already_locked: "The squad is already locked.",
  not_locked: "The squad isn't locked.",
  has_matches: "This person has matches. Void them first or keep them on the roster.",
  cannot_remove_self: "You can't remove yourself.",
  cannot_demote_self: "You can't remove your own admin role.",
  invalid_day: "Check the date on this phone and try again.",
  invalid_court_count: "Choose between 1 and 8 courts.",
  void_first: "Void the match first; then it can be deleted for good.",
};

export function errorText(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (msg.startsWith("selected_count_mismatch")) {
    const m = msg.match(/(\d+) selected, (\d+) required/);
    return m ? `Select exactly ${m[2]} players before locking (${m[1]} selected).` : "Selected count doesn't match the squad size.";
  }
  if (/duplicate key.*email/i.test(msg)) return "That email is already used by another profile.";
  if (/row-level security/i.test(msg)) return FRIENDLY.forbidden;
  for (const key of Object.keys(FRIENDLY)) if (msg.startsWith(key)) return FRIENDLY[key];
  return msg;
}

/** Throws on a Supabase error so React Query sees it. */
export function must<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}
