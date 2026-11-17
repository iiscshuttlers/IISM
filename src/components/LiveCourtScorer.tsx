import { useEffect, useState } from "react";
import { Play, RotateCcw, Trophy, Check, Pencil, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Button, Card, ConfirmDialog, Field, Select, Sheet, cx, today } from "./ui";
import { PlayerSelect } from "./PlayerSelect";
import { CATEGORIES, isSingles, slotGenders, type Category } from "../lib/scores";
import type { Member } from "../lib/types";
import type { MatchInput } from "../lib/api";
import { clearLiveScore, loadLiveScore, saveLiveScore, type ScoreLogEntry } from "../lib/liveScore";
import { haptic } from "../lib/haptics";
import {
  INITIAL_SERVE, afterPointRemoved, afterRally, choosePlayer, courtOf, nextServe, otherSide,
  type PlayerIndex, type ServeState, type Side,
} from "../lib/serving";

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
  // A match in progress survives a refresh, a locked screen or closing the scorer.
  const [saved] = useState(loadLiveScore);
  const [step, setStep] = useState<"setup" | "scoring" | "finished">(saved?.step ?? "setup");
  const [category, setCategory] = useState<Category>(saved?.category ?? "MS");
  const [targetPoints, setTargetPoints] = useState<number>(saved?.targetPoints ?? 21);
  const [isCustomPoints, setIsCustomPoints] = useState<boolean>(saved?.isCustomPoints ?? false);
  const [enableDeuce, setEnableDeuce] = useState<boolean>(saved?.enableDeuce ?? true);
  const [editingTargetDuringGame, setEditingTargetDuringGame] = useState<boolean>(false);
  const [matchFormat, setMatchFormat] = useState<"best_of_3" | "1_set" | "best_of_5">(saved?.matchFormat ?? "best_of_3");
  const [slots, setSlots] = useState<(string | null)[]>(saved?.slots ?? [null, null, null, null]);
  const [playedOn, setPlayedOn] = useState(saved?.playedOn ?? today());

  // Scoring state
  const [currentGame, setCurrentGame] = useState(saved?.currentGame ?? 1);
  const [scoreA, setScoreA] = useState(saved?.scoreA ?? 0);
  const [scoreB, setScoreB] = useState(saved?.scoreB ?? 0);
  const [gamesHistory, setGamesHistory] = useState<string[]>(saved?.gamesHistory ?? []);
  const [winsA, setWinsA] = useState(saved?.winsA ?? 0);
  const [winsB, setWinsB] = useState(saved?.winsB ?? 0);
  const [scoreLog, setScoreLog] = useState<ScoreLogEntry[]>(saved?.scoreLog ?? []);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [endsSwapped, setEndsSwapped] = useState(saved?.endsSwapped ?? false);
  // Which side serves, and in doubles where each player stands, so the server can be named.
  const [serve, setServe] = useState<ServeState>(saved?.serve ?? INITIAL_SERVE);

  useEffect(() => {
    if (step === "setup") {
      clearLiveScore();
      return;
    }
    saveLiveScore({
      step, category, targetPoints, isCustomPoints, enableDeuce, matchFormat, slots, playedOn,
      currentGame, scoreA, scoreB, gamesHistory, winsA, winsB, scoreLog, endsSwapped, serve,
    });
  }, [step, category, targetPoints, isCustomPoints, enableDeuce, matchFormat, slots, playedOn,
    currentGame, scoreA, scoreB, gamesHistory, winsA, winsB, scoreLog, endsSwapped, serve]);

  const close = () => {
    if (step === "scoring") toast.info("Match paused. Open the scorer again to carry on.");
    onClose();
  };


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
  const playerId = (side: Side, i: PlayerIndex) => slots[(side === "A" ? 0 : 2) + i] ?? null;
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
    setEndsSwapped(false);
    setServe(INITIAL_SERVE);
    setPlayedOn(today());
    setStep("scoring");
  };

  const addPoint = (side: Side) => {
    setServe(afterRally(serve, side));
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

    // The history runs across games, so even the point that won a game (or the match) can be undone.
    const entry: ScoreLogEntry = { a: scoreA, b: scoreB, serve };
    if (isGameWon) entry.game = { currentGame, gamesHistory, winsA, winsB, endsSwapped };
    setScoreLog((prev) => [...prev, entry]);

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
        haptic("success");
        setStep("finished");
      } else {
        // Next set - automatically switch ends as per standard rules
        setEndsSwapped((prev) => !prev);
        setCurrentGame((g) => g + 1);
        setScoreA(0);
        setScoreB(0);
      }
    }
  };

  const subPoint = (side: Side) => {
    const before = side === "A" ? { a: scoreA - 1, b: scoreB } : { a: scoreA, b: scoreB - 1 };
    if (before.a < 0 || before.b < 0) return;
    // Taking back the point just scored, when that rally won this side the serve: hand it back.
    const last = scoreLog[scoreLog.length - 1];
    const servedBack = !!last?.serve && last.a === before.a && last.b === before.b && last.serve.serving !== side;
    setServe(afterPointRemoved(serve, side, servedBack));
    setScoreLog((prev) => [...prev, { a: scoreA, b: scoreB, serve }]);
    setScoreA(before.a);
    setScoreB(before.b);
  };

  const undoPoint = () => {
    if (scoreLog.length === 0) return;
    const last = scoreLog[scoreLog.length - 1];
    setScoreA(last.a);
    setScoreB(last.b);
    if (last.serve) setServe(last.serve);
    if (last.game) {
      // Taking back the point that won a game: reopen that game, and the match if it ended there.
      setCurrentGame(last.game.currentGame);
      setGamesHistory(last.game.gamesHistory);
      setWinsA(last.game.winsA);
      setWinsB(last.game.winsB);
      setEndsSwapped(last.game.endsSwapped);
      setStep("scoring");
      toast.info(`Set ${last.game.currentGame} reopened at ${last.a}–${last.b}`);
    }
    setScoreLog((prev) => prev.slice(0, -1));
  };

  /** Tapping a player makes them the server (their side is serving) or the receiver. */
  const pickPlayer = (side: Side, player: PlayerIndex) =>
    setServe((s) => choosePlayer(s, scoreA, scoreB, side, player));

  const saveLiveMatch = async () => {
    const winnerSide = winsA > winsB ? 1 : 2;
    try {
      await onSaveMatch({
        playedOn,
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
    <Sheet open={open} onClose={close} title="Live Court Scoreboard" fullScreen>
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
                      "flex-1 py-1.5 text-xs font-bold rounded-xl border transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1",
                      targetPoints === pts && !isCustomPoints
                        ? "bg-brand-pale text-brand border-brand-border font-black shadow-xs"
                        : "bg-surface text-ink-soft border-line hover:border-brand-border hover:text-ink"
                    )}
                  >
                    {pts} pts
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setIsCustomPoints(true)}
                  className={cx(
                    "px-2.5 py-1.5 text-xs font-bold rounded-xl border transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1",
                    isCustomPoints
                      ? "bg-brand-pale text-brand border-brand-border font-black shadow-xs"
                      : "bg-surface text-ink-soft border-line hover:border-brand-border hover:text-ink"
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
                <PlayerSelect
                  label={`Team 1 · ${singles ? "Player" : "Player 1"}`}
                  placeholder={singles ? "Player" : "Player 1"}
                  players={optionsFor(0)}
                  value={slots[0]}
                  allowClear
                  onChange={(id) => {
                    const n = [...slots];
                    n[0] = id || null;
                    setSlots(n);
                  }}
                />

                {!singles && (
                  <PlayerSelect
                    label="Team 1 · Player 2"
                    placeholder="Player 2"
                    players={optionsFor(1)}
                    value={slots[1]}
                    allowClear
                    onChange={(id) => {
                      const n = [...slots];
                      n[1] = id || null;
                      setSlots(n);
                    }}
                  />
                )}
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-ink-soft">Team 2</span>
                <PlayerSelect
                  label={`Team 2 · ${singles ? "Player" : "Player 1"}`}
                  placeholder={singles ? "Player" : "Player 1"}
                  players={optionsFor(2)}
                  value={slots[2]}
                  allowClear
                  onChange={(id) => {
                    const n = [...slots];
                    n[2] = id || null;
                    setSlots(n);
                  }}
                />

                {!singles && (
                  <PlayerSelect
                    label="Team 2 · Player 2"
                    placeholder="Player 2"
                    players={optionsFor(3)}
                    value={slots[3]}
                    allowClear
                    onChange={(id) => {
                      const n = [...slots];
                      n[3] = id || null;
                      setSlots(n);
                    }}
                  />
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

          const next = nextServe(serve, scoreA, scoreB);
          const serverName = nameOf(playerId(serve.serving, singles ? 0 : next.server));
          const receiverName = nameOf(playerId(otherSide(serve.serving), singles ? 0 : next.receiver));
          const gameStart = scoreA === 0 && scoreB === 0;

          return (
            <div className="space-y-4">
              {/* Game Status Header */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs px-2.5 py-1.5 bg-surface-2 rounded-lg">
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

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEndsSwapped((prev) => !prev);
                      toast.success("Court ends switched");
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface border border-line text-[11px] font-semibold text-ink hover:bg-surface-3 transition cursor-pointer"
                    title="Switch court ends (swap left and right)"
                  >
                    <ArrowLeftRight size={11} className="text-brand" />
                    <span>Switch ends</span>
                  </button>
                  <span className="font-mono text-ink-soft">
                    Sets: {winsA} – {winsB}
                  </span>
                  {gamesHistory.length > 0 && (
                    <span className="text-ink-soft font-mono">({gamesHistory.join(", ")})</span>
                  )}
                </div>
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
                          "flex-1 py-1 rounded-lg font-bold border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 active:scale-95",
                          targetPoints === p
                            ? "bg-brand-pale text-brand border-brand-border font-black shadow-xs"
                            : "bg-surface border-line hover:border-brand-border text-ink"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Visual Badminton Court Scoreboard */}
              <div className="rounded-2xl overflow-hidden border-2 border-emerald-700 bg-emerald-800 shadow-lg text-white p-3 sm:p-4">
                {/* Game Point / Match Point Banner */}
                {hasBanner && (
                  <div className="mb-2 sm:mb-3 text-center">
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

                {/* Who serves to whom, and from which service court */}
                <div className="mb-3 text-center" aria-live="polite">
                  <p className="text-xs sm:text-sm text-emerald-100">
                    <span aria-hidden>🏸 </span>
                    <strong className="font-black text-white">{serverName}</strong> serves to{" "}
                    <strong className="font-black text-white">{receiverName}</strong>
                    <span className="text-emerald-300/90"> · from the {next.court} court</span>
                  </p>
                  {gameStart && (
                    <p className="mt-0.5 text-[11px] text-emerald-300/70">
                      {singles
                        ? "Tap Serving or Receiving to change who serves first."
                        : "Tap a name to choose who serves and who receives first."}
                    </p>
                  )}
                </div>

                {/* Court with Vertical Net Divider */}
                <div className="relative grid grid-cols-2 gap-3 sm:gap-6 items-center">
                  {/* Vertical Net Divider */}
                  <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 flex flex-col items-center justify-center pointer-events-none z-10">
                    <div className="w-px h-full border-r-2 border-dashed border-emerald-300/40" />
                    <span className="absolute bg-emerald-900 border border-emerald-500/50 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest text-emerald-200 shadow">
                      NET
                    </span>
                  </div>

                  {/* Render sides according to court ends */}
                  {([endsSwapped ? "B" : "A", endsSwapped ? "A" : "B"] as const).map((side) => {
                    const isA = side === "A";
                    const teamName = isA ? team1Name : team2Name;
                    const score = isA ? scoreA : scoreB;
                    const isServing = serve.serving === side;

                    return (
                      <div key={side} className="text-center space-y-2 z-0">
                        <div className="flex flex-col items-center justify-center gap-1 min-h-[42px]">
                          {singles ? (
                            <div className="flex items-center justify-center gap-1.5 max-w-full px-1">
                              {playerId(side, 0) && <Avatar name={teamName} size="xs" />}
                              <p className="font-bold text-xs sm:text-sm truncate text-emerald-100">{teamName}</p>
                            </div>
                          ) : (
                            <div className="w-full space-y-1">
                              {([0, 1] as const).map((i) => {
                                const name = nameOf(playerId(side, i));
                                const court = courtOf(serve, side, i);
                                const role = isServing
                                  ? next.server === i && "serving"
                                  : next.receiver === i && "receiving";
                                return (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => pickPlayer(side, i)}
                                    data-haptic="select"
                                    aria-pressed={!!role}
                                    aria-label={`${name}, ${court} court${role ? `, ${role}` : ""}. Tap to make ${name} the ${isServing ? "server" : "receiver"}.`}
                                    title={`Make ${name} the ${isServing ? "server" : "receiver"}`}
                                    className={cx(
                                      "w-full flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition cursor-pointer active:scale-[0.98]",
                                      role === "serving"
                                        ? "bg-amber-400 text-amber-950 shadow"
                                        : role === "receiving"
                                        ? "bg-emerald-950/70 text-white ring-1 ring-emerald-200/70"
                                        : "text-emerald-100/70 hover:bg-emerald-900/60"
                                    )}
                                  >
                                    <Avatar name={name} size="xs" />
                                    <span className="min-w-0 flex-1 truncate text-xs sm:text-sm font-bold">
                                      {role === "serving" && <span aria-hidden>🏸 </span>}
                                      {name}
                                    </span>
                                    <span className="shrink-0 text-[9px] font-black uppercase tracking-wider opacity-70">
                                      {court}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => setServe((s) => ({ ...s, serving: otherSide(s.serving) }))}
                            className={cx(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition cursor-pointer shadow-xs",
                              isServing
                                ? "bg-amber-400 text-amber-950 animate-pulse font-black"
                                : "bg-emerald-950/60 text-emerald-300/70 hover:bg-emerald-900 border border-emerald-600/30"
                            )}
                            title={isServing ? `Give the serve to the other side` : `Give the serve to ${teamName}`}
                          >
                            🏸 {isServing ? "Serving" : "Receiving"}
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => addPoint(side)}
                          data-haptic="impact"
                          title={`Tap to add point to ${teamName}`}
                          className="w-full text-5xl sm:text-6xl font-black tabular-nums tracking-tight font-mono py-3 sm:py-4 bg-emerald-900/70 hover:bg-emerald-900 rounded-xl border border-emerald-500/40 active:scale-95 transition cursor-pointer"
                        >
                          {score}
                        </button>
                        <div className="flex gap-1.5 sm:gap-2">
                          <button
                            type="button"
                            disabled={score === 0}
                            onClick={() => subPoint(side)}
                            title={`Subtract 1 point from ${teamName}`}
                            aria-label={`Subtract 1 point from ${teamName}`}
                            className="px-2.5 sm:px-3.5 py-2.5 sm:py-3 rounded-xl bg-emerald-950/70 hover:bg-emerald-950 border border-emerald-600/50 text-emerald-200 font-black text-sm shadow active:scale-95 transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                          >
                            -1
                          </button>
                          <button
                            type="button"
                            onClick={() => addPoint(side)}
                            data-haptic="impact"
                            className="flex-1 py-2.5 sm:py-3 rounded-xl bg-white hover:bg-emerald-50 text-emerald-950 font-extrabold text-sm sm:text-base shadow active:scale-95 transition cursor-pointer"
                          >
                            +1 Point
                          </button>
                        </div>
                      </div>
                    );
                  })}
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

                  {/* Only when someone is ahead: a level score has no winner to record. */}
                  {gamesHistory.length > 0 && winsA !== winsB && (
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

              {/* Won on a point (not finished early): that point can be taken back. */}
              {scoreLog[scoreLog.length - 1]?.game && (winsA === setsToWin || winsB === setsToWin) && (
                <Button variant="ghost" size="sm" onClick={undoPoint} disabled={busy}>
                  <RotateCcw size={14} className="mr-1.5" />
                  Undo last point
                </Button>
              )}

              <Button variant="ghost" size="sm" onClick={() => setConfirmDiscard(true)}>
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

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this match?"
        message="The result won't be saved and the score can't be recovered."
        confirmLabel="Discard match"
        cancelLabel="Keep it"
        tone="danger"
        onConfirm={() => {
          setConfirmDiscard(false);
          setStep("setup");
          onClose();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </Sheet>
  );
}
