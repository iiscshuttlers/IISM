import { useMemo, useState } from "react";
import { Lock, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../lib/session";
import { useAssessments, useAttendance, useMembers, useSessions, useStandings } from "../lib/api";
import { useLeave, useSaveShortlistWeights, useShortlistWeights } from "../lib/sharedData";
import { attendanceSummary } from "../lib/leave";
import { DEFAULT_WEIGHTS, METRICS, scoreShortlist, weightPercents, type MetricKey, type ShortlistWeights } from "../lib/shortlist";
import { errorText } from "../lib/supabase";
import { Avatar, Badge, Button, Card, Empty, PageTitle, Segmented, Skeleton, cx } from "../components/ui";

const MISSING_LABEL: Record<MetricKey, string> = {
  rating: "No rating", coach_score: "No coach score yet", attendance: "No sessions yet", win_rate: "No matches yet",
};

/**
 * Camp admin only: every player ranked by one score built from rating, coach score, attendance
 * and win rate, weighted the way the admin chooses. Coaches and players never see it, and the
 * database keeps the weights admin-only too.
 */
export default function ShortlistPage() {
  const s = useSession();
  const camp = s.camp!;
  const members = useMembers(camp.id);
  const standings = useStandings(camp.id);
  const sessions = useSessions(camp.id);
  const attendance = useAttendance((sessions.data ?? []).map((x) => x.id));
  const assessments = useAssessments(camp.id, s.isAdmin);
  const leave = useLeave(camp.id);
  const saved = useShortlistWeights(camp.id, s.isAdmin);
  const save = useSaveShortlistWeights(camp.id);
  /** Unsaved slider changes; null means "show what's saved". */
  const [draft, setDraft] = useState<ShortlistWeights | null>(null);
  const [gender, setGender] = useState<"all" | "M" | "F">("all");

  const savedWeights = saved.data ?? DEFAULT_WEIGHTS;
  const w = draft ?? savedWeights;
  const pct = weightPercents(w);
  const total = w.rating + w.coach_score + w.attendance + w.win_rate;
  const dirty = !!draft && METRICS.some(({ key }) => draft[key] !== savedWeights[key]);

  const players = useMemo(() => (members.data ?? []).filter((m) => m.role === "player"), [members.data]);

  const details = useMemo(() => {
    const map = new Map<string, { rating: number; played: number; winPct: number | null; att: ReturnType<typeof attendanceSummary>; coachAvg: number | null; assessed: number }>();
    for (const p of players) {
      const st = (standings.data ?? []).find((r) => r.person_id === p.id);
      const asmt = (assessments.data ?? []).filter((a) => a.person_id === p.id);
      const scores = asmt.flatMap((a) => [a.technique, a.fitness, a.tactics, a.attitude]).filter((x): x is number => x != null);
      map.set(p.id, {
        rating: st?.rating ?? 1200,
        played: st?.played ?? 0,
        winPct: st?.played ? Math.round((100 * st.won) / st.played) : null,
        att: attendanceSummary(p.id, sessions.data ?? [], attendance.data ?? [], leave.data ?? []),
        coachAvg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
        assessed: asmt.length,
      });
    }
    return map;
  }, [players, standings.data, assessments.data, sessions.data, attendance.data, leave.data]);

  // Rating is scaled across the whole camp, then the list is filtered, so a filter never
  // changes anyone's score.
  const ranked = useMemo(
    () => scoreShortlist(players.map((p) => {
      const d = details.get(p.id)!;
      return { id: p.id, rating: d.rating, winPct: d.winPct, attendancePct: d.att.pct, coachAvg: d.coachAvg };
    }), w),
    [players, details, w],
  );
  const person = (id: string) => players.find((p) => p.id === id)!;
  const rows = ranked.filter((r) => gender === "all" || person(r.id).gender === gender);

  if (!s.isAdmin) return <Empty>Only the camp admin can see the shortlist.</Empty>;

  const setWeight = (key: MetricKey, v: number) => setDraft({ ...w, [key]: v });
  const onSave = () =>
    save.mutate(w, {
      onSuccess: () => { setDraft(null); toast.success("Weights saved"); },
      onError: (e) => toast.error(errorText(e)),
    });

  return (
    <div>
      <PageTitle sub={<span className="inline-flex items-center gap-1"><Lock size={12} /> Only you can see this page</span>}>
        Shortlist
      </PageTitle>

      <Card className="mb-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold">How much each number counts</h2>
            <p className="mt-0.5 text-xs text-ink-soft">
              Each player gets a score out of 100. Rating is compared within the camp; attendance doesn't count sessions missed on
              leave. A player missing a number is scored on the ones they have.
            </p>
          </div>
          <button type="button" onClick={() => setDraft({ ...DEFAULT_WEIGHTS })} title="Back to the default weights"
            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-ink-soft hover:bg-surface-2 hover:text-ink">
            <RotateCcw size={13} /> Default
          </button>
        </div>
        <div className="space-y-2.5">
          {METRICS.map(({ key, label }) => (
            <label key={key} className="grid grid-cols-[6.5rem_1fr_2.75rem] items-center gap-3 text-sm">
              <span className="font-medium text-ink">{label}</span>
              <input type="range" min={0} max={10} step={1} value={w[key]} onChange={(e) => setWeight(key, Number(e.target.value))}
                aria-label={`${label} weight`} aria-valuetext={`${pct[key]} percent`} className="w-full accent-brand" />
              <span className="text-right text-xs font-semibold tabular-nums text-ink-soft">{pct[key]}%</span>
            </label>
          ))}
        </div>
        {total === 0 && <p className="mt-2 text-xs text-status-danger-text">Give at least one number some weight.</p>}
        {(dirty || saved.isError) && (
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={onSave} disabled={save.isPending || total === 0}>Save weights</Button>
            {draft && <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Undo changes</Button>}
            {saved.isError && <span className="text-xs text-status-danger-text">Couldn't load saved weights.</span>}
          </div>
        )}
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="w-full sm:w-56">
          <Segmented value={gender} onChange={setGender}
            options={[{ value: "all", label: "All" }, { value: "M", label: "Men" }, { value: "F", label: "Women" }]} />
        </div>
        <p className="text-xs text-ink-soft">Squad size {camp.selection_target}</p>
      </div>

      {members.isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : rows.length === 0 ? (
        <Empty>No players{gender === "all" ? "" : gender === "M" ? " (men)" : " (women)"} on the roster yet.</Empty>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => {
            const p = person(r.id);
            const d = details.get(r.id)!;
            const cut = gender === "all" && i === camp.selection_target - 1 && rows.length > camp.selection_target;
            return (
              <li key={r.id}>
                <Card className={cx("!p-3", gender === "all" && i < camp.selection_target && "border-brand-border")}>
                  <div className="flex items-center gap-3">
                    <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-ink-soft">{i + 1}</span>
                    <Avatar name={p.full_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {p.full_name} {p.gender && <span className="text-xs font-normal text-ink-soft">({p.gender})</span>}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-ink-soft">
                        Rating {d.rating}
                        {" · "}Coach {d.coachAvg != null ? `${d.coachAvg.toFixed(1)}/5 (${d.assessed})` : "—"}
                        {" · "}Attend {d.att.pct != null ? `${d.att.pct}%` : "—"}{d.att.excused ? ` (${d.att.excused} on leave)` : ""}
                        {" · "}Win {d.winPct != null ? `${d.winPct}% (${d.played})` : "—"}
                      </p>
                      {r.missing.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.missing.map((k) => <Badge key={k} tone="warn">{MISSING_LABEL[k]}</Badge>)}
                        </div>
                      )}
                    </div>
                    <div className="w-14 shrink-0 text-right">
                      <p className="text-lg font-bold tabular-nums text-ink">{r.score != null ? r.score.toFixed(1) : "—"}</p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${r.score ?? 0}%` }} />
                      </div>
                    </div>
                  </div>
                </Card>
                {cut && (
                  <p className="my-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                    <span className="h-px flex-1 bg-line" /> Squad size {camp.selection_target} <span className="h-px flex-1 bg-line" />
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-4 text-xs text-ink-soft">
        A guide for the selection conversation, not the decision. Coaches and players can't see this page or the weights.
      </p>
    </div>
  );
}
