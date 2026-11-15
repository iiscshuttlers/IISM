import { useState, useMemo } from "react";
import { History, TrendingUp, ArrowRight, Filter } from "lucide-react";
import { Badge, Button, Card, Sheet } from "./ui";
import { computePlayerRatingHistory } from "../lib/campExtended";
import type { Match, Member, Standing } from "../lib/types";

export function PersonalMatchHistoryModal({
  open,
  onClose,
  personId,
  members,
  matches,
  standings,
}: {
  open: boolean;
  onClose: () => void;
  personId: string | null;
  members: Member[];
  matches: Match[];
  standings: Standing[];
}) {
  const [selectedCat, setSelectedCat] = useState<string>("ALL");

  const member = useMemo(() => members.find((m) => m.id === personId), [members, personId]);
  const standing = useMemo(() => standings.find((s) => s.person_id === personId), [standings, personId]);

  const history = useMemo(() => {
    if (!personId) return [];
    return computePlayerRatingHistory(personId, matches, members);
  }, [personId, matches, members]);

  const filteredHistory = useMemo(() => {
    if (selectedCat === "ALL") return history;
    return history.filter((h) => h.category === selectedCat);
  }, [history, selectedCat]);

  // Statistics summary
  const stats = useMemo(() => {
    const total = history.length;
    const wins = history.filter((h) => h.isWin).length;
    const losses = total - wins;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    const latestRating = history.length > 0 ? history[history.length - 1].ratingAfter : (standing?.rating ?? 1200);
    const netRatingChange = latestRating - 1200;
    return { total, wins, losses, winRate, latestRating, netRatingChange };
  }, [history, standing]);

  // Reverse chronological for displaying recent matches first
  const displayMatches = useMemo(() => [...filteredHistory].reverse(), [filteredHistory]);

  if (!member) return null;

  return (
    <Sheet open={open} onClose={onClose} title={`${member.full_name} — Match & Rating History`}>
      <div className="space-y-4">
        {/* Rating & Performance Summary Banner */}
        <Card className="bg-surface-2 border-line">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-[11px] text-ink-soft uppercase font-bold tracking-wider">Current Rating</p>
              <div className="flex items-center justify-center gap-1 mt-0.5">
                <span className="text-xl font-black text-brand tabular-nums">{stats.latestRating}</span>
                <span
                  className={`text-xs font-bold tabular-nums ${
                    stats.netRatingChange >= 0 ? "text-status-success-text" : "text-status-danger-text"
                  }`}
                >
                  ({stats.netRatingChange >= 0 ? `+${stats.netRatingChange}` : stats.netRatingChange})
                </span>
              </div>
            </div>

            <div>
              <p className="text-[11px] text-ink-soft uppercase font-bold tracking-wider">Record</p>
              <p className="text-xl font-black text-ink mt-0.5">
                {stats.wins}W – {stats.losses}L
              </p>
            </div>

            <div>
              <p className="text-[11px] text-ink-soft uppercase font-bold tracking-wider">Win Rate</p>
              <p className="text-xl font-black text-emerald-600 mt-0.5">{stats.winRate}%</p>
            </div>

            <div>
              <p className="text-[11px] text-ink-soft uppercase font-bold tracking-wider">Current Form</p>
              <div className="flex items-center justify-center gap-1 mt-1 font-mono font-bold text-xs">
                {standing?.form ? (
                  standing.form.split("").slice(-5).map((letter, idx) => (
                    <span
                      key={idx}
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white ${
                        letter === "W" ? "bg-status-success-text" : "bg-status-danger-text"
                      }`}
                    >
                      {letter}
                    </span>
                  ))
                ) : (
                  <span className="text-ink-soft">—</span>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Category Filters */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-ink-soft">
            <Filter size={13} />
            <span className="font-semibold">Category:</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {["ALL", "MS", "WS", "MD", "WD", "XD"].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCat(cat)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                  selectedCat === cat
                    ? "bg-brand text-white"
                    : "bg-surface-2 text-ink hover:bg-surface-2/80 border border-line"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Match Timeline */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-ink-soft uppercase tracking-wider flex items-center gap-1.5">
              <History size={14} />
              <span>Match-by-Match Progression ({displayMatches.length})</span>
            </h4>
            <span className="text-[11px] text-ink-soft">Chronological breakdown</span>
          </div>

          {displayMatches.length === 0 ? (
            <Card className="text-center py-6 text-ink-soft text-xs border-dashed">
              No confirmed matches recorded {selectedCat !== "ALL" ? `for ${selectedCat}` : "yet"}.
            </Card>
          ) : (
            <div className="space-y-2">
              {displayMatches.map((item, idx) => {
                const matchNum = displayMatches.length - idx;
                const isGain = item.ratingChange >= 0;

                return (
                  <Card
                    key={item.matchId}
                    className={`border transition-all ${
                      item.isWin ? "border-status-success-border/60" : "border-status-danger-border/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0 ${
                            item.isWin ? "bg-status-success-text" : "bg-status-danger-text"
                          }`}
                        >
                          {item.isWin ? "W" : "L"}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge tone="brand">{item.category}</Badge>
                            <span className="text-xs font-bold text-ink">Match #{matchNum}</span>
                            <span className="text-[11px] text-ink-soft">
                              {new Date(item.playedOn).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                          <p className="text-xs text-ink mt-0.5">
                            {item.partnerName ? (
                              <span>
                                With <strong>{item.partnerName}</strong> vs <strong>{item.opponentNames}</strong>
                              </span>
                            ) : (
                              <span>
                                vs <strong>{item.opponentNames}</strong>
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Scores */}
                      <div className="text-right">
                        <p className="font-mono text-xs font-bold text-ink">
                          {item.games.length > 0 ? item.games.join(", ") : "Result only"}
                        </p>
                        <p className="text-[10px] text-ink-soft mt-0.5">
                          Rally:{" "}
                          <span className={item.rallyDiff >= 0 ? "text-status-success-text" : "text-status-danger-text"}>
                            {item.rallyDiff >= 0 ? `+${item.rallyDiff}` : item.rallyDiff}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Rating Progression Bar */}
                    <div className="mt-3 pt-2.5 border-t border-line/70 flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-1.5 text-ink-soft">
                        <span>{item.ratingBefore}</span>
                        <ArrowRight size={12} />
                        <span className="font-bold text-ink">{item.ratingAfter}</span>
                        <span
                          className={`text-[11px] font-bold px-1.5 py-0.2 rounded ${
                            isGain
                              ? "bg-status-success-bg text-status-success-text"
                              : "bg-status-danger-bg text-status-danger-text"
                          }`}
                        >
                          {isGain ? `+${item.ratingChange}` : item.ratingChange} Elo
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-[11px]">
                        <span className="text-ink-soft font-sans">Form:</span>
                        <span className="font-mono font-bold tracking-wider text-ink">{item.formStreak}</span>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

export function PersonalMatchHistoryButton({
  onClick,
  className = "",
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick} className={className}>
      <TrendingUp size={14} className="mr-1.5 text-brand" />
      <span>My Results & Form History</span>
    </Button>
  );
}
