import { useState } from "react";
import { toast } from "sonner";
import { Button, Field, Input, Segmented, Select, cx, today } from "./ui";
import { CATEGORIES, isSingles, parseGames, slotGenders, validatePlayers, winnerFromGames, type Category } from "../lib/scores";
import type { Match, Member } from "../lib/types";
import type { MatchInput } from "../lib/api";
import { errorText } from "../lib/supabase";

const createEmptyRows = (count: number) => Array.from({ length: count }, () => ({ a: "", b: "" }));

export interface Lineup { category: Category; slots: (string | null)[] }

export function MatchForm({ players, initial, submitLabel, onSubmit, busy, lockPlayers = false, initialCategory, initialSlots, recent = [] }: {
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
}) {
  const [category, setCategory] = useState<Category>(initial?.category ?? initialCategory ?? "MS");
  const [playedOn, setPlayedOn] = useState(initial?.played_on ?? today());
  const [matchFormat, setMatchFormat] = useState<"best_of_3" | "1_set" | "best_of_5">(() => {
    if (initial?.games?.length === 1) return "1_set";
    if (initial?.games && initial.games.length > 3) return "best_of_5";
    return "best_of_3";
  });
  const [slots, setSlots] = useState<(string | null)[]>(
    initial ? [initial.t1_p1, initial.t1_p2, initial.t2_p1, initial.t2_p2] : initialSlots ?? [null, null, null, null],
  );
  const [rows, setRows] = useState(() => {
    if (initial?.games?.length) {
      return initial.games.map((g) => {
        const [a, b] = g.split("-");
        return { a, b };
      });
    }
    return createEmptyRows(initial?.games?.length === 1 ? 1 : 3);
  });
  const [winner, setWinner] = useState<1 | 2 | null>(initial?.winner_side ?? null);

  const genderOf = (id: string) => players.find((p) => p.id === id)?.gender ?? null;
  const parsed = parseGames(rows);
  const gamesWinner = winnerFromGames(parsed.games);
  const effectiveWinner = gamesWinner ?? winner;
  const want = slotGenders(category);
  const singles = isSingles(category);

  const optionsFor = (i: number) =>
    players.filter((p) => (!want[i] || !p.gender || p.gender === want[i]) && (slots[i] === p.id || !slots.includes(p.id)));

  const changeCategory = (c: Category) => {
    setCategory(c);
    const w = slotGenders(c);
    setSlots((prev) => prev.map((id, i) => {
      if (isSingles(c) && (i === 1 || i === 3)) return null;
      if (id && w[i] && genderOf(id) && genderOf(id) !== w[i]) return null;
      return id;
    }));
  };

  const name = (id: string | null) => players.find((p) => p.id === id)?.full_name ?? "—";
  const sideLabel = (side: 1 | 2) => {
    const [a, b] = side === 1 ? [slots[0], slots[1]] : [slots[2], slots[3]];
    return singles ? name(a) : `${name(a)} & ${name(b)}`;
  };

  const submit = async () => {
    const err = validatePlayers(category, slots, genderOf) ?? parsed.error
      ?? (parsed.games && !gamesWinner ? "Games are level — add the deciding game or clear scores" : null)
      ?? (!effectiveWinner ? "Choose the winner" : null);
    if (err) { toast.error(err); return; }
    try {
      await onSubmit({
        playedOn, category,
        slots: singles ? [slots[0], null, slots[2], null] : slots,
        games: parsed.games, winner: effectiveWinner!,
      });
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const slot = (i: number, label: string) => (
    <Select aria-label={label} disabled={lockPlayers} value={slots[i] ?? ""} onChange={(e) => {
      const next = [...slots]; next[i] = e.target.value || null; setSlots(next);
    }}>
      <option value="">{label}</option>
      {optionsFor(i).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
    </Select>
  );

  const ready = !validatePlayers(category, slots, genderOf);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <Select value={category} disabled={lockPlayers} onChange={(e) => changeCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Date"><Input type="date" value={playedOn} max={today()} disabled={lockPlayers} onChange={(e) => setPlayedOn(e.target.value)} /></Field>
      </div>

      {!initial && !lockPlayers && recent.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-ink-soft">Recent line-ups</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {recent.map((l, i) => {
              const nm = (id: string | null) => players.find((p) => p.id === id)?.full_name.split(" ")[0] ?? "?";
              const label = isSingles(l.category)
                ? `${nm(l.slots[0])} v ${nm(l.slots[2])}`
                : `${nm(l.slots[0])}/${nm(l.slots[1])} v ${nm(l.slots[2])}/${nm(l.slots[3])}`;
              return (
                <button key={i} type="button" onClick={() => { setCategory(l.category); setSlots([...l.slots]); }}
                  className="shrink-0 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink hover:border-brand/50">
                  <span className="mr-1 font-bold text-brand">{l.category}</span>{label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink-soft">Side A</p>
          {slot(0, singles ? "Player" : "Player 1")}
          {!singles && slot(1, "Player 2")}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink-soft">Side B</p>
          {slot(2, singles ? "Player" : "Player 1")}
          {!singles && slot(3, "Player 2")}
        </div>
      </div>

      {/* Dynamic Match Format Selector */}
      <div className="flex items-center justify-between p-2 rounded-lg bg-surface-2/60 border border-line">
        <span className="text-xs font-semibold text-ink">Match format</span>
        <Segmented
          value={matchFormat}
          onChange={(f) => {
            setMatchFormat(f);
            const targetLen = f === "1_set" ? 1 : f === "best_of_5" ? 5 : 3;
            setRows((prev) => {
              if (prev.length === targetLen) return prev;
              if (prev.length < targetLen) {
                return [...prev, ...createEmptyRows(targetLen - prev.length)];
              }
              return prev.slice(0, targetLen);
            });
          }}
          options={[
            { value: "1_set", label: "1 Set (Shootout)" },
            { value: "best_of_3", label: "Best of 3" },
            { value: "best_of_5", label: "Best of 5" },
          ]}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-ink-soft">Game scores (optional, A–B)</p>
          <button
            type="button"
            onClick={() => setRows(createEmptyRows(rows.length))}
            className="text-[11px] text-ink-soft hover:text-red-500"
          >
            Clear scores
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
          <span className="text-[10px] uppercase font-bold text-ink-soft">Presets:</span>
          <button
            type="button"
            onClick={() => {
              setMatchFormat("1_set");
              setRows([{ a: "15", b: "12" }]);
            }}
            className="px-1.5 py-0.5 rounded bg-surface-2 hover:bg-surface-3 text-[11px] text-ink font-mono border border-line"
          >
            15-12 (1 set)
          </button>
          <button
            type="button"
            onClick={() => {
              setMatchFormat("1_set");
              setRows([{ a: "21", b: "19" }]);
            }}
            className="px-1.5 py-0.5 rounded bg-surface-2 hover:bg-surface-3 text-[11px] text-ink font-mono border border-line"
          >
            21-19 (1 set)
          </button>
          <button
            type="button"
            onClick={() => {
              setMatchFormat("best_of_3");
              setRows([{ a: "21", b: "18" }, { a: "21", b: "16" }, { a: "", b: "" }]);
            }}
            className="px-1.5 py-0.5 rounded bg-surface-2 hover:bg-surface-3 text-[11px] text-ink font-mono border border-line"
          >
            21-18, 21-16
          </button>
          <button
            type="button"
            onClick={() => {
              setMatchFormat("best_of_3");
              setRows([{ a: "21", b: "15" }, { a: "18", b: "21" }, { a: "21", b: "17" }]);
            }}
            className="px-1.5 py-0.5 rounded bg-surface-2 hover:bg-surface-3 text-[11px] text-ink font-mono border border-line"
          >
            21-15, 18-21, 21-17
          </button>
        </div>

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

        {/* Dynamic Add / Remove Game buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            disabled={rows.length >= 5}
            onClick={() => setRows([...rows, { a: "", b: "" }])}
            className="text-xs font-semibold text-brand hover:underline disabled:opacity-30 disabled:pointer-events-none"
          >
            + Add Game {rows.length + 1}
          </button>
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => setRows(rows.slice(0, -1))}
              className="text-xs text-ink-soft hover:text-red-500"
            >
              – Remove Game {rows.length}
            </button>
          )}
        </div>

        {parsed.error && <p className="mt-1 text-xs text-red-600">{parsed.error}</p>}
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold text-ink-soft">
          Winner {gamesWinner ? "(from scores)" : ""}
        </p>
        {gamesWinner ? (
          <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm font-semibold text-brand">{sideLabel(gamesWinner)}</p>
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

      <Button className="w-full" onClick={submit} disabled={busy}>{busy ? "Saving…" : submitLabel}</Button>
    </div>
  );
}
