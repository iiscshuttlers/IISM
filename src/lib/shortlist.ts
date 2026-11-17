// The camp admin's ranked shortlist (migration 0010): one score per player from their rating,
// coach score, attendance and win rate, weighted the way the admin chooses. Admin only.

export interface ShortlistWeights {
  rating: number;
  coach_score: number;
  attendance: number;
  win_rate: number;
}

export type MetricKey = keyof ShortlistWeights;

export const DEFAULT_WEIGHTS: ShortlistWeights = { rating: 3, coach_score: 3, attendance: 2, win_rate: 2 };

export const METRICS: { key: MetricKey; label: string }[] = [
  { key: "rating", label: "Rating" },
  { key: "coach_score", label: "Coach score" },
  { key: "attendance", label: "Attendance" },
  { key: "win_rate", label: "Win %" },
];

export interface ShortlistInput {
  id: string;
  /** Camp rating. Everyone has one (it starts at 1200). */
  rating: number;
  /** null until they've played. */
  winPct: number | null;
  /** Leave-adjusted attendance; null before any session counts. */
  attendancePct: number | null;
  /** Average coach assessment, 1–5; null before any assessment. */
  coachAvg: number | null;
}

export interface ShortlistScore {
  id: string;
  /** 0–100, or null when none of the weighted numbers exist for this player yet. */
  score: number | null;
  /** Each number on a 0–100 scale; null when the player doesn't have it yet. */
  parts: Record<MetricKey, number | null>;
  /** Weighted numbers this player has no data for (their score uses the others). */
  missing: MetricKey[];
}

/** Each weight as a whole-number percentage of the total. */
export function weightPercents(w: ShortlistWeights): Record<MetricKey, number> {
  const total = w.rating + w.coach_score + w.attendance + w.win_rate;
  const pct = (x: number) => (total ? Math.round((100 * x) / total) : 0);
  return { rating: pct(w.rating), coach_score: pct(w.coach_score), attendance: pct(w.attendance), win_rate: pct(w.win_rate) };
}

/**
 * Scores and ranks players, best first. Rating is scaled within the camp (lowest 0, highest 100);
 * coach score maps 1–5 onto 0–100; win % and attendance are already percentages. A player missing
 * a number is scored on the ones they have, and the gap is listed so it can be shown.
 */
export function scoreShortlist(players: readonly ShortlistInput[], w: ShortlistWeights): ShortlistScore[] {
  const ratings = players.map((p) => p.rating);
  const lo = Math.min(...ratings);
  const hi = Math.max(...ratings);
  const scaled = (r: number) => (hi > lo ? (100 * (r - lo)) / (hi - lo) : 50);

  const rows = players.map((p): ShortlistScore => {
    const parts: Record<MetricKey, number | null> = {
      rating: scaled(p.rating),
      coach_score: p.coachAvg == null ? null : (100 * (p.coachAvg - 1)) / 4,
      attendance: p.attendancePct,
      win_rate: p.winPct,
    };
    let sum = 0;
    let weight = 0;
    const missing: MetricKey[] = [];
    for (const { key } of METRICS) {
      if (!w[key]) continue;
      const v = parts[key];
      if (v == null) { missing.push(key); continue; }
      sum += w[key] * v;
      weight += w[key];
    }
    return { id: p.id, parts, missing, score: weight ? Math.round((10 * sum) / weight) / 10 : null };
  });
  return rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}
