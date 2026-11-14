import { describe, expect, it } from "vitest";
import { glicko2Update, replay, teamOf } from "./glicko2";

describe("glicko2", () => {
  it("matches Glickman's worked example", () => {
    const out = glicko2Update({ r: 1500, rd: 200, vol: 0.06 }, [
      { r: 1400, rd: 30, s: 1 },
      { r: 1550, rd: 100, s: 0 },
      { r: 1700, rd: 300, s: 0 },
    ]);
    expect(out.r).toBeCloseTo(1464.06, 1);
    expect(out.rd).toBeCloseTo(151.52, 1);
    expect(out.vol).toBeCloseTo(0.05999, 4);
  });

  it("a win from equal footing raises rating and shrinks RD", () => {
    const st = replay(["a", "b"], [{ t1: ["a"], t2: ["b"], winner: 1 }]);
    expect(st.a.r).toBeGreaterThan(1500);
    expect(st.b.r).toBeLessThan(1500);
    expect(st.a.r - 1500).toBeCloseTo(1500 - st.b.r, 6);
    expect(st.a.rd).toBeLessThan(350);
  });

  it("combines doubles teams by mean rating and RMS deviation", () => {
    const t = teamOf([{ r: 1600, rd: 100, vol: 0.06 }, { r: 1400, rd: 200, vol: 0.06 }]);
    expect(t.r).toBe(1500);
    expect(t.rd).toBeCloseTo(Math.sqrt((100 ** 2 + 200 ** 2) / 2), 9);
  });
});
