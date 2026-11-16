import { useState } from "react";
import { Target, CheckCircle2, Circle, Edit3, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Sheet } from "./ui";
import { useMembers } from "../lib/api";
import { errorText } from "../lib/supabase";
import { useNextFocus, useNextFocusMutations } from "../lib/sharedData";

export function NextSessionFocusCard({
  campId,
  personId,
  playerName,
  isStaff,
  onOpenSkills,
}: {
  campId: string;
  personId: string | null;
  playerName?: string;
  isStaff?: boolean;
  onOpenSkills?: () => void;
}) {
  const focusQ = useNextFocus(campId, personId);
  const members = useMembers(campId);
  const mut = useNextFocusMutations(campId);
  const focus = focusQ.data ?? null;
  const [modalOpen, setModalOpen] = useState(false);
  const [customText, setCustomText] = useState("");

  if (!personId) return null;

  const setter = (members.data ?? []).find((m) => m.id === focus?.set_by);
  const setByLabel = !focus
    ? ""
    : focus.set_by === personId
    ? "you"
    : setter
    ? setter.role === "player" ? setter.full_name : `Coach ${setter.full_name}`
    : "your coach";

  const handleToggle = () => {
    if (!focus) return;
    const completed = !focus.completed;
    mut.setCompleted.mutate(
      { personId, completed },
      {
        onSuccess: () => {
          if (completed) toast.success("Great work locking in on your focus today! 🎯");
        },
        onError: (e) => toast.error(errorText(e)),
      },
    );
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customText.trim()) return;
    mut.set.mutate(
      { personId, text: customText },
      {
        onSuccess: () => {
          toast.success("Next session focus set!");
          setCustomText("");
          setModalOpen(false);
        },
        onError: (err) => toast.error(errorText(err)),
      },
    );
  };

  return (
    <>
      <Card
        className={`border transition-all ${
          focus?.completed
            ? "bg-status-success-bg/20 border-status-success-border"
            : focus
            ? "bg-brand/5 border-brand/30"
            : "bg-surface-2/60 border-line"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            <button
              type="button"
              onClick={handleToggle}
              disabled={!focus || mut.setCompleted.isPending}
              className={`mt-0.5 shrink-0 transition-transform ${focus ? "cursor-pointer active:scale-95" : "cursor-default text-ink-soft"}`}
              aria-label={focus ? (focus.completed ? "Mark focus not done" : "Mark focus done") : "No focus set"}
            >
              {focus?.completed ? (
                <CheckCircle2 size={18} className="text-status-success-text" />
              ) : focus ? (
                <Circle size={18} className="text-brand hover:text-brand-hover" />
              ) : (
                <Target size={18} className="text-ink-soft" />
              )}
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand">
                  🎯 Next Session Focus
                </span>
                {focus && (
                  <span className="text-[10px] text-ink-soft">
                    (Set by {setByLabel}{focus.source === "skill_library" ? " from the skill library" : ""})
                  </span>
                )}
                {focus?.completed && (
                  <span className="text-[10px] font-bold text-status-success-text bg-status-success-bg px-1.5 py-0.2 rounded border border-status-success-border">
                    Done!
                  </span>
                )}
              </div>

              {focus ? (
                <p
                  className={`text-xs font-semibold mt-0.5 leading-snug ${
                    focus.completed ? "line-through text-ink-soft" : "text-ink"
                  }`}
                >
                  {focus.focus_text}
                </p>
              ) : (
                <p className="text-xs text-ink-soft mt-0.5">
                  {focusQ.isLoading
                    ? "Loading…"
                    : "No focus set for next practice. Turn a coach cue or technique note into 1 small goal!"}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {focus ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setCustomText(focus.focus_text);
                  setModalOpen(true);
                }}
                className="text-xs !py-1"
                title="Edit focus"
              >
                <Edit3 size={12} className="mr-1" />
                Change
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setModalOpen(true)}
                className="text-xs !py-1"
              >
                <Plus size={12} className="mr-1" />
                Set Focus
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Focus Setter Modal */}
      <Sheet
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={playerName && isStaff ? `Set Next Focus for ${playerName}` : "Next Session Focus"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <p className="text-xs text-ink-soft">
            Keep it small and concrete: 1 specific cue or habit to concentrate on during today's drills and matches.
            {isStaff && " Your name is shown as the coach who set it."}
          </p>

          <div>
            <label htmlFor="next-focus-text" className="text-xs font-semibold text-ink-soft block mb-1">
              Focus Statement <span className="text-status-danger-text">*</span>
            </label>
            <textarea
              id="next-focus-text"
              required
              rows={3}
              maxLength={300}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="e.g. Keep racket head above tape level when waiting at the net."
              className="w-full text-xs rounded-lg border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          <div className="space-y-2 pt-2">
            <Button type="submit" className="w-full" disabled={mut.set.isPending}>
              {mut.set.isPending ? "Saving…" : "Save Focus"}
            </Button>

            {onOpenSkills && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setModalOpen(false);
                  onOpenSkills();
                }}
                className="w-full text-xs"
              >
                Browse Skill Library for Ideas
              </Button>
            )}
          </div>
        </form>
      </Sheet>
    </>
  );
}
