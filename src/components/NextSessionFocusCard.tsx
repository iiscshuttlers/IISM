import { useState, useEffect } from "react";
import { Target, CheckCircle2, Circle, Edit3, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Sheet } from "./ui";
import {
  getNextSessionFocus,
  saveNextSessionFocus,
  toggleNextSessionFocus,
  type NextSessionFocus,
} from "../lib/campExtended";

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
  const [focus, setFocus] = useState<NextSessionFocus | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const [assignedBy, setAssignedBy] = useState(isStaff ? "Coach" : "Self");

  const refresh = () => {
    if (campId && personId) {
      setFocus(getNextSessionFocus(campId, personId));
    } else {
      setFocus(null);
    }
  };

  useEffect(() => {
    refresh();
    const handleStorageChange = () => refresh();
    window.addEventListener("iism_extended_change", handleStorageChange);
    return () => window.removeEventListener("iism_extended_change", handleStorageChange);
  }, [campId, personId]);

  if (!personId) return null;

  const handleToggle = () => {
    if (!focus) return;
    const newState = !focus.completed;
    toggleNextSessionFocus(campId, personId, newState);
    refresh();
    if (newState) {
      toast.success("Great work locking in on your focus today! 🎯");
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customText.trim()) return;

    saveNextSessionFocus(
      campId,
      personId,
      customText.trim(),
      isStaff ? (assignedBy.trim() || "Coach") : "Self"
    );
    toast.success("Next session focus set!");
    setCustomText("");
    setModalOpen(false);
    refresh();
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
              disabled={!focus}
              className={`mt-0.5 shrink-0 transition-transform ${focus ? "cursor-pointer active:scale-95" : "cursor-default text-ink-soft"}`}
              title={focus ? (focus.completed ? "Mark incomplete" : "Mark completed today") : ""}
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
                    (Set by {focus.assigned_by})
                  </span>
                )}
                {focus?.completed && (
                  <span className="text-[10px] font-bold text-status-success-text bg-status-success-bg px-1.5 py-0.2 rounded border border-status-success-border">
                    Completed today!
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
                  No focus set for next practice. Turn a coach cue or technique note into 1 small goal!
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
        title={playerName ? `Set Next Focus for ${playerName}` : "Next Session Focus"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <p className="text-xs text-ink-soft">
            Keep it small and concrete: 1 specific cue or habit to concentrate on during today's drills and matches.
          </p>

          <div>
            <label className="text-xs font-semibold text-ink-soft block mb-1">
              Focus Statement <span className="text-status-danger-text">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="e.g. Keep racket head above tape level when waiting at the net."
              className="w-full text-xs rounded-lg border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {isStaff && (
            <div>
              <label className="text-xs font-semibold text-ink-soft block mb-1">Assigned By (Coach Name)</label>
              <input
                type="text"
                value={assignedBy}
                onChange={(e) => setAssignedBy(e.target.value)}
                placeholder="e.g. Coach Varla"
                className="w-full text-xs rounded-lg border border-line bg-surface px-3 py-2 text-ink"
              />
            </div>
          )}

          <div className="space-y-2 pt-2">
            <Button type="submit" className="w-full">
              Save Focus
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
