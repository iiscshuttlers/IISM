import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../lib/session";
import {
  useAssessments, useAttendance, useDrills, useMatches, useMembers, useSelection, useSessions, useStaffMutations, useStandings,
} from "../lib/api";
import { errorText } from "../lib/supabase";
import { Badge, Button, Card, Field, Input, PageTitle, Segmented, Select, Sheet, Textarea, cx, fmtDate, today } from "../components/ui";
import { PlayerDetailSheet } from "../components/PlayerDetail";
import type { SelectionRow } from "../lib/types";

type Decision = SelectionRow["decision"];

export default function SelectionPage() {
  const s = useSession();
  const camp = s.camp!;
  const members = useMembers(camp.id);
  const standings = useStandings(camp.id);
  const matches = useMatches(camp.id);
  const sessions = useSessions(camp.id);
  const ids = (sessions.data ?? []).map((x) => x.id);
  const drills = useDrills(ids);
  const attendance = useAttendance(ids);
  const assessments = useAssessments(camp.id, true);
  const selection = useSelection(camp.id, true);
  const mut = useStaffMutations(camp.id);
  const [gender, setGender] = useState<"all" | "M" | "F">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "selected" | "standby" | "not_selected" | "undecided">("all");
  const [assessing, setAssessing] = useState<string | null>(null);
  const [inspectingPlayer, setInspectingPlayer] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  const locked = !!camp.selection_locked_at;
  const onErr = (e: unknown) => toast.error(errorText(e));

  const board = useMemo(() => {
    const players = (members.data ?? []).filter((m) => m.role === "player");
    const sessCount = (sessions.data ?? []).length;
    const minutesBySession: Record<string, number> = {};
    for (const d of drills.data ?? []) minutesBySession[d.session_id] = (minutesBySession[d.session_id] ?? 0) + (d.duration_min ?? 0);
    return players.map((p) => {
      const st = (standings.data ?? []).find((r) => r.person_id === p.id);
      const att = (attendance.data ?? []).filter((a) => a.person_id === p.id);
      const attended = att.filter((a) => a.status !== "absent");
      const rpes = attended.map((a) => a.rpe).filter((x): x is number => x != null);
      const asmt = (assessments.data ?? []).filter((a) => a.person_id === p.id);
      const scores = asmt.flatMap((a) => [a.technique, a.fitness, a.tactics, a.attitude]).filter((x): x is number => x != null);
      const sel = (selection.data ?? []).find((r) => r.person_id === p.id);
      return {
        ...p,
        rating: st?.rating ?? 1200,
        played: st?.played ?? 0,
        winPct: st?.played ? Math.round((100 * st.won) / st.played) : null,
        attendancePct: sessCount ? Math.round((100 * attended.length) / sessCount) : null,
        drillMinutes: attended.reduce((t, a) => t + (minutesBySession[a.session_id] ?? 0), 0),
        avgRpe: rpes.length ? (rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(1) : null,
        avgAssessment: scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null,
        assessmentCount: asmt.length,
        decision: sel?.decision ?? null,
        note: sel?.note ?? null,
      };
    }).sort((a, b) => b.rating - a.rating);
  }, [members.data, standings.data, sessions.data, drills.data, attendance.data, assessments.data, selection.data]);

  const rows = board
    .filter((r) => gender === "all" || r.gender === gender)
    .filter((r) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "undecided") return !r.decision;
      return r.decision === statusFilter;
    });
  const selectedCount = board.filter((r) => r.decision === "selected").length;
  const selectedM = board.filter((r) => r.decision === "selected" && r.gender === "M").length;
  const selectedF = board.filter((r) => r.decision === "selected" && r.gender === "F").length;

  const decide = (personId: string, decision: Decision | "", note: string | null) => {
    if (!decision) mut.clearDecision.mutate(personId, { onError: onErr });
    else mut.setDecision.mutate({ person_id: personId, decision, note }, { onError: onErr });
  };

  return (
    <div>
      <PageTitle action={
        locked
          ? <Button variant="secondary" onClick={() => { setUnlockReason(""); setUnlocking(true); }} disabled={!s.isAdmin}><Unlock size={16} /> Unlock</Button>
          : <Button onClick={() => mut.lock.mutate(undefined, { onSuccess: () => toast.success("Squad locked"), onError: onErr })}
              disabled={!s.isAdmin || mut.lock.isPending}><Lock size={16} /> Lock squad</Button>
      }>Selection</PageTitle>

      <Card className="mb-3 space-y-2 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className={cx("font-bold text-base", selectedCount === camp.selection_target ? "text-brand" : "text-ink")}>
              {selectedCount} / {camp.selection_target} selected
            </span>
            <span className="text-xs text-ink-soft">({selectedM} men · {selectedF} women)</span>
          </div>

          <div className="flex items-center gap-2">
            {locked
              ? <Badge tone="good">Locked {fmtDate(camp.selection_locked_at!.slice(0, 10))}{camp.publish_selection ? " · published" : " · not published"}</Badge>
              : <Badge>Draft — only staff can see this</Badge>}
            <Link href="/insights" className="text-xs font-semibold text-brand hover:underline">Compare &amp; insights</Link>
            {s.isAdmin && locked && !camp.publish_selection && (
              <Link href="/settings" className="text-xs font-semibold text-brand hover:underline">Publish to players</Link>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-surface-2 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              selectedCount === camp.selection_target ? "bg-brand" : selectedCount > camp.selection_target ? "bg-red-500" : "bg-brand/70"
            }`}
            style={{ width: `${Math.min(100, (selectedCount / camp.selection_target) * 100)}%` }}
          />
        </div>
      </Card>

      <div className="mb-3 flex flex-col sm:flex-row gap-2">
        <div className="w-full sm:w-48">
          <Segmented value={gender} onChange={setGender}
            options={[{ value: "all", label: "All" }, { value: "M", label: "Men" }, { value: "F", label: "Women" }]} />
        </div>
        <div className="flex-1 overflow-x-auto">
          <Segmented
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as typeof statusFilter)}
            options={[
              { value: "all", label: "All Status" },
              { value: "selected", label: `Selected (${selectedCount})` },
              { value: "standby", label: `Standby (${board.filter(b => b.decision === "standby").length})` },
              { value: "not_selected", label: "Not selected" },
              { value: "undecided", label: "Undecided" },
            ]}
          />
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <Card key={r.id} className={cx(r.decision === "selected" && "border-brand/60")}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <button
                  type="button"
                  onClick={() => setInspectingPlayer(r.id)}
                  className="font-semibold text-ink hover:text-brand transition-colors text-left flex items-center gap-1.5"
                >
                  <span>{r.full_name}</span>
                  {r.gender && <span className="text-xs text-ink-soft">({r.gender})</span>}
                </button>
                <div className="mt-1 grid grid-cols-3 gap-x-4 gap-y-0.5 text-xs text-ink-soft sm:grid-cols-6">
                  <span>Rating <b className="text-ink">{r.rating}</b></span>
                  <span>Win <b className="text-ink">{r.winPct != null ? `${r.winPct}%` : "—"}</b> ({r.played})</span>
                  <span>Attend <b className="text-ink">{r.attendancePct != null ? `${r.attendancePct}%` : "—"}</b></span>
                  <span>Drills <b className="text-ink">{r.drillMinutes}m</b></span>
                  <span>RPE <b className="text-ink">{r.avgRpe ?? "—"}</b></span>
                  <span>Coach <b className="text-ink">{r.avgAssessment ?? "—"}</b>/5 ({r.assessmentCount})</span>
                </div>
              </div>
              <Select aria-label={`Decision for ${r.full_name}`} className="!w-36 shrink-0" disabled={locked}
                value={r.decision ?? ""} onChange={(e) => decide(r.id, e.target.value as Decision | "", r.note)}>
                <option value="">Undecided</option>
                <option value="selected">Selected</option>
                <option value="standby">Standby</option>
                <option value="not_selected">Not selected</option>
              </Select>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Input aria-label={`Note for ${r.full_name}`} placeholder={r.decision ? "Private note (staff only)" : "Choose a decision to add a note"}
                disabled={locked || !r.decision} defaultValue={r.note ?? ""} key={`${r.id}-${r.note}`} maxLength={500}
                onBlur={(e) => {
                  const v = e.target.value.trim() || null;
                  if (r.decision && v !== r.note) decide(r.id, r.decision, v);
                }} />
              <Button size="sm" variant="secondary" onClick={() => setAssessing(r.id)}>Assess</Button>
            </div>
          </Card>
        ))}
      </div>

      <Sheet open={!!assessing} onClose={() => setAssessing(null)}
        title={`Assess ${board.find((r) => r.id === assessing)?.full_name ?? ""}`}>
        {assessing && (
          <AssessmentForm
            history={(assessments.data ?? []).filter((a) => a.person_id === assessing)}
            busy={mut.addAssessment.isPending}
            onSubmit={(a) => mut.addAssessment.mutate({ person_id: assessing, ...a }, {
              onSuccess: () => { toast.success("Assessment saved"); setAssessing(null); }, onError: onErr,
            })} />
        )}
      </Sheet>

      <Sheet open={unlocking} onClose={() => setUnlocking(false)} title="Unlock squad">
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">Unlocking lets coaches change decisions again. The reason is kept in the audit log.</p>
          <Field label="Reason"><Textarea value={unlockReason} maxLength={500} onChange={(e) => setUnlockReason(e.target.value)} /></Field>
          <Button className="w-full" disabled={!unlockReason.trim() || mut.unlock.isPending}
            onClick={() => mut.unlock.mutate(unlockReason, { onSuccess: () => { setUnlocking(false); toast.success("Squad unlocked"); }, onError: onErr })}>
            Unlock
          </Button>
        </div>
      </Sheet>

      <PlayerDetailSheet
        personId={inspectingPlayer}
        onClose={() => setInspectingPlayer(null)}
        members={members.data ?? []}
        standings={standings.data ?? []}
        matches={matches.data ?? []}
        attendance={attendance.data ?? []}
        assessments={assessments.data ?? []}
        isStaff={true}
      />
    </div>
  );
}

const AREAS = ["technique", "fitness", "tactics", "attitude"] as const;

function AssessmentForm({ history, busy, onSubmit }: {
  history: { id: string; assessed_on: string; technique: number | null; fitness: number | null; tactics: number | null; attitude: number | null; note: string | null }[];
  busy: boolean;
  onSubmit: (a: { assessed_on: string; technique: number | null; fitness: number | null; tactics: number | null; attitude: number | null; note: string | null }) => void;
}) {
  const [v, setV] = useState<Record<(typeof AREAS)[number], string>>({ technique: "", fitness: "", tactics: "", attitude: "" });
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());
  const n = (x: string) => (x ? Number(x) : null);
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-soft">Visible to the camp admin and coaches only.</p>
      <div className="grid grid-cols-2 gap-3">
        {AREAS.map((k) => (
          <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
            <Select value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
          </Field>
        ))}
      </div>
      <Field label="Date"><Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Note"><Textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></Field>
      <Button className="w-full" disabled={busy || AREAS.every((k) => !v[k])}
        onClick={() => onSubmit({ assessed_on: date, technique: n(v.technique), fitness: n(v.fitness), tactics: n(v.tactics), attitude: n(v.attitude), note: note.trim() || null })}>
        Save assessment
      </Button>
      {history.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-bold">Previous</h3>
          <ul className="space-y-1 text-xs text-ink-soft">
            {history.map((h) => (
              <li key={h.id}>
                {fmtDate(h.assessed_on)}: T{h.technique ?? "–"} F{h.fitness ?? "–"} Ta{h.tactics ?? "–"} A{h.attitude ?? "–"}
                {h.note && ` · ${h.note}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
