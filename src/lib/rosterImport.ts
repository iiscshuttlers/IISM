import type { Role } from "./types";

export interface RosterLine {
  line: number;
  full_name: string;
  gender: "M" | "F" | "";
  email: string;
  role: Role;
  /** Why this line can't be added (it's skipped). */
  error?: string;
}

const GENDER: Record<string, "M" | "F"> = {
  m: "M", male: "M", man: "M", boy: "M",
  f: "F", female: "F", woman: "F", girl: "F",
};
const ROLES: Role[] = ["player", "coach", "admin"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parses a pasted roster: one person per line, "Name, M/F, email, role" (comma- or
 * tab-separated, so a spreadsheet paste works). Only the name is required; role defaults to
 * player. A header row ("Name, Gender, Email…") is skipped.
 */
export function parseRosterLines(text: string, existingEmails: string[] = []): RosterLine[] {
  const taken = new Set(existingEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  const seen = new Set<string>();
  const out: RosterLine[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const cells = raw.split(raw.includes("\t") ? "\t" : ",").map((c) => c.trim());
    if (i === 0 && /name/i.test(cells[0] ?? "") && cells.some((c) => /e-?mail|gender/i.test(c))) return;

    const [name = "", g = "", email = "", r = ""] = cells;
    const row: RosterLine = {
      line: i + 1,
      full_name: name.replace(/\s+/g, " "),
      gender: GENDER[g.toLowerCase()] ?? "",
      email: email.toLowerCase(),
      role: (ROLES.find((x) => x === r.toLowerCase()) ?? "player"),
    };

    if (!row.full_name) row.error = "Name is missing";
    else if (row.full_name.length > 80) row.error = "Name is longer than 80 characters";
    else if (g && !GENDER[g.toLowerCase()]) row.error = `Gender "${g}" should be M or F`;
    else if (r && !ROLES.includes(r.toLowerCase() as Role)) row.error = `Role "${r}" should be player, coach or admin`;
    else if (row.email && !EMAIL.test(row.email)) row.error = `"${email}" isn't a valid email`;
    else if (row.email && taken.has(row.email)) row.error = "This email is already on the roster";
    else if (row.email && seen.has(row.email)) row.error = "This email appears twice in the list";

    if (row.email) seen.add(row.email);
    out.push(row);
  });
  return out;
}

/** WhatsApp message asking someone (or a group) to sign in. */
export function inviteText({ campName, url, firstName, email }: { campName: string; url: string; firstName?: string; email?: string | null }) {
  const hello = firstName ? `Hi ${firstName}, you're` : "You're";
  return [
    `${hello} on the ${campName} roster.`,
    `1. Open ${url}`,
    email
      ? `2. Tap "Continue with Google" and sign in with ${email}`
      : `2. Tap "Continue with Google" and sign in with the email you gave the camp admin`,
    "3. On your phone, add it to your home screen so it opens like an app.",
  ].join("\n");
}
