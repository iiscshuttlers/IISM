import { describe, expect, it } from "vitest";
import { attendanceGrid, sortGridRows } from "./attendanceGrid";
import type { PlayerLeave } from "./leave";

const players = [
  { id: "p1", full_name: "Kriti Kalia" },
  { id: "p2", full_name: "Ashitha D Pattabi" },
  { id: "p3", full_name: "Varla Aneesh" },
];

// As useSessions returns them: newest day first, and on 20 Nov the evening (logged later) first.
const sessions = [
  { id: "future", session_date: "2026-11-25", title: "Planned" },
  { id: "s4", session_date: "2026-11-21", title: "Morning" },
  { id: "s3b", session_date: "2026-11-20", title: "Evening" },
  { id: "s3a", session_date: "2026-11-20", title: "Morning" },
  { id: "s1", session_date: "2026-11-18", title: "Morning" },
];

const leave = (person_id: string, starts_on: string, ends_on: string): PlayerLeave => ({
  id: `${person_id}-${starts_on}`, camp_id: "c", person_id, starts_on, ends_on, reason: "exam", note: null, created_at: "2026-11-01T00:00:00Z",
});

const att = (session_id: string, person_id: string, status: "present" | "late" | "absent") => ({ session_id, person_id, status });

describe("attendanceGrid", () => {
  const attendance = [
    att("s4", "p1", "present"), att("s4", "p2", "late"), att("s4", "p3", "absent"),
    att("s3a", "p1", "present"), att("s3b", "p1", "absent"),
    att("s1", "p3", "present"), att("s1", "p2", "absent"),
  ];
  const leaves = [leave("p3", "2026-11-20", "2026-11-21"), leave("p2", "2026-11-18", "2026-11-18")];
  const g = attendanceGrid(players, sessions, attendance, leaves, "2026-11-23");

  it("has one column per session up to today, newest first, with a count of who came", () => {
    expect(g.columns.map((c) => c.session.id)).toEqual(["s4", "s3b", "s3a", "s1"]);
    expect(g.columns.map((c) => c.came)).toEqual([2, 0, 1, 1]);
  });

  it("numbers sessions on a shared day in the order they were logged", () => {
    expect(g.columns.map((c) => c.part)).toEqual([null, 2, 1, null]);
  });

  it("shows each player's mark, with leave covering away and unmarked days but not days they came", () => {
    const marks = Object.fromEntries(g.rows.map((r) => [r.player.id, r.marks]));
    expect(marks.p1).toEqual(["present", "absent", "present", null]);
    expect(marks.p2).toEqual(["late", null, null, "leave"]);
    expect(marks.p3).toEqual(["leave", "leave", "leave", "present"]);
  });

  it("summarises only the sessions in the grid, leave excluded", () => {
    const pct = Object.fromEntries(g.rows.map((r) => [r.player.id, r.summary]));
    expect(pct.p1).toEqual({ attended: 2, expected: 4, excused: 0, pct: 50 });
    expect(pct.p2).toEqual({ attended: 1, expected: 3, excused: 1, pct: 33 });
    expect(pct.p3).toEqual({ attended: 1, expected: 1, excused: 3, pct: 100 });
  });

  it("is empty but well-formed with no sessions yet", () => {
    const e = attendanceGrid(players, [], [], [], "2026-11-23");
    expect(e.columns).toEqual([]);
    expect(e.rows.map((r) => r.marks)).toEqual([[], [], []]);
    expect(e.rows[0].summary.pct).toBeNull();
  });
});

describe("sortGridRows", () => {
  const rows = attendanceGrid(
    [...players, { id: "p4", full_name: "Minakshi Jangir" }],
    sessions,
    [att("s4", "p1", "present"), att("s4", "p2", "absent"), att("s4", "p3", "present")],
    [leave("p4", "2026-11-18", "2026-11-21")],
    "2026-11-23",
  ).rows;

  it("sorts A–Z", () => {
    expect(sortGridRows(rows, "name").map((r) => r.player.full_name)).toEqual([
      "Ashitha D Pattabi", "Kriti Kalia", "Minakshi Jangir", "Varla Aneesh",
    ]);
  });

  it("puts the lowest attendance first and players with nothing counted last", () => {
    // Kriti and Varla tie at 25%, so A–Z between them; Minakshi was on leave for every session.
    expect(sortGridRows(rows, "lowest").map((r) => r.player.id)).toEqual(["p2", "p1", "p3", "p4"]);
  });
});
