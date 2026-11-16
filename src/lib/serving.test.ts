import { describe, expect, it } from "vitest";
import {
  INITIAL_SERVE, afterPointRemoved, afterRally, choosePlayer, courtOf, isServeState, nextServe,
  serviceCourt, type ServeState, type Side,
} from "./serving";

// Team A is A (0) & B (1); team B is C (0) & D (1).
const NAMES = { A: ["A", "B"], B: ["C", "D"] } as const;

/** Plays out rallies, reporting each serve as "server→receiver court" before the rally. */
function play(winners: Side[], start: ServeState = INITIAL_SERVE) {
  let s = start;
  let a = 0;
  let b = 0;
  const serves: string[] = [];
  for (const w of winners) {
    const n = nextServe(s, a, b);
    const recv = s.serving === "A" ? "B" : "A";
    serves.push(`${a}-${b} ${NAMES[s.serving][n.server]}→${NAMES[recv][n.receiver]} ${n.court}`);
    s = afterRally(s, w);
    if (w === "A") a++;
    else b++;
  }
  return { s, a, b, serves };
}

describe("doubles service order", () => {
  it("follows the laws' worked example: A&B v C&D, A serves first to C", () => {
    // Rally winners from the example: A&B, C&D, A&B, A&B, C&D, C&D, A&B, then the 4-3 serve.
    const { s, a, b, serves } = play(["A", "B", "A", "A", "B", "B", "A"]);
    expect(serves).toEqual([
      "0-0 A→C right",
      "1-0 A→D left", // A&B won: A switches to the left court and serves again
      "1-1 D→A left", // service over: nobody moves, D is in C&D's left court
      "2-1 B→C right", // service over: B is in A&B's right court
      "3-1 B→D left",
      "3-2 C→A right",
      "3-3 C→B left",
    ]);
    const n = nextServe(s, a, b);
    expect(`${NAMES[s.serving][n.server]}→${NAMES.B[n.receiver]} ${n.court}`).toBe("A→D right");
  });

  it("only the serving pair switches courts, and only when they win the rally", () => {
    const s = afterRally(INITIAL_SERVE, "A");
    expect(courtOf(s, "A", 0)).toBe("left");
    expect(courtOf(s, "A", 1)).toBe("right");
    expect(courtOf(s, "B", 0)).toBe("right"); // receivers stay put
    const over = afterRally(s, "B");
    expect(over).toEqual({ ...s, serving: "B" }); // service over: nobody moves
  });

  it("serves from the court matching the server's own score", () => {
    expect(serviceCourt(0)).toBe("right");
    expect(serviceCourt(7)).toBe("left");
    expect(serviceCourt(20)).toBe("right");
    // B serving at 5-4: B's score is even, so the right court, whatever A has.
    expect(nextServe({ ...INITIAL_SERVE, serving: "B" }, 5, 4).court).toBe("right");
  });

  it("keeps the same server when a winning side keeps serving through deuce", () => {
    let s = INITIAL_SERVE;
    for (let i = 0; i < 25; i++) {
      expect(nextServe(s, i, 0).server).toBe(0);
      s = afterRally(s, "A");
    }
  });
});

describe("choosing who serves and receives", () => {
  it("moves the chosen server into the court for the score, and the partner across", () => {
    const s = choosePlayer(INITIAL_SERVE, 0, 0, "A", 1);
    expect(nextServe(s, 0, 0).server).toBe(1);
    expect(courtOf(s, "A", 1)).toBe("right");
    const odd = choosePlayer(INITIAL_SERVE, 3, 2, "A", 1);
    expect(nextServe(odd, 3, 2)).toMatchObject({ server: 1, court: "left" });
    expect(courtOf(odd, "A", 1)).toBe("left");
  });

  it("puts the chosen receiver diagonally opposite the server", () => {
    const s = choosePlayer(INITIAL_SERVE, 3, 2, "B", 1);
    expect(nextServe(s, 3, 2)).toMatchObject({ receiver: 1, court: "left" });
    expect(s.serving).toBe("A");
    expect(s.rightA).toBe(INITIAL_SERVE.rightA); // the serving pair isn't touched
  });

  it("changes nothing when the player already has that role", () => {
    expect(choosePlayer(INITIAL_SERVE, 0, 0, "A", 0)).toEqual(INITIAL_SERVE);
    expect(choosePlayer(INITIAL_SERVE, 0, 0, "B", 0)).toEqual(INITIAL_SERVE);
  });
});

describe("taking a point off", () => {
  it("undoes a point the serving side just won", () => {
    const before = afterRally(INITIAL_SERVE, "B"); // 0-1, B to serve
    const after = afterRally(before, "B"); // 0-2, B switched courts
    expect(afterPointRemoved(after, "B")).toEqual(before);
  });

  it("hands the serve back when the point removed was a service over", () => {
    const before = afterRally(INITIAL_SERVE, "A"); // 1-0, A serving
    const after = afterRally(before, "B"); // 1-1, service over to B
    expect(afterPointRemoved(after, "B", true)).toEqual(before);
  });

  it("otherwise keeps the same server, now serving from the court for their new score", () => {
    const s = afterRally(afterRally(INITIAL_SERVE, "A"), "A"); // 2-0, A in the right court
    const fixed = afterPointRemoved(s, "A"); // 1-0
    expect(nextServe(fixed, 1, 0)).toEqual({ court: "left", server: 0, receiver: 1 });
    expect(courtOf(fixed, "B", 0)).toBe("right"); // receivers didn't move
    // The receiving side losing a point moves nobody.
    expect(afterPointRemoved(s, "B")).toEqual(s);
  });
});

describe("isServeState", () => {
  it("accepts only a complete serve state", () => {
    expect(isServeState(INITIAL_SERVE)).toBe(true);
    expect(isServeState({ serving: "B", rightA: 1, rightB: 0 })).toBe(true);
    expect(isServeState(undefined)).toBe(false);
    expect(isServeState({ serving: "C", rightA: 0, rightB: 0 })).toBe(false);
    expect(isServeState({ serving: "A", rightA: 2, rightB: 0 })).toBe(false);
  });
});
