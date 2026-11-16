export type Category = "MS" | "WS" | "MD" | "WD" | "XD";
export type Gender = "M" | "F" | null;

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: "MS", label: "Men's singles" },
  { value: "WS", label: "Women's singles" },
  { value: "MD", label: "Men's doubles" },
  { value: "WD", label: "Women's doubles" },
  { value: "XD", label: "Mixed doubles" },
];

export const isSingles = (c: Category) => c === "MS" || c === "WS";

/** Turns raw "21" / "15" input pairs into ["21-15", ...]; empty rows are ignored. */
export function parseGames(rows: { a: string; b: string }[]): { games: string[] | null; error?: string } {
  const games: string[] = [];
  for (const [i, row] of rows.entries()) {
    const a = row.a.trim();
    const b = row.b.trim();
    if (!a && !b) continue;
    if (!/^\d{1,2}$/.test(a) || !/^\d{1,2}$/.test(b)) return { games: null, error: `Game ${i + 1}: enter both scores as numbers` };
    if (Number(a) === Number(b)) return { games: null, error: `Game ${i + 1}: a game cannot be tied` };
    games.push(`${Number(a)}-${Number(b)}`);
  }
  return { games: games.length ? games : null };
}

/** Points-per-game choices for quick entry, with the score a game is capped at. */
export const GAME_POINTS = [
  { target: 21, cap: 30 },
  { target: 15, cap: 21 },
  { target: 11, cap: 15 },
] as const;

/**
 * The winner's score in a game to `target` points (win by 2, capped), given the loser's score.
 * null when the loser's score is impossible for that game.
 */
export function winningScore(target: number, loser: number): number | null {
  const cap = GAME_POINTS.find((g) => g.target === target)?.cap ?? target;
  if (!Number.isInteger(loser) || loser < 0 || loser >= cap) return null;
  return loser <= target - 2 ? target : Math.min(loser + 2, cap);
}

/** Quick entry for one game: who won, and the losing side's score. */
export interface QuickGame {
  winner: 1 | 2 | null;
  loser: string;
}

/** Turns quick entries into the "A"/"B" score rows parseGames reads. Empty games are skipped. */
export function quickGamesToRows(games: QuickGame[], target: number): { rows: { a: string; b: string }[]; error?: string } {
  const rows: { a: string; b: string }[] = [];
  for (const [i, g] of games.entries()) {
    const l = g.loser.trim();
    if (!g.winner && !l) {
      rows.push({ a: "", b: "" });
      continue;
    }
    if (!g.winner) return { rows: [], error: `Game ${i + 1}: tap who won` };
    if (!/^\d{1,2}$/.test(l)) return { rows: [], error: `Game ${i + 1}: enter the losing side's score` };
    const w = winningScore(target, Number(l));
    if (w === null) return { rows: [], error: `Game ${i + 1}: ${l} is too high for a ${target}-point game` };
    rows.push(g.winner === 1 ? { a: String(w), b: l } : { a: l, b: String(w) });
  }
  return { rows };
}

/** Side that won more games, or null if no games or level. */
export function winnerFromGames(games: string[] | null): 1 | 2 | null {
  if (!games?.length) return null;
  let w1 = 0;
  let w2 = 0;
  for (const g of games) {
    const [a, b] = g.split("-").map(Number);
    if (a > b) w1++;
    else w2++;
  }
  if (w1 === w2) return null;
  return w1 > w2 ? 1 : 2;
}

/** Gender each slot must have for a category: [t1p1, t1p2, t2p1, t2p2]. null = any. */
export function slotGenders(c: Category): [Gender, Gender, Gender, Gender] {
  switch (c) {
    case "MS": return ["M", null, "M", null];
    case "WS": return ["F", null, "F", null];
    case "MD": return ["M", "M", "M", "M"];
    case "WD": return ["F", "F", "F", "F"];
    case "XD": return ["M", "F", "M", "F"];
  }
}

/** Client-side mirror of the server rules, for instant feedback. The server re-checks. */
export function validatePlayers(
  c: Category,
  slots: (string | null)[],
  genderOf: (id: string) => Gender,
): string | null {
  const needed = isSingles(c) ? [0, 2] : [0, 1, 2, 3];
  for (const i of needed) if (!slots[i]) return "Pick every player";
  const ids = needed.map((i) => slots[i]!) as string[];
  if (new Set(ids).size !== ids.length) return "A player appears twice";
  const want = slotGenders(c);
  for (const i of needed) {
    const g = genderOf(slots[i]!);
    if (want[i] && g && g !== want[i]) return "Players don't match the category";
  }
  return null;
}
