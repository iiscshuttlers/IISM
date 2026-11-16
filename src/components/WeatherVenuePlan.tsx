import { useState } from "react";
import { CloudSun, Wind, AlertCircle, Edit2, CheckCircle, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, Sheet } from "./ui";
import { useMembers } from "../lib/api";
import { errorText } from "../lib/supabase";
import { useSaveVenuePlan, useVenuePlan, type VenuePlan } from "../lib/sharedData";

const PLAN_LABEL: Record<VenuePlan["plan_type"], string> = {
  indoor_regular: "Indoor Plan (Active)",
  indoor_backup: "Rain Contingency Plan",
  outdoor_relocated: "Track Relocated",
  heat_warning: "Heat Advisory",
};

export function WeatherVenueBanner({
  campId,
  isStaff,
}: {
  campId: string;
  isStaff?: boolean;
}) {
  const planQ = useVenuePlan(campId);
  const members = useMembers(campId);
  const plan = planQ.data ?? null;
  const [editOpen, setEditOpen] = useState(false);

  if (planQ.isLoading) return null;

  // Nothing posted yet: players see nothing; coaches get a quiet prompt to post one.
  if (!plan) {
    if (!isStaff) return null;
    return (
      <>
        <Card className="flex items-center justify-between gap-3 border-dashed bg-surface-2/40 p-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <MapPin size={16} className="shrink-0 text-ink-soft" />
            <p className="text-xs text-ink-soft">No venue or conditions notice for players yet.</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)} className="shrink-0 text-xs">
            Post notice
          </Button>
        </Card>
        <WeatherPlanEditModal open={editOpen} onClose={() => setEditOpen(false)} campId={campId} currentPlan={null} />
      </>
    );
  }

  const isRelocated = plan.plan_type === "indoor_backup" || plan.plan_type === "outdoor_relocated";
  const isHeatWarning = plan.plan_type === "heat_warning";
  const tone: "brand" | "warn" | "bad" = isHeatWarning ? "bad" : isRelocated ? "warn" : "brand";
  const setBy = (members.data ?? []).find((m) => m.id === (plan.updated_by ?? plan.created_by))?.full_name ?? "Camp staff";

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
                <Badge tone={tone}>{PLAN_LABEL[plan.plan_type]}</Badge>
                <span className="font-bold text-xs text-ink">{plan.venue_name}</span>
                <span className="text-[11px] text-ink-soft font-mono flex items-center gap-1">
                  <Wind size={11} /> Shuttle: <strong>{plan.shuttle_speed}</strong>
                </span>
              </div>

              {plan.athlete_notice && <p className="text-xs text-ink font-medium">{plan.athlete_notice}</p>}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-soft">
                {plan.weather_summary && (
                  <>
                    <span>{plan.weather_summary}</span>
                    <span>·</span>
                  </>
                )}
                <span>Set by {setBy}</span>
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

      {isStaff && (
        <WeatherPlanEditModal
          // Re-seed the form whenever someone else changes the plan.
          key={plan.updated_at ?? plan.created_at}
          open={editOpen}
          onClose={() => setEditOpen(false)}
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
  currentPlan: VenuePlan | null;
}) {
  const save = useSaveVenuePlan(campId);
  const [planType, setPlanType] = useState<VenuePlan["plan_type"]>(currentPlan?.plan_type ?? "indoor_regular");
  const [venueName, setVenueName] = useState(currentPlan?.venue_name ?? "");
  const [weatherSummary, setWeatherSummary] = useState(currentPlan?.weather_summary ?? "");
  const [shuttleSpeed, setShuttleSpeed] = useState<VenuePlan["shuttle_speed"]>(currentPlan?.shuttle_speed ?? "77 (Medium)");
  const [athleteNotice, setAthleteNotice] = useState(currentPlan?.athlete_notice ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate(
      {
        plan_type: planType,
        venue_name: venueName.trim(),
        weather_summary: weatherSummary.trim(),
        shuttle_speed: shuttleSpeed,
        athlete_notice: athleteNotice.trim(),
      },
      {
        onSuccess: () => {
          toast.success("Venue & conditions updated for everyone");
          onClose();
        },
        onError: (err) => toast.error(errorText(err)),
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Venue & Weather-Aware Planning">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-ink-soft">
          Keep the squad informed of court conditions, weather relocations, and equipment recommendations.
          Everyone in the camp sees this on their Today page.
        </p>

        <div>
          <label htmlFor="venue-plan-type" className="text-xs font-semibold text-ink-soft block mb-1">Plan Condition</label>
          <select
            id="venue-plan-type"
            value={planType}
            onChange={(e) => setPlanType(e.target.value as VenuePlan["plan_type"])}
            className="w-full text-xs rounded-lg border border-line bg-surface px-3 py-2 text-ink"
          >
            <option value="indoor_regular">Indoor Courts Normal (No issues)</option>
            <option value="indoor_backup">Rain Relocation / Indoor Backup</option>
            <option value="outdoor_relocated">Track / Outdoor Warmup Relocated</option>
            <option value="heat_warning">Heat Advisory (Extended hydrate intervals)</option>
          </select>
        </div>

        <div>
          <label htmlFor="venue-plan-name" className="text-xs font-semibold text-ink-soft block mb-1">Active Venue / Courts</label>
          <input
            id="venue-plan-name"
            type="text"
            required
            maxLength={120}
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            placeholder="e.g. IISc Gymkhana Indoor Hall (Courts 1–4)"
            className="w-full text-xs rounded-lg border border-line bg-surface px-3 py-2 text-ink"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="venue-plan-weather" className="text-xs font-semibold text-ink-soft block mb-1">Atmosphere / Temperature</label>
            <input
              id="venue-plan-weather"
              type="text"
              maxLength={200}
              value={weatherSummary}
              onChange={(e) => setWeatherSummary(e.target.value)}
              placeholder="e.g. Indoor 26°C · 70% Humidity"
              className="w-full text-xs rounded-lg border border-line bg-surface px-3 py-2 text-ink"
            />
          </div>

          <div>
            <label htmlFor="venue-plan-shuttle" className="text-xs font-semibold text-ink-soft block mb-1">Recommended Shuttle Speed</label>
            <select
              id="venue-plan-shuttle"
              value={shuttleSpeed}
              onChange={(e) => setShuttleSpeed(e.target.value as VenuePlan["shuttle_speed"])}
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
          <label htmlFor="venue-plan-notice" className="text-xs font-semibold text-ink-soft block mb-1">
            Player Guidance Notice
          </label>
          <textarea
            id="venue-plan-notice"
            rows={3}
            maxLength={1000}
            value={athleteNotice}
            onChange={(e) => setAthleteNotice(e.target.value)}
            placeholder="e.g. Rain expected: Bring dry change of socks, indoor court shoes only. Sprints moved inside."
            className="w-full text-xs rounded-lg border border-line bg-surface px-3 py-2 text-ink"
          />
        </div>

        <Button type="submit" className="w-full" disabled={save.isPending}>
          <CheckCircle size={14} className="mr-1.5" />
          <span>{save.isPending ? "Saving…" : "Save & Share With Camp"}</span>
        </Button>
      </form>
    </Sheet>
  );
}
