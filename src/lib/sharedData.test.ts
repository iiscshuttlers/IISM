import { describe, expect, it } from "vitest";
import { activeAnnouncements, toSkill, type Announcement } from "./sharedData";

const ann = (over: Partial<Announcement>): Announcement => ({
  id: "a", camp_id: "c", title: "t", message: "m", priority: "normal", expires_on: null,
  created_by: null, created_at: "2026-11-10T08:00:00+00:00", read_by: [], ...over,
});

describe("activeAnnouncements", () => {
  it("hides expired notices but keeps ones expiring today", () => {
    const list = [
      ann({ id: "old", expires_on: "2026-11-15" }),
      ann({ id: "today", expires_on: "2026-11-16" }),
      ann({ id: "open", expires_on: null }),
    ];
    expect(activeAnnouncements(list, "2026-11-16").map((a) => a.id).sort()).toEqual(["open", "today"]);
  });

  it("puts urgent first, then important, then newest", () => {
    const list = [
      ann({ id: "n-new", created_at: "2026-11-16T09:00:00+00:00" }),
      ann({ id: "i", priority: "important", created_at: "2026-11-01T09:00:00+00:00" }),
      ann({ id: "u", priority: "urgent", created_at: "2026-11-02T09:00:00+00:00" }),
      ann({ id: "n-old", created_at: "2026-11-12T09:00:00+00:00" }),
    ];
    expect(activeAnnouncements(list, "2026-11-16").map((a) => a.id)).toEqual(["u", "i", "n-new", "n-old"]);
  });
});

describe("toSkill", () => {
  it("marks database skills as custom so coaches can tell them apart", () => {
    const s = toSkill({
      id: "s1", camp_id: "c", title: "Net tumble", category: "net", difficulty: "advanced",
      description: "d", key_cues: ["soft grip"], common_mistakes: [], suggested_drill: "",
    });
    expect(s.is_custom).toBe(true);
    expect(s.key_cues).toEqual(["soft grip"]);
  });
});
