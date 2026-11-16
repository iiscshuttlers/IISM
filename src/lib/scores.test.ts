import { describe, expect, it } from "vitest";
import { parseGames, quickGamesToRows, validatePlayers, winnerFromGames, winningScore } from "./scores";

describe("parseGames", () => {
  it("ignores empty rows and normalises numbers", () => {
    expect(parseGames([{ a: "21", b: "05" }, { a: "", b: "" }])).toEqual({ games: ["21-5"] });
    expect(parseGames([{ a: "21", b: "105" }]).error).toMatch(/both scores/);
  });
  it("returns null when no scores entered (winner-only match)", () => {
    expect(parseGames([{ a: "", b: "" }])).toEqual({ games: null });
  });
  it("rejects ties and half-filled rows", () => {
    expect(parseGames([{ a: "21", b: "21" }]).error).toMatch(/tied/);
    expect(parseGames([{ a: "21", b: "" }]).error).toMatch(/both scores/);
  });
});

describe("winnerFromGames", () => {
  it("picks the side with more games", () => {
    expect(winnerFromGames(["21-19", "18-21", "21-17"])).toBe(1);
    expect(winnerFromGames(["15-21", "19-21"])).toBe(2);
  });
  it("is null with no games or a level count", () => {
    expect(winnerFromGames(null)).toBeNull();
    expect(winnerFromGames(["21-10", "10-21"])).toBeNull();
  });
});

describe("validatePlayers", () => {
  const g: Record<string, "M" | "F" | null> = { a: "M", b: "M", c: "F", d: "F", e: null };
  const genderOf = (id: string) => g[id];
  it("accepts valid mixed doubles", () => {
    expect(validatePlayers("XD", ["a", "c", "b", "d"], genderOf)).toBeNull();
  });
  it("rejects wrong genders and duplicates", () => {
    expect(validatePlayers("MS", ["a", null, "c", null], genderOf)).toMatch(/category/);
    expect(validatePlayers("MS", ["a", null, "a", null], genderOf)).toMatch(/twice/);
  });
  it("allows players with no gender set", () => {
    expect(validatePlayers("WS", ["c", null, "e", null], genderOf)).toBeNull();
  });
  it("needs partners in doubles", () => {
    expect(validatePlayers("MD", ["a", null, "b", null], genderOf)).toMatch(/every player/);
  });
});

describe("winningScore", () => {
  it("is the target when the loser is two or more behind", () => {
    expect(winningScore(21, 0)).toBe(21);
    expect(winningScore(21, 19)).toBe(21);
    expect(winningScore(15, 13)).toBe(15);
    expect(winningScore(11, 9)).toBe(11);
  });
  it("goes to deuce: win by two, up to the cap", () => {
    expect(winningScore(21, 20)).toBe(22);
    expect(winningScore(21, 28)).toBe(30);
    expect(winningScore(21, 29)).toBe(30);
    expect(winningScore(15, 19)).toBe(21);
    expect(winningScore(11, 14)).toBe(15);
  });
  it("rejects impossible losing scores", () => {
    expect(winningScore(21, 30)).toBeNull();
    expect(winningScore(11, 15)).toBeNull();
    expect(winningScore(21, -1)).toBeNull();
    expect(winningScore(21, 1.5)).toBeNull();
  });
});

describe("quickGamesToRows", () => {
  it("builds full scores from who won and the losing score", () => {
    const r = quickGamesToRows([{ winner: 1, loser: "17" }, { winner: 2, loser: "20" }, { winner: null, loser: "" }], 21);
    expect(r).toEqual({ rows: [{ a: "21", b: "17" }, { a: "20", b: "22" }, { a: "", b: "" }] });
    expect(parseGames(r.rows).games).toEqual(["21-17", "20-22"]);
  });
  it("asks for whatever is missing", () => {
    expect(quickGamesToRows([{ winner: null, loser: "12" }], 21).error).toMatch(/who won/);
    expect(quickGamesToRows([{ winner: 1, loser: "" }], 21).error).toMatch(/losing side/);
    expect(quickGamesToRows([{ winner: 1, loser: "31" }], 21).error).toMatch(/too high/);
  });
});
