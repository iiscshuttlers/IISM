// Extended camp management features: Announcements, Player Goals, Equipment, Injury Follow-ups, Reflections, Skills, Weather Planning, and Accessibility
import type { Match, Member } from "./types";

export interface Announcement {
  id: string;
  camp_id: string;
  title: string;
  message: string;
  priority: "normal" | "important" | "urgent";
  author_name: string;
  created_at: string;
  expires_at: string | null;
  read_by: string[]; // person_ids who acknowledged
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
  updated_at: string;
}

export interface EquipmentItem {
  id: string;
  camp_id: string;
  name: string;
  category: "shuttles" | "rackets" | "training_aids" | "medical";
  quantity: number;
  status: "available" | "borrowed" | "needs_replacement";
  borrowed_by: string | null; // person_id
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
  reported_at: string;
  updated_at: string;
}

export interface SessionReflection {
  id: string;
  camp_id: string;
  session_id?: string | null;
  person_id: string;
  session_date: string;
  went_well: string;
  to_work_on: string;
  effort_rpe: number; // 1 to 10
  energy_level: "high" | "normal" | "low";
  created_at: string;
}

export interface SkillTechnique {
  id: string;
  camp_id?: string;
  title: string;
  category: "footwork" | "net" | "attack" | "defence" | "serve_return" | "tactics" | "doubles";
  difficulty: "fundamental" | "intermediate" | "advanced";
  description: string;
  key_cues: string[];
  common_mistakes: string[];
  suggested_drill: string;
  is_custom?: boolean;
}

export interface WeatherVenuePlan {
  camp_id: string;
  plan_type: "indoor_regular" | "indoor_backup" | "outdoor_relocated" | "heat_warning";
  venue_name: string;
  weather_summary: string;
  shuttle_speed: "76 (Slow)" | "77 (Medium)" | "78 (Fast)" | "Standard";
  athlete_notice: string;
  updated_by: string;
  updated_at: string;
}

export interface NextSessionFocus {
  id: string;
  camp_id: string;
  person_id: string;
  focus_text: string;
  assigned_by: string; // Coach name or "Self"
  created_at: string;
  completed: boolean;
  completed_at: string | null;
}

export interface PlayerMatchHistoryItem {
  matchId: string;
  playedOn: string;
  category: string;
  isWin: boolean;
  partnerName: string | null;
  opponentNames: string;
  games: string[];
  rallyDiff: number;
  ratingBefore: number;
  ratingChange: number;
  ratingAfter: number;
  formStreak: string;
}

export interface AccessibilityPrefs {
  textSize: "normal" | "large" | "xlarge";
  highContrast: boolean;
  reducedMotion: boolean;
}

const STORAGE_PREFIX = "iism_ext_";
const A11Y_KEY = "iism_a11y_prefs";

const memStore = new Map<string, string>();

function getStorage<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage !== "undefined" && localStorage && typeof localStorage.getItem === "function") {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }
  } catch {
    // fallback to memory
  }
  const mem = memStore.get(key);
  return mem ? JSON.parse(mem) : fallback;
}

function setStorage<T>(key: string, value: T): void {
  const serialized = JSON.stringify(value);
  try {
    if (typeof localStorage !== "undefined" && localStorage && typeof localStorage.setItem === "function") {
      localStorage.setItem(key, serialized);
    }
  } catch {
    // ignore
  }
  memStore.set(key, serialized);
  if (typeof window !== "undefined" && window.dispatchEvent) {
    try {
      window.dispatchEvent(new CustomEvent("iism_extended_change", { detail: { key } }));
    } catch {
      // ignore
    }
  }
}

export function clearExtendedStorage(): void {
  memStore.clear();
  try {
    if (typeof localStorage !== "undefined" && localStorage && typeof localStorage.clear === "function") {
      localStorage.clear();
    }
  } catch {
    // ignore
  }
}

// ───────── 1. Camp Announcements ─────────

export function getAnnouncements(campId: string): Announcement[] {
  const all = getStorage<Announcement[]>(`${STORAGE_PREFIX}announcements_${campId}`, []);
  const now = new Date().toISOString();
  // Sort urgent first, then by date descending
  return all
    .filter((a) => !a.expires_at || a.expires_at >= now.slice(0, 10))
    .sort((a, b) => {
      const pMap = { urgent: 3, important: 2, normal: 1 };
      if (pMap[a.priority] !== pMap[b.priority]) return pMap[b.priority] - pMap[a.priority];
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
}

export function getAllAnnouncementsHistory(campId: string): Announcement[] {
  const all = getStorage<Announcement[]>(`${STORAGE_PREFIX}announcements_${campId}`, []);
  return all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function addAnnouncement(
  campId: string,
  data: Omit<Announcement, "id" | "camp_id" | "created_at" | "read_by">
): Announcement {
  const key = `${STORAGE_PREFIX}announcements_${campId}`;
  const existing = getStorage<Announcement[]>(key, []);
  const newItem: Announcement = {
    id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    camp_id: campId,
    ...data,
    created_at: new Date().toISOString(),
    read_by: [],
  };
  setStorage(key, [newItem, ...existing]);
  return newItem;
}

export function acknowledgeAnnouncement(campId: string, announcementId: string, personId: string): void {
  const key = `${STORAGE_PREFIX}announcements_${campId}`;
  const existing = getStorage<Announcement[]>(key, []);
  const updated = existing.map((a) => {
    if (a.id === announcementId && !a.read_by.includes(personId)) {
      return { ...a, read_by: [...a.read_by, personId] };
    }
    return a;
  });
  setStorage(key, updated);
}

export function deleteAnnouncement(campId: string, announcementId: string): void {
  const key = `${STORAGE_PREFIX}announcements_${campId}`;
  const existing = getStorage<Announcement[]>(key, []);
  setStorage(key, existing.filter((a) => a.id !== announcementId));
}

// ───────── 2. Player Goals ─────────

export function getPlayerGoals(campId: string, personId?: string): PlayerGoal[] {
  const all = getStorage<PlayerGoal[]>(`${STORAGE_PREFIX}goals_${campId}`, []);
  const filtered = personId ? all.filter((g) => g.person_id === personId) : all;
  return filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

export function savePlayerGoal(
  campId: string,
  data: Omit<PlayerGoal, "id" | "camp_id" | "created_at" | "updated_at">,
  goalId?: string
): PlayerGoal {
  const key = `${STORAGE_PREFIX}goals_${campId}`;
  const existing = getStorage<PlayerGoal[]>(key, []);
  const now = new Date().toISOString();

  if (goalId) {
    const updated = existing.map((g) => (g.id === goalId ? { ...g, ...data, updated_at: now } : g));
    setStorage(key, updated);
    return updated.find((g) => g.id === goalId)!;
  }

  const newItem: PlayerGoal = {
    id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    camp_id: campId,
    ...data,
    created_at: now,
    updated_at: now,
  };
  setStorage(key, [newItem, ...existing]);
  return newItem;
}

export function deletePlayerGoal(campId: string, goalId: string): void {
  const key = `${STORAGE_PREFIX}goals_${campId}`;
  const existing = getStorage<PlayerGoal[]>(key, []);
  setStorage(key, existing.filter((g) => g.id !== goalId));
}

// ───────── 3. Equipment Tracking ─────────

export function getEquipment(campId: string): EquipmentItem[] {
  const list = getStorage<EquipmentItem[]>(`${STORAGE_PREFIX}equipment_${campId}`, [
    {
      id: "eq_default_1",
      camp_id: campId,
      name: "Yonex AS-30 Feather Shuttles (Box)",
      category: "shuttles",
      quantity: 10,
      status: "available",
      borrowed_by: null,
      borrowed_at: null,
      notes: "Tournament grade",
    },
    {
      id: "eq_default_2",
      camp_id: campId,
      name: "Agility Ladder & Cones Set",
      category: "training_aids",
      quantity: 2,
      status: "available",
      borrowed_by: null,
      borrowed_at: null,
      notes: "Footwork drills",
    },
  ]);
  return list;
}

export function saveEquipmentItem(
  campId: string,
  data: Omit<EquipmentItem, "id" | "camp_id">,
  itemId?: string
): EquipmentItem {
  const key = `${STORAGE_PREFIX}equipment_${campId}`;
  const existing = getEquipment(campId);

  if (itemId) {
    const updated = existing.map((e) => (e.id === itemId ? { ...e, ...data } : e));
    setStorage(key, updated);
    return updated.find((e) => e.id === itemId)!;
  }

  const newItem: EquipmentItem = {
    id: `eq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    camp_id: campId,
    ...data,
  };
  setStorage(key, [newItem, ...existing]);
  return newItem;
}

export function deleteEquipmentItem(campId: string, itemId: string): void {
  const key = `${STORAGE_PREFIX}equipment_${campId}`;
  const existing = getEquipment(campId);
  setStorage(key, existing.filter((e) => e.id !== itemId));
}

// ───────── 4. Injury & Wellness Follow-ups ─────────

export function getInjuryReports(campId: string, personId?: string): InjuryReport[] {
  const all = getStorage<InjuryReport[]>(`${STORAGE_PREFIX}injuries_${campId}`, []);
  const filtered = personId ? all.filter((r) => r.person_id === personId) : all;
  return filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

export function saveInjuryReport(
  campId: string,
  data: Omit<InjuryReport, "id" | "camp_id" | "reported_at" | "updated_at">,
  reportId?: string
): InjuryReport {
  const key = `${STORAGE_PREFIX}injuries_${campId}`;
  const existing = getStorage<InjuryReport[]>(key, []);
  const now = new Date().toISOString();

  if (reportId) {
    const updated = existing.map((r) => (r.id === reportId ? { ...r, ...data, updated_at: now } : r));
    setStorage(key, updated);
    return updated.find((r) => r.id === reportId)!;
  }

  const newItem: InjuryReport = {
    id: `inj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    camp_id: campId,
    ...data,
    reported_at: now,
    updated_at: now,
  };
  setStorage(key, [newItem, ...existing]);
  return newItem;
}

export function deleteInjuryReport(campId: string, reportId: string): void {
  const key = `${STORAGE_PREFIX}injuries_${campId}`;
  const existing = getStorage<InjuryReport[]>(key, []);
  setStorage(key, existing.filter((r) => r.id !== reportId));
}

// ───────── 5. Accessibility Preferences ─────────

export function getA11yPrefs(): AccessibilityPrefs {
  return getStorage<AccessibilityPrefs>(A11Y_KEY, {
    textSize: "normal",
    highContrast: false,
    reducedMotion: false,
  });
}

export function saveA11yPrefs(patch: Partial<AccessibilityPrefs>): AccessibilityPrefs {
  const current = getA11yPrefs();
  const updated: AccessibilityPrefs = { ...current, ...patch };
  setStorage(A11Y_KEY, updated);
  applyA11yPrefs(updated);
  return updated;
}

export function applyA11yPrefs(prefs: AccessibilityPrefs): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // Text size
  root.setAttribute("data-text-size", prefs.textSize);

  // High contrast / Outdoor
  root.toggleAttribute("data-outdoor", prefs.highContrast);

  // Reduced motion
  root.setAttribute("data-reduced-motion", prefs.reducedMotion ? "true" : "false");
}

// ───────── 6. Session Reflections (Post-Practice Check-in) ─────────

export function getSessionReflections(campId: string, personId?: string): SessionReflection[] {
  const all = getStorage<SessionReflection[]>(`${STORAGE_PREFIX}reflections_${campId}`, []);
  const filtered = personId ? all.filter((r) => r.person_id === personId) : all;
  return filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function saveSessionReflection(
  campId: string,
  data: Omit<SessionReflection, "id" | "camp_id" | "created_at">,
  reflectionId?: string
): SessionReflection {
  const key = `${STORAGE_PREFIX}reflections_${campId}`;
  const existing = getStorage<SessionReflection[]>(key, []);
  const now = new Date().toISOString();

  if (reflectionId) {
    const updated = existing.map((r) => (r.id === reflectionId ? { ...r, ...data } : r));
    setStorage(key, updated);
    return updated.find((r) => r.id === reflectionId)!;
  }

  const newItem: SessionReflection = {
    id: `refl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    camp_id: campId,
    ...data,
    created_at: now,
  };
  setStorage(key, [newItem, ...existing]);
  return newItem;
}

export function deleteSessionReflection(campId: string, reflectionId: string): void {
  const key = `${STORAGE_PREFIX}reflections_${campId}`;
  const existing = getStorage<SessionReflection[]>(key, []);
  setStorage(key, existing.filter((r) => r.id !== reflectionId));
}

// ───────── 7. Skill Library & Technique Notes ─────────

export const DEFAULT_SKILLS: SkillTechnique[] = [
  {
    id: "skill_clear",
    title: "Forehand Overhead Clear",
    category: "attack",
    difficulty: "fundamental",
    description: "High and deep trajectory forcing the opponent to the rear boundary, buying time to recover.",
    key_cues: [
      "Turn side-on with non-racket arm pointing up at the shuttle",
      "Hit at highest contact point slightly ahead of racket shoulder",
      "Pronate forearm and follow through diagonally toward non-racket hip",
    ],
    common_mistakes: ["Hitting behind the head", "No shoulder rotation (arm-only swing)"],
    suggested_drill: "Rear-court 2-corner alternating clears with partner (target back doubles service line).",
  },
  {
    id: "skill_backhand_clear",
    title: "Backhand Overhead Clear",
    category: "attack",
    difficulty: "intermediate",
    description: "Emergency escape shot from deep backhand corner into opponent's deep rear corner.",
    key_cues: [
      "Bevel thumb grip with thumb along back diagonal bevel",
      "Turn back fully to the net with elbow high and pointing at shuttle",
      "Relaxed wrist with sudden explosive supination at contact",
    ],
    common_mistakes: ["Tense death grip before hit", "Swinging with flat elbow"],
    suggested_drill: "Continuous backhand shadow footwork into multi-shuttle high feed (15 reps x 3 sets).",
  },
  {
    id: "skill_half_smash",
    title: "Steep Half-Smash & Slicing",
    category: "attack",
    difficulty: "intermediate",
    description: "Fast downward strike aimed at lines and midcourt gaps without expending full jump-smash energy.",
    key_cues: [
      "Quick wrist snap with 70% power focused on steep downward angle",
      "Angle racket face slightly (slice) to disguise direction",
      "Immediate forward recovery step toward T junction",
    ],
    common_mistakes: ["Hitting into net by over-snapping too early", "Admiring the shot instead of recovering"],
    suggested_drill: "Feeder lifts to mid-rear; alternate straight half-smash and cross drop.",
  },
  {
    id: "skill_tumbling_net",
    title: "Tumbling Spinning Net Shot",
    category: "net",
    difficulty: "advanced",
    description: "Brushes under the cork to make the shuttle tumble unpredictably over the white net tape.",
    key_cues: [
      "High racket head with soft fingers and relaxed grip",
      "Slicing brushing motion from outside-in across bottom of shuttle",
      "Keep racket face steady without flicking wrist",
    ],
    common_mistakes: ["Stiff wrist hitting cork flat", "Reaching down rather than lunging early"],
    suggested_drill: "Net-to-net tumble rally: 10 consecutive spinning returns without lifting.",
  },
  {
    id: "skill_net_kill",
    title: "Net Kill & Tape Push",
    category: "net",
    difficulty: "intermediate",
    description: "Aggressive interception of loose or high net shots into opponent floor.",
    key_cues: [
      "Racket head up above tape level before opponent hits",
      "Short windscreen-wiper brush or tap (avoid hitting the net)",
      "Brake racket face immediately after contact",
    ],
    common_mistakes: ["Big swing leading to racket touching net fault", "Looking down"],
    suggested_drill: "Rapid-fire loose net feeds from coach; tap 20 shuttles under 25 seconds.",
  },
  {
    id: "skill_low_serve",
    title: "Precision Low Backhand Serve",
    category: "serve_return",
    difficulty: "fundamental",
    description: "Consistent low trajectory skimming 2 inches over tape landing on front service line.",
    key_cues: [
      "Thumb on flat bevel, elbow slightly bent",
      "Hold feather tip between thumb and index finger",
      "Push through smooth horizontal line with wrist locked",
    ],
    common_mistakes: ["Flicking wrist creating high loft", "Standing too close to front line"],
    suggested_drill: "Target practice: Serve 20 shuttles trying to land inside 30cm target zone.",
  },
  {
    id: "skill_smash_defense",
    title: "Low Defense & Cross Block",
    category: "defence",
    difficulty: "fundamental",
    description: "Wide defensive stance redirecting opponent smashes into empty front corners.",
    key_cues: [
      "Wide base with knees bent, chest forward and racket out in front",
      "Absorb power with soft hands for short drop, or punch with forearm for lift",
      "Keep racket head at waist height",
    ],
    common_mistakes: ["Standing upright", "Swinging back before contact"],
    suggested_drill: "2-on-1 smash defense: two attackers alternate smashes; defender returns to front corners.",
  },
  {
    id: "skill_doubles_rotation",
    title: "Doubles Front-to-Back Attack Rotation",
    category: "doubles",
    difficulty: "intermediate",
    description: "Fluid switching between side-by-side defense and front-and-back attacking formation.",
    key_cues: [
      "When we lift, split side-by-side into defensive positions",
      "When opponent lifts, rear player attacks while front player cuts off returns at T",
      "Communicate with short calls: 'Mine', 'Go', 'Leave'",
    ],
    common_mistakes: ["Both players chasing same midcourt shuttle", "Front player turning back to watch smash"],
    suggested_drill: "Attack vs Defense 2v2 tactical rallies with locked scoring rules.",
  },
  {
    id: "skill_footwork_split",
    title: "Split-Step & 6-Corner Recovery",
    category: "footwork",
    difficulty: "fundamental",
    description: "Pre-hop loading calf tension right as opponent strikes shuttle to explode in any direction.",
    key_cues: [
      "Micro-hop landing on balls of feet as opponent hits",
      "First step pushes off rear leg toward shuttle trajectory",
      "Dynamic recovery hop back to center base",
    ],
    common_mistakes: ["Timing split too late after opponent hit", "Landing on flat heels"],
    suggested_drill: "Shadow badminton: 6-corner reaction drill responding to coach visual cues (1 min x 5).",
  },
];

export function getSkillLibrary(campId: string): SkillTechnique[] {
  const custom = getStorage<SkillTechnique[]>(`${STORAGE_PREFIX}skills_${campId}`, []);
  return [...DEFAULT_SKILLS, ...custom];
}

export function saveCustomSkill(
  campId: string,
  data: Omit<SkillTechnique, "id" | "is_custom">,
  skillId?: string
): SkillTechnique {
  const key = `${STORAGE_PREFIX}skills_${campId}`;
  const existing = getStorage<SkillTechnique[]>(key, []);

  if (skillId) {
    const updated = existing.map((s) => (s.id === skillId ? { ...s, ...data, is_custom: true } : s));
    setStorage(key, updated);
    return updated.find((s) => s.id === skillId)!;
  }

  const newItem: SkillTechnique = {
    id: `cskill_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    camp_id: campId,
    ...data,
    is_custom: true,
  };
  setStorage(key, [newItem, ...existing]);
  return newItem;
}

export function deleteCustomSkill(campId: string, skillId: string): void {
  const key = `${STORAGE_PREFIX}skills_${campId}`;
  const existing = getStorage<SkillTechnique[]>(key, []);
  setStorage(key, existing.filter((s) => s.id !== skillId));
}

// ───────── 8. Weather-aware Planning ─────────

export function getWeatherVenuePlan(campId: string): WeatherVenuePlan {
  return getStorage<WeatherVenuePlan>(`${STORAGE_PREFIX}weather_plan_${campId}`, {
    camp_id: campId,
    plan_type: "indoor_regular",
    venue_name: "IISc Gymkhana Indoor Hall (Courts 1–4)",
    weather_summary: "Indoor 26°C · Moderate humidity (68%)",
    shuttle_speed: "77 (Medium)",
    athlete_notice: "Standard indoor footwear required. Morning fitness in Main Hall.",
    updated_by: "Head Coach",
    updated_at: new Date().toISOString(),
  });
}

export function saveWeatherVenuePlan(campId: string, plan: WeatherVenuePlan): WeatherVenuePlan {
  const key = `${STORAGE_PREFIX}weather_plan_${campId}`;
  const updated: WeatherVenuePlan = {
    ...plan,
    camp_id: campId,
    updated_at: new Date().toISOString(),
  };
  setStorage(key, updated);
  return updated;
}

// ───────── 9. Goals for Next Session (Micro Focus) ─────────

export function getNextSessionFocus(campId: string, personId: string): NextSessionFocus | null {
  const all = getStorage<NextSessionFocus[]>(`${STORAGE_PREFIX}next_focus_${campId}`, []);
  return all.find((f) => f.person_id === personId) ?? null;
}

export function saveNextSessionFocus(
  campId: string,
  personId: string,
  focusText: string,
  assignedBy = "Coach"
): NextSessionFocus {
  const key = `${STORAGE_PREFIX}next_focus_${campId}`;
  const all = getStorage<NextSessionFocus[]>(key, []);
  const filtered = all.filter((f) => f.person_id !== personId);

  const newItem: NextSessionFocus = {
    id: `focus_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    camp_id: campId,
    person_id: personId,
    focus_text: focusText.trim(),
    assigned_by: assignedBy,
    created_at: new Date().toISOString(),
    completed: false,
    completed_at: null,
  };
  setStorage(key, [newItem, ...filtered]);
  return newItem;
}

export function toggleNextSessionFocus(
  campId: string,
  personId: string,
  completed: boolean
): NextSessionFocus | null {
  const key = `${STORAGE_PREFIX}next_focus_${campId}`;
  const all = getStorage<NextSessionFocus[]>(key, []);
  const item = all.find((f) => f.person_id === personId);
  if (!item) return null;

  const updatedItem: NextSessionFocus = {
    ...item,
    completed,
    completed_at: completed ? new Date().toISOString() : null,
  };

  const updatedAll = all.map((f) => (f.person_id === personId ? updatedItem : f));
  setStorage(key, updatedAll);
  return updatedItem;
}

// ───────── 10. Personal Match History & Rating Progression ─────────

export function computePlayerRatingHistory(
  personId: string,
  matches: Match[],
  members: Member[],
  startRating = 1200,
  kFactor = 32
): PlayerMatchHistoryItem[] {
  const memberMap = new Map(members.map((m) => [m.id, m.full_name]));
  const formatName = (id: string | null) => (id ? memberMap.get(id) ?? "Unknown" : "");

  // Collect all eligible confirmed matches in chronological order
  const validMatches = matches
    .filter((m) => m.status === "confirmed")
    .sort((a, b) => {
      const d1 = new Date(a.played_on || a.created_at).getTime();
      const d2 = new Date(b.played_on || b.created_at).getTime();
      return d1 - d2;
    });

  // Track dynamic ratings of all players as matches unfold
  const ratings = new Map<string, number>();
  members.forEach((m) => ratings.set(m.id, startRating));

  const history: PlayerMatchHistoryItem[] = [];
  let formAccumulator = "";

  for (const m of validMatches) {
    const isT1 = m.t1_p1 === personId || m.t1_p2 === personId;
    const isT2 = m.t2_p1 === personId || m.t2_p2 === personId;
    const isParticipant = isT1 || isT2;

    const t1Ids = [m.t1_p1, m.t1_p2].filter(Boolean) as string[];
    const t2Ids = [m.t2_p1, m.t2_p2].filter(Boolean) as string[];

    const r1 = t1Ids.reduce((acc, id) => acc + (ratings.get(id) ?? startRating), 0) / (t1Ids.length || 1);
    const r2 = t2Ids.reduce((acc, id) => acc + (ratings.get(id) ?? startRating), 0) / (t2Ids.length || 1);

    const exp1 = 1 / (1 + Math.pow(10, (r2 - r1) / 400));
    const s1 = m.winner_side === 1 ? 1 : 0;
    const delta1 = Math.round(kFactor * (s1 - exp1));
    const delta2 = -delta1;

    // Record pre-match rating
    const ratingBefore = ratings.get(personId) ?? startRating;

    // Apply rating deltas to all participants
    t1Ids.forEach((id) => ratings.set(id, (ratings.get(id) ?? startRating) + delta1));
    t2Ids.forEach((id) => ratings.set(id, (ratings.get(id) ?? startRating) + delta2));

    if (isParticipant) {
      const myDelta = isT1 ? delta1 : delta2;
      const isWin = (isT1 && m.winner_side === 1) || (isT2 && m.winner_side === 2);
      const ratingAfter = ratings.get(personId) ?? ratingBefore + myDelta;

      // Form streak update
      formAccumulator += isWin ? "W" : "L";

      // Opponents & Partner
      let partnerName: string | null = null;
      let opponentNames = "";
      if (isT1) {
        if (m.t1_p2 && m.t1_p1 === personId) partnerName = formatName(m.t1_p2);
        else if (m.t1_p1 && m.t1_p2 === personId) partnerName = formatName(m.t1_p1);
        opponentNames = [formatName(m.t2_p1), formatName(m.t2_p2)].filter(Boolean).join(" & ");
      } else {
        if (m.t2_p2 && m.t2_p1 === personId) partnerName = formatName(m.t2_p2);
        else if (m.t2_p1 && m.t2_p2 === personId) partnerName = formatName(m.t2_p1);
        opponentNames = [formatName(m.t1_p1), formatName(m.t1_p2)].filter(Boolean).join(" & ");
      }

      // Rally diff from games
      let rallyDiff = 0;
      if (m.games && Array.isArray(m.games)) {
        for (const g of m.games) {
          const parts = g.split("-").map((x) => parseInt(x.trim(), 10));
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            const myScore = isT1 ? parts[0] : parts[1];
            const oppScore = isT1 ? parts[1] : parts[0];
            rallyDiff += myScore - oppScore;
          }
        }
      }

      history.push({
        matchId: m.id,
        playedOn: m.played_on || m.created_at,
        category: m.category,
        isWin,
        partnerName,
        opponentNames,
        games: m.games || [],
        rallyDiff,
        ratingBefore,
        ratingChange: myDelta,
        ratingAfter,
        formStreak: formAccumulator,
      });
    }
  }

  return history;
}

// ───────── 11. Full Camp Backup Export ─────────

export interface CampFullBackup {
  exportDate: string;
  campId: string;
  version: "1.1";
  announcements: Announcement[];
  goals: PlayerGoal[];
  equipment: EquipmentItem[];
  injuries: InjuryReport[];
  reflections: SessionReflection[];
  customSkills: SkillTechnique[];
  weatherPlan: WeatherVenuePlan;
  nextSessionFocuses: NextSessionFocus[];
  meta: Record<string, unknown>;
}

export function exportFullCampJson(campId: string, extraMeta: Record<string, unknown> = {}): string {
  const customSkills = getSkillLibrary(campId).filter((s) => s.is_custom);
  const nextSessionFocuses = getStorage<NextSessionFocus[]>(`${STORAGE_PREFIX}next_focus_${campId}`, []);
  const backup: CampFullBackup = {
    exportDate: new Date().toISOString(),
    campId,
    version: "1.1",
    announcements: getAllAnnouncementsHistory(campId),
    goals: getPlayerGoals(campId),
    equipment: getEquipment(campId),
    injuries: getInjuryReports(campId),
    reflections: getSessionReflections(campId),
    customSkills,
    weatherPlan: getWeatherVenuePlan(campId),
    nextSessionFocuses,
    meta: extraMeta,
  };
  return JSON.stringify(backup, null, 2);
}
