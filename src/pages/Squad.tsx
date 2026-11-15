import { Trophy } from "lucide-react";
import { useSession } from "../lib/session";
import { useSquad } from "../lib/api";
import { Badge, Card, Empty, PageTitle } from "../components/ui";

/** Read-only published squad. Members see it only once the admin locks and publishes it. */
export default function SquadPage() {
  const s = useSession();
  const squad = useSquad(s.camp!.id);
  const rows = (squad.data ?? []).filter((r) => r.decision !== "not_selected");
  const published = rows.length > 0 && rows[0].published;
  const selected = rows.filter((r) => r.decision === "selected");
  const standby = rows.filter((r) => r.decision === "standby");

  const isMeSelected = selected.some((r) => r.person_id === s.meId);
  const isMeStandby = standby.some((r) => r.person_id === s.meId);

  if (squad.isLoading) return <p className="text-sm text-ink-soft">Loading…</p>;
  if (!published && !s.isStaff) {
    return (
      <div>
        <PageTitle>Squad</PageTitle>
        <Empty>The squad hasn't been announced yet. It will appear here when the coaches publish it.</Empty>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <PageTitle>Squad</PageTitle>
      {s.isStaff && !published && (
        <p className="mb-2 text-xs text-ink-soft">Preview: players can't see this until you lock and publish the squad in Settings.</p>
      )}

      {/* Celebratory badge for selected players */}
      {isMeSelected && (
        <Card className="border-status-success-border bg-status-success-bg">
          <div className="flex items-center gap-2 font-bold text-sm text-status-success-text">
            <Trophy size={18} className="text-status-success-text" />
            <span>Congratulations! You made the squad</span>
          </div>
          <p className="text-xs text-ink-soft mt-1">
            You have been officially selected to represent the IISc Badminton Team.
          </p>
        </Card>
      )}

      {isMeStandby && (
        <Card className="border-status-warn-border bg-status-warn-bg">
          <p className="font-semibold text-sm text-status-warn-text">You are on the Standby roster</p>
          <p className="text-xs text-ink-soft mt-0.5">Stay match-ready and keep up training sessions.</p>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 text-sm font-bold">Selected ({selected.length})</h2>
        {selected.length === 0 ? <p className="text-sm text-ink-soft">None yet.</p> : (
          <ul className="space-y-1.5">
            {selected.map((r) => (
              <li key={r.person_id} className="flex items-center justify-between text-sm py-1 border-b border-line/50 last:border-0">
                <span className="font-semibold text-ink">
                  {r.full_name}{r.person_id === s.meId && <span className="text-brand font-bold ml-1.5">(You)</span>}
                </span>
                {r.gender && <Badge tone="brand">{r.gender === "M" ? "Men" : "Women"}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {standby.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-bold">Standby ({standby.length})</h2>
          <ul className="space-y-1.5">
            {standby.map((r) => (
              <li key={r.person_id} className="flex items-center justify-between text-sm py-1 border-b border-line/50 last:border-0">
                <span className="text-ink">
                  {r.full_name}{r.person_id === s.meId && <span className="text-amber-600 font-bold ml-1.5">(You)</span>}
                </span>
                {r.gender && <Badge>{r.gender === "M" ? "Men" : "Women"}</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
