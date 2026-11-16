import { describe, expect, it } from "vitest";
import { playersDueAssessment } from "../components/CoachAttention";
import type { Member } from "./types";

const p = (id: string): Member => ({ id, full_name: id, gender: "M", role: "player", activity_muted: false });

describe("playersDueAssessment", () => {
  const players = [p("never"), p("recent"), p("stale"), p("exactly7")];
  const assessments = [
    { person_id: "recent", assessed_on: "2026-11-14" },
    { person_id: "stale", assessed_on: "2026-11-01" },
    { person_id: "stale", assessed_on: "2026-11-05" },
    { person_id: "exactly7", assessed_on: "2026-11-09" },
  ];

  it("lists players never assessed or not assessed in the last 7 days", () => {
    expect(playersDueAssessment(players, assessments, "2026-11-16").map((x) => x.id)).toEqual(["never", "stale", "exactly7"]);
  });

  it("uses each player's latest assessment", () => {
    expect(playersDueAssessment([p("stale")], assessments, "2026-11-11").map((x) => x.id)).toEqual([]);
  });
});
