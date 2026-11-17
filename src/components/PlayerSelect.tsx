import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Avatar, Sheet, cx } from "./ui";
import { fuzzyFilter } from "../lib/fuzzy";
import { eventsLabel, type TrainingEvent } from "../lib/disciplines";

export interface PickablePlayer {
  id: string;
  full_name: string;
  events?: TrainingEvent[];
}

/**
 * A player dropdown with a search box. Typos are forgiven ("Rsja" finds "Raja"), and on a phone
 * it opens as a bottom sheet so the list isn't hidden behind the keyboard.
 */
export function PlayerSelect({
  players, value, onChange, placeholder = "Select player", label, disabled, disabledIds = [], allowClear = false, className,
}: {
  players: PickablePlayer[];
  value: string | null | undefined;
  /** The chosen player's id, or "" when cleared. */
  onChange: (id: string) => void;
  /** Shown when nobody is chosen (also the clear option's label). */
  placeholder?: string;
  /** Screen-reader name of the field and the picker's title. */
  label?: string;
  disabled?: boolean;
  /** Listed but greyed out (e.g. the player already chosen on the other side). */
  disabledIds?: string[];
  /** Offer a "nobody" choice at the top. */
  allowClear?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = players.find((p) => p.id === value);
  const title = label ?? placeholder;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={selected ? `${title}: ${selected.full_name}. Change` : title}
        className={cx(
          "flex min-h-[38px] w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-left text-sm transition-[border-color,box-shadow] focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:opacity-60",
          className,
        )}
      >
        <span className={cx("min-w-0 flex-1 truncate", selected ? "text-ink" : "text-ink-faint")}>
          {selected ? selected.full_name : placeholder}
        </span>
        <ChevronDown size={15} className="shrink-0 text-ink-soft" aria-hidden />
      </button>
      {open && (
        <PickerSheet
          title={title}
          players={players}
          value={value ?? ""}
          disabledIds={disabledIds}
          clearLabel={allowClear ? placeholder : null}
          onPick={(id) => { setOpen(false); if (id !== (value ?? "")) onChange(id); }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function PickerSheet({ title, players, value, disabledIds, clearLabel, onPick, onClose }: {
  title: string;
  players: PickablePlayer[];
  value: string;
  disabledIds: string[];
  clearLabel: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const blocked = useMemo(() => new Set(disabledIds), [disabledIds]);

  const results = useMemo(() => fuzzyFilter(players, query, (p) => p.full_name), [players, query]);
  type Row = { id: string; name: string; player?: PickablePlayer };
  const rows: Row[] = [
    ...(clearLabel && !query.trim() ? [{ id: "", name: clearLabel }] : []),
    ...results.map((p) => ({ id: p.id, name: p.full_name, player: p })),
  ];
  const pickable = rows.filter((r) => !blocked.has(r.id));

  // Highlighted row for the keyboard: the chosen player at first, the best match while typing.
  const [hovered, setActive] = useState<string | null>(value || null);
  const active = hovered !== null && pickable.some((r) => r.id === hovered)
    ? hovered
    : query.trim() ? pickable[0]?.id ?? null : null;
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const move = (step: number) => {
    if (!pickable.length) return;
    const i = pickable.findIndex((r) => r.id === active);
    const next = i < 0 ? (step > 0 ? 0 : pickable.length - 1) : Math.min(pickable.length - 1, Math.max(0, i + step));
    setActive(pickable[next].id);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const row = pickable.find((r) => r.id === active) ?? pickable[0];
      if (row) onPick(row.id);
    }
  };
  const optionId = (id: string) => `${listId}-${id || "none"}`;

  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="space-y-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
          <input
            autoFocus
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active !== null ? optionId(active) : undefined}
            aria-label="Search players"
            placeholder="Type a name"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(null); }}
            onKeyDown={onKeyDown}
            className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-9 text-base text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); setActive(null); }}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-2"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <ul ref={listRef} id={listId} role="listbox" aria-label={title} className="max-h-[min(52dvh,420px)] overflow-y-auto overscroll-contain">
          {rows.map((r) => {
            const isBlocked = blocked.has(r.id);
            const isChosen = r.id === value;
            const isActive = r.id === active;
            const events = eventsLabel(r.player?.events);
            return (
              <li
                key={r.id || "none"}
                id={optionId(r.id)}
                role="option"
                aria-selected={isChosen}
                aria-disabled={isBlocked || undefined}
                data-active={isActive}
                onClick={() => !isBlocked && onPick(r.id)}
                onMouseMove={() => !isBlocked && !isActive && setActive(r.id)}
                className={cx(
                  "flex min-h-[44px] cursor-pointer select-none items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-sm",
                  isActive && !isBlocked && "bg-surface-2",
                  isBlocked && "cursor-not-allowed opacity-40",
                )}
              >
                {r.player ? <Avatar name={r.name} size="sm" /> : <span className="h-6 w-6 shrink-0" aria-hidden />}
                <span className="min-w-0 flex-1">
                  <span className={cx("block truncate", r.player ? "font-medium text-ink" : "text-ink-soft")}>{r.name}</span>
                  {events && <span className="block truncate text-[11px] text-ink-faint">{events}</span>}
                </span>
                {isChosen && <Check size={16} className="shrink-0 text-brand" aria-hidden />}
              </li>
            );
          })}
        </ul>
        {results.length === 0 && (
          <p className="px-1 py-4 text-center text-sm text-ink-soft">
            {players.length === 0 ? "No players to choose from." : `No player matches “${query.trim()}”.`}
          </p>
        )}
      </div>
    </Sheet>
  );
}
