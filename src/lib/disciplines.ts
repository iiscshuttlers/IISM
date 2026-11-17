import type { Standing } from "./types";
import type { Category } from "./scores";

/** Overall (every match) or one discipline: singles (MS+WS), doubles (MD+WD), mixed (XD). */
export type Discipline = "all" | "singles" | "doubles" | "mixed";

export const DISCIPLINES: { value: Discipline; label: string; categories: string[] }[] = [
  { value: "all", label: "Overall", categories: ["MS", "WS", "MD", "WD", "XD"] },
  { value: "singles", label: "Singles", categories: ["MS", "WS"] },
  { value: "doubles", label: "Doubles", categories: ["MD", "WD"] },
  { value: "mixed", label: "Mixed", categories: ["XD"] },
];

/** Whether the server returns per-discipline ratings yet (migration 0006). */
export const hasDisciplineRatings = (rows: Standing[]) => rows.some((r) => r.rating_singles !== undefined);

/** A player's rating and record in one discipline (or overall). */
export function disciplineStat(r: Standing, d: Discipline): { rating: number; won: number; lost: number; played: number } {
  if (d === "all") return { rating: r.rating, won: r.won, lost: r.lost, played: r.played };
  const cats = DISCIPLINES.find((x) => x.value === d)!.categories;
  const won = cats.reduce((t, c) => t + (r.by_category?.[c]?.w ?? 0), 0);
  const lost = cats.reduce((t, c) => t + (r.by_category?.[c]?.l ?? 0), 0);
  const rating = d === "singles" ? r.rating_singles : d === "doubles" ? r.rating_doubles : r.rating_mixed;
  return { rating: rating ?? 1200, won, lost, played: won + lost };
}

/** Ranked for a discipline: players with matches first (by rating, then wins), then the rest. */
export function rankByDiscipline<T extends Standing>(rows: T[], d: Discipline): { row: T; stat: ReturnType<typeof disciplineStat>; rank: number | null }[] {
  const withStats = rows.map((row) => ({ row, stat: disciplineStat(row, d) }));
  if (d === "all") return withStats.map((x, i) => ({ ...x, rank: i + 1 }));
  withStats.sort((a, b) =>
    Number(b.stat.played > 0) - Number(a.stat.played > 0) || b.stat.rating - a.stat.rating || b.stat.won - a.stat.won,
  );
  let n = 0;
  return withStats.map((x) => ({ ...x, rank: x.stat.played > 0 ? ++n : null }));
}

/** What a player is training for in this camp (migration 0009); any combination, or none yet. */
export type TrainingEvent = Exclude<Discipline, "all">;

/** `short` is what's shown next to names (S, D, XD); `label` is the full name for filters and tooltips. */
export const TRAINING_EVENTS: { value: TrainingEvent; label: string; short: string }[] = [
  { value: "singles", label: "Singles", short: "S" },
  { value: "doubles", label: "Doubles", short: "D" },
  { value: "mixed", label: "Mixed (XD)", short: "XD" },
];

/** Always in the order singles, doubles, mixed, without repeats or unknown values. */
export const sortEvents = (events: readonly string[]): TrainingEvent[] =>
  TRAINING_EVENTS.map((e) => e.value).filter((v) => events.includes(v));

/** "S · XD", or "" when none are set. */
export const eventsLabel = (events: readonly string[] | null | undefined): string =>
  sortEvents(events ?? []).map((v) => TRAINING_EVENTS.find((e) => e.value === v)!.short).join(" · ");

/** Turns one event on or off. */
export const toggleEvent = (events: readonly string[], e: TrainingEvent): TrainingEvent[] =>
  sortEvents(events.includes(e) ? events.filter((x) => x !== e) : [...events, e]);

/** The event a match category belongs to: MS/WS singles, MD/WD doubles, XD mixed. */
export const categoryEvent = (c: Category): TrainingEvent =>
  c === "MS" || c === "WS" ? "singles" : c === "XD" ? "mixed" : "doubles";
