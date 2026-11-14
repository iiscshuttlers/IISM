import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../lib/session";
import { useAdminMutations, useRosterAdmin } from "../lib/api";
import { errorText } from "../lib/supabase";
import { Badge, Button, Card, ConfirmDialog, Field, Input, PageTitle, Segmented, Select, Sheet, Toggle } from "../components/ui";
import { CsvExportCard } from "../components/CsvExport";
import type { RosterAdminRow, Role } from "../lib/types";

export default function SettingsPage() {
  const s = useSession();
  const camp = s.camp!;
  const roster = useRosterAdmin(camp.id, true);
  const mut = useAdminMutations(camp.id);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<RosterAdminRow | null>(null);
  const [confirmDeletePerson, setConfirmDeletePerson] = useState<RosterAdminRow | null>(null);
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
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold">Roster · {players.length} players, {staff.length} staff</h2>
            <p className="text-xs text-ink-soft mt-0.5">
              Click any person or the <strong>Edit</strong> button to change name, email, gender, role, or remove them.
            </p>
          </div>
          <Button size="sm" onClick={() => setAdding(true)}><Plus size={14} /> Add person</Button>
        </div>
        <div className="divide-y divide-line mt-3">
          {[...staff, ...players].map((r) => (
            <div
              key={r.person_id}
              className="flex items-center justify-between gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-surface-2/70 transition group"
            >
              <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(r)}>
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-ink group-hover:text-brand transition">
                    {r.full_name} {r.gender && <span className="font-normal text-ink-soft">({r.gender})</span>}
                  </p>
                  {r.role !== "player" && <Badge tone="brand">{r.role}</Badge>}
                </div>
                <p className="truncate text-xs text-ink-soft mt-0.5">
                  {r.email ? (r.signed_in ? `${r.email} · signed in` : `${r.email} · not signed in yet`) : "No login email"}
                </p>
              </button>

              <div className="flex items-center gap-2 shrink-0">
                <label className="hidden sm:flex items-center gap-1 text-xs text-ink-soft mr-1" title="Activity updates for this person">
                  <input
                    type="checkbox"
                    checked={!r.activity_muted}
                    aria-label={`Activity for ${r.full_name}`}
                    onChange={(e) => mut.setMuted.mutate({ person_id: r.person_id, muted: !e.target.checked }, { onError: onErr })}
                  />
                  Updates
                </label>

                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 px-2 text-xs flex items-center gap-1 font-medium text-ink-soft hover:text-ink"
                  onClick={() => setEditing(r)}
                >
                  <Pencil size={12} />
                  <span>Edit</span>
                </Button>
              </div>
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

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit ${editing.full_name}` : ""}>
        {editing && (
          <div className="space-y-5">
            <PersonForm initial={editing} busy={mut.updatePerson.isPending || mut.setRole.isPending} submitLabel="Save changes"
              onSubmit={async (v) => {
                try {
                  await mut.updatePerson.mutateAsync({ person_id: editing.person_id, full_name: v.full_name, gender: v.gender, email: v.email });
                  if (v.role !== editing.role) await mut.setRole.mutateAsync({ person_id: editing.person_id, role: v.role });
                  toast.success("Saved");
                  setEditing(null);
                } catch (e) { onErr(e); }
              }} />
            {editing.person_id !== s.meId && (
              <div className="pt-4 border-t border-line">
                <p className="text-xs font-semibold text-red-600 mb-1">Danger Zone</p>
                <p className="text-xs text-ink-soft mb-3">
                  Removing this person removes them from the roster and standings.
                </p>
                <Button
                  variant="ghost"
                  className="w-full text-red-600 border border-red-200 hover:bg-red-50 flex items-center justify-center gap-1.5"
                  onClick={() => setConfirmDeletePerson(editing)}
                >
                  <Trash2 size={14} />
                  <span>Remove from camp</span>
                </Button>
              </div>
            )}
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={!!confirmDeletePerson}
        title={`Remove ${confirmDeletePerson?.full_name}?`}
        message="This player will be permanently removed from the camp roster and standings."
        confirmLabel="Remove player"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => {
          if (!confirmDeletePerson) return;
          mut.remove.mutate(confirmDeletePerson.person_id, {
            onSuccess: () => {
              toast.success(`${confirmDeletePerson.full_name} removed from camp`);
              setConfirmDeletePerson(null);
              setEditing(null);
            },
            onError: onErr,
          });
        }}
        onCancel={() => setConfirmDeletePerson(null)}
      />
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
    full_name: initial?.full_name ?? "",
    gender: initial?.gender ?? "",
    email: initial?.email ?? "",
    role: initial?.role ?? ("player" as Role),
  });
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...v, full_name: v.full_name.trim(), email: v.email.trim() }); }}>
      <Field label="Full name">
        <Input required maxLength={80} value={v.full_name} placeholder="e.g. Lakshya Sen" onChange={(e) => setV({ ...v, full_name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Gender">
          <Select value={v.gender} onChange={(e) => setV({ ...v, gender: e.target.value })}>
            <option value="">Not set</option>
            <option value="M">Male (M)</option>
            <option value="F">Female (F)</option>
          </Select>
        </Field>
        <Field label="Role">
          <Select value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as Role })}>
            <option value="player">Player</option>
            <option value="coach">Coach</option>
            <option value="admin">Camp Admin</option>
          </Select>
        </Field>
      </div>
      <Field
        label="Login Email (optional)"
        hint={
          initial?.signed_in
            ? "Changing this email will reset their current login link."
            : "Required for Google Sign-in or Password login. Leave blank if player will not log in."
        }
      >
        <Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} placeholder="player@gmail.com" />
      </Field>
      <Button type="submit" className="w-full" disabled={busy}>{submitLabel}</Button>
    </form>
  );
}
