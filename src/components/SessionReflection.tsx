import { useState, useEffect } from "react";
import { MessageSquare, Flame, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, ConfirmDialog, Sheet, today } from "./ui";
import { errorText } from "../lib/supabase";
import { useReflectionMutations, useReflections, type SessionReflection } from "../lib/sharedData";
import type { Session } from "../lib/types";

export function SessionReflectionModal({
  open,
  onClose,
  campId,
  personId,
  playerName,
  sessions = [],
}: {
  open: boolean;
  onClose: () => void;
  campId: string;
  personId: string | null;
  playerName?: string;
  sessions?: Session[];
}) {
  // Your own reflections; coaches can read players' reflections too (enforced by the database).
  const reflectionsQ = useReflections(open ? campId : undefined, personId);
  const mut = useReflectionMutations(campId);
  const reflections = reflectionsQ.data ?? [];
  const [wentWell, setWentWell] = useState("");
  const [toWorkOn, setToWorkOn] = useState("");
  const [effortRpe, setEffortRpe] = useState<number>(6);
  const [energyLevel, setEnergyLevel] = useState<"high" | "normal" | "low">("normal");
  const [sessionId, setSessionId] = useState<string>("");
  const [deleting, setDeleting] = useState<SessionReflection | null>(null);
  const submitting = mut.add.isPending;

  // Set default session if available
  useEffect(() => {
    if (sessions.length > 0 && !sessionId) {
      setSessionId(sessions[0].id);
    }
  }, [sessions, sessionId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personId) {
      toast.error("Please identify as a player first.");
      return;
    }
    if (!wentWell.trim() || !toWorkOn.trim()) {
      toast.error("Please write what went well and what to work on.");
      return;
    }

    const session = sessions.find((x) => x.id === sessionId);
    mut.add.mutate(
      {
        person_id: personId,
        session_id: session?.id ?? null,
        session_date: session?.session_date ?? today(),
        went_well: wentWell.trim(),
        to_work_on: toWorkOn.trim(),
        effort_rpe: effortRpe,
        energy_level: energyLevel,
      },
      {
        onSuccess: () => {
          toast.success("Post-practice reflection saved!");
          setWentWell("");
          setToWorkOn("");
        },
        onError: (err) => toast.error(errorText(err)),
      },
    );
  };

  const handleDelete = () => {
    if (!deleting) return;
    const id = deleting.id;
    setDeleting(null);
    mut.remove.mutate(id, {
      onSuccess: () => toast.success("Reflection removed."),
      onError: (err) => toast.error(errorText(err)),
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={playerName ? `${playerName} — Post-Practice Check-in` : "Session Reflection"}
    >
      <div className="space-y-6">
        <p className="text-xs text-ink-soft">
          Take 2 minutes to lock in what you learned today. Honest self-reflection accelerates your match intuition and court fitness.
        </p>

        {/* Reflection Form */}
        <form onSubmit={handleSubmit} className="space-y-4 p-4 rounded-xl bg-surface-2/60 border border-line">
          <h4 className="text-xs font-bold text-ink-soft uppercase tracking-wider flex items-center gap-1.5">
            <MessageSquare size={14} className="text-brand" />
            <span>Today's Check-in</span>
          </h4>

          {/* Session Selector (if available) */}
          {sessions.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1">Training Session</label>
              <select
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                className="w-full text-xs rounded-lg border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s.session_date})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Question 1: What went well */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              1. What went well today? <span className="text-status-danger-text">*</span>
            </label>
            <p className="text-[11px] text-ink-soft mb-1.5">
              A solid shot, good tactical patience, footwork adjustment, or consistent serves.
            </p>
            <textarea
              value={wentWell}
              onChange={(e) => setWentWell(e.target.value)}
              rows={2}
              required
              placeholder="e.g. My backhand net tumbled cleanly and I stayed patient during long rallies."
              className="w-full text-xs rounded-lg border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Question 2: What to work on */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              2. What do you want to work on next? <span className="text-status-danger-text">*</span>
            </label>
            <p className="text-[11px] text-ink-soft mb-1.5">
              The primary focus for your next drill or match play.
            </p>
            <textarea
              value={toWorkOn}
              onChange={(e) => setToWorkOn(e.target.value)}
              rows={2}
              required
              placeholder="e.g. Quicker split-step recovery when opponent lifts cross-court."
              className="w-full text-xs rounded-lg border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Question 3: Effort (RPE) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-ink flex items-center gap-1">
                <Flame size={13} className="text-amber-500" />
                <span>3. How hard was your effort? (RPE 1–10)</span>
              </label>
              <span className="text-xs font-bold font-mono text-brand bg-brand/10 px-2 py-0.5 rounded">
                {effortRpe} / 10
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1 text-center">
              {[
                { rpe: 2, label: "Light (1-2)" },
                { rpe: 4, label: "Moderate (3-4)" },
                { rpe: 6, label: "Hard (5-6)" },
                { rpe: 8, label: "Very Hard (7-8)" },
                { rpe: 10, label: "Max Out (9-10)" },
              ].map((tier) => (
                <button
                  key={tier.rpe}
                  type="button"
                  onClick={() => setEffortRpe(tier.rpe)}
                  className={`p-1.5 rounded text-[10px] font-semibold transition-colors border ${
                    Math.abs(effortRpe - tier.rpe) <= 1
                      ? "bg-brand text-white border-brand"
                      : "bg-surface text-ink-soft hover:bg-surface-2 border-line"
                  }`}
                >
                  {tier.label}
                </button>
              ))}
            </div>
          </div>

          {/* Question 4: Energy Level */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Energy Level</label>
            <div className="flex gap-2">
              {[
                { key: "high" as const, label: "⚡ High Energy" },
                { key: "normal" as const, label: "👍 Normal" },
                { key: "low" as const, label: "💤 Fatigued / Sore" },
              ].map((lvl) => (
                <button
                  key={lvl.key}
                  type="button"
                  onClick={() => setEnergyLevel(lvl.key)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    energyLevel === lvl.key
                      ? "bg-brand/10 border-brand text-brand"
                      : "bg-surface border-line text-ink-soft hover:bg-surface-2"
                  }`}
                >
                  {lvl.label}
                </button>
              ))}
            </div>
          </div>

          <Button type="submit" disabled={submitting} className="w-full">
            <CheckCircle2 size={14} className="mr-1.5" />
            <span>{submitting ? "Saving Check-in…" : "Submit Post-Practice Check-in"}</span>
          </Button>
        </form>

        {/* Previous Reflections History */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-ink-soft uppercase tracking-wider">
            Past Reflections ({reflections.length})
          </h4>

          {reflectionsQ.isLoading ? (
            <p className="text-center py-5 text-xs text-ink-soft">Loading…</p>
          ) : reflections.length === 0 ? (
            <Card className="text-center py-5 text-xs text-ink-soft border-dashed">
              No reflections logged yet. Submit your first check-in above after practice!
            </Card>
          ) : (
            <div className="space-y-2.5">
              {reflections.map((r) => (
                <Card key={r.id} className="text-xs space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-ink-soft border-b border-line pb-1.5">
                    <span className="font-semibold text-ink">
                      {new Date(`${r.session_date}T00:00:00`).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold">
                        Effort: {r.effort_rpe}/10
                      </span>
                      <span className="capitalize">{r.energy_level}</span>
                      <button
                        type="button"
                        onClick={() => setDeleting(r)}
                        className="text-ink-soft hover:text-status-danger-text p-0.5"
                        aria-label="Delete reflection"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-status-success-text block">
                        What went well:
                      </span>
                      <p className="text-ink">{r.went_well}</p>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-brand block mt-1.5">
                        Focus next:
                      </span>
                      <p className="text-ink">{r.to_work_on}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleting}
        title="Delete this reflection?"
        message="It can't be recovered."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </Sheet>
  );
}

export function SessionReflectionBanner({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Card className="bg-gradient-to-r from-brand/10 to-surface border-brand/30 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center text-brand shrink-0">
          <MessageSquare size={16} />
        </div>
        <div>
          <h4 className="text-xs font-bold text-ink">Post-Practice Check-in</h4>
          <p className="text-[11px] text-ink-soft">Log what went well, focus next time, and effort score.</p>
        </div>
      </div>
      <Button size="sm" variant="secondary" onClick={onClick} className="shrink-0 text-xs">
        Reflect
      </Button>
    </Card>
  );
}
