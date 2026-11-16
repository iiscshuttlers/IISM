import { Ban, Flag, Gavel, Pencil, Repeat, RotateCcw, Share2, Trash2 } from "lucide-react";
import { Avatar, Badge, cx, fmtDate } from "./ui";
import { CATEGORIES, isSingles } from "../lib/scores";
import { shareMatchOnWhatsApp } from "../lib/whatsappShare";
import type { Match, Member } from "../lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;
export const withinDay = (m: Match) => Date.now() - new Date(m.created_at).getTime() < DAY_MS;

export function MatchCard({ match: m, people, meId, isStaff, onEdit, onDispute, onResolve, onRematch, onDeleteForever, flat = false, hideDate = false }: {
  match: Match;
  people: Member[];
  meId: string | null | undefined;
  isStaff: boolean;
  onEdit?: (m: Match) => void;
  onDispute?: (m: Match) => void;
  onResolve?: (m: Match) => void;
  /** Opens the record form with the same players and category. */
  onRematch?: (m: Match) => void;
  /** Camp admin only: permanently delete a voided match. */
  onDeleteForever?: (m: Match) => void;
  /** A row inside a list card instead of a card of its own. */
  flat?: boolean;
  /** The list already shows the day above this card. */
  hideDate?: boolean;
}) {
  const name = (id: string | null) => people.find((p) => p.id === id)?.full_name ?? "Former player";
  const side = (a: string, b: string | null) => (isSingles(m.category) ? name(a) : `${name(a)} & ${name(b)}`);
  const participants = [m.t1_p1, m.t1_p2, m.t2_p1, m.t2_p2];
  const isParticipant = !!meId && participants.includes(meId);
  const fresh = withinDay(m);
  const canEdit = isStaff || (m.recorded_by === meId && m.status === "confirmed" && fresh);
  const canDispute = isParticipant && m.status === "confirmed" && fresh;
  const catLabel = CATEGORIES.find((c) => c.value === m.category)?.label ?? m.category;
  const hasActions =
    (canEdit && m.status !== "void" && !!onEdit) || (canDispute && !!onDispute) || (!!onRematch && m.status !== "void") ||
    (isStaff && !!onResolve) || (!!onDeleteForever && m.status === "void");

  return (
    <div className={cx(flat ? "px-4 py-3" : "rounded-2xl bg-surface p-3.5 shadow-card ring-1 ring-line/70", m.status === "void" && "opacity-60")}>
      <div className="mb-1.5 flex items-center gap-2 text-xs text-ink-soft">
        {!hideDate && (
          <>
            <span className="font-medium">{fmtDate(m.played_on)}</span>
            <span aria-hidden>·</span>
          </>
        )}
        <span className={cx(hideDate && "font-medium")}>{catLabel}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {m.status === "disputed" && <Badge tone="warn">Disputed</Badge>}
          {m.status === "void" && <Badge tone="bad">Void</Badge>}
          {!m.games && m.status === "confirmed" && <Badge>Winner only</Badge>}
          {m.status === "confirmed" && (
            <button
              type="button"
              onClick={() => shareMatchOnWhatsApp(m, people)}
              className="-mr-1.5 rounded-full p-1.5 text-ink-faint transition hover:bg-surface-2 hover:text-brand"
              aria-label="Share result on WhatsApp"
              title="Share result on WhatsApp"
            >
              <Share2 size={14} />
            </button>
          )}
        </span>
      </div>
      {[1, 2].map((s) => {
        const won = m.winner_side === s;
        const label = s === 1 ? side(m.t1_p1, m.t1_p2) : side(m.t2_p1, m.t2_p2);
        const p1 = s === 1 ? m.t1_p1 : m.t2_p1;
        const p2 = s === 1 ? m.t1_p2 : m.t2_p2;
        return (
          <div key={s} className="flex items-center justify-between gap-2 py-1">
            <div className="flex items-center gap-1.5 min-w-0">
              {won ? (
                <span className="h-2 w-2 rounded-full bg-brand shrink-0" />
              ) : (
                <span className="h-2 w-2 shrink-0" />
              )}
              <div className="flex items-center gap-1 min-w-0">
                {p1 && <Avatar name={name(p1)} size="xs" />}
                {p2 && !isSingles(m.category) && <Avatar name={name(p2)} size="xs" />}
                <span className={cx("text-sm leading-snug [overflow-wrap:anywhere]", won ? "font-bold text-ink" : "text-ink-soft")}>
                  {label}
                </span>
              </div>
            </div>
            {m.games && (
              <span className="flex gap-2.5 text-sm tabular-nums">
                {m.games.map((g, i) => {
                  const [a, b] = g.split("-").map(Number);
                  const mine = s === 1 ? a : b;
                  const theirs = s === 1 ? b : a;
                  return <span key={i} className={mine > theirs ? "font-bold text-ink" : "text-ink-soft"}>{mine}</span>;
                })}
              </span>
            )}
          </div>
        );
      })}
      {m.status === "disputed" && m.dispute_reason && (
        <p className="mt-2 rounded-xl bg-status-warn-bg px-3 py-2 text-xs font-medium text-status-warn-text">
          Dispute ({name(m.disputed_by)}): {m.dispute_reason}
        </p>
      )}
      {hasActions && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {isStaff && onResolve && m.status === "disputed" && (
            <button type="button" className={cx(ACT, "bg-brand text-white hover:bg-brand-dark")} onClick={() => onResolve(m)}>
              <Gavel size={13} /> Resolve
            </button>
          )}
          {canEdit && m.status !== "void" && onEdit && (
            <button type="button" className={cx(ACT, "bg-surface-2 text-ink hover:bg-surface-3")} onClick={() => onEdit(m)}>
              <Pencil size={13} /> Edit
            </button>
          )}
          {canDispute && onDispute && (
            <button type="button" className={cx(ACT, "bg-status-warn-bg text-status-warn-text hover:opacity-90")} onClick={() => onDispute(m)}>
              <Flag size={13} /> Dispute
            </button>
          )}
          {onRematch && m.status !== "void" && (
            <button type="button" className={cx(ACT, "bg-surface-2 text-ink hover:bg-surface-3")} onClick={() => onRematch(m)}
              aria-label="Rematch: record another game with the same players">
              <Repeat size={13} /> Rematch
            </button>
          )}
          {isStaff && onResolve && m.status === "void" && (
            <button type="button" className={cx(ACT, "bg-status-success-bg text-status-success-text hover:opacity-90")} onClick={() => onResolve(m)}>
              <RotateCcw size={13} /> Restore
            </button>
          )}
          {onDeleteForever && m.status === "void" && (
            <button type="button" className={cx(ACT, "text-ink-faint hover:bg-status-danger-bg hover:text-status-danger-text")} onClick={() => onDeleteForever(m)}>
              <Trash2 size={13} /> Delete forever
            </button>
          )}
          {isStaff && onResolve && m.status === "confirmed" && (
            <button type="button" className={cx(ACT, "ml-auto text-ink-faint hover:bg-status-danger-bg hover:text-status-danger-text")} onClick={() => onResolve(m)}>
              <Ban size={13} /> Void
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const ACT = "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition active:scale-95";
