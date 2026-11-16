import { describe, expect, it } from "vitest";
import { inviteText, parseRosterLines } from "./rosterImport";

describe("parseRosterLines", () => {
  it("reads comma lines with optional gender, email and role", () => {
    const rows = parseRosterLines("Arjun Rao, M, Arjun@Gmail.com\nChitra Nair,female,,coach\nEshan");
    expect(rows).toEqual([
      { line: 1, full_name: "Arjun Rao", gender: "M", email: "arjun@gmail.com", role: "player" },
      { line: 2, full_name: "Chitra Nair", gender: "F", email: "", role: "coach" },
      { line: 3, full_name: "Eshan", gender: "", email: "", role: "player" },
    ]);
  });

  it("reads a tab-separated spreadsheet paste and skips its header row", () => {
    const rows = parseRosterLines("Name\tGender\tEmail\nDivya Menon\tF\tdivya@x.in\n\n");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ full_name: "Divya Menon", gender: "F", email: "divya@x.in", line: 2 });
  });

  it("flags lines that can't be added, keeping the rest", () => {
    const rows = parseRosterLines(
      ", M, a@x.in\nBad Gender, X\nBad Email, M, nope\nTaken, M, old@x.in\nTwice, F, t@x.in\nTwice Again, F, T@x.in\nBad Role, M,, captain",
      ["Old@x.in"],
    );
    expect(rows.map((r) => r.error ?? "ok")).toEqual([
      "Name is missing",
      'Gender "X" should be M or F',
      '"nope" isn\'t a valid email',
      "This email is already on the roster",
      "ok",
      "This email appears twice in the list",
      'Role "captain" should be player, coach or admin',
    ]);
  });
});

describe("inviteText", () => {
  it("personalises the message when it has a name and email", () => {
    const t = inviteText({ campName: "Selection Camp", url: "https://x.github.io/IISM/", firstName: "Arjun", email: "a@x.in" });
    expect(t).toContain("Hi Arjun, you're on the Selection Camp roster.");
    expect(t).toContain("sign in with a@x.in");
    expect(t).toContain("https://x.github.io/IISM/");
  });
  it("works as a group message", () => {
    expect(inviteText({ campName: "Camp", url: "u" })).toMatch(/^You're on the Camp roster\.[\s\S]*the email you gave the camp admin/);
  });
});
