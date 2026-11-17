/**
 * Forgiving name search for the player pickers: "Rsja" still finds "Raja", "rk" finds
 * "Raja Kumar", "jose" finds "José". Lower scores are better matches; null means no match.
 */

/** Lowercase, accents dropped, punctuation turned into spaces. Keeps letters of any script. */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Edits to turn a into b: insert, delete, replace, or swap two neighbouring letters. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, rows[i - 2][j - 2] + 1);
      rows[i][j] = d;
    }
  }
  return rows[a.length][b.length];
}

/** Typos forgiven for a search word of this length. */
const allowedTypos = (n: number) => (n <= 2 ? 0 : n <= 5 ? 1 : 2);

/** How well one typed word matches one word of the name, or null. */
function wordScore(t: string, w: string, isFirstWord: boolean): number | null {
  if (w.startsWith(t)) return isFirstWord ? 0 : 1;
  if (w.includes(t)) return 3;
  const allowed = allowedTypos(t.length);
  // Short words: a typo in the first letter is too loose (it would match half the roster).
  if (!allowed || (t.length <= 3 && t[0] !== w[0])) return null;
  // Compare against the start of the name word (typing is usually a prefix), give or take a letter.
  let best = Infinity;
  for (const len of [t.length - 1, t.length, t.length + 1]) {
    if (len < 1 || len > w.length) continue;
    best = Math.min(best, editDistance(t, w.slice(0, len)));
  }
  best = Math.min(best, editDistance(t, w));
  return best <= allowed ? 4 + best : null;
}

/** Match score of a typed query against a name; lower is better, null is no match. */
export function fuzzyScore(query: string, name: string): number | null {
  const q = normalize(query);
  if (!q) return 0;
  const n = normalize(name);
  if (n.startsWith(q)) return 0;

  const words = n.split(" ");
  const compact = words.join("");
  const qCompact = q.replace(/ /g, "");
  // Typed without the space ("rajakumar"), or initials ("rk").
  if (qCompact.length > 1 && compact.startsWith(qCompact)) return 1;
  if (qCompact.length > 1 && words.length > 1 && words.map((w) => w[0]).join("").startsWith(qCompact)) return 2;

  let total = 0;
  for (const t of q.split(" ")) {
    let best: number | null = null;
    words.forEach((w, i) => {
      const s = wordScore(t, w, i === 0);
      if (s !== null && (best === null || s < best)) best = s;
    });
    // "rajakumr" (no space, one typo) against "raja kumar".
    if (best === null && words.length > 1) best = wordScore(t, compact, true);
    if (best === null) return null;
    total += best;
  }
  return total;
}

/** The items whose name matches, best match first (ties keep their order). Empty query: all. */
export function fuzzyFilter<T>(items: T[], query: string, nameOf: (item: T) => string): T[] {
  if (!normalize(query)) return items;
  return items
    .map((item, i) => ({ item, i, score: fuzzyScore(query, nameOf(item)) }))
    .filter((x): x is { item: T; i: number; score: number } => x.score !== null)
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map((x) => x.item);
}
