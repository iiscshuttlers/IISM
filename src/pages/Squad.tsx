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
    <div>
      <PageTitle>Squad</PageTitle>
      {s.isStaff && !published && (
        <p className="mb-3 text-xs text-ink-soft">Preview: players can't see this until you lock and publish the squad.</p>
      )}
      <Card className="mb-3">
        <h2 className="mb-2 text-sm font-bold">Selected ({selected.length})</h2>
        {selected.length === 0 ? <p className="text-sm text-ink-soft">None yet.</p> : (
          <ul className="space-y-1">
            {selected.map((r) => (
              <li key={r.person_id} className="flex items-center justify-between text-sm">
                <span className="font-semibold">{r.full_name}{r.person_id === s.meId && " (you)"}</span>
                {r.gender && <Badge>{r.gender === "M" ? "Men" : "Women"}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {standby.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-bold">Standby ({standby.length})</h2>
          <ul className="space-y-1">
            {standby.map((r) => (
              <li key={r.person_id} className="text-sm">{r.full_name}{r.person_id === s.meId && " (you)"}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
