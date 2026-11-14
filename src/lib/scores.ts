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
