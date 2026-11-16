import { useState } from "react";
import { toast } from "sonner";
import { Button, Field, Input, Sheet, Textarea, cx, fmtDate, today } from "./ui";
import { useStaffMutations } from "../lib/api";
import { errorText } from "../lib/supabase";
import type { Assessment } from "../lib/types";

export const ASSESS_AREAS = ["technique", "fitness", "tactics", "attitude"] as const;
type Area = (typeof ASSESS_AREAS)[number];
type Scores = Record<Area, number | null>;
type AssessmentInput = Omit<Assessment, "id" | "coach_id" | "person_id">;

const label = (a: Area) => a[0].toUpperCase() + a.slice(1);
const empty: Scores = { technique: null, fitness: null, tactics: null, attitude: null };

/** Four 1–5 ratings by tapping (tap the same number again to clear it), a date and a note. */
export function AssessmentForm({ history, busy, onSubmit }: {
  history: Pick<Assessment, "id" | "assessed_on" | "technique" | "fitness" | "tactics" | "attitude" | "note">[];
  busy: boolean;
  onSubmit: (a: AssessmentInput) => void;
}) {
  const [v, setV] = useState<Scores>(empty);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());
  const last = history[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-ink-soft">Visible to the camp admin and coaches only.</p>
        {last && (
          <button
            type="button"
            onClick={() => setV({ technique: last.technique, fitness: last.fitness, tactics: last.tactics, attitude: last.attitude })}
            className="shrink-0 text-xs font-semibold text-brand hover:underline"
          >
            Copy last scores
          </button>
        )}
      </div>

      <div className="space-y-2.5">
        {ASSESS_AREAS.map((k) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs font-semibold text-ink">{label(k)}</span>
            <div className="grid flex-1 grid-cols-5 gap-1" role="group" aria-label={label(k)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setV({ ...v, [k]: v[k] === n ? null : n })}
                  aria-pressed={v[k] === n}
                  aria-label={`${label(k)} ${n} of 5`}
                  className={cx(
                    "min-h-[40px] rounded-lg border text-sm font-bold transition active:scale-95",
                    v[k] === n ? "border-brand-border bg-brand-pale text-brand" : "border-line bg-surface text-ink-soft hover:text-ink",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Field label="Note (optional)">
        <Textarea value={note} maxLength={1000} rows={2} onChange={(e) => setNote(e.target.value)} placeholder="What you saw, what to work on" />
      </Field>
      <Field label="Date"><Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
      <Button
        className="w-full"
        disabled={busy || ASSESS_AREAS.every((k) => v[k] === null)}
        onClick={() => onSubmit({ assessed_on: date, ...v, note: note.trim() || null })}
      >
        {busy ? "Saving…" : "Save assessment"}
      </Button>

      {history.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-bold">Previous</h3>
          <ul className="space-y-1 text-xs text-ink-soft">
            {history.map((h) => (
              <li key={h.id}>
                {fmtDate(h.assessed_on)}: Technique {h.technique ?? "–"} · Fitness {h.fitness ?? "–"} · Tactics {h.tactics ?? "–"} · Attitude {h.attitude ?? "–"}
                {h.note && ` · ${h.note}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Assess one player from anywhere (Players page, player details). Staff only. */
export function AssessSheet({ campId, person, history, onClose }: {
  campId: string;
  person: { id: string; full_name: string } | null;
  history: Assessment[];
  onClose: () => void;
}) {
  const mut = useStaffMutations(campId);
  return (
    <Sheet open={!!person} onClose={onClose} title={`Assess ${person?.full_name ?? ""}`}>
      {person && (
        <AssessmentForm
          key={person.id}
          history={history.filter((a) => a.person_id === person.id)}
          busy={mut.addAssessment.isPending}
          onSubmit={(a) => mut.addAssessment.mutate({ person_id: person.id, ...a }, {
            onSuccess: () => { toast.success(`Assessment saved for ${person.full_name}`); onClose(); },
            onError: (e) => toast.error(errorText(e)),
          })}
        />
      )}
    </Sheet>
  );
}
