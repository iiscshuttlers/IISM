import { useState, useMemo } from "react";
import { BookOpen, Search, Filter, Plus, Target, Check, AlertTriangle, Dumbbell, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, ConfirmDialog, Sheet } from "./ui";
import { DEFAULT_SKILLS, type SkillTechnique } from "../lib/campExtended";
import { errorText } from "../lib/supabase";
import { useCustomSkillMutations, useCustomSkills, useNextFocusMutations } from "../lib/sharedData";

export function SkillLibrarySheet({
  open,
  onClose,
  campId,
  currentPersonId,
  isStaff,
}: {
  open: boolean;
  onClose: () => void;
  campId: string;
  currentPersonId?: string | null;
  isStaff?: boolean;
}) {
  // Built-in techniques plus the ones this camp's coaches added (shared with everyone).
  const customQ = useCustomSkills(open ? campId : undefined);
  const customMut = useCustomSkillMutations(campId);
  const focusMut = useNextFocusMutations(campId);
  const skills = useMemo(() => [...DEFAULT_SKILLS, ...(customQ.data ?? [])], [customQ.data]);
  const [deleting, setDeleting] = useState<SkillTechnique | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("ALL");
  const [difficulty, setDifficulty] = useState<string>("ALL");
  const [addingCustom, setAddingCustom] = useState(false);

  // New Custom Skill form state
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<SkillTechnique["category"]>("footwork");
  const [newDifficulty, setNewDifficulty] = useState<SkillTechnique["difficulty"]>("fundamental");
  const [newDesc, setNewDesc] = useState("");
  const [newCues, setNewCues] = useState("");
  const [newMistakes, setNewMistakes] = useState("");
  const [newDrill, setNewDrill] = useState("");

  const filteredSkills = useMemo(() => {
    return skills.filter((s) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.key_cues.some((c) => c.toLowerCase().includes(q)) ||
        s.suggested_drill.toLowerCase().includes(q);

      const matchCat = category === "ALL" || s.category === category;
      const matchDiff = difficulty === "ALL" || s.difficulty === difficulty;

      return matchSearch && matchCat && matchDiff;
    });
  }, [skills, search, category, difficulty]);

  const handleSetFocus = (skill: SkillTechnique) => {
    if (!currentPersonId) {
      toast.error("Please identify as a player first.");
      return;
    }
    const focusText = `Practice ${skill.title}: ${skill.key_cues[0] || skill.description}`.slice(0, 300);
    focusMut.set.mutate(
      { personId: currentPersonId, text: focusText, source: "skill_library" },
      {
        onSuccess: () => toast.success(`Set as next session focus: ${skill.title}`),
        onError: (e) => toast.error(errorText(e)),
      },
    );
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDesc.trim()) {
      toast.error("Please fill in title and description.");
      return;
    }
    const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 20);

    customMut.add.mutate(
      {
        title: newTitle.trim(),
        category: newCategory,
        difficulty: newDifficulty,
        description: newDesc.trim(),
        key_cues: lines(newCues),
        common_mistakes: lines(newMistakes),
        suggested_drill: newDrill.trim() || "Practice in 10-minute focused sets.",
      },
      {
        onSuccess: () => {
          toast.success("New technique & drill added for the whole camp");
          setAddingCustom(false);
          setNewTitle("");
          setNewDesc("");
          setNewCues("");
          setNewMistakes("");
          setNewDrill("");
        },
        onError: (err) => toast.error(errorText(err)),
      },
    );
  };

  const handleDelete = () => {
    if (!deleting) return;
    const s = deleting;
    setDeleting(null);
    customMut.remove.mutate(s.id, {
      onSuccess: () => toast.success(`${s.title} removed from the library`),
      onError: (err) => toast.error(errorText(err)),
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Camp Skill & Technique Library">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-ink-soft">
            Camp-approved technique blueprints, coaching cues, and structured practice drills.
          </p>
          {isStaff && !addingCustom && (
            <Button size="sm" variant="secondary" onClick={() => setAddingCustom(true)}>
              <Plus size={13} className="mr-1" />
              Add Drill
            </Button>
          )}
        </div>

        {/* Coach Custom Technique Creator */}
        {addingCustom && (
          <form onSubmit={handleAddCustom} className="p-3.5 rounded-xl bg-surface-2 border border-brand/30 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-ink uppercase tracking-wider">New Camp Technique Note</h4>
              <button
                type="button"
                onClick={() => setAddingCustom(false)}
                className="text-xs text-ink-soft hover:text-ink"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-ink-soft block mb-1">Technique Title</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Cross-Court Net Roll"
                  className="w-full text-xs rounded-lg border border-line bg-surface px-2.5 py-1.5 text-ink"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-ink-soft block mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as SkillTechnique["category"])}
                  className="w-full text-xs rounded-lg border border-line bg-surface px-2.5 py-1.5 text-ink"
                >
                  <option value="footwork">Footwork</option>
                  <option value="net">Net Play</option>
                  <option value="attack">Attack &amp; Smash</option>
                  <option value="defence">Defence</option>
                  <option value="serve_return">Serve &amp; Return</option>
                  <option value="doubles">Doubles Rotation</option>
                  <option value="tactics">Tactics</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-ink-soft block mb-1">Difficulty</label>
                <select
                  value={newDifficulty}
                  onChange={(e) => setNewDifficulty(e.target.value as SkillTechnique["difficulty"])}
                  className="w-full text-xs rounded-lg border border-line bg-surface px-2.5 py-1.5 text-ink"
                >
                  <option value="fundamental">Fundamental</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-ink-soft block mb-1">Overview Description</label>
              <textarea
                required
                rows={2}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Core biomechanics and purpose of this shot..."
                className="w-full text-xs rounded-lg border border-line bg-surface px-2.5 py-1.5 text-ink"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-ink-soft block mb-1">
                  Key Cues (1 per line)
                </label>
                <textarea
                  rows={2}
                  value={newCues}
                  onChange={(e) => setNewCues(e.target.value)}
                  placeholder="Elbow up&#10;Soft grip&#10;Recover to T"
                  className="w-full text-xs rounded-lg border border-line bg-surface px-2.5 py-1.5 text-ink"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-ink-soft block mb-1">
                  Common Mistakes (1 per line)
                </label>
                <textarea
                  rows={2}
                  value={newMistakes}
                  onChange={(e) => setNewMistakes(e.target.value)}
                  placeholder="Death grip&#10;Dropping racket head"
                  className="w-full text-xs rounded-lg border border-line bg-surface px-2.5 py-1.5 text-ink"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-ink-soft block mb-1">Suggested Drill Instructions</label>
              <input
                type="text"
                value={newDrill}
                onChange={(e) => setNewDrill(e.target.value)}
                placeholder="e.g. Feeder lifts cross; repeat 20 shuttles x 3 sets."
                className="w-full text-xs rounded-lg border border-line bg-surface px-2.5 py-1.5 text-ink"
              />
            </div>

            <Button size="sm" type="submit" className="w-full" disabled={customMut.add.isPending}>
              {customMut.add.isPending ? "Saving…" : "Save to Skill Library"}
            </Button>
          </form>
        )}

        {/* Search Bar & Filters */}
        <div className="space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search technique, cue, drill or category…"
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-line bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-ink-soft flex items-center gap-1 text-[11px] font-semibold mr-1">
              <Filter size={12} /> Category:
            </span>
            {["ALL", "attack", "defence", "net", "serve_return", "footwork", "doubles"].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize border transition-colors ${
                  category === cat
                    ? "bg-brand text-white border-brand"
                    : "bg-surface text-ink-soft hover:bg-surface-2 border-line"
                }`}
              >
                {cat === "ALL" ? "All" : cat.replace("_", " ")}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-ink-soft text-[11px] font-semibold mr-1">Level:</span>
            {["ALL", "fundamental", "intermediate", "advanced"].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setDifficulty(lvl)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize border transition-colors ${
                  difficulty === lvl
                    ? "bg-brand text-white border-brand"
                    : "bg-surface text-ink-soft hover:bg-surface-2 border-line"
                }`}
              >
                {lvl === "ALL" ? "All" : lvl}
              </button>
            ))}
          </div>
        </div>

        {/* Skills Cards List */}
        <div className="space-y-3 pt-1">
          {filteredSkills.length === 0 ? (
            <Card className="text-center py-6 text-xs text-ink-soft border-dashed">
              No technique matches your search. Try another keyword or filter.
            </Card>
          ) : (
            filteredSkills.map((skill) => (
              <Card key={skill.id} className="border hover:border-brand/40 transition-colors space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="font-bold text-sm text-ink">{skill.title}</h4>
                      <Badge tone="brand">{skill.category.replace("_", " ")}</Badge>
                      <span className="text-[10px] uppercase font-semibold text-ink-soft px-1.5 py-0.5 rounded bg-surface-2 border border-line">
                        {skill.difficulty}
                      </span>
                      {skill.is_custom && (
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
                          Camp Custom
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-soft mt-1">{skill.description}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {currentPersonId && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleSetFocus(skill)}
                        disabled={focusMut.set.isPending}
                        className="text-xs"
                        title="Set this technique as your focus for next practice"
                      >
                        <Target size={13} className="mr-1 text-brand" />
                        Focus Next
                      </Button>
                    )}
                    {isStaff && skill.is_custom && (
                      <button
                        type="button"
                        onClick={() => setDeleting(skill)}
                        className="p-1.5 text-ink-soft hover:text-red-600"
                        aria-label={`Delete ${skill.title}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Key Coaching Cues */}
                {skill.key_cues.length > 0 && (
                  <div className="bg-surface-2/60 p-2.5 rounded-lg border border-line/60">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-ink block mb-1">
                      Key Coaching Cues
                    </span>
                    <ul className="space-y-1">
                      {skill.key_cues.map((cue, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-xs text-ink">
                          <Check size={13} className="text-status-success-text shrink-0 mt-0.5" />
                          <span>{cue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Common Mistakes */}
                {skill.common_mistakes.length > 0 && (
                  <div className="text-xs">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-status-danger-text flex items-center gap-1 mb-1">
                      <AlertTriangle size={12} /> Avoid These Mistakes
                    </span>
                    <ul className="list-disc pl-4 space-y-0.5 text-ink-soft">
                      {skill.common_mistakes.map((m, idx) => (
                        <li key={idx}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Suggested Drill */}
                <div className="pt-2 border-t border-line flex items-start gap-2 text-xs">
                  <Dumbbell size={14} className="text-brand shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-ink">Practice Drill: </span>
                    <span className="text-ink-soft">{skill.suggested_drill}</span>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleting}
        title={`Remove ${deleting?.title ?? "this technique"}?`}
        message="It disappears from the skill library for everyone in the camp."
        confirmLabel="Remove"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </Sheet>
  );
}

export function SkillLibraryButton({
  onClick,
  className = "",
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick} className={className}>
      <BookOpen size={14} className="mr-1.5 text-brand" />
      <span>Skill & Drill Library</span>
    </Button>
  );
}
