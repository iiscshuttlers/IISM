import type { Match, Member } from "./types";

export function formatMatchWhatsAppText(match: Match, members: Member[], campName = "IISc Badminton Camp"): string {
  const memberMap = new Map(members.map((m) => [m.id, m.full_name]));
  const nameOf = (id: string | null) => (id ? memberMap.get(id) ?? "Unknown" : "");

  const team1 = [nameOf(match.t1_p1), nameOf(match.t1_p2)].filter(Boolean).join(" & ");
  const team2 = [nameOf(match.t2_p1), nameOf(match.t2_p2)].filter(Boolean).join(" & ");

  const winner = match.winner_side === 1 ? team1 : team2;
  const runnerUp = match.winner_side === 1 ? team2 : team1;
  const scores = match.games?.length ? match.games.join(", ") : "Winner only";

  return `🏸 *${campName} Match Result*
🏆 *[${match.category}]* ${winner} def. ${runnerUp}
📊 *Score:* ${scores}
📅 *Date:* ${match.played_on}
🔗 *Live Standings:* ${window.location.origin + import.meta.env.BASE_URL}`;
}

export function shareMatchOnWhatsApp(match: Match, members: Member[], campName?: string) {
  const text = formatMatchWhatsAppText(match, members, campName);
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}
