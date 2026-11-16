import type { Category } from "./scores";

/**
 * The live scorer's match in progress, kept on this phone so a refresh, a locked screen or a
 * closed scorer doesn't lose the score. Cleared when the match is saved, discarded or reset,
 * on sign-out, and after 12 hours.
 */
export interface LiveScoreState {
  step: "scoring" | "finished";
  category: Category;
  targetPoints: number;
  isCustomPoints: boolean;
  enableDeuce: boolean;
  matchFormat: "best_of_3" | "1_set" | "best_of_5";
  slots: (string | null)[];
  playedOn: string;
  currentGame: number;
  scoreA: number;
  scoreB: number;
  gamesHistory: string[];
  winsA: number;
  winsB: number;
  scoreLog: { a: number; b: number }[];
  endsSwapped: boolean;
  servingSide: "A" | "B";
}

const KEY = "live-scorer.v1";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function loadLiveScore(now = Date.now()): LiveScoreState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { savedAt, ...s } = JSON.parse(raw) as LiveScoreState & { savedAt: number };
    const valid =
      (s.step === "scoring" || s.step === "finished") &&
      Array.isArray(s.slots) && Array.isArray(s.gamesHistory) && Array.isArray(s.scoreLog) &&
      typeof savedAt === "number" && now - savedAt <= MAX_AGE_MS;
    if (!valid) {
      clearLiveScore();
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function saveLiveScore(s: LiveScoreState, now = Date.now()) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, savedAt: now }));
  } catch {
    /* storage full or unavailable: scoring still works, it just won't survive a refresh */
  }
}

export function clearLiveScore() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
