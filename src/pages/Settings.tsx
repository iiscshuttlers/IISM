import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../lib/session";
import { useAdminMutations, useRosterAdmin } from "../lib/api";
import { errorText } from "../lib/supabase";
import { Badge, Button, Card, Field, Input, PageTitle, Segmented, Select, Sheet, Toggle } from "../components/ui";
import { CsvExportCard } from "../components/CsvExport";
import type { RosterAdminRow, Role } from "../lib/types";

export default function SettingsPage() {
  const s = useSession();
  const camp = s.camp!;
  const roster = useRosterAdmin(camp.id, true);
  const mut = useAdminMutations(camp.id);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<RosterAdminRow | null>(null);
  const [details, setDetails] = useState({
    name: camp.name, starts_on: camp.starts_on ?? "", ends_on: camp.ends_on ?? "", selection_target: camp.selection_target,
  });
  const onErr = (e: unknown) => toast.error(errorText(e));
  const update = (patch: Parameters<typeof mut.updateCamp.mutate>[0], msg = "Saved") =>
    mut.updateCamp.mutate(patch, { onSuccess: () => toast.success(msg), onError: onErr });

  const rows = roster.data ?? [];
  const players = rows.filter((r) => r.role === "player");
  const staff = rows.filter((r) => r.role !== "player");
  const locked = !!camp.selection_locked_at;

  return (
    <div className="space-y-5">
      <PageTitle>Camp settings</PageTitle>

      <Card>
        <h2 className="mb-1 text-sm font-bold">Who can see this camp</h2>
        <p className="mb-3 text-xs text-ink-soft">The club app never sees any of this. These controls are for people inside the camp.</p>
        <Segmented
          value={camp.visibility}
          onChange={(v) => update({ visibility: v }, v === "staff" ? "Camp hidden from players" : "Camp visible to players")}
          options={[{ value: "members", label: "Players & coaches" }, { value: "staff", label: "Coaches only" }]}
        />
        <div className="mt-3 divide-y divide-line">
          <Toggle label="Players see all results & standings"
            hint="Off: each player sees only their own matches and their own standings row."
            checked={camp.players_see_all_results} disabled={camp.visibility === "staff"}
            onChange={(v) => update({ players_see_all_results: v })} />
          <Toggle label="Publish squad to players after lock"
            hint={locked ? "Players see selected and standby names (never coach notes)." : "Takes effect once you lock the squad on the Selection page."}
            checked={camp.publish_selection} disabled={camp.visibility === "staff"}
            onChange={(v) => update({ publish_selection: v })} />
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-bold">Activity updates</h2>
        <Toggle label="Activity on for the whole camp"
          hint="In-site updates when a match is recorded, edited, disputed or resolved. No emails or push."
          checked={camp.activity_enabled} onChange={(v) => update({ activity_enabled: v })} />
        <p className="mt-2 text-xs text-ink-soft">Turn it off for one person with the switch next to their name below.</p>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-bold">Camp details</h2>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          update({ name: details.name, starts_on: details.starts_on || null, ends_on: details.ends_on || null, selection_target: details.selection_target });
        }}>
          <Field label="Name"><Input required maxLength={80} value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Starts"><Input type="date" value={details.starts_on} onChange={(e) => setDetails({ ...details, starts_on: e.target.value })} /></Field>
            <Field label="Ends"><Input type="date" value={details.ends_on} onChange={(e) => setDetails({ ...details, ends_on: e.target.value })} /></Field>
            <Field label="Squad size" hint={locked ? "Locked with the squad" : undefined}>
              <Input type="number" min={1} max={100} disabled={locked} value={details.selection_target}
                onChange={(e) => setDetails({ ...details, selection_target: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={mut.updateCamp.isPending}>Save details</Button>
            <Button type="button" variant="ghost" onClick={() => update({ status: camp.status === "active" ? "closed" : "active" },
              camp.status === "active" ? "Camp closed: no new matches" : "Camp reopened")}>
              {camp.status === "active" ? "Close camp" : "Reopen camp"}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">Roster · {players.length} players, {staff.length} staff</h2>
          <Button size="sm" onClick={() => setAdding(true)}><Plus size={14} /> Add person</Button>
        </div>
        <p className="mb-3 text-xs text-ink-soft">
          You create every profile. Email is optional: add one only if that person should sign in with Google.
        </p>
        <div className="divide-y divide-line">
          {[...staff, ...players].map((r) => (
            <div key={r.person_id} className="flex items-center gap-2 py-2">
              <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(r)}>
                <p className="truncate text-sm font-semibold">
                  {r.full_name} {r.gender && <span className="font-normal text-ink-soft">({r.gender})</span>}
                </p>
                <p className="truncate text-xs text-ink-soft">
                  {r.email ? (r.signed_in ? `${r.email} · signed in` : `${r.email} · not signed in yet`) : "No login"}
                </p>
              </button>
              {r.role !== "player" && <Badge tone="brand">{r.role}</Badge>}
              <label className="flex items-center gap-1 text-xs text-ink-soft" title="Activity updates for this person">
                <input type="checkbox" checked={!r.activity_muted} aria-label={`Activity for ${r.full_name}`}
                  onChange={(e) => mut.setMuted.mutate({ person_id: r.person_id, muted: !e.target.checked }, { onError: onErr })} />
                Updates
              </label>
            </div>
          ))}
        </div>
      </Card>

      <CsvExportCard camp={camp} />

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add person">
        <PersonForm busy={mut.addPerson.isPending} submitLabel="Add to camp"
          onSubmit={(v) => mut.addPerson.mutate(v, {
            onSuccess: () => { toast.success(`${v.full_name} added`); setAdding(false); }, onError: onErr,
          })} />
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.full_name ?? ""}>
        {editing && (
          <div className="space-y-5">
            <PersonForm initial={editing} busy={mut.updatePerson.isPending || mut.setRole.isPending} submitLabel="Save"
              onSubmit={async (v) => {
                try {
                  await mut.updatePerson.mutateAsync({ person_id: editing.person_id, full_name: v.full_name, gender: v.gender, email: v.email });
                  if (v.role !== editing.role) await mut.setRole.mutateAsync({ person_id: editing.person_id, role: v.role });
                  toast.success("Saved");
                  setEditing(null);
                } catch (e) { onErr(e); }
              }} />
            {editing.person_id !== s.meId && (
              <Button variant="ghost" className="w-full text-red-600" onClick={() => {
                if (confirm(`Remove ${editing.full_name} from the camp?`)) {
                  mut.remove.mutate(editing.person_id, { onSuccess: () => { toast.success("Removed"); setEditing(null); }, onError: onErr });
                }
              }}>Remove from camp</Button>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function PersonForm({ initial, onSubmit, busy, submitLabel }: {
  initial?: RosterAdminRow;
  onSubmit: (v: { full_name: string; gender: string; email: string; role: Role }) => void;
  busy: boolean;
  submitLabel: string;
}) {
  const [v, setV] = useState({
    full_name: initial?.full_name ?? "", gender: initial?.gender ?? "", email: initial?.email ?? "", role: initial?.role ?? ("player" as Role),
  });
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...v, full_name: v.full_name.trim(), email: v.email.trim() }); }}>
      <Field label="Full name"><Input required maxLength={80} value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Gender">
          <Select value={v.gender} onChange={(e) => setV({ ...v, gender: e.target.value })}>
            <option value="">Not set</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </Select>
        </Field>
        <Field label="Role">
          <Select value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as Role })}>
            <option value="player">Player</option>
            <option value="coach">Coach</option>
            <option value="admin">Camp admin</option>
          </Select>
        </Field>
      </div>
      <Field label="Google email (optional)" hint={initial?.signed_in ? "Changing it signs out the current login link." : "Leave empty if they won't sign in."}>
        <Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} placeholder="name@gmail.com" />
      </Field>
      <Button type="submit" className="w-full" disabled={busy}>{submitLabel}</Button>
    </form>
  );
}
