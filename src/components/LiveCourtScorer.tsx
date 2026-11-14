import { useState } from "react";
import { Play, RotateCcw, Trophy, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, ConfirmDialog, Field, Select, Sheet, cx } from "./ui";
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
  const [isCustomPoints, setIsCustomPoints] = useState<boolean>(false);
  const [enableDeuce, setEnableDeuce] = useState<boolean>(true);
  const [editingTargetDuringGame, setEditingTargetDuringGame] = useState<boolean>(false);
  const [matchFormat, setMatchFormat] = useState<"best_of_3" | "1_set" | "best_of_5">("best_of_3");
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

  const setsToWin = matchFormat === "1_set" ? 1 : matchFormat === "best_of_5" ? 3 : 2;
  const deuceAt = enableDeuce ? targetPoints - 1 : targetPoints;
  const cap = enableDeuce
    ? targetPoints === 21
      ? 30
      : targetPoints === 15
      ? 21
      : targetPoints === 11
      ? 15
      : targetPoints + Math.max(2, Math.min(9, Math.round(targetPoints * 0.4)))
    : targetPoints;

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
    const isGameWon = enableDeuce
      ? (nextA >= targetPoints && nextA - nextB >= 2) ||
        nextA >= cap ||
        (nextB >= targetPoints && nextB - nextA >= 2) ||
        nextB >= cap
      : nextA >= targetPoints || nextB >= targetPoints;

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

  const subPoint = (side: "A" | "B") => {
    if (side === "A" && scoreA > 0) {
      setScoreLog((prev) => [...prev, { a: scoreA, b: scoreB }]);
      setScoreA((a) => a - 1);
    } else if (side === "B" && scoreB > 0) {
      setScoreLog((prev) => [...prev, { a: scoreA, b: scoreB }]);
      setScoreB((b) => b - 1);
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
                  onChange={(e) => setMatchFormat(e.target.value as "best_of_3" | "1_set" | "best_of_5")}
                >
                  <option value="1_set">1 Set (Single Shootout · 1 to win)</option>
                  <option value="best_of_3">Best of 3 Sets (Standard · 2 to win)</option>
                  <option value="best_of_5">Best of 5 Sets (Extended · 3 to win)</option>
                </Select>
              </Field>
            </div>

            {/* Dynamic Points Per Set */}
            <div className="space-y-1.5 p-3 rounded-xl bg-surface-2/60 border border-line">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink">Points per set</span>
                <label className="flex items-center gap-1.5 text-xs text-ink-soft cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableDeuce}
                    onChange={(e) => setEnableDeuce(e.target.checked)}
                    className="rounded border-line text-brand"
                  />
                  <span>Deuce (win by 2)</span>
                </label>
              </div>

              {/* Presets and Custom button */}
              <div className="flex items-center gap-1.5 pt-1">
                {[11, 15, 21, 30].map((pts) => (
                  <button
                    key={pts}
                    type="button"
                    onClick={() => {
                      setTargetPoints(pts);
                      setIsCustomPoints(false);
                    }}
                    className={cx(
                      "flex-1 py-1.5 text-xs font-bold rounded-lg border transition",
                      targetPoints === pts && !isCustomPoints
                        ? "bg-brand text-white border-brand shadow-sm"
                        : "bg-surface text-ink border-line hover:bg-line/40"
                    )}
                  >
                    {pts} pts
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setIsCustomPoints(true)}
                  className={cx(
                    "px-2.5 py-1.5 text-xs font-bold rounded-lg border transition",
                    isCustomPoints
                      ? "bg-brand text-white border-brand shadow-sm"
                      : "bg-surface text-ink border-line hover:bg-line/40"
                  )}
                >
                  Custom
                </button>
              </div>

              {/* Dynamic Stepper & Custom Number Input */}
              {isCustomPoints && (
                <div className="flex items-center gap-2 pt-2 animate-in fade-in">
                  <div className="flex items-center gap-1 bg-surface rounded-lg border border-line p-1">
                    <button
                      type="button"
                      disabled={targetPoints <= 3}
                      onClick={() => setTargetPoints((p) => Math.max(3, p - 1))}
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-line/40 text-sm font-bold text-ink"
                    >
                      –
                    </button>
                    <input
                      type="number"
                      min={3}
                      max={99}
                      value={targetPoints}
                      onChange={(e) => setTargetPoints(Math.max(3, Math.min(99, Number(e.target.value) || 21)))}
                      className="w-14 text-center font-mono font-bold text-sm bg-surface-2 rounded border border-line py-1 text-ink focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                    <button
                      type="button"
                      disabled={targetPoints >= 99}
                      onClick={() => setTargetPoints((p) => Math.min(99, p + 1))}
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-line/40 text-sm font-bold text-ink"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-xs text-ink-soft">
                    Playing to <strong>{targetPoints} pts</strong> {enableDeuce ? `(Cap at ${cap})` : "(Sudden death)"}
                  </span>
                </div>
              )}
            </div>

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
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-brand uppercase">
                    {category} · {matchFormat === "1_set" ? "1 Set Shootout" : matchFormat === "best_of_5" ? `Set ${currentGame} of 5` : `Set ${currentGame} of 3`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingTargetDuringGame(!editingTargetDuringGame)}
                    title="Change target points dynamically"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface border border-line text-ink font-semibold hover:border-brand transition cursor-pointer"
                  >
                    <span>{targetPoints} pts</span>
                    <Pencil size={10} className="text-ink-soft" />
                  </button>
                </div>
                <span className="font-mono text-ink-soft">
                  Sets: {winsA} – {winsB}
                </span>
                {gamesHistory.length > 0 && (
                  <span className="text-ink-soft font-mono">({gamesHistory.join(", ")})</span>
                )}
              </div>

              {/* In-game quick point target adjustment drawer */}
              {editingTargetDuringGame && (
                <div className="p-2.5 bg-surface-2 border border-brand/40 rounded-xl space-y-2 animate-in fade-in text-xs">
                  <div className="flex items-center justify-between font-semibold text-ink">
                    <span>Adjust target points for this set:</span>
                    <button
                      type="button"
                      onClick={() => setEditingTargetDuringGame(false)}
                      className="text-ink-soft hover:text-ink px-1"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[7, 11, 15, 21, 30].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setTargetPoints(p);
                          setEditingTargetDuringGame(false);
                          toast.success(`Target points changed to ${p}`);
                        }}
                        className={cx(
                          "flex-1 py-1 rounded font-bold border transition cursor-pointer",
                          targetPoints === p
                            ? "bg-brand text-white border-brand shadow-sm"
                            : "bg-surface border-line hover:bg-line/40 text-ink"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={scoreA === 0}
                        onClick={() => subPoint("A")}
                        title="Subtract 1 point"
                        aria-label="Subtract 1 point from Team 1"
                        className="px-3.5 py-3 rounded-xl bg-emerald-950/70 hover:bg-emerald-950 border border-emerald-600/50 text-emerald-200 font-black text-sm shadow active:scale-95 transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                      >
                        -1
                      </button>
                      <button
                        type="button"
                        onClick={() => addPoint("A")}
                        className="flex-1 py-3 rounded-xl bg-white hover:bg-emerald-50 text-emerald-950 font-extrabold text-base shadow active:scale-95 transition cursor-pointer"
                      >
                        +1 Point
                      </button>
                    </div>
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
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={scoreB === 0}
                        onClick={() => subPoint("B")}
                        title="Subtract 1 point"
                        aria-label="Subtract 1 point from Team 2"
                        className="px-3.5 py-3 rounded-xl bg-emerald-950/70 hover:bg-emerald-950 border border-emerald-600/50 text-emerald-200 font-black text-sm shadow active:scale-95 transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                      >
                        -1
                      </button>
                      <button
                        type="button"
                        onClick={() => addPoint("B")}
                        className="flex-1 py-3 rounded-xl bg-white hover:bg-emerald-50 text-emerald-950 font-extrabold text-base shadow active:scale-95 transition cursor-pointer"
                      >
                        +1 Point
                      </button>
                    </div>
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
