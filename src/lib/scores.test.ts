import { describe, expect, it } from "vitest";
import { parseGames, validatePlayers, winnerFromGames } from "./scores";

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
