import { describe, expect, it } from "vitest";
import { rpeIsDue } from "./today";
import type { Attendance } from "./types";

const at = (over: Partial<Attendance>): Attendance => ({
  session_id: "s", person_id: "p", status: "present", rpe: null, note: null,
  created_at: "2026-11-16T04:00:00Z", ...over,
});
const t0 = new Date("2026-11-16T04:00:00Z").getTime();
const min = 60_000;

describe("rpeIsDue", () => {
  it("waits until the player has had an hour to train", () => {
    expect(rpeIsDue(at({}), 120, t0 + 59 * min)).toBe(false);
    expect(rpeIsDue(at({}), 120, t0 + 60 * min)).toBe(true);
  });
  it("uses the session length when it is shorter than an hour", () => {
    expect(rpeIsDue(at({}), 45, t0 + 44 * min)).toBe(false);
    expect(rpeIsDue(at({}), 45, t0 + 45 * min)).toBe(true);
  });
  it("stays open once a rating is logged, so it can be changed", () => {
    expect(rpeIsDue(at({ rpe: 6 }), 120, t0 + min)).toBe(true);
  });
  it("never asks someone who isn't checked in or is away", () => {
    expect(rpeIsDue(null, 120, t0 + 300 * min)).toBe(false);
    expect(rpeIsDue(at({ status: "absent" }), 120, t0 + 300 * min)).toBe(false);
  });
  it("shows straight away when the check-in time is unknown", () => {
    expect(rpeIsDue(at({ created_at: undefined }), 120, t0)).toBe(true);
  });
});
