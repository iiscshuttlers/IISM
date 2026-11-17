import { useState } from "react";
import { HeartPulse, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, ConfirmDialog, Field, Select, Sheet, Input, Textarea, cx, fmtDate } from "./ui";
import { PlayerSelect } from "./PlayerSelect";
import { errorText } from "../lib/supabase";
import { useInjuryMutations, useInjuryReports, type InjuryReport } from "../lib/sharedData";
import type { Member } from "../lib/types";

export function InjuryTrackerModal({
  campId,
  open,
  onClose,
  meId,
  isStaff,
  players,
}: {
  campId: string;
  open: boolean;
  onClose: () => void;
  meId: string | null;
  isStaff: boolean;
  players: Member[];
}) {
  // Players get their own reports, coaches everyone's (enforced by the database).
  const reportsQ = useInjuryReports(open ? campId : undefined);
  const mut = useInjuryMutations(campId);
  const reports = reportsQ.data ?? [];
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<InjuryReport | null>(null);

  // Form fields
  const [targetPersonId, setTargetPersonId] = useState(meId || "");
  const [bodyPart, setBodyPart] = useState("Right Shoulder");
  const [severity, setSeverity] = useState<InjuryReport["severity"]>("mild");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<InjuryReport["status"]>("new");
  const [staffNotes, setStaffNotes] = useState("");

  const onErr = (e: unknown) => toast.error(errorText(e));

  const resetForm = () => {
    setAdding(false);
    setEditingId(null);
    setNotes("");
    setStaffNotes("");
    setStatus("new");
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) return;
    const personId = isStaff ? targetPersonId || players[0]?.id || meId || "" : meId || "";
    if (!personId) {
      toast.error("Pick a player first.");
      return;
    }
    const wasEditing = !!editingId;
    const current = reports.find((r) => r.id === editingId);

    mut.save.mutate(
      {
        id: editingId ?? undefined,
        person_id: personId,
        body_part: bodyPart,
        severity,
        notes: notes.trim(),
        // Only coaches set these; the database ignores them from players.
        status: isStaff ? status : current?.status ?? "new",
        staff_notes: isStaff ? staffNotes.trim() || null : current?.staff_notes ?? null,
      },
      {
        onSuccess: () => {
          resetForm();
          toast.success(wasEditing ? "Report updated" : isStaff ? "Report added" : "Reported privately to your coaches");
        },
        onError: onErr,
      },
    );
  };

  const handleEdit = (r: InjuryReport) => {
    setEditingId(r.id);
    setTargetPersonId(r.person_id);
    setBodyPart(r.body_part);
    setSeverity(r.severity);
    setNotes(r.notes);
    setStatus(r.status);
    setStaffNotes(r.staff_notes || "");
    setAdding(true);
  };

  const handleDelete = () => {
    if (!deleting) return;
    const id = deleting.id;
    setDeleting(null);
    mut.remove.mutate(id, { onSuccess: () => toast.success("Record deleted"), onError: onErr });
  };

  const memberMap = new Map(players.map((p) => [p.id, p.full_name]));

  const activeCount = reports.filter((r) => r.status !== "cleared").length;

  return (
    <Sheet open={open} onClose={onClose} title="Private Injury &amp; Physical Check">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-ink-soft">
              {isStaff
                ? "Confidential injury board for coaches: review player soreness and assign modified workloads."
                : "Flag tightness, sprains, or pain privately. Only you and your coaches can see these reports."}
            </p>
            {isStaff && (
              <p className="text-[11px] font-semibold text-brand mt-0.5">
                {activeCount} active issue{activeCount === 1 ? "" : "s"} under management
              </p>
            )}
          </div>
          {!adding && (
            <Button size="sm" onClick={() => { resetForm(); setAdding(true); }}>
              <Plus size={14} /> Flag issue
            </Button>
          )}
        </div>

        {adding && (
          <form onSubmit={handleSave} className="p-3.5 rounded-xl border border-brand/30 bg-surface-2/60 space-y-3">
            <h4 className="text-xs font-bold text-ink">
              {editingId ? "Update Follow-up" : "Report Physical Issue (Private)"}
            </h4>

            {isStaff && (
              <Field label="Player">
                <PlayerSelect label="Player" players={players} value={targetPersonId} disabled={!!editingId} onChange={setTargetPersonId} />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Field label="Body Area">
                <Select value={bodyPart} onChange={(e) => setBodyPart(e.target.value)}>
                  <option value="Right Shoulder">Right Shoulder</option>
                  <option value="Left Shoulder">Left Shoulder</option>
                  <option value="Right Knee">Right Knee</option>
                  <option value="Left Knee">Left Knee</option>
                  <option value="Ankle / Achilles">Ankle / Achilles</option>
                  <option value="Lower Back">Lower Back</option>
                  <option value="Hamstring / Quad">Hamstring / Quad</option>
                  <option value="Wrist / Forearm">Wrist / Forearm</option>
                  <option value="Groin / Hip">Groin / Hip</option>
                  <option value="Other">Other</option>
                </Select>
              </Field>

              <Field label="Severity">
                <Select value={severity} onChange={(e) => setSeverity(e.target.value as InjuryReport["severity"])}>
                  <option value="mild">Mild (Stiffness / manageable)</option>
                  <option value="moderate">Moderate (Sharp pain on lunges)</option>
                  <option value="severe">Severe (Rest required / Medical)</option>
                </Select>
              </Field>
            </div>

            <Field label="Description & Symptoms">
              <Textarea
                required
                rows={2}
                maxLength={1000}
                placeholder="When did it start? How does it feel when jumping or lunging?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>

            {isStaff && (
              <div className="p-3 bg-surface rounded-lg border border-line space-y-2">
                <Field label="Staff Follow-up Status">
                  <Select value={status} onChange={(e) => setStatus(e.target.value as InjuryReport["status"])}>
                    <option value="new">New report (Pending check-in)</option>
                    <option value="reviewing">Reviewing with player</option>
                    <option value="modified_training">Modified training (No jump smashes / half-court)</option>
                    <option value="cleared">Cleared to play fully</option>
                  </Select>
                </Field>
                <Field label="Staff Clinical / Coaching Action">
                  <Input
                    maxLength={1000}
                    placeholder="e.g. Advised ice & compression; net drills only today"
                    value={staffNotes}
                    onChange={(e) => setStaffNotes(e.target.value)}
                  />
                </Field>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={mut.save.isPending}>
                {mut.save.isPending ? "Saving…" : "Save Report"}
              </Button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {reportsQ.isLoading ? (
            <p className="text-xs text-ink-soft text-center py-6">Loading…</p>
          ) : reports.length === 0 ? (
            <p className="text-xs text-ink-soft text-center py-6 border border-dashed border-line rounded-lg">
              {isStaff ? "No injury reports logged. Everyone is currently fit." : "You haven't reported anything. Flag an issue any time something hurts."}
            </p>
          ) : (
            reports.map((r) => {
              const isCleared = r.status === "cleared";
              const isSevere = r.severity === "severe";
              const isMod = r.severity === "moderate";
              const pName = memberMap.get(r.person_id) ?? "Player";

              return (
                <Card key={r.id} className="p-3 border-line space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className={cx(
                        "p-1.5 rounded-lg shrink-0 mt-0.5",
                        isCleared
                          ? "bg-status-success-bg text-status-success-text"
                          : isSevere
                          ? "bg-status-danger-bg text-status-danger-text"
                          : "bg-status-warn-bg text-status-warn-text"
                      )}>
                        <HeartPulse size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs text-ink">{r.body_part}</span>
                          {isStaff && <span className="text-xs font-semibold text-brand">({pName})</span>}
                          <span className={cx(
                            "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border",
                            isSevere
                              ? "bg-status-danger-bg text-status-danger-text border-status-danger-border"
                              : isMod
                              ? "bg-status-warn-bg text-status-warn-text border-status-warn-border"
                              : "bg-surface-2 text-ink-soft border-line"
                          )}>
                            {r.severity}
                          </span>
                          <Badge tone={isCleared ? "good" : r.status === "modified_training" ? "warn" : "brand"}>
                            {r.status.replace("_", " ")}
                          </Badge>
                        </div>
                        <p className="text-xs text-ink-soft mt-1 leading-relaxed">{r.notes}</p>
                        <p className="text-[10px] text-ink-soft mt-1">Reported {fmtDate(r.created_at)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="!p-1 text-ink-soft" onClick={() => handleEdit(r)}>
                        Update
                      </Button>
                      <button
                        type="button"
                        onClick={() => setDeleting(r)}
                        className="text-ink-soft hover:text-red-600 p-1 transition-colors"
                        aria-label={`Delete ${r.body_part} report`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {r.staff_notes && (
                    <div className="mt-2 p-2 rounded-lg bg-surface-2 border border-line flex items-start gap-1.5 text-xs">
                      <ShieldCheck size={14} className="text-brand shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-brand block text-[10px] uppercase">Staff Follow-up Note</span>
                        <p className="text-ink-soft text-[11px] leading-snug">{r.staff_notes}</p>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleting}
        title="Delete this report?"
        message={isStaff ? "The player's report and your follow-up notes are removed for good." : "Your coaches will no longer see it."}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </Sheet>
  );
}
