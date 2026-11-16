import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Avatar, Button, Field, Input, Segmented, cx, today } from "./ui";
import {
  CATEGORIES, GAME_POINTS, isSingles, parseGames, quickGamesToRows, slotGenders, validatePlayers,
  winnerFromGames, winningScore, type Category, type QuickGame,
} from "../lib/scores";
import type { Match, Member } from "../lib/types";
import type { MatchInput } from "../lib/api";
import { errorText } from "../lib/supabase";

type Format = "1_set" | "best_of_3" | "best_of_5";
const GAMES_IN: Record<Format, number> = { "1_set": 1, best_of_3: 3, best_of_5: 5 };
const emptyRows = (n: number) => Array.from({ length: n }, () => ({ a: "", b: "" }));
const emptyQuick = (n: number): QuickGame[] => Array.from({ length: n }, () => ({ winner: null, loser: "" }));
const resize = <T,>(list: T[], n: number, make: (k: number) => T[]) =>
  list.length >= n ? list.slice(0, n) : [...list, ...make(n - list.length)];

const lastCategoryKey = (meId: string) => `match.lastCategory.${meId}`;
function readLastCategory(meId: string | null | undefined): Category | null {
  if (!meId) return null;
  try {
    const v = localStorage.getItem(lastCategoryKey(meId));
    return CATEGORIES.some((c) => c.value === v) ? (v as Category) : null;
  } catch {
    return null;
  }
}

export interface Lineup { category: Category; slots: (string | null)[] }

export function MatchForm({
  players, initial, submitLabel, onSubmit, busy, lockPlayers = false, initialCategory, initialSlots, recent = [],
  meId, presentIds,
}: {
  players: Member[];
  initial?: Match;
  submitLabel: string;
  onSubmit: (m: MatchInput) => Promise<unknown>;
  busy: boolean;
  /** Only scores and winner are editable (used when a coach resolves a dispute). */
  lockPlayers?: boolean;
  initialCategory?: Category;
  initialSlots?: (string | null)[];
  /** Recent line-ups offered as one-tap chips on a fresh form. */
  recent?: Lineup[];
  /** Who is recording: placed on side A of a fresh form, and their last category is remembered. */
  meId?: string | null;
  /** Players checked in today; offered first in the player picker. */
  presentIds?: string[];
}) {
  const fresh = !initial;
  const me = players.find((p) => p.id === meId);
  const genderOf = (id: string) => players.find((p) => p.id === id)?.gender ?? null;

  const [meRemoved, setMeRemoved] = useState(false);
  /** On a fresh form, put the recorder on side A in the first slot their gender fits. */
  const withMe = (c: Category, s: (string | null)[], skip = meRemoved) => {
    if (!fresh || lockPlayers || !me || skip || s.includes(me.id)) return s;
    const want = slotGenders(c);
    const slot = (isSingles(c) ? [0] : [0, 1]).find((i) => !s[i] && (!want[i] || !me.gender || want[i] === me.gender));
    if (slot === undefined) return s;
    const next = [...s];
    next[slot] = me.id;
    return next;
  };

  // Last category this person recorded, else their own singles category.
  const startCategory = (): Category =>
    initial?.category ?? initialCategory ?? readLastCategory(meId) ?? (me?.gender === "F" ? "WS" : "MS");
  const [category, setCategory] = useState<Category>(startCategory);
  const [slots, setSlots] = useState<(string | null)[]>(() =>
    initial ? [initial.t1_p1, initial.t1_p2, initial.t2_p1, initial.t2_p2]
      : initialSlots ?? withMe(startCategory(), [null, null, null, null]),
  );
  const [activePick, setActivePick] = useState<number | null>(null);
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const [playedOn, setPlayedOn] = useState(initial?.played_on ?? today());

  const [format, setFormat] = useState<Format>(() => {
    const n = initial?.games?.length ?? 0;
    return n === 1 ? "1_set" : n > 3 ? "best_of_5" : "best_of_3";
  });
  // Quick entry (who won + the losing score) for new matches; exact scores when editing.
  const [mode, setMode] = useState<"quick" | "exact">(fresh ? "quick" : "exact");
  const [target, setTarget] = useState<number>(21);
  const [quick, setQuick] = useState<QuickGame[]>(() => emptyQuick(GAMES_IN[format]));
  const [rows, setRows] = useState(() =>
    initial?.games?.length
      ? initial.games.map((g) => { const [a, b] = g.split("-"); return { a, b }; })
      : emptyRows(GAMES_IN[format]),
  );
  const [winner, setWinner] = useState<1 | 2 | null>(initial?.winner_side ?? null);
  const [tried, setTried] = useState(false);

  const singles = isSingles(category);
  const want = slotGenders(category);
  const needed = singles ? [0, 2] : [0, 1, 2, 3];

  // Complete quick games only, so the winner preview updates as each game is filled in.
  const quickRows = quick.map((g) => {
    const r = quickGamesToRows([g], target);
    return r.error ? { a: "", b: "" } : r.rows[0];
  });
  const parsed = parseGames(mode === "quick" ? quickRows : rows);
  const gamesWinner = winnerFromGames(parsed.games);

  const changeCategory = (c: Category) => {
    setCategory(c);
    const w = slotGenders(c);
    const cleared = slots.map((id, i) => {
      if (isSingles(c) && (i === 1 || i === 3)) return null;
      if (id && w[i] && genderOf(id) && genderOf(id) !== w[i]) return null;
      return id;
    });
    setSlots(withMe(c, cleared));
    setActivePick(null);
  };

  const changeFormat = (f: Format) => {
    setFormat(f);
    const n = GAMES_IN[f];
    setRows((prev) => resize(prev, n, emptyRows));
    setQuick((prev) => resize(prev, n, emptyQuick));
  };

  const switchMode = (m: "quick" | "exact") => {
    if (m === "exact") {
      setRows(resize(quickRows, GAMES_IN[format], emptyRows));
    } else {
      setQuick(resize(
        rows.map((r): QuickGame => {
          const a = Number(r.a), b = Number(r.b);
          if (!r.a.trim() || !r.b.trim() || Number.isNaN(a) || Number.isNaN(b) || a === b) return { winner: null, loser: "" };
          return { winner: a > b ? 1 : 2, loser: String(Math.min(a, b)) };
        }),
        GAMES_IN[format], emptyQuick,
      ));
    }
    setMode(m);
  };

  const name = (id: string | null) => players.find((p) => p.id === id)?.full_name ?? "—";
  const first = (id: string | null) => name(id).split(" ")[0];
  const sideIds = (side: 1 | 2) => {
    const ids = side === 1 ? [slots[0], slots[1]] : [slots[2], slots[3]];
    return singles ? ids.slice(0, 1) : ids;
  };
  const sideLabel = (side: 1 | 2) => sideIds(side).map(name).join(" & ");
  const sideShort = (side: 1 | 2) =>
    sideIds(side).every(Boolean) ? sideIds(side).map(first).join("/") : side === 1 ? "Side A" : "Side B";

  const ready = !validatePlayers(category, slots, genderOf);

  // ── Player picker ──
  const firstEmpty = needed.find((i) => !slots[i]);
  const pickSlot = activePick !== null && needed.includes(activePick) && !slots[activePick] ? activePick : firstEmpty;
  const slotTitle = (i: number) =>
    `${i < 2 ? "Side A" : "Side B"}${singles ? "" : ` · player ${i % 2 === 0 ? 1 : 2}`}`;
  const present = new Set(presentIds ?? []);
  const eligible = pickSlot === undefined
    ? []
    : players.filter((p) => (!want[pickSlot] || !p.gender || p.gender === want[pickSlot]) && !slots.includes(p.id));
  const here = eligible.filter((p) => present.has(p.id));
  const notHere = eligible.filter((p) => !present.has(p.id));
  const collapse = present.size > 0 && here.length > 0 && !showAllPlayers;
  const listed = collapse ? here : [...here, ...notHere];

  const pick = (id: string) => {
    if (pickSlot === undefined) return;
    const next = [...slots];
    next[pickSlot] = id;
    setSlots(next);
    setActivePick(null);
    setShowAllPlayers(false);
  };
  const clearSlot = (i: number) => {
    const id = slots[i];
    if (id && id === meId) setMeRemoved(true);
    const next = [...slots];
    next[i] = null;
    setSlots(next);
    setActivePick(i);
  };

  const slotButton = (i: number) => {
    const id = slots[i];
    const active = pickSlot === i && !lockPlayers;
    return (
      <button
        key={i}
        type="button"
        disabled={lockPlayers}
        onClick={() => (id ? clearSlot(i) : setActivePick(i))}
        aria-label={id ? `${slotTitle(i)}: ${name(id)}. Tap to change` : `Choose ${slotTitle(i)}`}
        className={cx(
          "flex min-h-[44px] w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm transition",
          id ? "border-line bg-surface" : "border-dashed",
          active ? "border-brand bg-brand-pale/40 ring-2 ring-brand/30" : !id && "border-line bg-surface-2/50",
          lockPlayers && "opacity-80",
        )}
      >
        {id ? (
          <>
            <Avatar name={name(id)} size="xs" />
            <span className="min-w-0 flex-1 truncate font-semibold text-ink">
              {name(id)}{id === meId && <span className="ml-1 text-[10px] font-bold text-brand">(you)</span>}
            </span>
            {!lockPlayers && <X size={14} className="shrink-0 text-ink-soft" />}
          </>
        ) : (
          <span className={cx("text-xs", active ? "font-semibold text-brand" : "text-ink-soft")}>
            {singles ? "Pick player" : `Player ${i % 2 === 0 ? 1 : 2}`}
          </span>
        )}
      </button>
    );
  };

  const submit = async () => {
    setTried(true);
    let games = parsed.games;
    if (mode === "quick") {
      const strict = quickGamesToRows(quick, target);
      if (strict.error) { toast.error(strict.error); return; }
      games = parseGames(strict.rows).games;
    }
    const finalWinner = winnerFromGames(games) ?? (games ? null : winner);
    const err = validatePlayers(category, slots, genderOf) ?? (mode === "exact" ? parsed.error : undefined)
      ?? (games && !winnerFromGames(games) ? "Games are level — add the deciding game or clear scores" : null)
      ?? (!finalWinner ? "Choose the winner" : null);
    if (err) { toast.error(err); return; }
    try {
      await onSubmit({
        playedOn, category,
        slots: singles ? [slots[0], null, slots[2], null] : slots,
        games, winner: finalWinner!,
      });
      if (fresh && meId) {
        try { localStorage.setItem(lastCategoryKey(meId), category); } catch { /* storage unavailable */ }
      }
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <div className="space-y-4">
      {/* Category */}
      <div>
        <p className="mb-1 text-xs font-semibold text-ink-soft">Category</p>
        <div className="grid grid-cols-5 gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              disabled={lockPlayers}
              onClick={() => changeCategory(c.value)}
              title={c.label}
              aria-label={c.label}
              aria-pressed={category === c.value}
              className={cx(
                "min-h-[40px] rounded-xl border text-xs font-bold transition active:scale-95 disabled:opacity-60",
                category === c.value ? "border-brand-border bg-brand-pale text-brand" : "border-line bg-surface text-ink-soft hover:text-ink",
              )}
            >
              {c.value}
            </button>
          ))}
        </div>
      </div>

      {fresh && !lockPlayers && recent.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-ink-soft">Recent line-ups</p>
          <div className="flex flex-wrap gap-1.5">
            {recent.map((l, i) => {
              const label = isSingles(l.category)
                ? `${first(l.slots[0])} v ${first(l.slots[2])}`
                : `${first(l.slots[0])}/${first(l.slots[1])} v ${first(l.slots[2])}/${first(l.slots[3])}`;
              return (
                <button key={i} type="button" onClick={() => { setCategory(l.category); setSlots([...l.slots]); setActivePick(null); }}
                  className="shrink-0 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink hover:border-brand/50">
                  <span className="mr-1 font-bold text-brand">{l.category}</span>{label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Players */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-ink-soft">Side A</p>
            {slotButton(0)}
            {!singles && slotButton(1)}
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-ink-soft">Side B</p>
            {slotButton(2)}
            {!singles && slotButton(3)}
          </div>
        </div>

        {!lockPlayers && pickSlot !== undefined && (
          <div className="rounded-xl border border-line bg-surface-2/50 p-2.5">
            <p className="mb-1.5 text-[11px] font-semibold text-ink-soft">
              Tap to add to <span className="text-brand">{slotTitle(pickSlot)}</span>
              {present.size > 0 && here.length > 0 && collapse && " · checked in today"}
            </p>
            {listed.length === 0 ? (
              <p className="text-xs text-ink-soft">No one else fits this slot for {CATEGORIES.find((c) => c.value === category)?.label.toLowerCase()}.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {listed.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pick(p.id)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink transition hover:border-brand/50 active:scale-95"
                  >
                    {present.has(p.id) && <span className="h-1.5 w-1.5 rounded-full bg-status-success-text" aria-hidden />}
                    {p.full_name}{p.id === meId && <span className="text-[10px] font-bold text-brand">(you)</span>}
                  </button>
                ))}
              </div>
            )}
            {collapse && notHere.length > 0 && (
              <button type="button" onClick={() => setShowAllPlayers(true)} className="mt-2 text-[11px] font-semibold text-brand hover:underline">
                Show {notHere.length} more (not checked in)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Scores */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-ink-soft">Scores <span className="font-normal">(optional)</span></p>
          <Segmented<Format>
            value={format}
            onChange={changeFormat}
            options={[{ value: "1_set", label: "1 game" }, { value: "best_of_3", label: "Best of 3" }, { value: "best_of_5", label: "Best of 5" }]}
          />
        </div>

        {mode === "quick" ? (
          <>
            <div className="flex items-center gap-2 text-[11px] text-ink-soft">
              <span>Points per game</span>
              {GAME_POINTS.map((g) => (
                <button
                  key={g.target}
                  type="button"
                  onClick={() => setTarget(g.target)}
                  aria-pressed={target === g.target}
                  className={cx(
                    "rounded-lg border px-2 py-0.5 font-bold",
                    target === g.target ? "border-brand-border bg-brand-pale text-brand" : "border-line bg-surface text-ink-soft",
                  )}
                >
                  {g.target}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {quick.map((g, i) => {
                const loserN = Number(g.loser);
                const w = g.winner && g.loser.trim() ? winningScore(target, loserN) : null;
                const preview = w === null || !g.winner ? null : g.winner === 1 ? `${w}–${g.loser}` : `${g.loser}–${w}`;
                const setGame = (patch: Partial<QuickGame>) => setQuick((prev) => prev.map((x, k) => (k === i ? { ...x, ...patch } : x)));
                return (
                  <div key={i} className="rounded-xl border border-line p-2">
                    <div className="mb-1.5 flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-ink-soft">Game {i + 1}</span>
                      <span className="font-mono font-bold text-ink">{preview ?? ""}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {([1, 2] as const).map((side) => (
                        <button
                          key={side}
                          type="button"
                          onClick={() => setGame({ winner: g.winner === side ? null : side })}
                          aria-pressed={g.winner === side}
                          aria-label={`Game ${i + 1}: ${sideShort(side)} won`}
                          className={cx(
                            "min-h-[40px] min-w-0 flex-1 truncate rounded-lg border px-2 text-xs font-semibold transition active:scale-95",
                            g.winner === side ? "border-brand-border bg-brand-pale text-brand" : "border-line bg-surface text-ink-soft",
                          )}
                        >
                          {sideShort(side)} won
                        </button>
                      ))}
                      <Input
                        inputMode="numeric"
                        maxLength={2}
                        aria-label={`Game ${i + 1}: losing side's points`}
                        placeholder="Their pts"
                        className="!w-[5.5rem] text-center"
                        value={g.loser}
                        onChange={(e) => setGame({ loser: e.target.value.replace(/\D/g, "") })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {tried && quickGamesToRows(quick, target).error && (
              <p className="text-xs font-semibold text-status-danger-text">{quickGamesToRows(quick, target).error}</p>
            )}
            <button type="button" onClick={() => switchMode("exact")} className="text-[11px] font-semibold text-brand hover:underline">
              Type both scores instead
            </button>
          </>
        ) : (
          <>
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-14 text-xs text-ink-soft">Game {i + 1}</span>
                  <Input inputMode="numeric" aria-label={`Game ${i + 1} side A`} className="!w-16 text-center" value={r.a}
                    onChange={(e) => { const n = [...rows]; n[i] = { ...r, a: e.target.value }; setRows(n); }} />
                  <span className="text-ink-soft">–</span>
                  <Input inputMode="numeric" aria-label={`Game ${i + 1} side B`} className="!w-16 text-center" value={r.b}
                    onChange={(e) => { const n = [...rows]; n[i] = { ...r, b: e.target.value }; setRows(n); }} />
                </div>
              ))}
            </div>
            {parsed.error && <p className="text-xs font-semibold text-status-danger-text">{parsed.error}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setRows(emptyRows(rows.length))} className="text-[11px] text-ink-soft hover:text-red-500">
                Clear scores
              </button>
              <button type="button" onClick={() => switchMode("quick")} className="text-[11px] font-semibold text-brand hover:underline">
                Quick entry (who won + their points)
              </button>
            </div>
          </>
        )}
      </div>

      {/* Winner */}
      <div>
        <p className="mb-1 text-xs font-semibold text-ink-soft">Winner {gamesWinner ? "(from scores)" : ""}</p>
        {gamesWinner ? (
          <p className="rounded-xl border border-brand-border bg-brand-pale px-3 py-2 text-sm font-bold text-brand">{sideLabel(gamesWinner)}</p>
        ) : parsed.games ? (
          <p className="rounded-xl border border-status-warn-border bg-status-warn-bg px-3 py-2 text-xs font-semibold text-status-warn-text">
            Games are level. Add the deciding game, or clear the scores and just pick the winner.
          </p>
        ) : (
          <div className={cx(!ready && "pointer-events-none opacity-50")}>
            <Segmented<"1" | "2" | "">
              value={winner ? (String(winner) as "1" | "2") : ""}
              onChange={(v) => setWinner(v ? (Number(v) as 1 | 2) : null)}
              options={[{ value: "1", label: ready ? sideLabel(1) : "Side A" }, { value: "2", label: ready ? sideLabel(2) : "Side B" }]}
            />
          </div>
        )}
      </div>

      <Field label="Played on">
        <Input type="date" value={playedOn} max={today()} disabled={lockPlayers} onChange={(e) => setPlayedOn(e.target.value)} />
      </Field>

      <Button className="w-full" onClick={submit} disabled={busy}>
        {busy ? "Saving…" : submitLabel}
      </Button>
    </div>
  );
}
