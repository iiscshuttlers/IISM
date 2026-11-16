import type { Category, Gender } from "./scores";

export type Role = "admin" | "coach" | "player";

export interface Camp {
  id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  status: "active" | "closed";
  selection_target: number;
  visibility: "staff" | "members";
  players_see_all_results: boolean;
  publish_selection: boolean;
  activity_enabled: boolean;
  selection_locked_at: string | null;
  /** Courts on the live board (migration 0005). Missing before that migration runs: treat as 4. */
  court_count?: number;
}

export interface Person {
  id: string;
  full_name: string;
  gender: Gender;
}

export interface Member extends Person {
  role: Role;
  activity_muted: boolean;
}

export interface RosterAdminRow {
  person_id: string;
  full_name: string;
  gender: Gender;
  email: string | null;
  role: Role;
  activity_muted: boolean;
  signed_in: boolean;
}

export interface Match {
  id: string;
  camp_id: string;
  played_on: string;
  category: Category;
  t1_p1: string;
  t1_p2: string | null;
  t2_p1: string;
  t2_p2: string | null;
  games: string[] | null;
  winner_side: 1 | 2;
  status: "confirmed" | "disputed" | "void";
  dispute_reason: string | null;
  disputed_by: string | null;
  recorded_by: string;
  created_at: string;
}

export interface Standing {
  person_id: string;
  full_name: string;
  gender: Gender;
  rating: number;
  played: number;
  won: number;
  lost: number;
  points_for: number;
  points_against: number;
  form: string;
  by_category: Record<string, { w: number; l: number }>;
  /** Glicko-2 rating (starts 1500) and its deviation; ±2·RD is a ~95% range. */
  glicko: number;
  glicko_rd: number;
  /** Ratings that only move with that discipline's matches (migration 0006; absent before it). */
  rating_singles?: number;
  rating_doubles?: number;
  rating_mixed?: number;
  played_singles?: number;
  played_doubles?: number;
  played_mixed?: number;
}

export interface Session {
  id: string;
  camp_id: string;
  session_date: string;
  title: string;
  focus: string | null;
  notes: string | null;
  duration_min: number | null;
  created_by: string | null;
}

export interface Wellness {
  person_id: string;
  day: string;
  sleep: number;
  soreness: number;
  energy: number;
  mood: number;
  note: string | null;
}

export const DRILL_TYPES = [
  { value: "footwork", label: "Footwork" },
  { value: "net", label: "Net play" },
  { value: "smash", label: "Smash / attack" },
  { value: "defence", label: "Defence" },
  { value: "serve_return", label: "Serve & return" },
  { value: "multi_shuttle", label: "Multi-shuttle" },
  { value: "fitness", label: "Fitness" },
  { value: "match_play", label: "Match play" },
  { value: "other", label: "Other" },
] as const;
export type DrillType = (typeof DRILL_TYPES)[number]["value"];

export interface Drill {
  id: string;
  session_id: string;
  drill_name: string;
  drill_type: DrillType;
  duration_min: number | null;
  sets: number | null;
  reps: number | null;
  intensity: number | null;
  notes: string | null;
}

export interface Attendance {
  session_id: string;
  person_id: string;
  status: "present" | "late" | "absent";
  rpe: number | null;
  note: string | null;
  /** When the person was first marked for this session (read-only; set by the database). */
  created_at?: string;
}

export interface Assessment {
  id: string;
  person_id: string;
  coach_id: string | null;
  assessed_on: string;
  technique: number | null;
  fitness: number | null;
  tactics: number | null;
  attitude: number | null;
  note: string | null;
}

export interface SelectionRow {
  person_id: string;
  decision: "selected" | "standby" | "not_selected";
  note: string | null;
}

export interface SquadRow {
  person_id: string;
  full_name: string;
  gender: Gender;
  decision: SelectionRow["decision"];
  note: string | null;
  published: boolean;
}

export interface ActivityRow {
  id: number;
  kind: string;
  match_id: string | null;
  message: string;
  created_at: string;
  read_at: string | null;
}
