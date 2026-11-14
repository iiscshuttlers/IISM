import { useState } from "react";
import { Play, RotateCcw, Trophy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, ConfirmDialog, Field, Select, Sheet } from "./ui";
import { CATEGORIES, isSingles, slotGenders, type Category } from "../lib/scores";
import type { Member } from "../lib/types";
import type { MatchInput } from "../lib/api";

export function LiveCourtScorer({
  open,
  onClose,
  players,
  onSaveMatch,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  players: Member[];
  onSaveMatch: (m: MatchInput) => Promise<unknown>;
  busy: boolean;
}) {
  const [step, setStep] = useState<"setup" | "scoring" | "finished">("setup");
  const [category, setCategory] = useState<Category>("MS");
  const [targetPoints, setTargetPoints] = useState<number>(21);
  const [matchFormat, setMatchFormat] = useState<"best_of_3" | "1_set">("best_of_3");
  const [slots, setSlots] = useState<(string | null)[]>([null, null, null, null]);

  // Scoring state
  const [currentGame, setCurrentGame] = useState(1);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [gamesHistory, setGamesHistory] = useState<string[]>([]);
  const [winsA, setWinsA] = useState(0);
  const [winsB, setWinsB] = useState(0);
  const [scoreLog, setScoreLog] = useState<{ a: number; b: number }[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);

  const setsToWin = matchFormat === "1_set" ? 1 : 2;
  const deuceAt = targetPoints - 1;
  const cap =
    targetPoints === 21
      ? 30
      : targetPoints === 15
      ? 21
      : targetPoints === 11
      ? 15
      : targetPoints + 5;

  const singles = isSingles(category);
  const want = slotGenders(category);

  const optionsFor = (i: number) =>
    players.filter((p) => (!want[i] || !p.gender || p.gender === want[i]) && (slots[i] === p.id || !slots.includes(p.id)));

  const nameOf = (id: string | null) => players.find((p) => p.id === id)?.full_name ?? "—";
  const team1Name = singles ? nameOf(slots[0]) : `${nameOf(slots[0])} & ${nameOf(slots[1])}`;
  const team2Name = singles ? nameOf(slots[2]) : `${nameOf(slots[2])} & ${nameOf(slots[3])}`;

  const readyToStart = singles ? !!slots[0] && !!slots[2] : slots.every(Boolean);

  const startMatch = () => {
    if (!readyToStart) {
      toast.error("Please pick all players");
      return;
    }
    setScoreA(0);
    setScoreB(0);
    setGamesHistory([]);
    setWinsA(0);
    setWinsB(0);
    setScoreLog([]);
    setCurrentGame(1);
    setStep("scoring");
  };

  const addPoint = (side: "A" | "B") => {
    setScoreLog((prev) => [...prev, { a: scoreA, b: scoreB }]);
    const nextA = side === "A" ? scoreA + 1 : scoreA;
    const nextB = side === "B" ? scoreB + 1 : scoreB;

    setScoreA(nextA);
    setScoreB(nextB);

    // Win condition for current game
    const isGameWon =
      (nextA >= targetPoints && nextA - nextB >= 2) ||
      nextA >= cap ||
      (nextB >= targetPoints && nextB - nextA >= 2) ||
      nextB >= cap;

    if (isGameWon) {
      const winnerSide = nextA > nextB ? "A" : "B";
      const finalGameScore = `${nextA}-${nextB}`;
      const nextGames = [...gamesHistory, finalGameScore];
      setGamesHistory(nextGames);

      const nextWinsA = winnerSide === "A" ? winsA + 1 : winsA;
      const nextWinsB = winnerSide === "B" ? winsB + 1 : winsB;
      setWinsA(nextWinsA);
      setWinsB(nextWinsB);

      toast.success(
        `Set ${currentGame} won by ${winnerSide === "A" ? team1Name : team2Name} (${finalGameScore})`
      );

      // Check if match won
      if (nextWinsA === setsToWin || nextWinsB === setsToWin) {
        setStep("finished");
      } else {
        // Next set
        setCurrentGame((g) => g + 1);
        setScoreA(0);
        setScoreB(0);
        setScoreLog([]);
      }
    }
  };

  const undoPoint = () => {
    if (scoreLog.length === 0) return;
    const last = scoreLog[scoreLog.length - 1];
    setScoreA(last.a);
    setScoreB(last.b);
    setScoreLog((prev) => prev.slice(0, -1));
  };

  const saveLiveMatch = async () => {
    const winnerSide = winsA > winsB ? 1 : 2;
    try {
      await onSaveMatch({
        playedOn: new Date().toISOString().slice(0, 10),
        category,
        slots: singles ? [slots[0], null, slots[2], null] : slots,
        games: gamesHistory,
        winner: winnerSide,
      });
      toast.success("Match saved to camp records!");
      onClose();
      setStep("setup");
    } catch {
      toast.error("Failed to save match");
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Live Court Scoreboard">
      <div className="space-y-4">
        {step === "setup" && (
          <div className="space-y-4">
            <p className="text-xs text-ink-soft">
              Real-time courtside scoreboard. Track points as rallies happen with automatic deuce and game win detection.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <Select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value as Category);
                    setSlots([null, null, null, null]);
                  }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Match format">
                <Select
                  value={matchFormat}
                  onChange={(e) => setMatchFormat(e.target.value as "best_of_3" | "1_set")}
                >
                  <option value="best_of_3">Best of 3 Sets</option>
                  <option value="1_set">1 Set (Single Shootout)</option>
                </Select>
              </Field>
            </div>

            <Field label="Points per set">
              <Select
                value={targetPoints}
                onChange={(e) => setTargetPoints(Number(e.target.value))}
              >
                <option value={21}>21 Points (Standard BWF · Deuce to 30)</option>
                <option value={15}>15 Points (Training Camp / Fast · Deuce to 21)</option>
                <option value={11}>11 Points (King of the Court · Deuce to 15)</option>
                <option value={30}>30 Points (Single Game Marathon)</option>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-ink-soft">Team 1</span>
                <Select
                  value={slots[0] ?? ""}
                  onChange={(e) => {
                    const n = [...slots];
                    n[0] = e.target.value || null;
                    setSlots(n);
                  }}
                >
                  <option value="">{singles ? "Player" : "Player 1"}</option>
                  {optionsFor(0).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </Select>

                {!singles && (
                  <Select
                    value={slots[1] ?? ""}
                    onChange={(e) => {
                      const n = [...slots];
                      n[1] = e.target.value || null;
                      setSlots(n);
                    }}
                  >
                    <option value="">Player 2</option>
                    {optionsFor(1).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-ink-soft">Team 2</span>
                <Select
                  value={slots[2] ?? ""}
                  onChange={(e) => {
                    const n = [...slots];
                    n[2] = e.target.value || null;
                    setSlots(n);
                  }}
                >
                  <option value="">{singles ? "Player" : "Player 1"}</option>
                  {optionsFor(2).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </Select>

                {!singles && (
                  <Select
                    value={slots[3] ?? ""}
                    onChange={(e) => {
                      const n = [...slots];
                      n[3] = e.target.value || null;
                      setSlots(n);
                    }}
                  >
                    <option value="">Player 2</option>
                    {optionsFor(3).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            </div>

            <Button className="w-full" disabled={!readyToStart} onClick={startMatch}>
              <Play size={16} className="mr-1.5" /> Start Live Match
            </Button>
          </div>
        )}

        {step === "scoring" && (() => {
          const isDeuce = scoreA >= deuceAt && scoreB >= deuceAt && scoreA === scoreB;
          const isGamePointA = scoreA >= deuceAt && scoreA > scoreB;
          const isGamePointB = scoreB >= deuceAt && scoreB > scoreA;
          const isMatchPoint =
            (isGamePointA && winsA === setsToWin - 1) ||
            (isGamePointB && winsB === setsToWin - 1);
          const isGamePoint = isGamePointA || isGamePointB;
          const hasBanner = isDeuce || isGamePointA || isGamePointB;

          return (
            <div className="space-y-4">
              {/* Game Status Header */}
              <div className="flex items-center justify-between text-xs px-2.5 py-1.5 bg-surface-2 rounded-lg">
                <span className="font-bold text-brand uppercase">
                  {category} · {matchFormat === "1_set" ? "1 Set Shootout" : `Set ${currentGame} of 3`} ({targetPoints} pts)
                </span>
                <span className="font-mono text-ink-soft">
                  Sets: {winsA} – {winsB}
                </span>
                {gamesHistory.length > 0 && (
                  <span className="text-ink-soft font-mono">({gamesHistory.join(", ")})</span>
                )}
              </div>

              {/* Visual Badminton Court Scoreboard */}
              <div className="rounded-xl overflow-hidden border-2 border-emerald-700 bg-emerald-800 shadow-md text-white p-4">
                {/* Game Point / Match Point Banner */}
                {hasBanner && (
                  <div className="mb-3 text-center">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-amber-400 text-amber-950 uppercase tracking-wider shadow animate-pulse">
                      {isDeuce
                        ? `⚡ DEUCE (Must win by 2, sudden death at ${cap})`
                        : isMatchPoint
                        ? "🏆 MATCH POINT"
                        : isGamePoint
                        ? "🔥 SET POINT"
                        : ""}
                    </span>
                  </div>
                )}

                {/* Court with Vertical Net Divider */}
                <div className="relative grid grid-cols-2 gap-6 items-center">
                  {/* Vertical Net Divider */}
                  <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 flex flex-col items-center justify-center pointer-events-none z-10">
                    <div className="w-px h-full border-r-2 border-dashed border-emerald-300/40" />
                    <span className="absolute bg-emerald-900 border border-emerald-500/50 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest text-emerald-200 shadow">
                      NET
                    </span>
                  </div>

                  {/* Team A Side */}
                  <div className="text-center space-y-2 z-0">
                    <p className="font-bold text-sm truncate px-1 text-emerald-100">{team1Name}</p>
                    <button
                      type="button"
                      onClick={() => addPoint("A")}
                      title="Tap to add point"
                      className="w-full text-6xl font-black tabular-nums tracking-tight font-mono py-4 bg-emerald-900/70 hover:bg-emerald-900 rounded-xl border border-emerald-500/40 active:scale-95 transition cursor-pointer"
                    >
                      {scoreA}
                    </button>
                    <button
                      type="button"
                      onClick={() => addPoint("A")}
                      className="w-full py-3.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-950 font-extrabold text-base shadow active:scale-95 transition cursor-pointer"
                    >
                      +1 Point
                    </button>
                  </div>

                  {/* Team B Side */}
                  <div className="text-center space-y-2 z-0">
                    <p className="font-bold text-sm truncate px-1 text-emerald-100">{team2Name}</p>
                    <button
                      type="button"
                      onClick={() => addPoint("B")}
                      title="Tap to add point"
                      className="w-full text-6xl font-black tabular-nums tracking-tight font-mono py-4 bg-emerald-900/70 hover:bg-emerald-900 rounded-xl border border-emerald-500/40 active:scale-95 transition cursor-pointer"
                    >
                      {scoreB}
                    </button>
                    <button
                      type="button"
                      onClick={() => addPoint("B")}
                      className="w-full py-3.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-950 font-extrabold text-base shadow active:scale-95 transition cursor-pointer"
                    >
                      +1 Point
                    </button>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="flex items-center justify-between pt-4 mt-3 border-t border-emerald-700/60">
                  <button
                    type="button"
                    onClick={undoPoint}
                    disabled={scoreLog.length === 0}
                    className="flex items-center gap-1.5 text-xs text-emerald-200 hover:text-white disabled:opacity-30 transition font-medium"
                  >
                    <RotateCcw size={13} />
                    <span>Undo point</span>
                  </button>

                  {gamesHistory.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setConfirmFinish(true)}
                      className="text-xs text-amber-300 hover:text-amber-100 font-semibold underline underline-offset-2"
                    >
                      Finish match now
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setConfirmReset(true)}
                    className="text-xs text-emerald-300/80 hover:text-red-300 transition"
                  >
                    Reset match
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {step === "finished" && (
          <Card className="text-center py-6 space-y-4 bg-gradient-to-b from-brand/10 to-surface border-brand/30">
            <div className="mx-auto w-12 h-12 rounded-full bg-brand/20 flex items-center justify-center text-brand">
              <Trophy size={24} />
            </div>

            <div>
              <h3 className="text-lg font-bold text-ink">Match Completed!</h3>
              <p className="text-sm font-semibold text-brand mt-1">
                Winner: {winsA > winsB ? team1Name : team2Name}
              </p>
              <p className="text-xs text-ink-soft mt-0.5">
                Final Score: {gamesHistory.join(", ")}
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Button onClick={saveLiveMatch} disabled={busy} className="w-full">
                <Check size={16} className="mr-1.5" />
                {busy ? "Saving match…" : "Save to Camp Standings"}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStep("setup");
                  onClose();
                }}
              >
                Discard
              </Button>
            </div>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Cancel live scoring?"
        message="Current game points and progress will be reset. Are you sure you want to stop?"
        confirmLabel="Yes, reset match"
        cancelLabel="Keep playing"
        tone="danger"
        onConfirm={() => {
          setConfirmReset(false);
          setStep("setup");
        }}
        onCancel={() => setConfirmReset(false)}
      />

      <ConfirmDialog
        open={confirmFinish}
        title="Finish match early?"
        message="The currently completed sets will be recorded as the official match score."
        confirmLabel="Finish & save"
        cancelLabel="Continue playing"
        tone="brand"
        onConfirm={() => {
          setConfirmFinish(false);
          setStep("finished");
        }}
        onCancel={() => setConfirmFinish(false)}
      />
    </Sheet>
  );
}
