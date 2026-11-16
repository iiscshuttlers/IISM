import type { Category } from "./scores";
import { INITIAL_SERVE, isServeState, type ServeState } from "./serving";

/** The score before a scoring action, so it can be undone (with who was serving, and where). */
export interface ScoreLogEntry {
  a: number;
  b: number;
  /** Missing on entries saved before serving was tracked. */
  serve?: ServeState;
  /** On the point that won a game: the match as it stood before it, so that point can be undone. */
  game?: GameStanding;
}

export interface GameStanding {
  currentGame: number;
  gamesHistory: string[];
  winsA: number;
  winsB: number;
  endsSwapped: boolean;
}

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
  scoreLog: ScoreLogEntry[];
  endsSwapped: boolean;
  serve: ServeState;
}

const KEY = "live-scorer.v1";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function loadLiveScore(now = Date.now()): LiveScoreState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    // `servingSide` is how matches saved before player-by-player serving recorded the server.
    const { savedAt, servingSide, ...s } = JSON.parse(raw) as LiveScoreState & {
      savedAt: number;
      servingSide?: unknown;
    };
    const valid =
      (s.step === "scoring" || s.step === "finished") &&
      Array.isArray(s.slots) && Array.isArray(s.gamesHistory) && Array.isArray(s.scoreLog) &&
      typeof savedAt === "number" && now - savedAt <= MAX_AGE_MS;
    if (!valid) {
      clearLiveScore();
      return null;
    }
    const serve = isServeState(s.serve)
      ? s.serve
      : { ...INITIAL_SERVE, serving: servingSide === "B" ? ("B" as const) : ("A" as const) };
    return { ...s, serve };
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
