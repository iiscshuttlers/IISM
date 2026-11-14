import { describe, expect, it } from "vitest";
import { history, pairStats, readiness, suggestionScore, trainingLoad } from "./insights";
import type { Attendance, Match, Session } from "./types";

let n = 0;
const match = (t1: [string, string?], t2: [string, string?], winner: 1 | 2, status: Match["status"] = "confirmed"): Match => ({
  id: `m${++n}`, camp_id: "c", played_on: "2026-11-16", category: t1[1] ? "MD" : "MS",
  t1_p1: t1[0], t1_p2: t1[1] ?? null, t2_p1: t2[0], t2_p2: t2[1] ?? null,
  games: null, winner_side: winner, status, dispute_reason: null, disputed_by: null,
  recorded_by: "x", created_at: "2026-11-16T10:00:00Z",
});

describe("pairStats", () => {
  it("counts partnerships and their lift over each partner's other results", () => {
    const ms = [
      match(["a", "b"], ["c", "d"], 1),
      match(["a", "b"], ["c", "d"], 1),
      match(["a", "c"], ["b", "d"], 2),
      match(["a", "d"], ["b", "c"], 2),
      match(["a", "b"], ["c", "d"], 2, "void"),
    ];
    const ab = pairStats(ms).find((p) => p.a === "a" && p.b === "b")!;
    expect(ab).toMatchObject({ played: 2, won: 2 });
    // a without b: 0/2; b without a: 2/2 → base 0.5, together 1.0
    expect(ab.lift).toBeCloseTo(0.5);
  });
});

describe("suggestionScore", () => {
  it("prefers an unseen match-up over a repeat at the same rating gap", () => {
    const h = history([match(["a"], ["b"], 1), match(["a"], ["b"], 2)]);
    const r = () => 1500;
    expect(suggestionScore(h, ["a"], ["c"], r)).toBeLessThan(suggestionScore(h, ["a"], ["b"], r));
  });
  it("prefers players with less court time", () => {
    const h = history([match(["a"], ["b"], 1)]);
    const r = () => 1500;
    expect(suggestionScore(h, ["c"], ["d"], r)).toBeLessThan(suggestionScore(h, ["a"], ["c"], r));
  });
});

describe("trainingLoad", () => {
  const s = (id: string, date: string, duration_min: number | null): Session => ({
    id, camp_id: "c", session_date: date, title: "T", focus: null, notes: null, duration_min, created_by: null,
  });
  const at = (session_id: string, rpe: number, status: Attendance["status"] = "present"): Attendance => ({
    session_id, person_id: "p", status, rpe, note: null,
  });
  const now = new Date("2026-11-20T12:00:00");

  it("sums RPE × minutes per week and flags a spike", () => {
    const sessions = [s("old", "2026-11-10", 60), s("new1", "2026-11-18", 90), s("new2", "2026-11-19", 90)];
    const rows = trainingLoad(sessions, [], [at("old", 5), at("new1", 8), at("new2", 7)], now);
    expect(rows[0]).toMatchObject({ week: 1350, prevWeek: 300, sessions: 2, spike: true });
  });
  it("uses drill minutes when the session has no duration, and skips absences", () => {
    const rows = trainingLoad(
      [s("x", "2026-11-19", null)],
      [{ id: "d", session_id: "x", drill_name: "F", drill_type: "footwork", duration_min: 40, sets: null, reps: null, intensity: null, notes: null }],
      [at("x", 5), { ...at("x", 9, "absent"), person_id: "q" }],
      now,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].week).toBe(200);
  });
});

describe("readiness", () => {
  it("maps the four 1–5 answers to 0–100 with soreness inverted", () => {
    expect(readiness({ sleep: 5, soreness: 1, energy: 5, mood: 5 })).toBe(100);
    expect(readiness({ sleep: 1, soreness: 5, energy: 1, mood: 1 })).toBe(0);
  });
});
