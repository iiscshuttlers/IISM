import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../lib/session";
import {
  useAssessments, useAttendance, useDrills, useMatches, useMembers, useSelection, useSessions, useStaffMutations, useStandings,
} from "../lib/api";
import { errorText } from "../lib/supabase";
import { Check } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, Field, Input, PageTitle, Segmented, Select, Sheet, Textarea, cx, fmtDate } from "../components/ui";
import { PlayerDetailSheet } from "../components/PlayerDetail";
import { AssessSheet } from "../components/Assessment";
import type { SelectionRow } from "../lib/types";

type Decision = SelectionRow["decision"];
type SortBy = "rating" | "coach" | "attendance" | "name";

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
  const [confirmLock, setConfirmLock] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("rating");
  /** Per-player note save state, so coaches can see a note was stored. */
  const [noteState, setNoteState] = useState<Record<string, "saving" | "saved">>({});
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
    });
  }, [members.data, standings.data, sessions.data, drills.data, attendance.data, assessments.data, selection.data]);

  const sortValue = (r: (typeof board)[number]): number =>
    sortBy === "coach" ? (r.avgAssessment ? Number(r.avgAssessment) : -1)
      : sortBy === "attendance" ? r.attendancePct ?? -1
      : r.rating;
  const rows = board
    .filter((r) => gender === "all" || r.gender === gender)
    .filter((r) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "undecided") return !r.decision;
      return r.decision === statusFilter;
    })
    .sort((a, b) => (sortBy === "name" ? a.full_name.localeCompare(b.full_name) : sortValue(b) - sortValue(a) || b.rating - a.rating));
  const undecidedCount = board.filter((r) => !r.decision).length;
  const selectedCount = board.filter((r) => r.decision === "selected").length;
  const selectedM = board.filter((r) => r.decision === "selected" && r.gender === "M").length;
  const selectedF = board.filter((r) => r.decision === "selected" && r.gender === "F").length;

  const decide = (personId: string, decision: Decision | "", note: string | null) => {
    if (!decision) mut.clearDecision.mutate(personId, { onError: onErr });
    else mut.setDecision.mutate({ person_id: personId, decision, note }, { onError: onErr });
  };

  const standbyCount = board.filter((r) => r.decision === "standby").length;
  const requestLock = () => {
    if (selectedCount !== camp.selection_target) {
      toast.error(`Select exactly ${camp.selection_target} players before locking (${selectedCount} selected).`);
      return;
    }
    setConfirmLock(true);
  };

  const saveNote = (personId: string, decision: Decision, note: string | null) => {
    setNoteState((s) => ({ ...s, [personId]: "saving" }));
    mut.setDecision.mutate({ person_id: personId, decision, note }, {
      onSuccess: () => {
        setNoteState((s) => ({ ...s, [personId]: "saved" }));
        window.setTimeout(() => setNoteState((s) => {
          const { [personId]: _done, ...rest } = s;
          return rest;
        }), 2500);
      },
      onError: (e) => {
        setNoteState((s) => {
          const { [personId]: _failed, ...rest } = s;
          return rest;
        });
        onErr(e);
      },
    });
  };

  return (
    <div>
      {/* Only the camp admin locks and unlocks; coaches get an explanation instead of a dead button. */}
      <PageTitle action={
        !s.isAdmin ? undefined
          : locked
          ? <Button variant="secondary" onClick={() => { setUnlockReason(""); setUnlocking(true); }}><Unlock size={16} /> Unlock</Button>
          : <Button onClick={requestLock} disabled={mut.lock.isPending}><Lock size={16} /> Lock squad</Button>
      }>Selection</PageTitle>
      {!s.isAdmin && (
        <p className="mb-3 text-xs text-ink-soft">
          {locked ? "The squad is locked. Only the camp admin can unlock it." : "Only the camp admin can lock the squad, once exactly " + camp.selection_target + " players are selected."}
        </p>
      )}

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
              selectedCount === camp.selection_target ? "bg-brand" : selectedCount > camp.selection_target ? "bg-status-danger-text" : "bg-brand/70"
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
              { value: "undecided", label: `Undecided (${undecidedCount})` },
            ]}
          />
        </div>
      </div>
      <div className="mb-3 flex items-center gap-2 overflow-x-auto">
        <span className="shrink-0 text-xs font-semibold text-ink-soft">Sort by</span>
        <Segmented<SortBy>
          value={sortBy}
          onChange={setSortBy}
          options={[
            { value: "rating", label: "Rating" },
            { value: "coach", label: "Coach score" },
            { value: "attendance", label: "Attendance" },
            { value: "name", label: "Name" },
          ]}
        />
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <Card key={r.id} className={cx(r.decision === "selected" && "border-brand-border bg-brand-pale/15")}>
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
                  if (r.decision && v !== r.note) saveNote(r.id, r.decision, v);
                }} />
              <Button size="sm" variant="secondary" onClick={() => setAssessing(r.id)}>Assess</Button>
            </div>
            {noteState[r.id] && (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-ink-soft" aria-live="polite">
                {noteState[r.id] === "saving" ? "Saving note…" : <><Check size={12} className="text-status-success-text" /> Note saved</>}
              </p>
            )}
          </Card>
        ))}
      </div>

      <AssessSheet
        campId={camp.id}
        person={board.find((r) => r.id === assessing) ?? null}
        history={assessments.data ?? []}
        onClose={() => setAssessing(null)}
      />

      <ConfirmDialog
        open={confirmLock}
        tone="brand"
        title="Lock the squad?"
        message={
          `${selectedCount} selected (${selectedM} men, ${selectedF} women)` +
          (standbyCount ? `, ${standbyCount} on standby` : "") +
          ". Decisions are frozen until you unlock with a reason, which is kept in the audit log. " +
          (camp.publish_selection
            ? "Publish squad is on, so players will see the squad straight away."
            : "Players won't see it until you turn on Publish squad in Settings.")
        }
        confirmLabel="Lock squad"
        onConfirm={() => {
          setConfirmLock(false);
          mut.lock.mutate(undefined, { onSuccess: () => toast.success("Squad locked"), onError: onErr });
        }}
        onCancel={() => setConfirmLock(false)}
      />

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
        campId={camp.id}
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
