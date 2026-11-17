import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, scoreShortlist, weightPercents, type ShortlistInput } from "./shortlist";

const p = (id: string, rating: number, winPct: number | null, attendancePct: number | null, coachAvg: number | null): ShortlistInput =>
  ({ id, rating, winPct, attendancePct, coachAvg });

describe("weightPercents", () => {
  it("turns weights into percentages of the total", () => {
    expect(weightPercents(DEFAULT_WEIGHTS)).toEqual({ rating: 30, coach_score: 30, attendance: 20, win_rate: 20 });
  });
});

describe("scoreShortlist", () => {
  it("scales rating within the camp and coach score from 1–5", () => {
    const [top, bottom] = scoreShortlist([p("a", 1300, 100, 100, 5), p("b", 1100, 0, 0, 1)], DEFAULT_WEIGHTS);
    expect(top).toMatchObject({ id: "a", score: 100, missing: [] });
    expect(bottom).toMatchObject({ id: "b", score: 0 });
    expect(top.parts).toEqual({ rating: 100, coach_score: 100, attendance: 100, win_rate: 100 });
  });

  it("follows the weights", () => {
    const players = [p("rater", 1300, 0, 0, 1), p("worker", 1100, 0, 100, 1)];
    expect(scoreShortlist(players, { rating: 10, coach_score: 0, attendance: 0, win_rate: 0 })[0].id).toBe("rater");
    expect(scoreShortlist(players, { rating: 0, coach_score: 0, attendance: 10, win_rate: 0 })[0].id).toBe("worker");
  });

  it("scores a player on what they have and lists the gaps", () => {
    const [r] = scoreShortlist([p("new", 1200, null, 80, null)], { rating: 0, coach_score: 5, attendance: 5, win_rate: 5 });
    expect(r.score).toBe(80);
    expect(r.missing).toEqual(["coach_score", "win_rate"]);
  });

  it("puts rating at the middle when everyone has the same one", () => {
    const rows = scoreShortlist([p("a", 1200, null, null, null), p("b", 1200, null, null, null)], DEFAULT_WEIGHTS);
    expect(rows.map((r) => r.score)).toEqual([50, 50]);
  });

  it("ranks players with nothing to score last", () => {
    const rows = scoreShortlist([p("blank", 1200, null, null, null), p("some", 1200, null, 10, null)],
      { rating: 0, coach_score: 0, attendance: 1, win_rate: 0 });
    expect(rows.map((r) => [r.id, r.score])).toEqual([["some", 10], ["blank", null]]);
  });

  it("handles an empty roster", () => {
    expect(scoreShortlist([], DEFAULT_WEIGHTS)).toEqual([]);
  });
});
