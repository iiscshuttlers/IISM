import { useState } from "react";
import { HeartPulse } from "lucide-react";
import { toast } from "sonner";
import { useSaveWellness, useWellness } from "../lib/api";
import { readiness } from "../lib/insights";
import { errorText } from "../lib/supabase";
import { Button, Card, cx, today } from "./ui";
import type { Wellness } from "../lib/types";

type Key = "sleep" | "soreness" | "energy" | "mood";
const QUESTIONS: { key: Key; label: string; low: string; high: string }[] = [
  { key: "sleep", label: "Sleep", low: "Poor", high: "Great" },
  { key: "soreness", label: "Soreness", low: "None", high: "Very sore" },
  { key: "energy", label: "Energy", low: "Drained", high: "Full" },
  { key: "mood", label: "Mood", low: "Low", high: "Great" },
];

/** 10-second daily check-in. Only the player and the coaches can see answers. */
export function WellnessCheckin({ campId, meId }: { campId: string; meId: string }) {
  const wellness = useWellness(campId);
  const save = useSaveWellness(campId);
  const mine = (wellness.data ?? []).find((w) => w.person_id === meId && w.day === today());
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Record<Key, number | null>>({ sleep: null, soreness: null, energy: null, mood: null });

  if (wellness.isLoading) return null;

  if (mine && !editing) {
    const score = readiness(mine);
    return (
      <Card className="flex items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2">
          <HeartPulse size={18} className="text-brand" />
          <div>
            <p className="text-xs font-semibold text-ink">Checked in today · readiness {score}/100</p>
            <p className="text-[11px] text-ink-soft">Only you and the coaches see this.</p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => { setV({ sleep: mine.sleep, soreness: mine.soreness, energy: mine.energy, mood: mine.mood }); setEditing(true); }}>
          Edit
        </Button>
      </Card>
    );
  }

  // Not answered yet: a single line until the player chooses to answer.
  if (!mine && !open) {
    return (
      <Card className="flex items-center gap-3 p-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-pale text-brand">
          <HeartPulse size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">How are you today?</p>
          <p className="text-xs text-ink-soft">4 quick taps: sleep, soreness, energy, mood. Only coaches see it.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Answer</Button>
      </Card>
    );
  }

  const ready = QUESTIONS.every((q) => v[q.key] !== null);
  const submit = () => {
    const row: Wellness = { person_id: meId, day: today(), sleep: v.sleep!, soreness: v.soreness!, energy: v.energy!, mood: v.mood!, note: null };
    save.mutate(row, {
      onSuccess: () => { toast.success("Check-in saved"); setEditing(false); setOpen(false); },
      onError: (e) => toast.error(errorText(e)),
    });
  };

  return (
    <Card className="animate-pop-in space-y-2.5 p-3.5">
      <div className="flex items-center gap-2">
        <HeartPulse size={18} className="text-brand" />
        <p className="text-sm font-semibold text-ink">How are you today?</p>
        <span className="ml-auto text-[11px] text-ink-soft">Coaches only</span>
      </div>
      {QUESTIONS.map((q) => (
        <div key={q.key} className="flex items-center gap-2">
          <span className="w-16 text-xs font-medium text-ink">{q.label}</span>
          <div className="grid flex-1 grid-cols-5 gap-1" role="radiogroup" aria-label={q.label}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={v[q.key] === n}
                aria-label={`${q.label} ${n}${n === 1 ? ` (${q.low})` : n === 5 ? ` (${q.high})` : ""}`}
                onClick={() => setV({ ...v, [q.key]: n })}
                className={cx("h-9 rounded-lg text-sm font-bold transition",
                  v[q.key] === n ? "bg-brand text-white" : "bg-surface-2 text-ink-soft hover:bg-surface-3")}>
                {n}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[10px] text-ink-soft">1 = {QUESTIONS.map((q) => `${q.label.toLowerCase()} ${q.low.toLowerCase()}`).join(", ")}.</p>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => { setEditing(false); setOpen(false); }}>Cancel</Button>
        <Button className="flex-1" disabled={!ready || save.isPending} onClick={submit}>{save.isPending ? "Saving…" : "Save check-in"}</Button>
      </div>
    </Card>
  );
}
