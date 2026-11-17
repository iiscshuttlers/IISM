// Device-local helpers and built-in reference data: accessibility preferences (per phone), the
// built-in skill library, and personal rating history. Camp data that everyone shares
// (announcements, goals, equipment, injuries, reflections, custom skills, venue plan, courts,
// next-session focus) lives in the camp database: see sharedData.ts.
import type { Match, Member } from "./types";

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

/**
 * Forgets what this module saved, and nothing else. The sign-in session, the offline match
 * queue and other sites on the same github.io origin share this storage, so never clear() it.
 */
export function clearExtendedStorage(): void {
  memStore.clear();
  try {
    if (typeof localStorage !== "undefined" && localStorage && typeof localStorage.removeItem === "function") {
      localStorage.removeItem(A11Y_KEY);
    }
  } catch {
    // ignore
  }
}

// ───────── Accessibility preferences (this phone only) ─────────

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

// ───────── Built-in skill library ─────────

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

// ───────── Personal match history & rating progression ─────────

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
