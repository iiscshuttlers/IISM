import { describe, expect, it } from "vitest";
import { setupSteps } from "../components/AdminChecklist";

const person = (role: "admin" | "coach" | "player", email: string | null, signed_in: boolean) => ({ role, email, signed_in });

describe("setupSteps", () => {
  it("marks each step from the camp and roster", () => {
    const steps = setupSteps(
      { starts_on: "2026-11-16", ends_on: null, selection_target: 2 },
      [person("admin", "a@x", true), person("player", "p1@x", true), person("player", null, false), person("player", "p3@x", false)],
    );
    expect(Object.fromEntries(steps.map((s) => [s.key, s.done]))).toEqual({ dates: false, players: true, coaches: false, signin: false });
    expect(steps.find((s) => s.key === "signin")!.title).toContain("2 of 3");
  });

  it("is complete once dates, enough players, a coach and every email signed in", () => {
    const steps = setupSteps(
      { starts_on: "2026-11-16", ends_on: "2026-12-16", selection_target: 1 },
      [person("coach", "c@x", true), person("player", "p@x", true), person("player", null, false)],
    );
    expect(steps.every((s) => s.done)).toBe(true);
  });
});
