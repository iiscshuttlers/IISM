import { useState, useEffect } from "react";
import { CloudSun, Wind, AlertCircle, Edit2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, Sheet } from "./ui";
import {
  getWeatherVenuePlan,
  saveWeatherVenuePlan,
  type WeatherVenuePlan,
} from "../lib/campExtended";

export function WeatherVenueBanner({
  campId,
  isStaff,
}: {
  campId: string;
  isStaff?: boolean;
}) {
  const [plan, setPlan] = useState<WeatherVenuePlan | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const refresh = () => {
    if (campId) {
      setPlan(getWeatherVenuePlan(campId));
    }
  };

  useEffect(() => {
    refresh();
    const handleStorageChange = () => refresh();
    window.addEventListener("iism_extended_change", handleStorageChange);
    return () => window.removeEventListener("iism_extended_change", handleStorageChange);
  }, [campId]);

  if (!plan) return null;

  const isRelocated = plan.plan_type === "indoor_backup" || plan.plan_type === "outdoor_relocated";
  const isHeatWarning = plan.plan_type === "heat_warning";

  const getTone = (): "brand" | "warn" | "bad" => {
    if (isHeatWarning) return "bad";
    if (isRelocated) return "warn";
    return "brand";
  };

  return (
    <>
      <Card
        className={`border transition-colors ${
          isRelocated
            ? "bg-amber-500/5 border-amber-500/30"
            : isHeatWarning
            ? "bg-status-danger-bg/20 border-status-danger-border"
            : "bg-surface-2/70 border-line"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                isRelocated
                  ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                  : isHeatWarning
                  ? "bg-status-danger-bg text-status-danger-text"
                  : "bg-brand/10 text-brand"
              }`}
            >
              {isRelocated || isHeatWarning ? <AlertCircle size={16} /> : <CloudSun size={16} />}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge tone={getTone()}>
                  {plan.plan_type === "indoor_regular"
                    ? "Indoor Plan (Active)"
                    : plan.plan_type === "indoor_backup"
                    ? "Rain Contingency Plan"
                    : plan.plan_type === "outdoor_relocated"
                    ? "Track Relocated"
                    : "Heat Advisory"}
                </Badge>
                <span className="font-bold text-xs text-ink">{plan.venue_name}</span>
                <span className="text-[11px] text-ink-soft font-mono flex items-center gap-1">
                  <Wind size={11} /> Shuttle: <strong>{plan.shuttle_speed}</strong>
                </span>
              </div>

              <p className="text-xs text-ink font-medium">{plan.athlete_notice}</p>

              <div className="flex items-center gap-3 text-[11px] text-ink-soft">
                <span>{plan.weather_summary}</span>
                <span>·</span>
                <span>Set by {plan.updated_by}</span>
              </div>
            </div>
          </div>

          {isStaff && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEditOpen(true)}
              className="text-xs shrink-0"
              title="Update venue & weather plan"
            >
              <Edit2 size={12} className="mr-1" />
              Change
            </Button>
          )}
        </div>
      </Card>

      {/* Staff Editor Modal */}
      {isStaff && (
        <WeatherPlanEditModal
          open={editOpen}
          onClose={() => {
            setEditOpen(false);
            refresh();
          }}
          campId={campId}
          currentPlan={plan}
        />
      )}
    </>
  );
}

export function WeatherPlanEditModal({
  open,
  onClose,
  campId,
  currentPlan,
}: {
  open: boolean;
  onClose: () => void;
  campId: string;
  currentPlan: WeatherVenuePlan;
}) {
  const [planType, setPlanType] = useState(currentPlan.plan_type);
  const [venueName, setVenueName] = useState(currentPlan.venue_name);
  const [weatherSummary, setWeatherSummary] = useState(currentPlan.weather_summary);
  const [shuttleSpeed, setShuttleSpeed] = useState(currentPlan.shuttle_speed);
  const [athleteNotice, setAthleteNotice] = useState(currentPlan.athlete_notice);
  const [updatedBy, setUpdatedBy] = useState(currentPlan.updated_by || "Head Coach");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveWeatherVenuePlan(campId, {
      camp_id: campId,
      plan_type: planType,
      venue_name: venueName.trim(),
      weather_summary: weatherSummary.trim(),
      shuttle_speed: shuttleSpeed,
      athlete_notice: athleteNotice.trim(),
      updated_by: updatedBy.trim() || "Staff",
      updated_at: new Date().toISOString(),
    });
    toast.success("Venue & weather plan updated for all players!");
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Venue & Weather-Aware Planning">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-ink-soft">
          Keep the squad informed of court conditions, weather relocations, and equipment recommendations.
        </p>

        <div>
          <label className="text-xs font-semibold text-ink-soft block mb-1">Plan Condition</label>
          <select
            value={planType}
            onChange={(e) => setPlanType(e.target.value as WeatherVenuePlan["plan_type"])}
            className="w-full text-xs rounded-lg border border-line bg-surface px-3 py-2 text-ink"
          >
            <option value="indoor_regular">Indoor Courts Normal (No issues)</option>
            <option value="indoor_backup">Rain Relocation / Indoor Backup</option>
            <option value="outdoor_relocated">Track / Outdoor Warmup Relocated</option>
            <option value="heat_warning">Heat Advisory (Extended hydrate intervals)</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-ink-soft block mb-1">Active Venue / Courts</label>
          <input
            type="text"
            required
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            placeholder="e.g. IISc Gymkhana Indoor Hall (Courts 1–4)"
            className="w-full text-xs rounded-lg border border-line bg-surface px-3 py-2 text-ink"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-ink-soft block mb-1">Atmosphere / Temperature</label>
            <input
              type="text"
              required
              value={weatherSummary}
              onChange={(e) => setWeatherSummary(e.target.value)}
              placeholder="e.g. Indoor 26°C · 70% Humidity"
              className="w-full text-xs rounded-lg border border-line bg-surface px-3 py-2 text-ink"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-soft block mb-1">Recommended Shuttle Speed</label>
            <select
              value={shuttleSpeed}
              onChange={(e) => setShuttleSpeed(e.target.value as WeatherVenuePlan["shuttle_speed"])}
              className="w-full text-xs rounded-lg border border-line bg-surface px-3 py-2 text-ink"
            >
              <option value="76 (Slow)">76 (Slow - Warm / High Humidity)</option>
              <option value="77 (Medium)">77 (Medium - Normal Gymkhana)</option>
              <option value="78 (Fast)">78 (Fast - Cool / High Altitude)</option>
              <option value="Standard">Standard Tournament Grade</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-ink-soft block mb-1">
            Player Guidance Notice <span className="text-status-danger-text">*</span>
          </label>
          <textarea
            required
            rows={3}
            value={athleteNotice}
            onChange={(e) => setAthleteNotice(e.target.value)}
            placeholder="e.g. Rain expected: Bring dry change of socks, indoor court shoes only. Sprints moved inside."
            className="w-full text-xs rounded-lg border border-line bg-surface px-3 py-2 text-ink"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-ink-soft block mb-1">Staff Member Name</label>
          <input
            type="text"
            value={updatedBy}
            onChange={(e) => setUpdatedBy(e.target.value)}
            className="w-full text-xs rounded-lg border border-line bg-surface px-3 py-2 text-ink"
          />
        </div>

        <Button type="submit" className="w-full">
          <CheckCircle size={14} className="mr-1.5" />
          <span>Save & Broadcast Venue Plan</span>
        </Button>
      </form>
    </Sheet>
  );
}
