// Leave and exam days (migration 0010). A player tells the camp admin they'll be away and the
// admin marks the days. Sessions on those days don't count against the player's attendance, and
// the pairing helper leaves them out unless they turn up anyway.
import type { Attendance, Session } from "./types";

export type LeaveReason = "exam" | "medical" | "personal" | "other";

export interface PlayerLeave {
  id: string;
  camp_id: string;
  person_id: string;
  /** First and last day away, inclusive (YYYY-MM-DD). */
  starts_on: string;
  ends_on: string;
  reason: LeaveReason;
  note: string | null;
  created_at: string;
}

export const LEAVE_REASONS: { value: LeaveReason; label: string }[] = [
  { value: "exam", label: "Exam" },
  { value: "medical", label: "Medical" },
  { value: "personal", label: "Personal" },
  { value: "other", label: "Other" },
];

export const leaveReasonLabel = (r: LeaveReason) => LEAVE_REASONS.find((x) => x.value === r)?.label ?? "Leave";

/** The leave that covers `day` (YYYY-MM-DD) for this person, if any. */
export function leaveOn(leaves: readonly PlayerLeave[], personId: string, day: string): PlayerLeave | undefined {
  return leaves.find((l) => l.person_id === personId && l.starts_on <= day && day <= l.ends_on);
}

/** Everyone on leave on `day`, with the leave that covers it. */
export function leaveByPerson(leaves: readonly PlayerLeave[], day: string): Map<string, PlayerLeave> {
  const out = new Map<string, PlayerLeave>();
  for (const l of leaves) if (l.starts_on <= day && day <= l.ends_on && !out.has(l.person_id)) out.set(l.person_id, l);
  return out;
}

export interface AttendanceSummary {
  /** Sessions they came to (present or late). */
  attended: number;
  /** Sessions that count: every session except ones they missed while on leave. */
  expected: number;
  /** Sessions they missed while on leave. */
  excused: number;
  /** attended / expected, rounded; null when no session counts yet. */
  pct: number | null;
}

/**
 * Attendance that doesn't hold leave against a player. A session counts when they came, or when
 * they missed it without leave. Coming in on a leave day still counts as attended.
 */
export function attendanceSummary(
  personId: string,
  sessions: readonly Pick<Session, "id" | "session_date">[],
  attendance: readonly Pick<Attendance, "session_id" | "person_id" | "status">[],
  leaves: readonly PlayerLeave[],
): AttendanceSummary {
  const status = new Map<string, Attendance["status"]>();
  for (const a of attendance) if (a.person_id === personId) status.set(a.session_id, a.status);
  let attended = 0;
  let expected = 0;
  let excused = 0;
  for (const s of sessions) {
    const st = status.get(s.id);
    if (st === "present" || st === "late") {
      attended++;
      expected++;
    } else if (leaveOn(leaves, personId, s.session_date)) {
      excused++;
    } else {
      expected++;
    }
  }
  return { attended, expected, excused, pct: expected ? Math.round((100 * attended) / expected) : null };
}

/** Leave that hasn't finished by `day`, soonest first; then past leave, most recent first. */
export function sortLeave(leaves: readonly PlayerLeave[], day: string): { current: PlayerLeave[]; past: PlayerLeave[] } {
  const current = leaves.filter((l) => l.ends_on >= day).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const past = leaves.filter((l) => l.ends_on < day).sort((a, b) => b.ends_on.localeCompare(a.ends_on));
  return { current, past };
}

/** "20 Nov", or "20–22 Nov", or "30 Nov – 2 Dec". */
export function leaveDates(l: Pick<PlayerLeave, "starts_on" | "ends_on">): string {
  const d = (s: string) => new Date(`${s}T00:00:00`);
  const day = (s: string) => d(s).getDate();
  const mon = (s: string) => d(s).toLocaleDateString("en-IN", { month: "short" });
  if (l.starts_on === l.ends_on) return `${day(l.starts_on)} ${mon(l.starts_on)}`;
  if (l.starts_on.slice(0, 7) === l.ends_on.slice(0, 7)) return `${day(l.starts_on)}–${day(l.ends_on)} ${mon(l.ends_on)}`;
  return `${day(l.starts_on)} ${mon(l.starts_on)} – ${day(l.ends_on)} ${mon(l.ends_on)}`;
}
