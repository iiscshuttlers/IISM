import { useState, useMemo } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { Button, Card, Segmented, Sheet } from "./ui";
import { CATEGORIES, isSingles, type Category } from "../lib/scores";
import type { Member, Match, Standing } from "../lib/types";
import { history, suggestionScore, timesMet } from "../lib/insights";

interface SuggestedPairing {
  category: Category;
  team1: Member[];
  team2: Member[];
  team1Rating: number;
  team2Rating: number;
  ratingDiff: number;
  reason: string;
}

export function PairingHelperModal({
  players,
  matches,
  standings,
  onSelectMatch,
}: {
  players: Member[];
  matches: Match[];
  standings: Standing[];
  onSelectMatch: (category: Category, slots: (string | null)[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedCat, setSelectedCat] = useState<Category>("MS");

  const ratingMap = useMemo(() => new Map(standings.map((s) => [s.person_id, s.glicko ?? s.rating])), [standings]);
  const hist = useMemo(() => history(matches), [matches]);

  // Count matches played per person in this category
  const playCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of players) counts.set(p.id, 0);
    for (const m of matches) {
      if (m.status !== "confirmed") continue;
      const participants = [m.t1_p1, m.t1_p2, m.t2_p1, m.t2_p2].filter(Boolean) as string[];
      for (const id of participants) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  }, [players, matches]);

  const suggestions = useMemo<SuggestedPairing[]>(() => {
    const singles = isSingles(selectedCat);

    // Filter players eligible by gender
    const eligibleMale = players.filter((p) => !p.gender || p.gender === "M");
    const eligibleFemale = players.filter((p) => !p.gender || p.gender === "F");

    const getRating = (id: string) => ratingMap.get(id) ?? 1500;

    const list: SuggestedPairing[] = [];

    if (singles) {
      const candidates = selectedCat === "MS" ? eligibleMale : eligibleFemale;
      if (candidates.length < 2) return [];

      // Sort candidates by match count (least played first)
      const sorted = [...candidates].sort((a, b) => (playCounts.get(a.id) ?? 0) - (playCounts.get(b.id) ?? 0));

      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const p1 = sorted[i];
          const p2 = sorted[j];
          const r1 = getRating(p1.id);
          const r2 = getRating(p2.id);
          const diff = Math.abs(r1 - r2);
          const totalPlayed = (playCounts.get(p1.id) ?? 0) + (playCounts.get(p2.id) ?? 0);

          list.push({
            category: selectedCat,
            team1: [p1],
            team2: [p2],
            team1Rating: r1,
            team2Rating: r2,
            ratingDiff: diff,
            reason:
              totalPlayed === 0
                ? "Both need first match"
                : diff <= 30
                ? `Closest rating gap (${diff} pts)`
                : `Balanced court time (${playCounts.get(p1.id)} vs ${playCounts.get(p2.id)} played)`,
          });
        }
      }
    } else if (selectedCat === "XD") {
      if (eligibleMale.length < 2 || eligibleFemale.length < 2) return [];
      const mSorted = [...eligibleMale].sort((a, b) => (playCounts.get(a.id) ?? 0) - (playCounts.get(b.id) ?? 0));
      const fSorted = [...eligibleFemale].sort((a, b) => (playCounts.get(a.id) ?? 0) - (playCounts.get(b.id) ?? 0));

      for (let m1 = 0; m1 < mSorted.length; m1++) {
        for (let f1 = 0; f1 < fSorted.length; f1++) {
          for (let m2 = m1 + 1; m2 < mSorted.length; m2++) {
            for (let f2 = 0; f2 < fSorted.length; f2++) {
              if (f1 === f2) continue;
              const t1_m = mSorted[m1];
              const t1_f = fSorted[f1];
              const t2_m = mSorted[m2];
              const t2_f = fSorted[f2];

              const t1Avg = (getRating(t1_m.id) + getRating(t1_f.id)) / 2;
              const t2Avg = (getRating(t2_m.id) + getRating(t2_f.id)) / 2;
              const diff = Math.round(Math.abs(t1Avg - t2Avg));

              list.push({
                category: selectedCat,
                team1: [t1_m, t1_f],
                team2: [t2_m, t2_f],
                team1Rating: Math.round(t1Avg),
                team2Rating: Math.round(t2Avg),
                ratingDiff: diff,
                reason: diff <= 25 ? `Evenly matched mixed pair (${diff} pts diff)` : "Balanced playtime",
              });
            }
          }
        }
      }
    } else {
      // MD or WD
      const candidates = selectedCat === "MD" ? eligibleMale : eligibleFemale;
      if (candidates.length < 4) return [];
      const sorted = [...candidates].sort((a, b) => (playCounts.get(a.id) ?? 0) - (playCounts.get(b.id) ?? 0));

      // Generate pairs from the top 6 least-played candidates
      const pool = sorted.slice(0, Math.min(8, sorted.length));
      for (let a = 0; a < pool.length; a++) {
        for (let b = a + 1; b < pool.length; b++) {
          for (let c = b + 1; c < pool.length; c++) {
            for (let d = c + 1; d < pool.length; d++) {
              const pA = pool[a];
              const pB = pool[b];
              const pC = pool[c];
              const pD = pool[d];

              const t1Avg = (getRating(pA.id) + getRating(pD.id)) / 2;
              const t2Avg = (getRating(pB.id) + getRating(pC.id)) / 2;
              const diff = Math.round(Math.abs(t1Avg - t2Avg));

              list.push({
                category: selectedCat,
                team1: [pA, pD],
                team2: [pB, pC],
                team1Rating: Math.round(t1Avg),
                team2Rating: Math.round(t2Avg),
                ratingDiff: diff,
                reason: diff <= 30 ? `Closest doubles balance (${diff} pts)` : "Least matches played",
              });
            }
          }
        }
      }
    }

    // Rank by closeness, least court time and fresh match-ups (see lib/insights suggestionScore).
    const ids = (t: Member[]) => t.map((p) => p.id);
    return list
      .map((p) => {
        const met = timesMet(hist, ids(p.team1), ids(p.team2));
        return {
          ...p,
          score: suggestionScore(hist, ids(p.team1), ids(p.team2), getRating),
          reason: met === 0 ? `New match-up · ${p.reason}` : p.reason,
        };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 4);
  }, [selectedCat, players, matches, playCounts, ratingMap, hist]);

  const handlePick = (pairing: SuggestedPairing) => {
    const singles = isSingles(pairing.category);
    let slots: (string | null)[];
    if (singles) {
      slots = [pairing.team1[0].id, null, pairing.team2[0].id, null];
    } else {
      slots = [pairing.team1[0].id, pairing.team1[1].id, pairing.team2[0].id, pairing.team2[1].id];
    }
    setOpen(false);
    onSelectMatch(pairing.category, slots);
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5"
      >
        <Sparkles size={15} className="text-amber-500" />
        <span>Who plays next?</span>
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Pairing Suggester">
        <div className="space-y-4">
          <p className="text-xs text-ink-soft">
            Ranks match-ups that are close on rating, give court time to whoever has played least, and haven't been seen yet — each one tells the coaches something new.
          </p>

          <div>
            <label className="text-xs font-semibold text-ink-soft mb-1.5 block">Category</label>
            <Segmented
              value={selectedCat}
              onChange={(val) => setSelectedCat(val as Category)}
              options={CATEGORIES.map((c) => ({ value: c.value, label: c.value }))}
            />
          </div>

          <div className="space-y-2">
            {suggestions.length === 0 ? (
              <div className="p-4 text-center text-sm text-ink-soft border border-dashed border-line rounded-lg">
                Not enough eligible players with matching gender to form a {selectedCat} match.
              </div>
            ) : (
              suggestions.map((s, idx) => (
                <Card key={idx} className="hover:border-brand/40 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-brand px-1.5 py-0.5 rounded bg-brand/10">
                      {s.category}
                    </span>
                    <span className="text-[11px] text-ink-soft font-medium">{s.reason}</span>
                  </div>

                  <div className="flex items-center justify-between py-1 text-sm">
                    <div className="flex-1">
                      <p className="font-semibold text-ink">{s.team1.map((p) => p.full_name).join(" & ")}</p>
                      <p className="text-[11px] text-ink-soft">
                        Played: {s.team1.map((p) => playCounts.get(p.id) ?? 0).join(" & ")}
                      </p>
                    </div>

                    <div className="px-3 text-xs font-bold text-ink-soft">vs</div>

                    <div className="flex-1 text-right">
                      <p className="font-semibold text-ink">{s.team2.map((p) => p.full_name).join(" & ")}</p>
                      <p className="text-[11px] text-ink-soft">
                        Played: {s.team2.map((p) => playCounts.get(p.id) ?? 0).join(" & ")}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-line flex items-center justify-between">
                    <span className="text-xs text-ink-soft font-mono">
                      Rating gap: <strong>{s.ratingDiff} Elo</strong> ({s.team1Rating} vs {s.team2Rating})
                    </span>
                    <Button size="sm" onClick={() => handlePick(s)}>
                      <span>Record this</span>
                      <ArrowRight size={14} />
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </Sheet>
    </>
  );
}
