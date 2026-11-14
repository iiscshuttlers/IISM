import type { Attendance, Drill, Match, Session, Wellness } from "./types";

const confirmed = (ms: Match[]) => ms.filter((m) => m.status === "confirmed");
const sideOf = (m: Match, side: 1 | 2) =>
  (side === 1 ? [m.t1_p1, m.t1_p2] : [m.t2_p1, m.t2_p2]).filter(Boolean) as string[];
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// ───────── Doubles pairs ─────────

export interface PairStat {
  a: string;
  b: string;
  played: number;
  won: number;
  /** Win rate together minus the average of each partner's doubles win rate with anyone else. */
  lift: number | null;
}

/** Every partnership that has played at least once, best first. */
export function pairStats(matches: Match[]): PairStat[] {
  const pairs = new Map<string, { a: string; b: string; played: number; won: number }>();
  const solo = new Map<string, { played: number; won: number }>();
  for (const m of confirmed(matches)) {
    if (!m.t1_p2 || !m.t2_p2) continue;
    for (const side of [1, 2] as const) {
      const [a, b] = sideOf(m, side);
      const won = m.winner_side === side ? 1 : 0;
      const k = pairKey(a, b);
      const p = pairs.get(k) ?? { a: a < b ? a : b, b: a < b ? b : a, played: 0, won: 0 };
      p.played++; p.won += won; pairs.set(k, p);
      for (const id of [a, b]) {
        const s = solo.get(id) ?? { played: 0, won: 0 };
        s.played++; s.won += won; solo.set(id, s);
      }
    }
  }
  const rateWithout = (id: string, p: { played: number; won: number }) => {
    const s = solo.get(id)!;
    const n = s.played - p.played;
    return n > 0 ? (s.won - p.won) / n : null;
  };
  return [...pairs.values()]
    .map((p) => {
      const ra = rateWithout(p.a, p);
      const rb = rateWithout(p.b, p);
      const base = ra !== null && rb !== null ? (ra + rb) / 2 : null;
      return { ...p, lift: base === null ? null : p.won / p.played - base };
    })
    .sort((x, y) => y.won / y.played - x.won / x.played || y.played - x.played);
}

// ───────── Match suggestions ─────────

export interface History { games: Map<string, number>; partnered: Map<string, number>; met: Map<string, number> }

export function history(matches: Match[]): History {
  const h: History = { games: new Map(), partnered: new Map(), met: new Map() };
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const m of confirmed(matches)) {
    const t1 = sideOf(m, 1);
    const t2 = sideOf(m, 2);
    for (const id of [...t1, ...t2]) inc(h.games, id);
    if (t1.length === 2) inc(h.partnered, pairKey(t1[0], t1[1]));
    if (t2.length === 2) inc(h.partnered, pairKey(t2[0], t2[1]));
    for (const a of t1) for (const b of t2) inc(h.met, pairKey(a, b));
  }
  return h;
}

/**
 * Lower is better. Balances three things a selection camp wants from each next match:
 * close on rating, players who have had the least court time, and match-ups not seen yet
 * (a repeat tells coaches little new).
 */
export function suggestionScore(h: History, t1: string[], t2: string[], rating: (id: string) => number): number {
  const avg = (t: string[]) => t.reduce((s, id) => s + rating(id), 0) / t.length;
  const gap = Math.abs(avg(t1) - avg(t2));
  const courtTime = [...t1, ...t2].reduce((s, id) => s + (h.games.get(id) ?? 0), 0) / (t1.length + t2.length);
  let repeats = 0;
  for (const a of t1) for (const b of t2) repeats += h.met.get(pairKey(a, b)) ?? 0;
  if (t1.length === 2) repeats += h.partnered.get(pairKey(t1[0], t1[1])) ?? 0;
  if (t2.length === 2) repeats += h.partnered.get(pairKey(t2[0], t2[1])) ?? 0;
  return gap + 25 * courtTime + 30 * repeats;
}

export function timesMet(h: History, t1: string[], t2: string[]): number {
  let n = 0;
  for (const a of t1) for (const b of t2) n += h.met.get(pairKey(a, b)) ?? 0;
  return Math.round(n / (t1.length * t2.length));
}

// ───────── Training load ─────────

/** Minutes for a session: its own duration, else the sum of its drills. */
export function sessionMinutes(s: Session, drills: Drill[]): number | null {
  if (s.duration_min) return s.duration_min;
  const sum = drills.filter((d) => d.session_id === s.id).reduce((t, d) => t + (d.duration_min ?? 0), 0);
  return sum > 0 ? sum : null;
}

export interface LoadRow {
  person_id: string;
  /** Session-RPE load (RPE × minutes) over the last 7 days. */
  week: number;
  /** The 7 days before that. */
  prevWeek: number;
  sessions: number;
  /** Week-on-week jump of more than 50% on a meaningful base: an injury-risk flag. */
  spike: boolean;
}

export function trainingLoad(sessions: Session[], drills: Drill[], attendance: Attendance[], now = new Date()): LoadRow[] {
  const day = (iso: string) => Math.floor((now.getTime() - new Date(`${iso}T12:00:00`).getTime()) / 864e5);
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const rows = new Map<string, LoadRow>();
  for (const a of attendance) {
    const s = byId.get(a.session_id);
    if (!s || a.status === "absent" || !a.rpe) continue;
    const mins = sessionMinutes(s, drills);
    if (!mins) continue;
    const d = day(s.session_date);
    const r = rows.get(a.person_id) ?? { person_id: a.person_id, week: 0, prevWeek: 0, sessions: 0, spike: false };
    if (d >= 0 && d < 7) { r.week += a.rpe * mins; r.sessions++; }
    else if (d >= 7 && d < 14) r.prevWeek += a.rpe * mins;
    rows.set(a.person_id, r);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, spike: r.prevWeek >= 300 && r.week > 1.5 * r.prevWeek }))
    .sort((x, y) => y.week - x.week);
}

// ───────── Wellness ─────────

/** 0–100 readiness from a check-in (soreness is inverted: 5 = very sore). */
export function readiness(w: Pick<Wellness, "sleep" | "soreness" | "energy" | "mood">): number {
  const total = w.sleep + (6 - w.soreness) + w.energy + w.mood; // 4..20
  return Math.round(((total - 4) / 16) * 100);
}

// ───────── Rating confidence ─────────

/** How settled a player's rating is, from the Glicko-2 deviation. */
export function confidence(rd: number | null | undefined): { label: "High" | "Medium" | "Low"; tone: "good" | "warn" | "bad" } {
  if (rd == null) return { label: "Low", tone: "bad" };
  if (rd < 110) return { label: "High", tone: "good" };
  if (rd < 200) return { label: "Medium", tone: "warn" };
  return { label: "Low", tone: "bad" };
}
