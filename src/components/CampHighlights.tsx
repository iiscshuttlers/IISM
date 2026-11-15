import { useMemo } from "react";
import { Trophy, Flame, Zap, Award, Target } from "lucide-react";
import { Card } from "./ui";
import type { Standing } from "../lib/types";

export function CampHighlightsCard({
  standings,
}: {
  standings: Standing[];
}) {
  const leader = useMemo(() => {
    if (!standings.length) return null;
    return standings[0];
  }, [standings]);

  const mostMatches = useMemo(() => {
    if (!standings.length) return null;
    return [...standings].sort((a, b) => b.played - a.played)[0];
  }, [standings]);

  const highestWins = useMemo(() => {
    if (!standings.length) return null;
    return [...standings].sort((a, b) => b.won - a.won)[0];
  }, [standings]);

  const bestWinRate = useMemo(() => {
    const qualified = standings.filter((s) => s.played >= 3);
    if (!qualified.length) return null;
    return [...qualified].sort((a, b) => b.won / b.played - a.won / a.played)[0];
  }, [standings]);

  if (!standings.length || standings.every((s) => s.played === 0)) {
    return null;
  }

  return (
    <Card className="p-3 bg-gradient-to-r from-brand/5 via-surface to-brand/5 border-brand/20">
      <div className="flex items-center gap-1.5 font-bold text-xs text-brand uppercase tracking-wider mb-2.5">
        <Award size={15} />
        <span>Camp Highlights & Leaders</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {leader && (
          <div className="p-2 rounded-lg bg-surface border border-line">
            <div className="flex items-center gap-1 text-[10px] text-ink-soft font-semibold">
              <Trophy size={12} className="text-amber-500" />
              <span>Rating Leader</span>
            </div>
            <p className="font-bold text-xs text-ink truncate mt-0.5">{leader.full_name}</p>
            <p className="text-[11px] font-mono text-brand font-semibold">{leader.rating} Elo</p>
          </div>
        )}

        {mostMatches && mostMatches.played > 0 && (
          <div className="p-2 rounded-lg bg-surface border border-line">
            <div className="flex items-center gap-1 text-[10px] text-ink-soft font-semibold">
              <Flame size={12} className="text-orange-500" />
              <span>Most Active</span>
            </div>
            <p className="font-bold text-xs text-ink truncate mt-0.5">{mostMatches.full_name}</p>
            <p className="text-[11px] text-ink-soft">{mostMatches.played} matches</p>
          </div>
        )}

        {highestWins && highestWins.won > 0 && (
          <div className="p-2 rounded-lg bg-surface border border-line">
            <div className="flex items-center gap-1 text-[10px] text-ink-soft font-semibold">
              <Zap size={12} className="text-emerald-500" />
              <span>Most Wins</span>
            </div>
            <p className="font-bold text-xs text-ink truncate mt-0.5">{highestWins.full_name}</p>
            <p className="text-[11px] text-emerald-600 font-semibold">{highestWins.won} wins</p>
          </div>
        )}

        {bestWinRate && (
          <div className="p-2 rounded-lg bg-surface border border-line">
            <div className="flex items-center gap-1 text-[10px] text-ink-soft font-semibold">
              <Target size={12} className="text-blue-500" />
              <span>Top Win %</span>
            </div>
            <p className="font-bold text-xs text-ink truncate mt-0.5">{bestWinRate.full_name}</p>
            <p className="text-[11px] text-blue-600 font-semibold">
              {Math.round((bestWinRate.won / bestWinRate.played) * 100)}% ({bestWinRate.won}/{bestWinRate.played})
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
