import { describe, expect, it } from "vitest";
import { attendanceSummary, leaveByPerson, leaveDates, leaveOn, sortLeave, type PlayerLeave } from "./leave";

const leave = (person_id: string, starts_on: string, ends_on: string, id = `${person_id}-${starts_on}`): PlayerLeave => ({
  id, camp_id: "c", person_id, starts_on, ends_on, reason: "exam", note: null, created_at: "2026-11-01T00:00:00Z",
});

const sessions = [
  { id: "s1", session_date: "2026-11-18" },
  { id: "s2", session_date: "2026-11-19" },
  { id: "s3", session_date: "2026-11-20" },
  { id: "s4", session_date: "2026-11-21" },
];

describe("leaveOn", () => {
  const leaves = [leave("p1", "2026-11-19", "2026-11-20")];
  it("covers the first and last day", () => {
    expect(leaveOn(leaves, "p1", "2026-11-19")).toBeTruthy();
    expect(leaveOn(leaves, "p1", "2026-11-20")).toBeTruthy();
  });
  it("misses the days around it and other people", () => {
    expect(leaveOn(leaves, "p1", "2026-11-18")).toBeUndefined();
    expect(leaveOn(leaves, "p1", "2026-11-21")).toBeUndefined();
    expect(leaveOn(leaves, "p2", "2026-11-19")).toBeUndefined();
  });
  it("maps everyone away on a day", () => {
    const m = leaveByPerson([...leaves, leave("p2", "2026-11-20", "2026-11-20")], "2026-11-20");
    expect([...m.keys()].sort()).toEqual(["p1", "p2"]);
  });
});

describe("attendanceSummary", () => {
  it("matches plain attendance when there's no leave", () => {
    const att = [
      { session_id: "s1", person_id: "p1", status: "present" as const },
      { session_id: "s2", person_id: "p1", status: "absent" as const },
      { session_id: "s3", person_id: "p1", status: "late" as const },
    ];
    expect(attendanceSummary("p1", sessions, att, [])).toEqual({ attended: 2, expected: 4, excused: 0, pct: 50 });
  });

  it("doesn't count sessions missed on leave, marked absent or not marked at all", () => {
    const att = [
      { session_id: "s1", person_id: "p1", status: "present" as const },
      { session_id: "s2", person_id: "p1", status: "absent" as const },
    ];
    const r = attendanceSummary("p1", sessions, att, [leave("p1", "2026-11-19", "2026-11-20")]);
    expect(r).toEqual({ attended: 1, expected: 2, excused: 2, pct: 50 });
  });

  it("still counts a session they came to while on leave", () => {
    const att = [{ session_id: "s2", person_id: "p1", status: "present" as const }];
    const r = attendanceSummary("p1", sessions, att, [leave("p1", "2026-11-19", "2026-11-19")]);
    expect(r).toEqual({ attended: 1, expected: 4, excused: 0, pct: 25 });
  });

  it("ignores other people's rows and leave", () => {
    const att = [{ session_id: "s1", person_id: "p2", status: "present" as const }];
    const r = attendanceSummary("p1", sessions, att, [leave("p2", "2026-11-18", "2026-11-21")]);
    expect(r).toEqual({ attended: 0, expected: 4, excused: 0, pct: 0 });
  });

  it("has no percentage when every session was on leave", () => {
    const r = attendanceSummary("p1", sessions, [], [leave("p1", "2026-11-18", "2026-11-21")]);
    expect(r.pct).toBeNull();
    expect(r.excused).toBe(4);
  });
});

describe("sortLeave and leaveDates", () => {
  it("splits on the day: still running or ahead first (soonest first), then the past", () => {
    const { current, past } = sortLeave(
      [leave("a", "2026-11-25", "2026-11-26"), leave("b", "2026-11-10", "2026-11-12"), leave("c", "2026-11-16", "2026-11-18"),
        leave("d", "2026-11-01", "2026-11-02")],
      "2026-11-17",
    );
    expect(current.map((l) => l.person_id)).toEqual(["c", "a"]);
    expect(past.map((l) => l.person_id)).toEqual(["b", "d"]);
  });

  it("writes ranges compactly", () => {
    expect(leaveDates({ starts_on: "2026-11-20", ends_on: "2026-11-20" })).toBe("20 Nov");
    expect(leaveDates({ starts_on: "2026-11-20", ends_on: "2026-11-22" })).toBe("20–22 Nov");
    expect(leaveDates({ starts_on: "2026-11-30", ends_on: "2026-12-02" })).toBe("30 Nov – 2 Dec");
  });
});
