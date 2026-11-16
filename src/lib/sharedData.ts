// Camp features stored in the camp database (migration 0004), so everyone in the camp sees the
// same data: announcements, goals, equipment, injury reports, reflections, custom skills, the
// venue plan and next-session focus. Who may read or write what is enforced by row-level
// security; the UI only mirrors it.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { must, supabase } from "./supabase";
import type { SkillTechnique } from "./campExtended";

// ───────── Types ─────────

export type Priority = "normal" | "important" | "urgent";

export interface Announcement {
  id: string;
  camp_id: string;
  title: string;
  message: string;
  priority: Priority;
  expires_on: string | null;
  created_by: string | null;
  created_at: string;
  /** Who acknowledged it. Players only ever see themselves here; coaches see everyone. */
  read_by: string[];
}

export interface PlayerGoal {
  id: string;
  camp_id: string;
  person_id: string;
  title: string;
  category: "technique" | "fitness" | "tactics" | "mental";
  target_date: string | null;
  status: "in_progress" | "achieved" | "needs_work";
  coach_feedback: string | null;
  created_at: string;
}

export interface EquipmentItem {
  id: string;
  camp_id: string;
  name: string;
  category: "shuttles" | "rackets" | "training_aids" | "medical";
  quantity: number;
  status: "available" | "borrowed" | "needs_replacement";
  borrowed_by: string | null;
  borrowed_at: string | null;
  notes: string | null;
}

export interface InjuryReport {
  id: string;
  camp_id: string;
  person_id: string;
  body_part: string;
  severity: "mild" | "moderate" | "severe";
  notes: string;
  status: "new" | "reviewing" | "modified_training" | "cleared";
  staff_notes: string | null;
  created_at: string;
}

export interface SessionReflection {
  id: string;
  camp_id: string;
  person_id: string;
  session_id: string | null;
  session_date: string;
  went_well: string;
  to_work_on: string;
  effort_rpe: number;
  energy_level: "high" | "normal" | "low";
  created_at: string;
}

export interface VenuePlan {
  camp_id: string;
  plan_type: "indoor_regular" | "indoor_backup" | "outdoor_relocated" | "heat_warning";
  venue_name: string;
  weather_summary: string;
  shuttle_speed: "76 (Slow)" | "77 (Medium)" | "78 (Fast)" | "Standard";
  athlete_notice: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface CourtAllocation {
  camp_id: string;
  court_num: number;
  status: "match" | "drill" | "warmup";
  title: string;
  subtitle: string | null;
  started_at: string;
}

/** Courts shown on the live board. A court with no allocation is open. */
export const COURT_NUMBERS = [1, 2, 3, 4] as const;

export interface NextSessionFocus {
  camp_id: string;
  person_id: string;
  focus_text: string;
  source: "manual" | "skill_library";
  set_by: string | null;
  set_at: string;
  completed: boolean;
  completed_at: string | null;
}

// ───────── Helpers ─────────

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

const PRIORITY_RANK: Record<Priority, number> = { urgent: 3, important: 2, normal: 1 };

/** Announcements still in date on `day` (YYYY-MM-DD), urgent first, then newest first. */
export function activeAnnouncements(list: Announcement[], day: string): Announcement[] {
  return list
    .filter((a) => !a.expires_on || a.expires_on >= day)
    .sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || b.created_at.localeCompare(a.created_at));
}

type CustomSkillRow = Omit<SkillTechnique, "is_custom" | "camp_id"> & { camp_id: string };

/** A coach-added skill in the shape the skill library already shows. */
export const toSkill = (r: CustomSkillRow): SkillTechnique => ({ ...r, is_custom: true });

// ───────── Announcements ─────────

export const useAnnouncements = (campId: string | undefined) =>
  useQuery({
    queryKey: ["announcements", campId],
    enabled: !!campId,
    queryFn: async (): Promise<Announcement[]> => {
      const rows = must(
        await supabase
          .from("announcements")
          .select("id, camp_id, title, message, priority, expires_on, created_by, created_at, announcement_reads(person_id)")
          .eq("camp_id", campId!)
          .order("created_at", { ascending: false })
          .limit(100),
      ) as (Omit<Announcement, "read_by"> & { announcement_reads: { person_id: string }[] | null })[];
      return rows.map(({ announcement_reads, ...a }) => ({ ...a, read_by: (announcement_reads ?? []).map((r) => r.person_id) }));
    },
  });

export function useAnnouncementMutations(campId: string) {
  const inv = useInvalidate();
  const after = () => inv("announcements");
  return {
    post: useMutation({
      mutationFn: async (a: { title: string; message: string; priority: Priority; expires_on: string | null }) =>
        must(await supabase.from("announcements").insert({ camp_id: campId, ...a })),
      onSuccess: after,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => must(await supabase.from("announcements").delete().eq("id", id)),
      onSuccess: after,
    }),
    acknowledge: useMutation({
      mutationFn: async (a: { announcementId: string; personId: string }) =>
        must(
          await supabase
            .from("announcement_reads")
            .upsert({ announcement_id: a.announcementId, person_id: a.personId }, {
              onConflict: "announcement_id,person_id",
              ignoreDuplicates: true,
            }),
        ),
      onSuccess: after,
    }),
  };
}

// ───────── Player goals ─────────

const GOAL_COLS = "id, camp_id, person_id, title, category, target_date, status, coach_feedback, created_at";

export const usePlayerGoals = (campId: string | undefined, personId: string | undefined) =>
  useQuery({
    queryKey: ["goals", campId, personId],
    enabled: !!campId && !!personId,
    queryFn: async () =>
      must(
        await supabase
          .from("player_goals")
          .select(GOAL_COLS)
          .eq("camp_id", campId!)
          .eq("person_id", personId!)
          .order("created_at", { ascending: false }),
      ) as PlayerGoal[],
  });

type GoalInput = Pick<PlayerGoal, "person_id" | "title" | "category" | "target_date" | "status" | "coach_feedback">;

export function useGoalMutations(campId: string) {
  const inv = useInvalidate();
  const after = () => inv("goals");
  return {
    save: useMutation({
      mutationFn: async ({ id, ...g }: GoalInput & { id?: string }) =>
        id
          ? must(await supabase.from("player_goals").update(g).eq("id", id))
          : must(await supabase.from("player_goals").insert({ camp_id: campId, ...g })),
      onSuccess: after,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => must(await supabase.from("player_goals").delete().eq("id", id)),
      onSuccess: after,
    }),
  };
}

// ───────── Equipment ─────────

export const useEquipment = (campId: string | undefined) =>
  useQuery({
    queryKey: ["equipment", campId],
    enabled: !!campId,
    queryFn: async () =>
      must(
        await supabase
          .from("equipment")
          .select("id, camp_id, name, category, quantity, status, borrowed_by, borrowed_at, notes")
          .eq("camp_id", campId!)
          .order("name"),
      ) as EquipmentItem[],
  });

type EquipmentInput = Omit<EquipmentItem, "id" | "camp_id">;

export function useEquipmentMutations(campId: string) {
  const inv = useInvalidate();
  const after = () => inv("equipment");
  return {
    save: useMutation({
      mutationFn: async ({ id, ...e }: EquipmentInput & { id?: string }) =>
        id
          ? must(await supabase.from("equipment").update(e).eq("id", id))
          : must(await supabase.from("equipment").insert({ camp_id: campId, ...e })),
      onSuccess: after,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => must(await supabase.from("equipment").delete().eq("id", id)),
      onSuccess: after,
    }),
  };
}

// ───────── Injury reports ─────────

/** A player gets their own reports; coaches get everyone's (enforced by the database). */
export const useInjuryReports = (campId: string | undefined) =>
  useQuery({
    queryKey: ["injuries", campId],
    enabled: !!campId,
    queryFn: async () =>
      must(
        await supabase
          .from("injury_reports")
          .select("id, camp_id, person_id, body_part, severity, notes, status, staff_notes, created_at")
          .eq("camp_id", campId!)
          .order("created_at", { ascending: false }),
      ) as InjuryReport[],
  });

type InjuryInput = Pick<InjuryReport, "person_id" | "body_part" | "severity" | "notes" | "status" | "staff_notes">;

export function useInjuryMutations(campId: string) {
  const inv = useInvalidate();
  const after = () => inv("injuries");
  return {
    save: useMutation({
      mutationFn: async ({ id, ...r }: InjuryInput & { id?: string }) =>
        id
          ? must(await supabase.from("injury_reports").update(r).eq("id", id))
          : must(await supabase.from("injury_reports").insert({ camp_id: campId, ...r })),
      onSuccess: after,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => must(await supabase.from("injury_reports").delete().eq("id", id)),
      onSuccess: after,
    }),
  };
}

// ───────── Post-practice reflections ─────────

export const useReflections = (campId: string | undefined, personId: string | null | undefined) =>
  useQuery({
    queryKey: ["reflections", campId, personId],
    enabled: !!campId && !!personId,
    queryFn: async () =>
      must(
        await supabase
          .from("session_reflections")
          .select("id, camp_id, person_id, session_id, session_date, went_well, to_work_on, effort_rpe, energy_level, created_at")
          .eq("camp_id", campId!)
          .eq("person_id", personId!)
          .order("created_at", { ascending: false }),
      ) as SessionReflection[],
  });

type ReflectionInput = Omit<SessionReflection, "id" | "camp_id" | "created_at">;

export function useReflectionMutations(campId: string) {
  const inv = useInvalidate();
  const after = () => inv("reflections");
  return {
    add: useMutation({
      mutationFn: async (r: ReflectionInput) =>
        must(await supabase.from("session_reflections").insert({ camp_id: campId, ...r })),
      onSuccess: after,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => must(await supabase.from("session_reflections").delete().eq("id", id)),
      onSuccess: after,
    }),
  };
}

// ───────── Custom skills ─────────

export const useCustomSkills = (campId: string | undefined) =>
  useQuery({
    queryKey: ["customSkills", campId],
    enabled: !!campId,
    queryFn: async () =>
      (must(
        await supabase
          .from("custom_skills")
          .select("id, camp_id, title, category, difficulty, description, key_cues, common_mistakes, suggested_drill")
          .eq("camp_id", campId!)
          .order("created_at"),
      ) as CustomSkillRow[]).map(toSkill),
  });

type SkillInput = Pick<SkillTechnique, "title" | "category" | "difficulty" | "description" | "key_cues" | "common_mistakes" | "suggested_drill">;

export function useCustomSkillMutations(campId: string) {
  const inv = useInvalidate();
  const after = () => inv("customSkills");
  return {
    add: useMutation({
      mutationFn: async (s: SkillInput) => must(await supabase.from("custom_skills").insert({ camp_id: campId, ...s })),
      onSuccess: after,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => must(await supabase.from("custom_skills").delete().eq("id", id)),
      onSuccess: after,
    }),
  };
}

// ───────── Venue & conditions plan ─────────

export const useVenuePlan = (campId: string | undefined) =>
  useQuery({
    queryKey: ["venuePlan", campId],
    enabled: !!campId,
    queryFn: async () =>
      must(
        await supabase
          .from("venue_plans")
          .select("camp_id, plan_type, venue_name, weather_summary, shuttle_speed, athlete_notice, created_by, updated_by, created_at, updated_at")
          .eq("camp_id", campId!)
          .maybeSingle(),
      ) as VenuePlan | null,
  });

type VenueInput = Pick<VenuePlan, "plan_type" | "venue_name" | "weather_summary" | "shuttle_speed" | "athlete_notice">;

export function useSaveVenuePlan(campId: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (p: VenueInput) =>
      must(await supabase.from("venue_plans").upsert({ camp_id: campId, ...p }, { onConflict: "camp_id" })),
    onSuccess: () => inv("venuePlan"),
  });
}

// ───────── Live courts ─────────

export const useCourts = (campId: string | undefined) =>
  useQuery({
    queryKey: ["courts", campId],
    enabled: !!campId,
    queryFn: async () =>
      must(
        await supabase
          .from("court_allocations")
          .select("camp_id, court_num, status, title, subtitle, started_at")
          .eq("camp_id", campId!)
          .order("court_num"),
      ) as CourtAllocation[],
  });

export function useCourtMutations(campId: string) {
  const inv = useInvalidate();
  const after = () => inv("courts");
  return {
    assign: useMutation({
      mutationFn: async (c: Omit<CourtAllocation, "camp_id">) =>
        must(await supabase.from("court_allocations").upsert({ camp_id: campId, ...c }, { onConflict: "camp_id,court_num" })),
      onSuccess: after,
    }),
    free: useMutation({
      mutationFn: async (courtNum: number) =>
        must(await supabase.from("court_allocations").delete().eq("camp_id", campId).eq("court_num", courtNum)),
      onSuccess: after,
    }),
  };
}

// ───────── Next-session focus ─────────

export const useNextFocus = (campId: string | undefined, personId: string | null | undefined) =>
  useQuery({
    queryKey: ["nextFocus", campId, personId],
    enabled: !!campId && !!personId,
    queryFn: async () =>
      must(
        await supabase
          .from("next_session_focus")
          .select("camp_id, person_id, focus_text, source, set_by, set_at, completed, completed_at")
          .eq("camp_id", campId!)
          .eq("person_id", personId!)
          .maybeSingle(),
      ) as NextSessionFocus | null,
  });

export function useNextFocusMutations(campId: string) {
  const inv = useInvalidate();
  const after = () => inv("nextFocus");
  return {
    /** Replaces the person's focus. Who set it is recorded by the database. */
    set: useMutation({
      mutationFn: async (f: { personId: string; text: string; source?: NextSessionFocus["source"] }) =>
        must(
          await supabase.from("next_session_focus").upsert(
            { camp_id: campId, person_id: f.personId, focus_text: f.text.trim(), source: f.source ?? "manual", completed: false },
            { onConflict: "camp_id,person_id" },
          ),
        ),
      onSuccess: after,
    }),
    setCompleted: useMutation({
      mutationFn: async (f: { personId: string; completed: boolean }) =>
        must(
          await supabase
            .from("next_session_focus")
            .update({ completed: f.completed })
            .eq("camp_id", campId)
            .eq("person_id", f.personId),
        ),
      onSuccess: after,
    }),
  };
}
