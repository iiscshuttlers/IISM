import { useState } from "react";
import { CheckCircle2, Clock, Plus, Target, Trash2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, ConfirmDialog, Field, Input, Select, Textarea, cx, fmtDate } from "./ui";
import { errorText } from "../lib/supabase";
import { useGoalMutations, usePlayerGoals, type PlayerGoal } from "../lib/sharedData";

export function PlayerGoalsSection({
  campId,
  personId,
  isCoach,
  playerName,
}: {
  campId: string;
  personId: string;
  isCoach: boolean;
  playerName?: string;
}) {
  const goalsQ = usePlayerGoals(campId, personId);
  const mut = useGoalMutations(campId);
  const goals = goalsQ.data ?? [];
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PlayerGoal | null>(null);
  const onErr = (e: unknown) => toast.error(errorText(e));

  // Form state
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<PlayerGoal["category"]>("technique");
  const [targetDate, setTargetDate] = useState("");
  const [status, setStatus] = useState<PlayerGoal["status"]>("in_progress");
  const [coachFeedback, setCoachFeedback] = useState("");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const wasEditing = !!editingId;
    const current = goals.find((g) => g.id === editingId);

    mut.save.mutate(
      {
        id: editingId ?? undefined,
        person_id: personId,
        title: title.trim(),
        category,
        target_date: targetDate || null,
        status,
        // Coach-only; the database keeps the existing feedback when a player saves.
        coach_feedback: isCoach ? coachFeedback.trim() || null : current?.coach_feedback ?? null,
      },
      {
        onSuccess: () => {
          setAdding(false);
          setEditingId(null);
          setTitle("");
          setTargetDate("");
          setStatus("in_progress");
          setCoachFeedback("");
          toast.success(wasEditing ? "Goal updated" : "Goal saved");
        },
        onError: onErr,
      },
    );
  };

  const handleEdit = (g: PlayerGoal) => {
    setEditingId(g.id);
    setTitle(g.title);
    setCategory(g.category);
    setTargetDate(g.target_date || "");
    setStatus(g.status);
    setCoachFeedback(g.coach_feedback || "");
    setAdding(true);
  };

  const handleDelete = () => {
    if (!deleting) return;
    const id = deleting.id;
    setDeleting(null);
    mut.remove.mutate(id, { onSuccess: () => toast.success("Goal deleted"), onError: onErr });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 font-bold text-xs text-ink">
            <Target size={15} className="text-brand" />
            <span>{playerName ? `${playerName}'s Camp Goals` : "Camp Goals & Progress"}</span>
          </div>
          <p className="text-[11px] text-ink-soft">
            Focus areas for technique, fitness, tactics, and coach check-ins.
          </p>
        </div>
        {!adding && goals.length < 5 && (
          <Button size="sm" variant="secondary" onClick={() => { setEditingId(null); setTitle(""); setAdding(true); }}>
            <Plus size={14} /> Add goal
          </Button>
        )}
      </div>

      {adding && (
        <form onSubmit={handleSave} className="p-3 rounded-xl border border-brand/30 bg-surface-2/60 space-y-2.5">
          <p className="text-xs font-bold text-ink">{editingId ? "Edit Goal" : "New Camp Goal"}</p>
          <Field label="Goal focus">
            <Input
              required
              maxLength={120}
              placeholder="e.g. Master cross-court net tumble & recovery"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Category">
              <Select value={category} onChange={(e) => setCategory(e.target.value as PlayerGoal["category"])}>
                <option value="technique">Technique</option>
                <option value="fitness">Fitness & Speed</option>
                <option value="tactics">Tactics / Matchplay</option>
                <option value="mental">Mental & Focus</option>
              </Select>
            </Field>
            <Field label="Target date (optional)">
              <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </Field>
          </div>

          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as PlayerGoal["status"])}>
              <option value="in_progress">In Progress</option>
              <option value="achieved">Achieved</option>
              <option value="needs_work">Needs Work / Revisit</option>
            </Select>
          </Field>

          {isCoach && (
            <Field label="Coach check-in notes & feedback">
              <Textarea
                rows={2}
                placeholder="Give constructive feedback on this goal..."
                value={coachFeedback}
                onChange={(e) => setCoachFeedback(e.target.value)}
              />
            </Field>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setAdding(false); setEditingId(null); }}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={mut.save.isPending}>
              {mut.save.isPending ? "Saving…" : "Save Goal"}
            </Button>
          </div>
        </form>
      )}

      {goalsQ.isLoading ? (
        <p className="text-xs text-ink-soft text-center py-4">Loading goals…</p>
      ) : goals.length === 0 ? (
        <p className="text-xs text-ink-soft text-center py-4 border border-dashed border-line rounded-lg">
          No goals logged yet. Setting 1–3 clear goals helps coaches direct focus during practice.
        </p>
      ) : (
        <div className="space-y-2">
          {goals.map((g) => {
            const isAchieved = g.status === "achieved";
            const isNeedsWork = g.status === "needs_work";
            return (
              <Card key={g.id} className="p-3 border-line space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="shrink-0 mt-0.5">
                      {isAchieved ? (
                        <CheckCircle2 size={16} className="text-status-success-text" />
                      ) : isNeedsWork ? (
                        <Clock size={16} className="text-status-warn-text" />
                      ) : (
                        <Target size={16} className="text-brand" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-surface-2 border border-line text-ink-soft">
                          {g.category}
                        </span>
                        <span className={cx(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                          isAchieved
                            ? "bg-status-success-bg text-status-success-text border-status-success-border"
                            : isNeedsWork
                            ? "bg-status-warn-bg text-status-warn-text border-status-warn-border"
                            : "bg-brand-pale text-brand border-brand-border"
                        )}>
                          {g.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-ink mt-1">{g.title}</p>
                      {g.target_date && (
                        <p className="text-[10px] text-ink-soft mt-0.5">Target: {fmtDate(g.target_date)}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="!p-1 text-ink-soft hover:text-brand" onClick={() => handleEdit(g)}>
                      Edit
                    </Button>
                    <button type="button" onClick={() => setDeleting(g)} aria-label={`Delete goal ${g.title}`} className="p-1 text-ink-soft hover:text-red-600 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {g.coach_feedback && (
                  <div className="mt-2 p-2 rounded-lg bg-surface-2 border border-line flex items-start gap-2 text-xs">
                    <MessageSquare size={13} className="text-brand shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-brand block text-[10px] uppercase">Coach Feedback</span>
                      <p className="text-ink-soft text-[11px] leading-snug">{g.coach_feedback}</p>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Delete this goal?"
        message={deleting ? `"${deleting.title}" and any coach feedback on it will be removed.` : undefined}
        confirmLabel="Delete goal"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
