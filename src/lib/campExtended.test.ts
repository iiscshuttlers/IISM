import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SKILLS,
  clearExtendedStorage,
  computePlayerRatingHistory,
  getA11yPrefs,
  saveA11yPrefs,
} from "./campExtended";
import type { Match, Member } from "./types";

describe("campExtended module", () => {
  const campId = "test-camp-123";

  beforeEach(() => {
    clearExtendedStorage();
  });

  it("saves and applies accessibility preferences", () => {
    saveA11yPrefs({ textSize: "large", highContrast: true, reducedMotion: true });
    const prefs = getA11yPrefs();
    expect(prefs.textSize).toBe("large");
    expect(prefs.highContrast).toBe(true);
    expect(prefs.reducedMotion).toBe(true);
  });

  it("ships a built-in skill library with unique ids and practice cues", () => {
    expect(DEFAULT_SKILLS.length).toBeGreaterThanOrEqual(9);
    expect(DEFAULT_SKILLS.some((s) => s.title.includes("Clear"))).toBe(true);
    expect(new Set(DEFAULT_SKILLS.map((s) => s.id)).size).toBe(DEFAULT_SKILLS.length);
    expect(DEFAULT_SKILLS.every((s) => s.key_cues.length > 0 && !s.is_custom)).toBe(true);
  });

  it("computes personal match history with rating and form progression", () => {
    const members: Member[] = [
      { id: "p1", full_name: "Aneesh Varla", gender: "M", role: "player", activity_muted: false },
      { id: "p2", full_name: "Raja", gender: "M", role: "player", activity_muted: false },
      { id: "p3", full_name: "Suresh", gender: "M", role: "player", activity_muted: false },
      { id: "p4", full_name: "Varun", gender: "M", role: "player", activity_muted: false },
    ];

    const matches: Match[] = [
      {
        id: "m1",
        camp_id: campId,
        played_on: "2026-11-14",
        created_at: "2026-11-14T10:00:00Z",
        category: "MD",
        t1_p1: "p1",
        t1_p2: "p2",
        t2_p1: "p3",
        t2_p2: "p4",
        games: ["21-0", "21-0"],
        winner_side: 1,
        status: "confirmed",
        dispute_reason: null,
        disputed_by: null,
        recorded_by: "coach",
      },
    ];

    const p1Hist = computePlayerRatingHistory("p1", matches, members);
    expect(p1Hist.length).toBe(1);
    expect(p1Hist[0].isWin).toBe(true);
    expect(p1Hist[0].partnerName).toBe("Raja");
    expect(p1Hist[0].opponentNames).toContain("Suresh");
    expect(p1Hist[0].ratingBefore).toBe(1200);
    expect(p1Hist[0].ratingChange).toBe(16);
    expect(p1Hist[0].ratingAfter).toBe(1216);
    expect(p1Hist[0].rallyDiff).toBe(42);
    expect(p1Hist[0].formStreak).toBe("W");

    const p3Hist = computePlayerRatingHistory("p3", matches, members);
    expect(p3Hist.length).toBe(1);
    expect(p3Hist[0].isWin).toBe(false);
    expect(p3Hist[0].ratingBefore).toBe(1200);
    expect(p3Hist[0].ratingChange).toBe(-16);
    expect(p3Hist[0].ratingAfter).toBe(1184);
    expect(p3Hist[0].rallyDiff).toBe(-42);
    expect(p3Hist[0].formStreak).toBe("L");
  });
});
