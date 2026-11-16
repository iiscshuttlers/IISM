import type { Match, Member, Session, Standing } from "./types";
import type { WeatherVenuePlan } from "./campExtended";

export function formatMatchWhatsAppText(match: Match, members: Member[], campName = "IISc Badminton Camp"): string {
  const memberMap = new Map(members.map((m) => [m.id, m.full_name]));
  const nameOf = (id: string | null) => (id ? memberMap.get(id) ?? "Unknown" : "");

  const team1 = [nameOf(match.t1_p1), nameOf(match.t1_p2)].filter(Boolean).join(" & ");
  const team2 = [nameOf(match.t2_p1), nameOf(match.t2_p2)].filter(Boolean).join(" & ");

  const winner = match.winner_side === 1 ? team1 : team2;
  const runnerUp = match.winner_side === 1 ? team2 : team1;
  const scores = match.games?.length ? match.games.join(", ") : "Winner only";

  const appUrl = typeof window !== "undefined" ? window.location.origin + import.meta.env.BASE_URL : "";

  return `🏸 *${campName} Match Result*
🏆 *[${match.category}]* ${winner} def. ${runnerUp}
📊 *Score:* ${scores}
📅 *Date:* ${match.played_on}
🔗 *Live Standings:* ${appUrl}`;
}

export function shareMatchOnWhatsApp(match: Match, members: Member[], campName?: string) {
  const text = formatMatchWhatsAppText(match, members, campName);
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}

export function formatDailyScheduleWhatsAppText({
  campName = "IISc Badminton Camp",
  session,
  weatherPlan,
  presentCount = 0,
  totalSquad = 0,
}: {
  campName?: string;
  session?: Session | null;
  weatherPlan?: WeatherVenuePlan | null;
  presentCount?: number;
  totalSquad?: number;
}): string {
  const dateStr = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
  const appUrl = typeof window !== "undefined" ? window.location.origin + import.meta.env.BASE_URL : "";

  const lines = [
    `🏸 *${campName} — Daily Briefing*`,
    `📅 *Day:* ${dateStr}`,
    `📍 *Venue:* ${weatherPlan?.venue_name ?? "IISc Gymkhana Badminton Courts"}`,
  ];

  if (weatherPlan) {
    lines.push(`⚡ *Court Conditions:* ${weatherPlan.weather_summary}`);
    lines.push(`💨 *Shuttle Speed:* ${weatherPlan.shuttle_speed}`);
    if (weatherPlan.athlete_notice) {
      lines.push(`📢 *Notice:* ${weatherPlan.athlete_notice}`);
    }
  }

  if (session) {
    lines.push(`🎯 *Session:* ${session.title}${session.duration_min ? ` (${session.duration_min} min)` : ""}`);
    if (session.focus) lines.push(`💡 *Focus Area:* ${session.focus}`);
  }

  if (totalSquad > 0) {
    lines.push(`👥 *Squad on Court:* ${presentCount} of ${totalSquad} athletes present`);
  }

  lines.push(`🔗 *Live Camp Board:* ${appUrl}`);
  return lines.join("\n");
}

export function shareDailyScheduleOnWhatsApp(options: Parameters<typeof formatDailyScheduleWhatsAppText>[0]) {
  const text = formatDailyScheduleWhatsAppText(options);
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}

export function formatStandingsLeaderboardWhatsAppText(
  campName: string,
  standings: Standing[],
  topCount = 5
): string {
  const top = standings.slice(0, topCount);
  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
  const appUrl = typeof window !== "undefined" ? window.location.origin + import.meta.env.BASE_URL : "";

  const lines = [
    `🏆 *${campName} — Current Leaderboard*`,
    `📅 *Updated:* ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`,
    "",
  ];

  top.forEach((s, idx) => {
    const medal = medals[idx] ?? `${idx + 1}.`;
    const form = s.form ? ` (${s.form.slice(-3)})` : "";
    lines.push(`${medal} *${s.full_name}* — ${s.rating} Elo · ${s.won}W/${s.played}P${form}`);
  });

  lines.push("");
  lines.push(`🔗 *View Full Standings:* ${appUrl}`);
  return lines.join("\n");
}

export function shareStandingsOnWhatsApp(campName: string, standings: Standing[], topCount = 5) {
  const text = formatStandingsLeaderboardWhatsAppText(campName, standings, topCount);
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}
