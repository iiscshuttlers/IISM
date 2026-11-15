import type { Match, Member, Session } from "./types";

function formatDateForIcs(dateStr: string, timeStr = "09:00:00"): string {
  // Convert YYYY-MM-DD to YYYYMMDDTHHMMSSZ or YYYYMMDD
  const cleanDate = dateStr.replace(/[-:]/g, "").slice(0, 8);
  const cleanTime = timeStr.replace(/[-:]/g, "").slice(0, 6);
  return `${cleanDate}T${cleanTime}`;
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export interface CampCalendarOptions {
  campName: string;
  sessions: Session[];
  matches?: Match[];
  members?: Member[];
  venue?: string;
}

export function generateCampIcs({
  campName,
  sessions,
  matches = [],
  members = [],
  venue = "IISc Gymkhana Badminton Courts",
}: CampCalendarOptions): string {
  const memberMap = new Map(members.map((m) => [m.id, m.full_name]));
  const formatName = (id: string | null) => (id ? memberMap.get(id) ?? "Unknown" : "");

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//IISc Shuttlers//Camp Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(campName)}`,
    "X-WR-TIMEZONE:Asia/Kolkata",
  ];

  // Sessions
  sessions.forEach((s) => {
    const dateStr = s.session_date;
    if (!dateStr) return;

    const durationMin = s.duration_min || 120;
    const startHour = 9;
    const endHour = startHour + Math.floor(durationMin / 60);
    const endMin = durationMin % 60;

    const startFormatted = formatDateForIcs(dateStr, `${String(startHour).padStart(2, "0")}:00:00`);
    const endFormatted = formatDateForIcs(
      dateStr,
      `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}:00`
    );

    const descParts = [
      s.focus ? `Focus: ${s.focus}` : "",
      s.notes ? `Notes: ${s.notes}` : "",
      `Duration: ${durationMin} minutes`,
    ]
      .filter(Boolean)
      .join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:session_${s.id}_${dateStr}@iiscshuttlers`,
      `DTSTAMP:${formatDateForIcs(new Date().toISOString().slice(0, 10), "12:00:00")}Z`,
      `DTSTART:${startFormatted}`,
      `DTEND:${endFormatted}`,
      `SUMMARY:${escapeIcsText(`[Training] ${s.title} (${campName})`)}`,
      `DESCRIPTION:${escapeIcsText(descParts)}`,
      `LOCATION:${escapeIcsText(venue)}`,
      "STATUS:CONFIRMED",
      "END:VEVENT"
    );
  });

  // Matches (if any)
  matches.slice(0, 50).forEach((m) => {
    const dateStr = m.played_on;
    if (!dateStr) return;

    const t1 = [formatName(m.t1_p1), formatName(m.t1_p2)].filter(Boolean).join(" & ");
    const t2 = [formatName(m.t2_p1), formatName(m.t2_p2)].filter(Boolean).join(" & ");
    const title = `${m.category}: ${t1} vs ${t2}`;

    const scoreStr = m.games && m.games.length > 0 ? `Games: ${m.games.join(", ")}` : "Fixture";
    const startFormatted = formatDateForIcs(dateStr, "16:00:00");
    const endFormatted = formatDateForIcs(dateStr, "17:00:00");

    lines.push(
      "BEGIN:VEVENT",
      `UID:match_${m.id}_${dateStr}@iiscshuttlers`,
      `DTSTAMP:${formatDateForIcs(new Date().toISOString().slice(0, 10), "12:00:00")}Z`,
      `DTSTART:${startFormatted}`,
      `DTEND:${endFormatted}`,
      `SUMMARY:${escapeIcsText(`[Match] ${title}`)}`,
      `DESCRIPTION:${escapeIcsText(`Camp Match: ${title}\\nStatus: ${m.status}\\n${scoreStr}`)}`,
      `LOCATION:${escapeIcsText(venue)}`,
      "STATUS:CONFIRMED",
      "END:VEVENT"
    );
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function generateGoogleCalendarUrl(
  session: Session,
  campName: string,
  venue = "IISc Gymkhana Badminton Courts"
): string {
  const dateStr = session.session_date ? session.session_date.replace(/-/g, "") : "";
  const start = `${dateStr}T090000`;
  const durMin = session.duration_min || 120;
  const endH = 9 + Math.floor(durMin / 60);
  const endM = durMin % 60;
  const end = `${dateStr}T${String(endH).padStart(2, "0")}${String(endM).padStart(2, "0")}00`;

  const details = [
    session.focus ? `Focus: ${session.focus}` : "",
    session.notes ? `Notes: ${session.notes}` : "",
    `Camp: ${campName}`,
  ]
    .filter(Boolean)
    .join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `[Training] ${session.title} - ${campName}`,
    dates: `${start}/${end}`,
    details,
    location: venue,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadIcsFile(filename: string, icsContent: string): void {
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename.endsWith(".ics") ? filename : `${filename}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
