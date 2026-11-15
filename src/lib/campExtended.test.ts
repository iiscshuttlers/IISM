import { beforeEach, describe, expect, it } from "vitest";
import {
  addAnnouncement,
  acknowledgeAnnouncement,
  getAnnouncements,
  savePlayerGoal,
  getPlayerGoals,
  saveEquipmentItem,
  getEquipment,
  saveInjuryReport,
  getInjuryReports,
  saveA11yPrefs,
  getA11yPrefs,
  exportFullCampJson,
  clearExtendedStorage,
  saveSessionReflection,
  getSessionReflections,
  getSkillLibrary,
  saveCustomSkill,
  getWeatherVenuePlan,
  saveWeatherVenuePlan,
  saveNextSessionFocus,
  getNextSessionFocus,
  toggleNextSessionFocus,
  computePlayerRatingHistory,
} from "./campExtended";
import type { Match, Member } from "./types";

describe("campExtended module", () => {
  const campId = "test-camp-123";

  beforeEach(() => {
    clearExtendedStorage();
  });

  it("handles announcements creation and read receipts", () => {
    const ann = addAnnouncement(campId, {
      title: "Morning session delayed",
      message: "Moved to 9:30 AM due to court maintenance.",
      priority: "important",
      author_name: "Coach Varla",
      expires_at: null,
    });

    expect(ann.id).toBeDefined();
    let list = getAnnouncements(campId);
    expect(list.length).toBe(1);
    expect(list[0].read_by.length).toBe(0);

    acknowledgeAnnouncement(campId, ann.id, "player-1");
    list = getAnnouncements(campId);
    expect(list[0].read_by).toContain("player-1");
  });

  it("handles player goals", () => {
    const goal = savePlayerGoal(campId, {
      person_id: "p-1",
      title: "Improve backhand clear depth",
      category: "technique",
      target_date: "2026-11-20",
      status: "in_progress",
      coach_feedback: null,
    });

    expect(goal.id).toBeDefined();
    const goals = getPlayerGoals(campId, "p-1");
    expect(goals.length).toBe(1);
    expect(goals[0].title).toBe("Improve backhand clear depth");

    savePlayerGoal(
      campId,
      {
        person_id: "p-1",
        title: "Improve backhand clear depth",
        category: "technique",
        target_date: "2026-11-20",
        status: "achieved",
        coach_feedback: "Great depth seen in Friday singles!",
      },
      goal.id
    );

    const updated = getPlayerGoals(campId, "p-1");
    expect(updated[0].status).toBe("achieved");
    expect(updated[0].coach_feedback).toBe("Great depth seen in Friday singles!");
  });

  it("tracks equipment items", () => {
    const item = saveEquipmentItem(campId, {
      name: "Yonex ArcSaber 11 Pro",
      category: "rackets",
      quantity: 1,
      status: "borrowed",
      borrowed_by: "p-2",
      borrowed_at: "2026-11-15T10:00:00Z",
      notes: "Strung at 28 lbs",
    });

    const eq = getEquipment(campId);
    expect(eq.some((x) => x.id === item.id)).toBe(true);
  });

  it("handles private injury reports and follow-up status", () => {
    const rep = saveInjuryReport(campId, {
      person_id: "p-3",
      body_part: "Right Shoulder",
      severity: "moderate",
      notes: "Sore after hard smashes yesterday",
      status: "new",
      staff_notes: null,
    });

    const list = getInjuryReports(campId, "p-3");
    expect(list.length).toBe(1);
    expect(list[0].body_part).toBe("Right Shoulder");

    saveInjuryReport(
      campId,
      {
        person_id: "p-3",
        body_part: "Right Shoulder",
        severity: "moderate",
        notes: "Sore after hard smashes yesterday",
        status: "modified_training",
        staff_notes: "Advised net drills and no jump smashes today",
      },
      rep.id
    );

    const updated = getInjuryReports(campId, "p-3");
    expect(updated[0].status).toBe("modified_training");
    expect(updated[0].staff_notes).toContain("Advised net drills");
  });

  it("saves and applies accessibility preferences", () => {
    saveA11yPrefs({ textSize: "large", highContrast: true, reducedMotion: true });
    const prefs = getA11yPrefs();
    expect(prefs.textSize).toBe("large");
    expect(prefs.highContrast).toBe(true);
    expect(prefs.reducedMotion).toBe(true);
  });

  it("exports a full JSON backup of the camp extended data", () => {
    addAnnouncement(campId, {
      title: "Test",
      message: "Testing backup",
      priority: "normal",
      author_name: "Admin",
      expires_at: null,
    });

    const json = exportFullCampJson(campId, { campName: "National Camp" });
    const parsed = JSON.parse(json);
    expect(parsed.campId).toBe(campId);
    expect(parsed.announcements.length).toBeGreaterThan(0);
    expect(parsed.meta.campName).toBe("National Camp");
  });

  it("handles session reflections (post-practice check-in)", () => {
    const refl = saveSessionReflection(campId, {
      person_id: "p-1",
      session_date: "2026-11-16",
      went_well: "Cross-court drop shots worked consistently",
      to_work_on: "Footwork recovery to backhand corner",
      effort_rpe: 7,
      energy_level: "normal",
    });

    expect(refl.id).toBeDefined();
    const list = getSessionReflections(campId, "p-1");
    expect(list.length).toBe(1);
    expect(list[0].effort_rpe).toBe(7);
    expect(list[0].went_well).toContain("Cross-court");
  });

  it("provides skill library and supports custom drills", () => {
    const skills = getSkillLibrary(campId);
    expect(skills.length).toBeGreaterThanOrEqual(9);
    expect(skills.some((s) => s.title.includes("Clear"))).toBe(true);

    const custom = saveCustomSkill(campId, {
      title: "Reverse Slice Drop Disguise",
      category: "attack",
      difficulty: "advanced",
      description: "Cutting across the outer cork to fake a straight clear into a tight cross drop.",
      key_cues: ["Pronate then slice outwards", "Delay racket preparation by 0.1s"],
      common_mistakes: ["Telegraphing direction with early body turn"],
      suggested_drill: "10 feeds cross, 10 straight alternating with coach.",
    });

    expect(custom.id).toBeDefined();
    const updated = getSkillLibrary(campId);
    expect(updated.some((s) => s.id === custom.id)).toBe(true);
  });

  it("manages weather-aware planning and venue conditions", () => {
    const initial = getWeatherVenuePlan(campId);
    expect(initial.venue_name).toBeDefined();

    saveWeatherVenuePlan(campId, {
      camp_id: campId,
      plan_type: "indoor_backup",
      venue_name: "Indoor Gymnasium B",
      weather_summary: "Thunderstorm outside · High humidity",
      shuttle_speed: "76 (Slow)",
      athlete_notice: "Track warmup relocated to Indoor Gymnasium B.",
      updated_by: "Coach Raja",
      updated_at: new Date().toISOString(),
    });

    const updated = getWeatherVenuePlan(campId);
    expect(updated.plan_type).toBe("indoor_backup");
    expect(updated.shuttle_speed).toBe("76 (Slow)");
    expect(updated.athlete_notice).toContain("Indoor Gymnasium B");
  });

  it("handles next session focus (goals for the next session)", () => {
    const focus = saveNextSessionFocus(
      campId,
      "p-player1",
      "Keep racket up at eye level during doubles net transitions",
      "Coach Varla"
    );

    expect(focus.focus_text).toBe("Keep racket up at eye level during doubles net transitions");
    expect(focus.completed).toBe(false);

    const current = getNextSessionFocus(campId, "p-player1");
    expect(current?.focus_text).toBe(focus.focus_text);

    toggleNextSessionFocus(campId, "p-player1", true);
    const completed = getNextSessionFocus(campId, "p-player1");
    expect(completed?.completed).toBe(true);
    expect(completed?.completed_at).toBeDefined();
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
