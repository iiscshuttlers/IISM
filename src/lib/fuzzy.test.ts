import { describe, expect, it } from "vitest";
import { editDistance, fuzzyFilter, fuzzyScore, normalize } from "./fuzzy";

const roster = ["Raja", "Raja Kumar", "Rajesh Iyer", "Ravi Shankar", "Arjun Rao", "Chitra Nair", "José Fernandes", "Sam Varghese"];
const find = (q: string) => fuzzyFilter(roster, q, (n) => n);

describe("fuzzy player search", () => {
  it("normalises case, accents and punctuation", () => {
    expect(normalize("  José  D'Souza ")).toBe("jose d souza");
  });

  it("counts a swap of neighbouring letters as one edit", () => {
    expect(editDistance("rjaa", "raja")).toBe(1);
    expect(editDistance("rsja", "raja")).toBe(1);
    expect(editDistance("raja", "raja")).toBe(0);
  });

  it("finds Raja when typed with a typo", () => {
    expect(find("Rsja")[0]).toBe("Raja");
    expect(find("Rsja")).toContain("Raja Kumar");
    expect(find("rjaa")).toContain("Raja");
  });

  it("puts exact prefix matches before typo matches", () => {
    const r = find("raj");
    expect(r.slice(0, 3)).toEqual(["Raja", "Raja Kumar", "Rajesh Iyer"]);
  });

  it("matches a surname, initials, or the name typed without the space", () => {
    expect(find("kumar")).toEqual(["Raja Kumar"]);
    expect(find("nair")).toEqual(["Chitra Nair"]);
    expect(find("rk")[0]).toBe("Raja Kumar");
    expect(find("rajakumar")[0]).toBe("Raja Kumar");
    expect(find("raja kumr")[0]).toBe("Raja Kumar");
  });

  it("ignores accents", () => {
    expect(find("jose")).toEqual(["José Fernandes"]);
  });

  it("does not match unrelated names", () => {
    expect(find("xyz")).toEqual([]);
    expect(fuzzyScore("zzzz", "Raja")).toBeNull();
    // A different first letter on a short word is too loose to count as a typo.
    expect(find("sam")).toEqual(["Sam Varghese"]);
  });

  it("returns everyone, in order, for an empty query", () => {
    expect(find("")).toEqual(roster);
    expect(find("   ")).toEqual(roster);
  });
});
