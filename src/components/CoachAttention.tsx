import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Flame, HeartPulse, ListChecks } from "lucide-react";
import { Card, cx } from "./ui";
import { useRosterAdmin } from "../lib/api";
import { useInjuryReports } from "../lib/sharedData";
import { rpeIsDue, useNow } from "../lib/today";
import { setupSteps } from "./AdminChecklist";
import type { Assessment, Attendance, Camp, Match, Member } from "../lib/types";

/** Days without an assessment before a player shows up as due. */
export const ASSESS_EVERY_DAYS = 7;

/** Players with no assessment, or none in the last `days` days, on or before `day` (YYYY-MM-DD). */
export function playersDueAssessment(players: Member[], assessments: Pick<Assessment, "person_id" | "assessed_on">[], day: string, days = ASSESS_EVERY_DAYS): Member[] {
  const cutoff = new Date(`${day}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffDay = cutoff.toLocaleDateString("en-CA");
  const last = new Map<string, string>();
  for (const a of assessments) {
    if (!last.has(a.person_id) || a.assessed_on > last.get(a.person_id)!) last.set(a.person_id, a.assessed_on);
  }
  return players.filter((p) => !last.has(p.id) || last.get(p.id)! <= cutoffDay);
}

/**
 * The coach's to-do list for today: things only staff can act on. Hidden parts disappear when
 * there's nothing to do, so an empty card means everything is handled.
 */
export function CoachAttention({
  campId, players, matches, assessments, todayAttendance, sessionMinutes, onOpenPlayer, onOpenInjuries, camp, isAdmin = false,
}: {
  campId: string;
  /** With isAdmin: shows camp setup progress until it's done (or hidden). */
  camp?: Camp;
  isAdmin?: boolean;
  players: Member[];
  matches: Match[];
  assessments: Pick<Assessment, "person_id" | "assessed_on">[];
  /** Attendance rows for today's session. */
  todayAttendance: Attendance[];
  sessionMinutes: number | null | undefined;
  onOpenPlayer: (personId: string) => void;
  onOpenInjuries: () => void;
}) {
  const now = useNow();
  const injuries = useInjuryReports(campId);
  const roster = useRosterAdmin(campId, isAdmin);
  const hideKey = `setup.hidden.${campId}`;
  const [setupHidden, setSetupHidden] = useState(() => {
    try { return localStorage.getItem(hideKey) === "1"; } catch { return false; }
  });
  const playerIds = new Set(players.map((p) => p.id));
  const nameOf = (id: string) => players.find((p) => p.id === id)?.full_name ?? "Player";

  const disputes = matches.filter((m) => m.status === "disputed");
  const newInjuries = (injuries.data ?? []).filter((r) => r.status === "new");
  const dueAssessment = playersDueAssessment(players, assessments, new Date().toLocaleDateString("en-CA"));
  const missingRpe = todayAttendance.filter(
    (a) => playerIds.has(a.person_id) && a.rpe == null && rpeIsDue(a, sessionMinutes, now),
  );

  const items: ReactNode[] = [];
  if (isAdmin && camp && roster.data && !setupHidden) {
    const steps = setupSteps(camp, roster.data);
    const next = steps.find((x) => !x.done);
    if (next) {
      const done = steps.filter((x) => x.done).length;
      items.push(
        <Item key="setup" tone="neutral" icon={<ListChecks size={16} />}
          title={`Finish setting up the camp (${done} of ${steps.length})`}
          detail={<>Next: {next.title}. <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => {
            setSetupHidden(true);
            try { localStorage.setItem(hideKey, "1"); } catch { /* storage unavailable */ }
          }}>Hide</button></>}
          action={<Link href={next.href} className="text-xs font-semibold text-brand">Go</Link>} />,
      );
    }
  }
  if (disputes.length) {
    items.push(
      <Item key="disputes" tone="warn" icon={<AlertTriangle size={16} />}
        title={`${disputes.length} disputed result${disputes.length === 1 ? "" : "s"}`}
        detail="These don't count in standings until you resolve or void them."
        action={<Link href="/matches?filter=disputed" className="text-xs font-semibold text-brand">Review</Link>} />,
    );
  }
  if (newInjuries.length) {
    items.push(
      <Item key="injuries" tone="bad" icon={<HeartPulse size={16} />}
        title={`${newInjuries.length} new injury report${newInjuries.length === 1 ? "" : "s"}`}
        detail={[...new Set(newInjuries.map((r) => nameOf(r.person_id)))].join(", ")}
        action={<button type="button" onClick={onOpenInjuries} className="text-xs font-semibold text-brand">Open</button>} />,
    );
  }
  if (missingRpe.length) {
    items.push(
      <Item key="rpe" tone="neutral" icon={<Flame size={16} />}
        title={`${missingRpe.length} haven't logged effort today`}
        detail={<Names ids={missingRpe.map((a) => a.person_id)} nameOf={nameOf} onOpen={onOpenPlayer} />} />,
    );
  }
  if (dueAssessment.length) {
    items.push(
      <Item key="assess" tone="neutral" icon={<ClipboardCheck size={16} />}
        title={`${dueAssessment.length} due an assessment`}
        detail={<Names ids={dueAssessment.map((p) => p.id)} nameOf={nameOf} onOpen={onOpenPlayer} />}
        action={<Link href="/players" className="text-xs font-semibold text-brand">Assess</Link>} />,
    );
  }

  if (items.length === 0) {
    return (
      <Card className="flex items-center gap-2.5 p-3.5 text-sm text-ink-soft">
        <CheckCircle2 size={18} className="text-status-success-text" />
        All caught up. No disputes, new injuries or overdue assessments.
      </Card>
    );
  }
  return (
    <Card className="!p-0">
      <div className="divide-y divide-line">{items}</div>
    </Card>
  );
}

function Item({ icon, title, detail, action, tone }: {
  icon: ReactNode; title: string; detail: ReactNode; action?: ReactNode; tone: "warn" | "bad" | "neutral";
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className={cx(
        "mt-0.5 shrink-0",
        tone === "warn" ? "text-status-warn-text" : tone === "bad" ? "text-status-danger-text" : "text-brand",
      )}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <div className="text-[11px] text-ink-soft">{detail}</div>
      </div>
      {action && <div className="shrink-0 pt-0.5">{action}</div>}
    </div>
  );
}

/** First few names as tappable links (opens the player), then "+N more". */
function Names({ ids, nameOf, onOpen, max = 4 }: { ids: string[]; nameOf: (id: string) => string; onOpen: (id: string) => void; max?: number }) {
  const shown = ids.slice(0, max);
  return (
    <span>
      {shown.map((id, i) => (
        <span key={id}>
          {i > 0 && ", "}
          <button type="button" onClick={() => onOpen(id)} className="font-medium text-ink underline decoration-line underline-offset-2 hover:text-brand">
            {nameOf(id)}
          </button>
        </span>
      ))}
      {ids.length > max && ` +${ids.length - max} more`}
    </span>
  );
}
