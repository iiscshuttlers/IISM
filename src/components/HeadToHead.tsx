import { useState, useMemo } from "react";
import { Users } from "lucide-react";
import { Card, Select, Sheet } from "./ui";
import type { Match, Member, Standing } from "../lib/types";

export function HeadToHeadModal({
  open,
  onClose,
  players,
  matches,
  standings,
  initialP1Id,
}: {
  open: boolean;
  onClose: () => void;
  players: Member[];
  matches: Match[];
  standings: Standing[];
  initialP1Id?: string | null;
}) {
  const [p1Id, setP1Id] = useState<string>(initialP1Id || (players[0]?.id ?? ""));
  const [p2Id, setP2Id] = useState<string>(
    players.find((p) => p.id !== (initialP1Id || players[0]?.id))?.id ?? ""
  );

  const p1 = useMemo(() => players.find((p) => p.id === p1Id), [players, p1Id]);
  const p2 = useMemo(() => players.find((p) => p.id === p2Id), [players, p2Id]);

  const s1 = useMemo(() => standings.find((s) => s.person_id === p1Id), [standings, p1Id]);
  const s2 = useMemo(() => standings.find((s) => s.person_id === p2Id), [standings, p2Id]);

  // Head-to-head opposing matches
  const opposingMatches = useMemo(() => {
    if (!p1Id || !p2Id || p1Id === p2Id) return [];
    return matches.filter((m) => {
      if (m.status !== "confirmed") return false;
      const team1 = [m.t1_p1, m.t1_p2].filter(Boolean);
      const team2 = [m.t2_p1, m.t2_p2].filter(Boolean);
      const p1InT1 = team1.includes(p1Id);
      const p1InT2 = team2.includes(p1Id);
      const p2InT1 = team1.includes(p2Id);
      const p2InT2 = team2.includes(p2Id);

      return (p1InT1 && p2InT2) || (p1InT2 && p2InT1);
    });
  }, [matches, p1Id, p2Id]);

  // Combined matches as partners
  const partnerMatches = useMemo(() => {
    if (!p1Id || !p2Id || p1Id === p2Id) return [];
    return matches.filter((m) => {
      if (m.status !== "confirmed") return false;
      const team1 = [m.t1_p1, m.t1_p2].filter(Boolean);
      const team2 = [m.t2_p1, m.t2_p2].filter(Boolean);
      return (team1.includes(p1Id) && team1.includes(p2Id)) || (team2.includes(p1Id) && team2.includes(p2Id));
    });
  }, [matches, p1Id, p2Id]);

  const p1WinsAgainstP2 = useMemo(() => {
    return opposingMatches.filter((m) => {
      const p1InT1 = [m.t1_p1, m.t1_p2].includes(p1Id);
      return (p1InT1 && m.winner_side === 1) || (!p1InT1 && m.winner_side === 2);
    }).length;
  }, [opposingMatches, p1Id]);

  const p2WinsAgainstP1 = opposingMatches.length - p1WinsAgainstP2;

  const partnerWins = useMemo(() => {
    return partnerMatches.filter((m) => {
      const inT1 = [m.t1_p1, m.t1_p2].includes(p1Id);
      return (inT1 && m.winner_side === 1) || (!inT1 && m.winner_side === 2);
    }).length;
  }, [partnerMatches, p1Id]);

  const memberMap = useMemo(() => new Map(players.map((p) => [p.id, p.full_name])), [players]);
  const formatName = (id: string | null) => (id ? memberMap.get(id) ?? "Unknown" : "");

  return (
    <Sheet open={open} onClose={onClose} title="Head-to-Head Comparison">
      <div className="space-y-4">
        {/* Selectors */}
        <div className="grid grid-cols-2 gap-3 items-center">
          <div>
            <label className="text-xs font-semibold text-ink-soft mb-1 block">Player 1</label>
            <Select value={p1Id} onChange={(e) => setP1Id(e.target.value)}>
              {players.map((p) => (
                <option key={p.id} value={p.id} disabled={p.id === p2Id}>
                  {p.full_name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-soft mb-1 block">Player 2</label>
            <Select value={p2Id} onChange={(e) => setP2Id(e.target.value)}>
              {players.map((p) => (
                <option key={p.id} value={p.id} disabled={p.id === p1Id}>
                  {p.full_name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {p1 && p2 && (
          <>
            {/* Scorecard Hero */}
            <Card className="bg-gradient-to-r from-brand/5 via-surface to-brand/5 border-brand/20 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft mb-2">Direct Encounters</p>
              <div className="flex items-center justify-around">
                <div className="flex-1">
                  <p className="text-sm font-bold text-ink truncate">{p1.full_name}</p>
                  <p className="text-3xl font-black text-brand tabular-nums">{p1WinsAgainstP2}</p>
                  <p className="text-[11px] text-ink-soft font-mono">{s1?.rating ?? 1200} Elo</p>
                </div>

                <div className="px-3 py-1 rounded bg-surface-2 text-xs font-bold text-ink-soft">
                  {opposingMatches.length} Matches
                </div>

                <div className="flex-1">
                  <p className="text-sm font-bold text-ink truncate">{p2.full_name}</p>
                  <p className="text-3xl font-black text-brand tabular-nums">{p2WinsAgainstP1}</p>
                  <p className="text-[11px] text-ink-soft font-mono">{s2?.rating ?? 1200} Elo</p>
                </div>
              </div>
            </Card>

            {/* Doubles Partnership Chemistry */}
            {partnerMatches.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-1 text-xs font-bold text-ink">
                  <Users size={14} className="text-brand" />
                  <span>As Doubles Partners</span>
                </div>
                <p className="text-xs text-ink-soft">
                  When paired together on the same side: <strong className="text-ink">{partnerWins} Won</strong> out of{" "}
                  <strong className="text-ink">{partnerMatches.length} matches</strong> (
                  {Math.round((partnerWins / partnerMatches.length) * 100)}% win rate).
                </p>
              </Card>
            )}

            {/* Match History Between Them */}
            <div>
              <h4 className="text-xs font-bold text-ink-soft uppercase tracking-wider mb-2">
                Encounter History ({opposingMatches.length})
              </h4>
              {opposingMatches.length === 0 ? (
                <div className="p-4 text-center text-xs text-ink-soft bg-surface-2 rounded-lg">
                  These two players have not faced each other yet in this camp.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {opposingMatches.map((m) => {
                    const p1InT1 = [m.t1_p1, m.t1_p2].includes(p1Id);
                    const p1Won = (p1InT1 && m.winner_side === 1) || (!p1InT1 && m.winner_side === 2);
                    const t1 = [formatName(m.t1_p1), formatName(m.t1_p2)].filter(Boolean).join(" & ");
                    const t2 = [formatName(m.t2_p1), formatName(m.t2_p2)].filter(Boolean).join(" & ");

                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-surface border border-line text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold text-[10px] text-white ${
                              p1Won ? "bg-status-success-text" : "bg-status-danger-text"
                            }`}
                          >
                            {p1Won ? `${p1.full_name.split(" ")[0]} won` : `${p2.full_name.split(" ")[0]} won`}
                          </span>
                          <span className="font-semibold text-brand">{m.category}</span>
                          <span className="text-ink truncate max-w-[160px] sm:max-w-none">
                            {t1} vs {t2}
                          </span>
                        </div>
                        <span className="font-mono text-ink-soft font-semibold">
                          {m.games?.join(", ") || "Winner only"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
