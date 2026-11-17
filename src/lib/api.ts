import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { must, supabase } from "./supabase";
import { isNetworkError, newClientId, outbox, recordArgs } from "./outbox";
import type {
  ActivityRow, Assessment, Attendance, Camp, Drill, Match, Member, Person, Role,
  RosterAdminRow, SelectionRow, Session, SquadRow, Standing, Wellness,
} from "./types";
import type { Category } from "./scores";
import { sortEvents, type TrainingEvent } from "./disciplines";

// "*" rather than a column list so a newer column (e.g. court_count from 0005) can't break
// loading the camp if the site deploys before its migration has been run.
const CAMP_COLS = "*";

// ───────── Camps & roster ─────────

export const useCamps = (enabled: boolean) =>
  useQuery({
    queryKey: ["camps"],
    enabled,
    queryFn: async () => must(await supabase.from("camps").select(CAMP_COLS).order("created_at", { ascending: false })) as Camp[],
  });

export const useIsSiteAdmin = (enabled: boolean) =>
  useQuery({
    queryKey: ["isSiteAdmin"],
    enabled,
    queryFn: async () => must(await supabase.rpc("is_site_admin")) as boolean,
  });

export const useRole = (campId: string | undefined) =>
  useQuery({
    queryKey: ["role", campId],
    enabled: !!campId,
    queryFn: async () => must(await supabase.rpc("camp_role", { p_camp: campId })) as Role | null,
  });

export const useMembers = (campId: string | undefined) =>
  useQuery({
    queryKey: ["members", campId],
    enabled: !!campId,
    queryFn: async (): Promise<Member[]> => {
      // "*" so the roster still loads before migration 0009 adds `events`.
      const rows = must(
        await supabase.from("camp_members").select("*").eq("camp_id", campId!),
      ) as { person_id: string; role: Role; activity_muted: boolean; events?: string[] | null }[];
      const ids = rows.map((r) => r.person_id);
      const people = ids.length
        ? (must(await supabase.from("people").select("id, full_name, gender").in("id", ids)) as Person[])
        : [];
      const byId = Object.fromEntries(people.map((p) => [p.id, p]));
      return rows
        .filter((r) => byId[r.person_id])
        .map((r) => ({
          ...byId[r.person_id], role: r.role, activity_muted: r.activity_muted,
          ...(r.events !== undefined ? { events: sortEvents(r.events ?? []) } : {}),
        }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });

/** Staff set what a player is training for (singles, doubles, mixed; any mix). */
export function useSetMemberEvents(campId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { person_id: string; events: TrainingEvent[] }) =>
      must(await supabase.rpc("set_member_events", { p_camp: campId, p_person: a.person_id, p_events: a.events })),
    // Shown at once; a failed save puts the list back as the server has it.
    onMutate: (a) => {
      qc.setQueryData<Member[]>(["members", campId], (old) =>
        old?.map((m) => (m.id === a.person_id ? { ...m, events: a.events } : m)));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["members", campId] }),
  });
}

export const useRosterAdmin = (campId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ["rosterAdmin", campId],
    enabled: !!campId && enabled,
    queryFn: async () => must(await supabase.rpc("get_roster_admin", { p_camp: campId })) as RosterAdminRow[],
  });

// ───────── Matches & standings ─────────

export const useMatches = (campId: string | undefined) =>
  useQuery({
    queryKey: ["matches", campId],
    enabled: !!campId,
    queryFn: async () =>
      must(
        await supabase
          .from("matches")
          .select("id, camp_id, played_on, category, t1_p1, t1_p2, t2_p1, t2_p2, games, winner_side, status, dispute_reason, disputed_by, recorded_by, created_at")
          .eq("camp_id", campId!)
          .order("played_on", { ascending: false })
          .order("created_at", { ascending: false }),
      ) as Match[],
  });

export const useStandings = (campId: string | undefined) =>
  useQuery({
    queryKey: ["standings", campId],
    enabled: !!campId,
    queryFn: async () => must(await supabase.rpc("get_standings", { p_camp: campId })) as Standing[],
  });

export interface MatchInput {
  playedOn: string;
  category: Category;
  slots: (string | null)[];
  games: string[] | null;
  winner: 1 | 2;
}

const matchArgs = (m: MatchInput) => ({
  p_played_on: m.playedOn,
  p_category: m.category,
  p_t1_p1: m.slots[0],
  p_t1_p2: m.slots[1] ?? null,
  p_t2_p1: m.slots[2],
  p_t2_p2: m.slots[3] ?? null,
  p_games: m.games ?? [],
  p_winner_side: m.winner,
});

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

export function useMatchMutations(campId: string) {
  const inv = useInvalidate();
  const after = () => inv("matches", "standings", "activity");
  return {
    /** Saves now, or queues on the phone when offline (then `queued` is true). */
    record: useMutation({
      mutationFn: async (m: MatchInput): Promise<{ id: string | null; queued: boolean }> => {
        const clientId = newClientId();
        const queue = () => {
          outbox.add({ clientId, campId, input: m, queuedAt: new Date().toISOString() });
          return { id: null, queued: true };
        };
        if (typeof navigator !== "undefined" && navigator.onLine === false) return queue();
        try {
          const res = await supabase.rpc("record_match", recordArgs(campId, m, clientId));
          if (res.error && isNetworkError(res.error)) return queue();
          return { id: must(res) as string, queued: false };
        } catch (e) {
          if (isNetworkError(e)) return queue();
          throw e;
        }
      },
      onSuccess: after,
    }),
    edit: useMutation({
      mutationFn: async ({ id, m }: { id: string; m: MatchInput }) =>
        must(await supabase.rpc("edit_match", { p_match: id, ...matchArgs(m) })),
      onSuccess: after,
    }),
    dispute: useMutation({
      mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
        must(await supabase.rpc("dispute_match", { p_match: id, p_reason: reason })),
      onSuccess: after,
    }),
    /** Camp admin only, and only for a voided match. Can't be undone. */
    removeForever: useMutation({
      mutationFn: async (id: string) => must(await supabase.rpc("delete_match", { p_match: id })),
      onSuccess: after,
    }),
    resolve: useMutation({
      mutationFn: async (a: { id: string; status: "confirmed" | "void"; games: string[] | null; winner: 1 | 2 }) =>
        must(await supabase.rpc("resolve_match", {
          p_match: a.id, p_status: a.status, p_games: a.games ?? [], p_winner_side: a.winner,
        })),
      onSuccess: after,
    }),
  };
}

// ───────── Training log ─────────

export const useSessions = (campId: string | undefined) =>
  useQuery({
    queryKey: ["sessions", campId],
    enabled: !!campId,
    queryFn: async () =>
      must(
        await supabase
          .from("sessions")
          .select("id, camp_id, session_date, title, focus, notes, duration_min, created_by")
          .eq("camp_id", campId!)
          .order("session_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ) as Session[],
  });

export const useDrills = (sessionIds: string[]) =>
  useQuery({
    queryKey: ["drills", sessionIds.join(",")],
    enabled: sessionIds.length > 0,
    queryFn: async () =>
      must(
        await supabase
          .from("session_drills")
          .select("id, session_id, drill_name, drill_type, duration_min, sets, reps, intensity, notes")
          .in("session_id", sessionIds)
          .order("created_at"),
      ) as Drill[],
  });

export const useAttendance = (sessionIds: string[]) =>
  useQuery({
    queryKey: ["attendance", sessionIds.join(",")],
    enabled: sessionIds.length > 0,
    queryFn: async () =>
      must(
        await supabase.from("attendance").select("session_id, person_id, status, rpe, note, created_at").in("session_id", sessionIds),
      ) as Attendance[],
  });

export function useTrainingMutations(campId: string) {
  const inv = useInvalidate();
  return {
    addSession: useMutation({
      mutationFn: async (s: { session_date: string; title: string; focus: string; notes: string; duration_min?: number | null }) =>
        must(await supabase.from("sessions").insert({ camp_id: campId, ...s }).select("id").single()) as { id: string },
      onSuccess: () => inv("sessions"),
    }),
    /** The day's first session, created only if there isn't one yet. Safe when several phones
     *  check in at the same moment (the database serialises them). */
    ensureSession: useMutation({
      mutationFn: async (s: { session_date: string; title: string; focus: string; notes?: string; duration_min?: number | null }) =>
        ({
          id: must(await supabase.rpc("ensure_session", {
            p_camp: campId, p_day: s.session_date, p_title: s.title, p_focus: s.focus, p_duration_min: s.duration_min ?? null,
          })) as string,
        }),
      onSuccess: () => inv("sessions"),
    }),
    updateSession: useMutation({
      mutationFn: async ({ id, ...s }: { id: string; title: string; focus: string; notes: string; duration_min?: number | null }) =>
        must(await supabase.from("sessions").update(s).eq("id", id)),
      onSuccess: () => inv("sessions"),
    }),
    deleteSession: useMutation({
      mutationFn: async (id: string) => must(await supabase.from("sessions").delete().eq("id", id)),
      onSuccess: () => inv("sessions", "drills", "attendance"),
    }),
    addDrill: useMutation({
      mutationFn: async (d: Omit<Drill, "id">) => must(await supabase.from("session_drills").insert(d)),
      onSuccess: () => inv("drills"),
    }),
    deleteDrill: useMutation({
      mutationFn: async (id: string) => must(await supabase.from("session_drills").delete().eq("id", id)),
      onSuccess: () => inv("drills"),
    }),
    setAttendance: useMutation({
      mutationFn: async (a: Attendance) =>
        must(await supabase.from("attendance").upsert(a, { onConflict: "session_id,person_id" })),
      onSuccess: () => inv("attendance"),
    }),
    /** Marks many people in one request (e.g. "Mark all present"). */
    setAttendanceBulk: useMutation({
      mutationFn: async (rows: Attendance[]) =>
        must(await supabase.from("attendance").upsert(rows, { onConflict: "session_id,person_id" })),
      onSuccess: () => inv("attendance"),
    }),
    deleteAttendance: useMutation({
      mutationFn: async ({ session_id, person_id }: { session_id: string; person_id: string }) =>
        must(await supabase.from("attendance").delete().eq("session_id", session_id).eq("person_id", person_id)),
      onSuccess: () => inv("attendance"),
    }),
    clearSessionAttendance: useMutation({
      mutationFn: async (session_id: string) =>
        must(await supabase.from("attendance").delete().eq("session_id", session_id)),
      onSuccess: () => inv("attendance"),
    }),
  };
}

// ───────── Assessments & selection (staff) ─────────

export const useAssessments = (campId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ["assessments", campId],
    enabled: !!campId && enabled,
    queryFn: async () =>
      must(
        await supabase
          .from("assessments")
          .select("id, person_id, coach_id, assessed_on, technique, fitness, tactics, attitude, note")
          .eq("camp_id", campId!)
          .order("assessed_on", { ascending: false }),
      ) as Assessment[],
  });

export const useSelection = (campId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ["selection", campId],
    enabled: !!campId && enabled,
    queryFn: async () =>
      must(await supabase.from("selection").select("person_id, decision, note").eq("camp_id", campId!)) as SelectionRow[],
  });

export const useSquad = (campId: string | undefined) =>
  useQuery({
    queryKey: ["squad", campId],
    enabled: !!campId,
    queryFn: async () => must(await supabase.rpc("get_squad", { p_camp: campId })) as SquadRow[],
  });

export function useStaffMutations(campId: string) {
  const inv = useInvalidate();
  return {
    addAssessment: useMutation({
      mutationFn: async (a: Omit<Assessment, "id" | "coach_id">) =>
        must(await supabase.from("assessments").insert({ camp_id: campId, ...a })),
      onSuccess: () => inv("assessments"),
    }),
    setDecision: useMutation({
      mutationFn: async (s: SelectionRow) =>
        must(await supabase.from("selection").upsert({ camp_id: campId, ...s }, { onConflict: "camp_id,person_id" })),
      onSuccess: () => inv("selection", "squad"),
    }),
    clearDecision: useMutation({
      mutationFn: async (personId: string) =>
        must(await supabase.from("selection").delete().eq("camp_id", campId).eq("person_id", personId)),
      onSuccess: () => inv("selection", "squad"),
    }),
    lock: useMutation({
      mutationFn: async () => must(await supabase.rpc("lock_selection", { p_camp: campId })),
      onSuccess: () => inv("camps", "squad", "selection"),
    }),
    unlock: useMutation({
      mutationFn: async (reason: string) => must(await supabase.rpc("unlock_selection", { p_camp: campId, p_reason: reason })),
      onSuccess: () => inv("camps", "squad", "selection"),
    }),
  };
}

// ───────── Camp admin ─────────

export function useAdminMutations(campId: string) {
  const inv = useInvalidate();
  const roster = () => inv("members", "rosterAdmin", "standings");
  return {
    updateCamp: useMutation({
      mutationFn: async (patch: Partial<Omit<Camp, "id" | "selection_locked_at">>) =>
        must(await supabase.from("camps").update(patch).eq("id", campId)),
      onSuccess: () => inv("camps", "standings", "matches", "squad"),
    }),
    addPerson: useMutation({
      mutationFn: async (p: { full_name: string; gender: string; email: string; role: Role }) =>
        must(await supabase.rpc("add_camp_person", {
          p_camp: campId, p_full_name: p.full_name, p_gender: p.gender, p_email: p.email, p_role: p.role,
        })),
      onSuccess: roster,
    }),
    /** Adds several people one after another; reports each one's outcome, refreshes once. */
    addPeople: useMutation({
      mutationFn: async (people: { full_name: string; gender: string; email: string; role: Role }[]) => {
        const results: { name: string; error: string | null }[] = [];
        for (const p of people) {
          const res = await supabase.rpc("add_camp_person", {
            p_camp: campId, p_full_name: p.full_name, p_gender: p.gender, p_email: p.email, p_role: p.role,
          });
          results.push({ name: p.full_name, error: res.error ? res.error.message : null });
        }
        return results;
      },
      onSettled: roster,
    }),
    updatePerson: useMutation({
      mutationFn: async (p: { person_id: string; full_name: string; gender: string; email: string }) =>
        must(await supabase.rpc("update_camp_person", {
          p_camp: campId, p_person: p.person_id, p_full_name: p.full_name, p_gender: p.gender, p_email: p.email,
        })),
      onSuccess: roster,
    }),
    setRole: useMutation({
      mutationFn: async (a: { person_id: string; role: Role }) =>
        must(await supabase.rpc("set_member_role", { p_camp: campId, p_person: a.person_id, p_role: a.role })),
      onSuccess: roster,
    }),
    remove: useMutation({
      mutationFn: async (personId: string) =>
        must(await supabase.rpc("remove_camp_member", { p_camp: campId, p_person: personId })),
      onSuccess: roster,
    }),
    setMuted: useMutation({
      mutationFn: async (a: { person_id: string; muted: boolean }) =>
        must(await supabase.rpc("set_activity_muted", { p_camp: campId, p_person: a.person_id, p_muted: a.muted })),
      onSuccess: roster,
    }),
  };
}

export function useCreateCamp() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (c: { name: string; starts_on: string; ends_on: string; selection_target: number }) =>
      must(await supabase.rpc("create_camp", {
        p_name: c.name, p_starts_on: c.starts_on || null, p_ends_on: c.ends_on || null, p_selection_target: c.selection_target,
      })) as string,
    onSuccess: () => inv("camps"),
  });
}

// ───────── Activity ─────────

export const useActivity = (campId: string | undefined) =>
  useQuery({
    queryKey: ["activity", campId],
    enabled: !!campId,
    queryFn: async () =>
      must(
        await supabase
          .from("activity")
          .select("id, kind, match_id, message, created_at, read_at")
          .eq("camp_id", campId!)
          .order("created_at", { ascending: false })
          .limit(100),
      ) as ActivityRow[],
  });

/** Marks one alert read (when it's opened). */
export function useMarkActivityItemRead() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (id: number) =>
      must(await supabase.from("activity").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null)),
    onSuccess: () => inv("activity"),
  });
}

export function useMarkActivityRead(campId: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async () =>
      must(await supabase.from("activity").update({ read_at: new Date().toISOString() }).eq("camp_id", campId).is("read_at", null)),
    onSuccess: () => inv("activity"),
  });
}

// ───────── Wellness check-in ─────────

/** Own rows for players; every row for staff (enforced by RLS). Last 28 days. */
export const useWellness = (campId: string | undefined) =>
  useQuery({
    queryKey: ["wellness", campId],
    enabled: !!campId,
    queryFn: async () => {
      const since = new Date(Date.now() - 28 * 864e5).toLocaleDateString("en-CA");
      return must(
        await supabase
          .from("wellness")
          .select("person_id, day, sleep, soreness, energy, mood, note")
          .eq("camp_id", campId!)
          .gte("day", since)
          .order("day", { ascending: false }),
      ) as Wellness[];
    },
  });

export function useSaveWellness(campId: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (w: Wellness) =>
      must(await supabase.from("wellness").upsert({ camp_id: campId, ...w }, { onConflict: "camp_id,person_id,day" })),
    onSuccess: () => inv("wellness"),
  });
}
