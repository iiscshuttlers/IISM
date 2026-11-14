import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

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
};

export function errorText(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (msg.startsWith("selected_count_mismatch")) {
    const m = msg.match(/(\d+) selected, (\d+) required/);
    return m ? `Select exactly ${m[2]} players before locking (${m[1]} selected).` : "Selected count doesn't match the squad size.";
  }
  if (/duplicate key.*email/i.test(msg)) return "That email is already used by another profile.";
  for (const key of Object.keys(FRIENDLY)) if (msg.startsWith(key)) return FRIENDLY[key];
  return msg;
}

/** Throws on a Supabase error so React Query sees it. */
export function must<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}
