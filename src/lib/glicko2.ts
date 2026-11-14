/**
 * Glicko-2 (Glickman, 2012). Mirrors public._glicko2_update() in
 * supabase/migrations/0003_world_class.sql. The server is the source of truth for standings;
 * this copy exists so the maths is unit-tested against the published worked example and so
 * the SQL assertions can pin exact values.
 */
export const G2 = { start: 1500, startRd: 350, startVol: 0.06, tau: 0.5, scale: 173.7178 } as const;

export interface G2Rating { r: number; rd: number; vol: number }
export interface G2Result { r: number; rd: number; s: 0 | 0.5 | 1 }

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));

/** One rating period against one or more opponents. */
export function glicko2Update(p: G2Rating, results: G2Result[]): G2Rating {
  const { scale, tau } = G2;
  const mu = (p.r - 1500) / scale;
  const phi = p.rd / scale;
  if (results.length === 0) {
    const phiStar = Math.sqrt(phi * phi + p.vol * p.vol);
    return { r: p.r, rd: phiStar * scale, vol: p.vol };
  }
  let vInv = 0;
  let sum = 0;
  for (const o of results) {
    const muj = (o.r - 1500) / scale;
    const gj = g(o.rd / scale);
    const e = 1 / (1 + Math.exp(-gj * (mu - muj)));
    vInv += gj * gj * e * (1 - e);
    sum += gj * (o.s - e);
  }
  const v = 1 / vInv;
  const delta = v * sum;

  const a = Math.log(p.vol * p.vol);
  const f = (x: number) => {
    const ex = Math.exp(x);
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) - (x - a) / (tau * tau);
  };
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > 1e-6) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else { fA = fA / 2; }
    B = C; fB = fC;
  }
  const vol = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + vol * vol);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * sum;
  return { r: muNew * scale + 1500, rd: phiNew * scale, vol };
}

/** Team strength used for doubles: mean rating, RD combined as root-mean-square. */
export function teamOf(players: G2Rating[]): { r: number; rd: number } {
  const n = players.length;
  return {
    r: players.reduce((t, p) => t + p.r, 0) / n,
    rd: Math.sqrt(players.reduce((t, p) => t + p.rd * p.rd, 0) / n),
  };
}

export interface G2Match { t1: string[]; t2: string[]; winner: 1 | 2 }

/** Replays matches in order (each match is its own rating period), as the server does. */
export function replay(players: string[], matches: G2Match[]): Record<string, G2Rating> {
  const st: Record<string, G2Rating> = {};
  for (const id of players) st[id] = { r: G2.start, rd: G2.startRd, vol: G2.startVol };
  for (const m of matches) {
    const a = teamOf(m.t1.map((id) => st[id]));
    const b = teamOf(m.t2.map((id) => st[id]));
    const next: Record<string, G2Rating> = {};
    for (const id of m.t1) next[id] = glicko2Update(st[id], [{ ...b, s: m.winner === 1 ? 1 : 0 }]);
    for (const id of m.t2) next[id] = glicko2Update(st[id], [{ ...a, s: m.winner === 2 ? 1 : 0 }]);
    Object.assign(st, next);
  }
  return st;
}
