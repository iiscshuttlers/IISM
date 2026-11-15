import { describe, expect, it } from "vitest";
import { generateCampIcs, generateGoogleCalendarUrl } from "./calendarExport";
import type { Session, Match } from "./types";

describe("calendarExport module", () => {
  const sessions: Session[] = [
    {
      id: "s1",
      camp_id: "c1",
      session_date: "2026-11-20",
      title: "Morning High Intensity Drill",
      focus: "Explosive footwork and net kills",
      notes: "Bring indoor non-marking court shoes",
      duration_min: 90,
      created_by: "coach",
    },
  ];

  const matches: Match[] = [
    {
      id: "m1",
      camp_id: "c1",
      played_on: "2026-11-20",
      created_at: "2026-11-20T10:00:00Z",
      category: "MS",
      t1_p1: "p1",
      t1_p2: null,
      t2_p1: "p2",
      t2_p2: null,
      games: ["21-18", "21-19"],
      winner_side: 1,
      status: "confirmed",
      dispute_reason: null,
      disputed_by: null,
      recorded_by: "admin",
    },
  ];

  it("generates a valid iCalendar (.ics) string", () => {
    const ics = generateCampIcs({
      campName: "IISc Badminton Camp 2026",
      sessions,
      matches,
      venue: "IISc Main Gymkhana",
    });

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:[Training] Morning High Intensity Drill (IISc Badminton Camp 2026)");
    expect(ics).toContain("LOCATION:IISc Main Gymkhana");
    expect(ics).toContain("DTSTART:20261120T090000");
    expect(ics).toContain("DTEND:20261120T103000");
  });

  it("generates Google Calendar URL with correct parameters", () => {
    const url = generateGoogleCalendarUrl(sessions[0], "IISc Badminton Camp");
    expect(url).toContain("https://calendar.google.com/calendar/render");
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("Morning+High+Intensity+Drill");
    expect(url).toContain("20261120T090000");
  });
});
