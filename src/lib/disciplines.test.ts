import { describe, expect, it } from "vitest";
import { disciplineStat, eventsLabel, hasDisciplineRatings, rankByDiscipline, sortEvents, toggleEvent } from "./disciplines";
import type { Standing } from "./types";

const st = (id: string, over: Partial<Standing>): Standing => ({
  person_id: id, full_name: id, gender: "M", rating: 1200, played: 0, won: 0, lost: 0, points_for: 0,
  points_against: 0, form: "", by_category: {}, glicko: 1500, glicko_rd: 350,
  rating_singles: 1200, rating_doubles: 1200, rating_mixed: 1200, played_singles: 0, played_doubles: 0, played_mixed: 0, ...over,
});

describe("disciplines", () => {
  const a = st("a", { rating: 1230, won: 3, lost: 1, played: 4, rating_singles: 1216, rating_doubles: 1214,
    by_category: { MS: { w: 1, l: 0 }, MD: { w: 2, l: 1 } } });
  const b = st("b", { rating: 1190, won: 1, lost: 1, played: 2, rating_doubles: 1240, by_category: { MD: { w: 1, l: 1 } } });
  const c = st("c", {});

  it("reads one discipline's rating and record", () => {
    expect(disciplineStat(a, "singles")).toEqual({ rating: 1216, won: 1, lost: 0, played: 1 });
    expect(disciplineStat(a, "doubles")).toEqual({ rating: 1214, won: 2, lost: 1, played: 3 });
    expect(disciplineStat(a, "all")).toEqual({ rating: 1230, won: 3, lost: 1, played: 4 });
  });

  it("ranks by the discipline's rating, players without matches unranked at the end", () => {
    const ranked = rankByDiscipline([a, c, b], "doubles");
    expect(ranked.map((x) => [x.row.person_id, x.rank])).toEqual([["b", 1], ["a", 2], ["c", null]]);
  });

  it("keeps the overall order as given", () => {
    expect(rankByDiscipline([a, b, c], "all").map((x) => x.rank)).toEqual([1, 2, 3]);
  });

  it("knows when the server has discipline ratings", () => {
    expect(hasDisciplineRatings([a])).toBe(true);
    expect(hasDisciplineRatings([{ ...a, rating_singles: undefined }])).toBe(false);
  });
});

describe("training events", () => {
  it("keeps a fixed order and drops repeats or unknown values", () => {
    expect(sortEvents(["mixed", "singles", "mixed", "bogus"])).toEqual(["singles", "mixed"]);
  });

  it("labels them briefly", () => {
    expect(eventsLabel(["mixed", "singles"])).toBe("Singles · XD");
    expect(eventsLabel([])).toBe("");
    expect(eventsLabel(undefined)).toBe("");
  });

  it("toggles one on or off", () => {
    expect(toggleEvent(["singles"], "mixed")).toEqual(["singles", "mixed"]);
    expect(toggleEvent(["singles", "mixed"], "singles")).toEqual(["mixed"]);
  });
});
