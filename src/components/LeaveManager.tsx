import { useState } from "react";
import { CalendarOff, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { errorText } from "../lib/supabase";
import { useLeave, useLeaveMutations } from "../lib/sharedData";
import { LEAVE_REASONS, leaveDates, leaveReasonLabel, sortLeave, type LeaveReason, type PlayerLeave } from "../lib/leave";
import { PlayerSelect, type PickablePlayer } from "./PlayerSelect";
import { Badge, Button, Card, ConfirmDialog, Field, Input, Segmented, Sheet, Textarea, today } from "./ui";

/** Camp admin: mark the days a player has told you they'll be away. */
export function LeaveCard({ campId, players }: { campId: string; players: PickablePlayer[] }) {
  const leave = useLeave(campId);
  const mut = useLeaveMutations(campId);
  const [editing, setEditing] = useState<PlayerLeave | "new" | null>(null);
  const [removing, setRemoving] = useState<PlayerLeave | null>(null);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.full_name ?? "Former player";
  const day = today();
  const { current, past } = sortLeave(leave.data ?? [], day);
  const onErr = (e: unknown) => toast.error(errorText(e));

  const row = (l: PlayerLeave) => (
    <li key={l.id} className="flex items-start justify-between gap-2 py-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">
          {nameOf(l.person_id)}
          {l.starts_on <= day && day <= l.ends_on && <span className="ml-2 align-middle"><Badge tone="warn">Away today</Badge></span>}
        </p>
        <p className="text-xs text-ink-soft">
          {leaveDates(l)} · {leaveReasonLabel(l.reason)}{l.note ? ` · ${l.note}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        <button type="button" onClick={() => setEditing(l)} aria-label={`Change ${nameOf(l.person_id)}'s leave`}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-2">
          <Pencil size={15} />
        </button>
        <button type="button" onClick={() => setRemoving(l)} aria-label={`Remove ${nameOf(l.person_id)}'s leave`}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-2">
          <Trash2 size={15} />
        </button>
      </div>
    </li>
  );

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-bold"><CalendarOff size={15} /> Leave and exams</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            When a player tells you they'll be away, mark the days here. Sessions they miss on those days don't count
            against their attendance, and the pairing helper leaves them out. Coaches and the player can see it; only you can change it.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setEditing("new")} disabled={!players.length}>
          <Plus size={15} /> Add
        </Button>
      </div>

      {leave.isError ? (
        <p className="mt-3 text-xs text-status-danger-text">Couldn't load leave: {errorText(leave.error)}</p>
      ) : current.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">Nobody is on leave today or later.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">{current.map(row)}</ul>
      )}
      {past.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-ink-soft">Past leave ({past.length})</summary>
          <ul className="divide-y divide-line">{past.map(row)}</ul>
        </details>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Add leave" : "Change leave"}>
        {editing && (
          <LeaveForm
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? null : editing}
            players={players}
            busy={mut.save.isPending}
            onSubmit={(v) => mut.save.mutate(
              editing === "new" ? v : { ...v, id: editing.id },
              { onSuccess: () => { toast.success(editing === "new" ? "Leave added" : "Leave updated"); setEditing(null); }, onError: onErr },
            )}
          />
        )}
      </Sheet>

      <ConfirmDialog
        open={!!removing}
        title="Remove this leave?"
        message={removing ? `${nameOf(removing.person_id)}, ${leaveDates(removing)}. Sessions they missed on those days will count against their attendance again.` : ""}
        confirmLabel="Remove"
        onConfirm={() => {
          const l = removing!;
          setRemoving(null);
          mut.remove.mutate(l.id, { onSuccess: () => toast.success("Leave removed"), onError: onErr });
        }}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}

type LeaveValues = Pick<PlayerLeave, "person_id" | "starts_on" | "ends_on" | "reason" | "note">;

const MAX_DAYS = 90;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

function LeaveForm({ initial, players, busy, onSubmit }: {
  initial: PlayerLeave | null;
  players: PickablePlayer[];
  busy: boolean;
  onSubmit: (v: LeaveValues) => void;
}) {
  const [personId, setPersonId] = useState(initial?.person_id ?? "");
  const [from, setFrom] = useState(initial?.starts_on ?? today());
  const [to, setTo] = useState(initial?.ends_on ?? today());
  const [reason, setReason] = useState<LeaveReason>(initial?.reason ?? "exam");
  const [note, setNote] = useState(initial?.note ?? "");
  const problem =
    !personId ? "Choose a player."
      : !from || !to ? "Choose the dates."
      : to < from ? "The last day is before the first day."
      : daysBetween(from, to) > MAX_DAYS ? `Leave can be at most ${MAX_DAYS + 1} days. Add it in parts.`
      : null;

  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      if (problem) return;
      onSubmit({ person_id: personId, starts_on: from, ends_on: to, reason, note: note.trim() || null });
    }}>
      <Field label="Player">
        <PlayerSelect players={players} value={personId} onChange={setPersonId} label="Player on leave" disabled={!!initial} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First day away">
          <Input type="date" required value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} />
        </Field>
        <Field label="Last day away">
          <Input type="date" required value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <Field label="Reason">
        <Segmented<LeaveReason> value={reason} onChange={setReason} options={LEAVE_REASONS} />
      </Field>
      <Field label="Note" hint="Optional. The player and coaches can read it.">
        <Textarea value={note} maxLength={300} rows={2} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Mid-semester exams" />
      </Field>
      {problem && personId && <p className="text-xs text-status-danger-text">{problem}</p>}
      <Button type="submit" className="w-full" disabled={busy || !!problem}>
        {initial ? "Save changes" : "Add leave"}
      </Button>
    </form>
  );
}
