import { useState, useMemo } from "react";
import { Shuffle, Play, CheckSquare, Square, Crown } from "lucide-react";
import { Button, Card, Segmented, Sheet } from "./ui";
import type { Member } from "../lib/types";
import type { Category } from "../lib/scores";

interface ScheduledFixture {
  round: number;
  playerA: Member;
  playerB: Member;
}

export function TournamentGeneratorModal({
  open,
  onClose,
  players,
  onStartMatch,
}: {
  open: boolean;
  onClose: () => void;
  players: Member[];
  onStartMatch: (category: Category, slots: (string | null)[]) => void;
}) {
  const [format, setFormat] = useState<"round_robin" | "king_of_court">("round_robin");
  const [selectedIds, setSelectedIds] = useState<string[]>(() => players.slice(0, 6).map((p) => p.id));
  const [fixtures, setFixtures] = useState<ScheduledFixture[]>([]);

  const togglePlayer = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectedPlayers = useMemo(
    () => players.filter((p) => selectedIds.includes(p.id)),
    [players, selectedIds]
  );

  const generateSchedule = () => {
    if (selectedPlayers.length < 2) return;
    const pool = [...selectedPlayers];
    if (pool.length % 2 !== 0) {
      // Bye placeholder if odd
      pool.push({ id: "BYE", full_name: "BYE", gender: null, role: "player", activity_muted: false });
    }

    const n = pool.length;
    const rounds = n - 1;
    const half = n / 2;
    const schedule: ScheduledFixture[] = [];

    const list = [...pool];
    for (let r = 0; r < rounds; r++) {
      for (let i = 0; i < half; i++) {
        const p1 = list[i];
        const p2 = list[n - 1 - i];
        if (p1.id !== "BYE" && p2.id !== "BYE") {
          schedule.push({
            round: r + 1,
            playerA: p1,
            playerB: p2,
          });
        }
      }
      // Rotate array leaving the first element fixed
      const fixed = list[0];
      const rest = list.slice(1);
      rest.unshift(rest.pop()!);
      list.splice(0, list.length, fixed, ...rest);
    }

    setFixtures(schedule);
  };

  const handleLaunchMatch = (f: ScheduledFixture) => {
    onClose();
    // Default to MS if both men, WS if both women, else MS
    const isFemale = f.playerA.gender === "F" && f.playerB.gender === "F";
    const category: Category = isFemale ? "WS" : "MS";
    onStartMatch(category, [f.playerA.id, null, f.playerB.id, null]);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Camp Tournament & Matchday Generator">
      <div className="space-y-4">
        <p className="text-xs text-ink-soft">
          Automatically generate fair round-robin schedules or king-of-the-court trial brackets for Saturday camp matchdays.
        </p>

        <Segmented
          value={format}
          onChange={(v) => setFormat(v as typeof format)}
          options={[
            { value: "round_robin", label: "Round Robin League" },
            { value: "king_of_court", label: "King of the Court" },
          ]}
        />

        {/* Player Selector */}
        <Card className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-ink">
            <span>Select Participants ({selectedIds.length})</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedIds(players.map((p) => p.id))}
                className="text-brand text-[11px] font-semibold hover:underline"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="text-ink-soft text-[11px] hover:underline"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pt-1">
            {players.map((p) => {
              const selected = selectedIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlayer(p.id)}
                  className={`flex items-center gap-2 p-1.5 rounded text-xs text-left transition-colors border ${
                    selected
                      ? "bg-brand/10 border-brand/40 text-brand font-semibold"
                      : "bg-surface-2 border-line text-ink"
                  }`}
                >
                  {selected ? <CheckSquare size={14} /> : <Square size={14} className="text-ink-soft" />}
                  <span className="truncate">{p.full_name}</span>
                </button>
              );
            })}
          </div>

          <Button
            size="sm"
            className="w-full mt-2"
            disabled={selectedIds.length < 2}
            onClick={generateSchedule}
          >
            <Shuffle size={14} className="mr-1.5" />
            Generate {format === "round_robin" ? "Round-Robin Schedule" : "Courtside Rotation"}
          </Button>
        </Card>

        {/* King of the Court Rules */}
        {format === "king_of_court" && (
          <Card className="bg-amber-500/5 border-amber-500/30 text-xs text-ink space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-amber-900">
              <Crown size={15} className="text-amber-600" />
              <span>King of the Court Rules</span>
            </div>
            <p className="text-ink-soft text-[11px]">
              Fast 11-point games. Court 1 is the <strong>King's Court</strong>. Winners move UP one court; losers move DOWN one court. The player holding Court 1 at the buzzer wins!
            </p>
          </Card>
        )}

        {/* Fixtures List */}
        {fixtures.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
              Generated Fixtures ({fixtures.length} matches)
            </h4>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {fixtures.map((f, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-surface border border-line text-xs"
                >
                  <div>
                    <span className="font-bold text-brand uppercase text-[10px] mr-2">
                      R{f.round}
                    </span>
                    <span className="font-semibold text-ink">{f.playerA.full_name}</span>
                    <span className="text-ink-soft mx-1.5 font-bold">vs</span>
                    <span className="font-semibold text-ink">{f.playerB.full_name}</span>
                  </div>

                  <Button size="sm" variant="secondary" onClick={() => handleLaunchMatch(f)}>
                    <Play size={13} className="mr-1 text-emerald-600" />
                    Play
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
