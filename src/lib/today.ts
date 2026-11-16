import { useEffect, useMemo, useState } from "react";
import { useAttendance, useSessions, useTrainingMutations } from "./api";
import type { Attendance } from "./types";

/** The phone's local date, YYYY-MM-DD. */
export const localDay = () => new Date().toLocaleDateString("en-CA");

/** Re-renders every `ms` so time-based UI (e.g. "after the session") updates on its own. */
export function useNow(ms = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/** Default session created when someone checks in and nothing is scheduled yet. */
export const DEFAULT_SESSION = {
  title: "Today's Training & Matches",
  focus: "Practice & Matchplay",
  notes: "",
  duration_min: 120,
};

/** Today's sessions and who has checked in to them. */
export function useTodayAttendance(campId: string) {
  const sessions = useSessions(campId);
  const day = localDay();
  const todays = useMemo(() => (sessions.data ?? []).filter((x) => x.session_date === day), [sessions.data, day]);
  const attendance = useAttendance(todays.map((x) => x.id));
  /** People marked present or late in any of today's sessions. */
  const presentIds = useMemo(
    () => [...new Set((attendance.data ?? []).filter((a) => a.status !== "absent").map((a) => a.person_id))],
    [attendance.data],
  );
  return { sessions, todays, todaySession: todays[0], attendance, presentIds, loading: sessions.isLoading };
}

/**
 * When a player should be asked how hard the session was (RPE): once they've had time to
 * train, i.e. an hour after they were marked in (or the session's length, if shorter), or
 * straight away if they already gave a rating and may want to change it.
 */
export function rpeIsDue(mine: Attendance | null | undefined, sessionMinutes: number | null | undefined, now: number): boolean {
  if (!mine || mine.status === "absent") return false;
  if (mine.rpe != null) return true;
  if (!mine.created_at) return true;
  const waitMin = Math.min(60, sessionMinutes ?? 60);
  return now - new Date(mine.created_at).getTime() >= waitMin * 60_000;
}

/** Check yourself in (creating today's session if needed) and log your own effort. */
export function useMyCheckIn(campId: string, meId: string | null | undefined) {
  const t = useTodayAttendance(campId);
  const mut = useTrainingMutations(campId);
  const mine = t.todaySession && meId
    ? (t.attendance.data ?? []).find((a) => a.session_id === t.todaySession!.id && a.person_id === meId) ?? null
    : null;

  const setStatus = async (status: Attendance["status"]) => {
    if (!meId) return;
    const sessionId = t.todaySession?.id
      ?? (await mut.ensureSession.mutateAsync({ session_date: localDay(), ...DEFAULT_SESSION })).id;
    await mut.setAttendance.mutateAsync({
      session_id: sessionId, person_id: meId, status, rpe: mine?.rpe ?? null, note: mine?.note ?? null,
    });
  };

  const setRpe = async (rpe: number) => {
    if (!meId || !t.todaySession) return;
    await mut.setAttendance.mutateAsync({
      session_id: t.todaySession.id, person_id: meId, status: mine?.status ?? "present", rpe, note: mine?.note ?? null,
    });
  };

  return {
    ...t,
    mine,
    setStatus,
    setRpe,
    busy: mut.ensureSession.isPending || mut.setAttendance.isPending,
  };
}
