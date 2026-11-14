import { Plus } from "lucide-react";
import { Button, Card, Sheet } from "./ui";
import type { DrillType } from "../lib/types";

export interface DrillTemplate {
  name: string;
  type: DrillType;
  duration: number;
  sets: number;
  reps: number;
  intensity: number;
  notes: string;
}

export const BADMINTON_DRILL_TEMPLATES: DrillTemplate[] = [
  {
    name: "6-Corner Shadow Footwork",
    type: "footwork",
    duration: 20,
    sets: 4,
    reps: 20,
    intensity: 4,
    notes: "Focus on split-step timing, low center of gravity, and swift push-off from base.",
  },
  {
    name: "Smash & Net-Kill Transition",
    type: "smash",
    duration: 25,
    sets: 5,
    reps: 15,
    intensity: 5,
    notes: "Rearcourt jump/stick smash followed by rapid front-court net kill.",
  },
  {
    name: "Multi-Shuttle 2-on-1 Defence",
    type: "multi_shuttle",
    duration: 30,
    sets: 6,
    reps: 25,
    intensity: 5,
    notes: "High tempo continuous feeding. Deep drive defense into opponent body or open corners.",
  },
  {
    name: "Low Serve & 3rd-Shot Attack",
    type: "serve_return",
    duration: 20,
    sets: 4,
    reps: 12,
    intensity: 3,
    notes: "Tight white-tape low serve, anticipatory step for interception or midcourt push.",
  },
  {
    name: "Spinning Net Tumbles & Brushes",
    type: "net",
    duration: 15,
    sets: 4,
    reps: 15,
    intensity: 3,
    notes: "Fine wrist slice, keeping contact point above net tape.",
  },
  {
    name: "Half-Court Singles Workouts",
    type: "match_play",
    duration: 30,
    sets: 2,
    reps: 21,
    intensity: 4,
    notes: "Patience, depth control, placement under fatigue.",
  },
  {
    name: "Court Interval Sprints & Core",
    type: "fitness",
    duration: 25,
    sets: 5,
    reps: 10,
    intensity: 5,
    notes: "Sideline-to-sideline suicides and core planks for explosive stability.",
  },
];

export function DrillTemplatesSheet({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (t: DrillTemplate) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Badminton Drill Routines">
      <div className="space-y-3">
        <p className="text-xs text-ink-soft">
          Pick a proven IISc camp training routine to add it directly to this session with 1 tap.
        </p>

        <div className="space-y-2">
          {BADMINTON_DRILL_TEMPLATES.map((t, idx) => (
            <Card key={idx} className="hover:border-brand/40 transition-colors p-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-sm text-ink">{t.name}</h4>
                  <div className="flex items-center gap-2 text-xs text-ink-soft mt-0.5">
                    <span className="capitalize font-medium text-brand">{t.type}</span>
                    <span>·</span>
                    <span>{t.duration} mins</span>
                    <span>·</span>
                    <span>{t.sets} sets × {t.reps} reps</span>
                    <span>·</span>
                    <span>Intensity {t.intensity}/5</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    onSelect(t);
                    onClose();
                  }}
                >
                  <Plus size={14} className="mr-1" />
                  Add
                </Button>
              </div>
              {t.notes && <p className="text-[11px] text-ink-soft mt-1.5 line-clamp-1">{t.notes}</p>}
            </Card>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
