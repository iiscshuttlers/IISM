import { Badge, Button, cx, fmtDate } from "./ui";
import { CATEGORIES, isSingles } from "../lib/scores";
import type { Match, Member } from "../lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;
export const withinDay = (m: Match) => Date.now() - new Date(m.created_at).getTime() < DAY_MS;

export function MatchCard({ match: m, people, meId, isStaff, onEdit, onDispute, onResolve }: {
  match: Match;
  people: Member[];
  meId: string | null | undefined;
  isStaff: boolean;
  onEdit?: (m: Match) => void;
  onDispute?: (m: Match) => void;
  onResolve?: (m: Match) => void;
}) {
  const name = (id: string | null) => people.find((p) => p.id === id)?.full_name ?? "Former player";
  const side = (a: string, b: string | null) => (isSingles(m.category) ? name(a) : `${name(a)} & ${name(b)}`);
  const participants = [m.t1_p1, m.t1_p2, m.t2_p1, m.t2_p2];
  const isParticipant = !!meId && participants.includes(meId);
  const fresh = withinDay(m);
  const canEdit = isStaff || (m.recorded_by === meId && m.status === "confirmed" && fresh);
  const canDispute = isParticipant && m.status === "confirmed" && fresh;
  const catLabel = CATEGORIES.find((c) => c.value === m.category)?.label ?? m.category;

  return (
    <div className={cx("rounded-xl border border-line bg-surface p-3", m.status === "void" && "opacity-60")}>
      <div className="mb-2 flex items-center gap-2 text-xs text-ink-soft">
        <span>{fmtDate(m.played_on)}</span>
        <span>·</span>
        <span>{catLabel}</span>
        <span className="ml-auto">
          {m.status === "disputed" && <Badge tone="warn">Disputed</Badge>}
          {m.status === "void" && <Badge tone="bad">Void</Badge>}
          {!m.games && m.status === "confirmed" && <Badge>Winner only</Badge>}
        </span>
      </div>
      {[1, 2].map((s) => {
        const won = m.winner_side === s;
        const label = s === 1 ? side(m.t1_p1, m.t1_p2) : side(m.t2_p1, m.t2_p2);
        return (
          <div key={s} className="flex items-center justify-between gap-2 py-0.5">
            <span className={cx("text-sm", won ? "font-bold text-ink" : "text-ink-soft")}>
              {won && <span className="mr-1 text-brand">●</span>}{label}
            </span>
            {m.games && (
              <span className="flex gap-2 font-mono text-sm tabular-nums">
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
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
          Dispute ({name(m.disputed_by)}): {m.dispute_reason}
        </p>
      )}
      {(canEdit || canDispute || isStaff) && (onEdit || onDispute || onResolve) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {canEdit && m.status !== "void" && onEdit && <Button size="sm" variant="secondary" onClick={() => onEdit(m)}>Edit</Button>}
          {canDispute && onDispute && <Button size="sm" variant="secondary" onClick={() => onDispute(m)}>Dispute</Button>}
          {isStaff && onResolve && (
            <Button size="sm" variant="ghost" onClick={() => onResolve(m)}>
              {m.status === "disputed" ? "Resolve" : m.status === "void" ? "Restore" : "Void"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
