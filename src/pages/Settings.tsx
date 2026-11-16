import { useMemo, useState } from "react";
import { Bell, BellOff, History, MessageCircle, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../lib/session";
import { useAdminMutations, useMatches, useMembers, useRosterAdmin, useSessions, useStandings } from "../lib/api";
import { errorText } from "../lib/supabase";
import { inviteText, parseRosterLines } from "../lib/rosterImport";
import { Badge, Button, Card, ConfirmDialog, Field, Input, PageTitle, Segmented, Select, Sheet, Textarea, Toggle, cx } from "../components/ui";
import { CsvExportCard } from "../components/CsvExport";
import { CampHistoryModal } from "../components/CampHistory";
import type { RosterAdminRow, Role } from "../lib/types";

type RosterFilter = "all" | "pending" | "no_email" | "staff";
type PersonValues = { full_name: string; gender: string; email: string; role: Role };

const appUrl = () => window.location.origin + import.meta.env.BASE_URL;
const openWhatsApp = (text: string) => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");

/** What a role change means, in one sentence, for the confirmation. */
function roleChangeMessage(name: string, from: Role, to: Role): string {
  if (to === "admin") return `${name} will be able to change camp settings, edit the roster, and lock or unlock the squad.`;
  if (from === "admin") return `${name} will lose access to camp settings and the roster.${to === "player" ? " They'll also lose access to selection, assessments and coach notes." : ""}`;
  if (to === "coach") return `${name} will see selection, assessments, private notes and injury reports for every player.`;
  return `${name} will lose access to selection, assessments, coach notes and other players' injury reports.`;
}

export default function SettingsPage() {
  const s = useSession();
  const camp = s.camp!;
  const roster = useRosterAdmin(camp.id, true);
  const mut = useAdminMutations(camp.id);
  const matches = useMatches(camp.id);
  const standings = useStandings(camp.id);
  const sessions = useSessions(camp.id);
  const members = useMembers(camp.id);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addingMany, setAddingMany] = useState(false);
  const [editing, setEditing] = useState<RosterAdminRow | null>(null);
  const [pendingEdit, setPendingEdit] = useState<PersonValues | null>(null);
  const [confirmDeletePerson, setConfirmDeletePerson] = useState<RosterAdminRow | null>(null);
  const [confirm, setConfirm] = useState<"hide" | "publish" | "close" | null>(null);
  const [filter, setFilter] = useState<RosterFilter>(() =>
    new URLSearchParams(window.location.search).get("filter") === "pending" ? "pending" : "all",
  );
  const [details, setDetails] = useState({
    name: camp.name, starts_on: camp.starts_on ?? "", ends_on: camp.ends_on ?? "", selection_target: camp.selection_target,
  });
  const onErr = (e: unknown) => toast.error(errorText(e));
  const update = (patch: Parameters<typeof mut.updateCamp.mutate>[0], msg = "Saved") =>
    mut.updateCamp.mutate(patch, { onSuccess: () => toast.success(msg), onError: onErr });

  const rows = roster.data ?? [];
  const players = rows.filter((r) => r.role === "player");
  const staff = rows.filter((r) => r.role !== "player");
  const pending = rows.filter((r) => r.email && !r.signed_in);
  const noEmail = rows.filter((r) => !r.email);
  const locked = !!camp.selection_locked_at;
  const listed = useMemo(() => {
    const all = [...staff, ...players];
    if (filter === "pending") return all.filter((r) => r.email && !r.signed_in);
    if (filter === "no_email") return all.filter((r) => !r.email);
    if (filter === "staff") return staff;
    return all;
  }, [filter, staff, players]);

  const saveEdit = async (v: PersonValues) => {
    if (!editing) return;
    try {
      await mut.updatePerson.mutateAsync({ person_id: editing.person_id, full_name: v.full_name, gender: v.gender, email: v.email });
      if (v.role !== editing.role) await mut.setRole.mutateAsync({ person_id: editing.person_id, role: v.role });
      toast.success("Saved");
      setEditing(null);
    } catch (e) { onErr(e); }
  };

  const invite = (r: RosterAdminRow) =>
    openWhatsApp(inviteText({ campName: camp.name, url: appUrl(), firstName: r.full_name.split(" ")[0], email: r.email }));
  const inviteAllPending = () =>
    openWhatsApp(
      `${inviteText({ campName: camp.name, url: appUrl() })}\n\nNot signed in yet: ${pending.map((r) => r.full_name).join(", ")}`,
    );

  return (
    <div className="space-y-5">
      <PageTitle>Camp settings</PageTitle>

      {/* ── Roster ── */}
      <Card>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold">Roster · {players.length} players, {staff.length} staff</h2>
            <p className="mt-0.5 text-xs text-ink-soft">
              {pending.length > 0 ? `${pending.length} with an email haven't signed in yet.` : "Everyone with an email has signed in."}
            </p>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => setAddingMany(true)}><Users size={14} /> Add many</Button>
            <Button size="sm" onClick={() => setAdding(true)}><Plus size={14} /> Add person</Button>
          </div>
        </div>

        <div className="mb-2 overflow-x-auto">
          <Segmented<RosterFilter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: `Everyone (${rows.length})` },
              { value: "pending", label: `Not signed in (${pending.length})` },
              { value: "no_email", label: `No email (${noEmail.length})` },
              { value: "staff", label: `Staff (${staff.length})` },
            ]}
          />
        </div>

        {filter === "pending" && pending.length > 0 && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/60 p-2.5">
            <p className="text-xs text-ink-soft">Send the link and sign-in steps to your camp group, or invite people one by one.</p>
            <Button size="sm" variant="secondary" onClick={inviteAllPending} className="shrink-0">
              <MessageCircle size={14} className="text-emerald-600" /> Group invite
            </Button>
          </div>
        )}
        {filter === "no_email" && noEmail.length > 0 && (
          <p className="mb-2 text-xs text-ink-soft">These people can't sign in. Coaches record matches and attendance for them, or add an email so they can.</p>
        )}

        <div className="divide-y divide-line">
          {listed.length === 0 && <p className="py-4 text-center text-xs text-ink-soft">No one here.</p>}
          {listed.map((r) => (
            <div key={r.person_id} className="flex items-center justify-between gap-2 py-2.5">
              <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(r)}>
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-ink">
                    {r.full_name} {r.gender && <span className="font-normal text-ink-soft">({r.gender})</span>}
                  </p>
                  {r.role !== "player" && <Badge tone="brand">{r.role}</Badge>}
                </div>
                <p className="mt-0.5 truncate text-xs text-ink-soft">
                  {r.email ? (
                    <>
                      {r.email} ·{" "}
                      <span className={r.signed_in ? "text-status-success-text" : "text-status-warn-text"}>
                        {r.signed_in ? "signed in" : "not signed in yet"}
                      </span>
                    </>
                  ) : "No login email"}
                </p>
              </button>

              <div className="flex shrink-0 items-center gap-1">
                {r.email && !r.signed_in && (
                  <button
                    type="button"
                    onClick={() => invite(r)}
                    aria-label={`Invite ${r.full_name} on WhatsApp`}
                    title="Send sign-in steps on WhatsApp"
                    className="rounded-lg p-2 text-emerald-600 hover:bg-surface-2"
                  >
                    <MessageCircle size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => mut.setMuted.mutate({ person_id: r.person_id, muted: !r.activity_muted }, {
                    onSuccess: () => toast.success(`Activity updates ${r.activity_muted ? "on" : "off"} for ${r.full_name}`),
                    onError: onErr,
                  })}
                  aria-pressed={!r.activity_muted}
                  aria-label={`Activity updates for ${r.full_name}: ${r.activity_muted ? "off" : "on"}`}
                  title={r.activity_muted ? "Activity updates off" : "Activity updates on"}
                  className={cx("rounded-lg p-2 hover:bg-surface-2", r.activity_muted ? "text-ink-soft" : "text-brand")}
                >
                  {r.activity_muted ? <BellOff size={16} /> : <Bell size={16} />}
                </button>
                <Button size="sm" variant="secondary" className="!min-h-[32px] !px-2 text-xs" onClick={() => setEditing(r)}>
                  <Pencil size={12} /> Edit
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Visibility ── */}
      <Card>
        <h2 className="mb-1 text-sm font-bold">Who can see this camp</h2>
        <p className="mb-3 text-xs text-ink-soft">The club app never sees any of this. These controls are for people inside the camp.</p>
        <Segmented
          value={camp.visibility}
          onChange={(v) => (v === "staff" ? setConfirm("hide") : update({ visibility: v }, "Camp visible to players"))}
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
            onChange={(v) => (v && locked ? setConfirm("publish") : update({ publish_selection: v }))} />
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-bold">Activity updates</h2>
        <Toggle label="Activity on for the whole camp"
          hint="In-site updates when a match is recorded, edited, disputed or resolved. No emails or push."
          checked={camp.activity_enabled} onChange={(v) => update({ activity_enabled: v })} />
        <p className="mt-2 text-xs text-ink-soft">Turn it off for one person with the bell next to their name in the roster.</p>
      </Card>

      {/* ── Details ── */}
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
          <Button type="submit" disabled={mut.updateCamp.isPending}>Save details</Button>
        </form>
      </Card>

      {/* ── Status: kept apart from Save so it isn't hit by accident ── */}
      <Card className={cx(camp.status === "closed" && "border-status-warn-border")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">Camp status: {camp.status === "active" ? "running" : "closed"}</h2>
            <p className="mt-0.5 text-xs text-ink-soft">
              {camp.status === "active"
                ? "Close the camp on the last day to stop new matches and freeze the standings for selection."
                : "No new matches can be recorded. Reopen if you need to add results."}
            </p>
          </div>
          {camp.status === "active" ? (
            <Button variant="secondary" size="sm" className="text-status-danger-text" onClick={() => setConfirm("close")}>Close camp</Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => update({ status: "active" }, "Camp reopened")}>Reopen camp</Button>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-bold">
              <History size={16} className="text-brand" />
              Camp History &amp; Records
            </h2>
            <p className="mt-0.5 text-xs text-ink-soft">
              Browse past training sessions, tournament milestones, final standings and archived rosters.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setHistoryOpen(true)}>
            View Archive
          </Button>
        </div>
      </Card>

      <CsvExportCard camp={camp} />

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add person">
        <PersonForm busy={mut.addPerson.isPending} submitLabel="Add to camp"
          onSubmit={(v) => mut.addPerson.mutate(v, {
            onSuccess: () => { toast.success(`${v.full_name} added`); setAdding(false); }, onError: onErr,
          })} />
      </Sheet>

      <Sheet open={addingMany} onClose={() => setAddingMany(false)} title="Add many people">
        {addingMany && (
          <BulkAdd
            existingEmails={rows.map((r) => r.email ?? "")}
            busy={mut.addPeople.isPending}
            onAdd={(people) => mut.addPeople.mutate(people, {
              onSuccess: (results) => {
                const failed = results.filter((r) => r.error);
                const added = results.length - failed.length;
                if (added) toast.success(`Added ${added} ${added === 1 ? "person" : "people"}`);
                if (failed.length) toast.error(`Couldn't add ${failed.map((f) => `${f.name} (${errorText({ message: f.error })})`).join(", ")}`);
                if (!failed.length) setAddingMany(false);
              },
              onError: onErr,
            })}
          />
        )}
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit ${editing.full_name}` : ""}>
        {editing && (
          <div className="space-y-5">
            <PersonForm initial={editing} busy={mut.updatePerson.isPending || mut.setRole.isPending} submitLabel="Save changes"
              onSubmit={(v) => (v.role !== editing.role ? setPendingEdit(v) : saveEdit(v))} />
            {editing.person_id !== s.meId && (
              <div className="border-t border-line pt-4">
                <p className="mb-1 text-xs font-semibold text-status-danger-text">Danger Zone</p>
                <p className="mb-3 text-xs text-ink-soft">
                  Removing this person removes them from the roster and standings.
                </p>
                <Button
                  variant="ghost"
                  className="flex w-full items-center justify-center gap-1.5 border border-status-danger-border bg-status-danger-bg text-status-danger-text hover:opacity-90"
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
        open={!!pendingEdit && !!editing}
        tone="brand"
        title={editing && pendingEdit ? `Change ${editing.full_name} from ${editing.role} to ${pendingEdit.role}?` : ""}
        message={editing && pendingEdit ? roleChangeMessage(editing.full_name, editing.role, pendingEdit.role) : undefined}
        confirmLabel="Change role"
        onConfirm={() => { const v = pendingEdit; setPendingEdit(null); if (v) saveEdit(v); }}
        onCancel={() => setPendingEdit(null)}
      />

      <ConfirmDialog
        open={confirm === "hide"}
        title="Hide the camp from players?"
        message="Players won't be able to open the camp (they'll see “No camp to show yet”) until you switch back. Coaches and admins keep full access."
        confirmLabel="Hide from players"
        onConfirm={() => { setConfirm(null); update({ visibility: "staff" }, "Camp hidden from players"); }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "publish"}
        tone="brand"
        title="Publish the squad now?"
        message="The squad is locked, so every player will see the selected and standby names straight away. Coach notes stay private."
        confirmLabel="Publish squad"
        onConfirm={() => { setConfirm(null); update({ publish_selection: true }, "Squad published to players"); }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "close"}
        title="Close the camp?"
        message="No one will be able to record new matches, and standings stop changing. Training logs still work. You can reopen it later."
        confirmLabel="Close camp"
        onConfirm={() => { setConfirm(null); update({ status: "closed" }, "Camp closed: no new matches"); }}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={!!confirmDeletePerson}
        title={`Remove ${confirmDeletePerson?.full_name}?`}
        message="This person will be permanently removed from the camp roster and standings."
        confirmLabel="Remove"
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

      <CampHistoryModal
        camp={camp}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        members={members.data ?? []}
        matches={matches.data ?? []}
        standings={standings.data ?? []}
        sessions={sessions.data ?? []}
      />
    </div>
  );
}

/** Paste a list (or a spreadsheet column block), check it, then add everyone valid in one go. */
function BulkAdd({ existingEmails, busy, onAdd }: {
  existingEmails: string[];
  busy: boolean;
  onAdd: (people: PersonValues[]) => void;
}) {
  const [text, setText] = useState("");
  const parsed = parseRosterLines(text, existingEmails);
  const ok = parsed.filter((r) => !r.error);
  const bad = parsed.filter((r) => r.error);
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-soft">
        One person per line: <span className="font-mono">Name, M/F, email, role</span>. Only the name is needed; role is
        player unless you write coach or admin. You can paste straight from a spreadsheet.
      </p>
      <Textarea
        rows={7}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Arjun Rao, M, arjun@gmail.com\nChitra Nair, F, chitra@gmail.com\nEshan Iyer, M"}
        aria-label="People to add"
        className="font-mono text-xs"
      />
      {parsed.length > 0 && (
        <div className="max-h-56 overflow-y-auto rounded-xl border border-line">
          {parsed.map((r) => (
            <div key={r.line} className={cx("flex items-start gap-2 border-b border-line px-3 py-1.5 text-xs last:border-0", r.error && "bg-status-danger-bg/40")}>
              <span className="w-6 shrink-0 text-ink-soft">{r.line}</span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-ink">{r.full_name || "—"}</span>
                <span className="text-ink-soft">
                  {r.gender && ` · ${r.gender}`}{r.email && ` · ${r.email}`}{r.role !== "player" && ` · ${r.role}`}
                </span>
                {r.error && <span className="block font-semibold text-status-danger-text">{r.error}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      <Button
        className="w-full"
        disabled={busy || ok.length === 0}
        onClick={() => onAdd(ok.map(({ full_name, gender, email, role }) => ({ full_name, gender, email, role })))}
      >
        {busy ? "Adding…" : ok.length ? `Add ${ok.length} ${ok.length === 1 ? "person" : "people"}${bad.length ? ` (skip ${bad.length})` : ""}` : "Add people"}
      </Button>
    </div>
  );
}

function PersonForm({ initial, onSubmit, busy, submitLabel }: {
  initial?: RosterAdminRow;
  onSubmit: (v: PersonValues) => void;
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
