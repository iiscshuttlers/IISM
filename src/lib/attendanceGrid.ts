// The attendance grid: every player against every session up to today, newest first, so staff
// can see who came on which day without opening each session in the training log.
import type { Attendance, Session } from "./types";
import { attendanceSummary, leaveOn, type AttendanceSummary, type PlayerLeave } from "./leave";

/** What one cell shows. Leave wins over "away" and "not marked", but not over turning up. */
export type GridMark = Attendance["status"] | "leave" | null;

export interface GridColumn {
  session: Pick<Session, "id" | "session_date" | "title">;
  /** Players in the grid marked present or late. */
  came: number;
  /** On a day with more than one session: which one this is (1 = first logged); otherwise null. */
  part: number | null;
}

export interface GridRow<P> {
  player: P;
  /** One per column, in column order. */
  marks: GridMark[];
  /** Over the sessions in the grid only, leave excluded (same rule as the Players list). */
  summary: AttendanceSummary;
}

export type GridSort = "name" | "lowest";

/**
 * Builds the grid. `sessions` come as useSessions returns them: newest first, and on a shared day
 * the most recently logged first. Sessions after `today` (planned ahead) are left out.
 */
export function attendanceGrid<P extends { id: string; full_name: string }>(
  players: readonly P[],
  sessions: readonly Pick<Session, "id" | "session_date" | "title">[],
  attendance: readonly Pick<Attendance, "session_id" | "person_id" | "status">[],
  leaves: readonly PlayerLeave[],
  today: string,
): { columns: GridColumn[]; rows: GridRow<P>[] } {
  const shown = sessions
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.session_date <= today)
    .sort((a, b) => b.s.session_date.localeCompare(a.s.session_date) || a.i - b.i)
    .map(({ s }) => s);

  const perDay = new Map<string, number>();
  for (const s of shown) perDay.set(s.session_date, (perDay.get(s.session_date) ?? 0) + 1);
  const seen = new Map<string, number>();

  const status = new Map<string, Attendance["status"]>();
  for (const a of attendance) status.set(`${a.session_id}|${a.person_id}`, a.status);

  const rows: GridRow<P>[] = players.map((p) => ({
    player: p,
    marks: shown.map((s) => {
      const st = status.get(`${s.id}|${p.id}`);
      if (st === "present" || st === "late") return st;
      if (leaveOn(leaves, p.id, s.session_date)) return "leave";
      return st ?? null;
    }),
    summary: attendanceSummary(p.id, shown, attendance, leaves),
  }));

  const columns: GridColumn[] = shown.map((session, c) => {
    const n = perDay.get(session.session_date)!;
    const k = (seen.get(session.session_date) ?? 0) + 1;
    seen.set(session.session_date, k);
    return {
      session,
      came: rows.filter((r) => r.marks[c] === "present" || r.marks[c] === "late").length,
      // Newest first within the day, so the first one we meet is the last one logged.
      part: n > 1 ? n - k + 1 : null,
    };
  });

  return { columns, rows };
}

/** A–Z, or lowest attendance first (players with no counted sessions last, then A–Z). */
export function sortGridRows<P extends { full_name: string }>(rows: readonly GridRow<P>[], by: GridSort): GridRow<P>[] {
  const byName = (a: GridRow<P>, b: GridRow<P>) => a.player.full_name.localeCompare(b.player.full_name);
  if (by === "name") return [...rows].sort(byName);
  return [...rows].sort((a, b) => (a.summary.pct ?? 101) - (b.summary.pct ?? 101) || byName(a, b));
}
