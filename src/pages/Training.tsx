import { useState } from "react";
import { Link } from "wouter";
import {
  CheckCheck, CheckCircle2, ChevronRight, Circle, Dumbbell, Plus, Sparkles, Trash2, Timer,
  PenTool, Package, BookOpen, Calendar, MessageSquare, RotateCcw, Wrench
} from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../lib/session";
import { useAttendance, useDrills, useMembers, useSessions, useTrainingMutations } from "../lib/api";
import { errorText } from "../lib/supabase";
import { Badge, Button, Card, ConfirmDialog, Empty, Field, Input, PageTitle, Section, Select, Sheet, Skeleton, Textarea, cx, dayLabel, fmtDate, today } from "../components/ui";
import { DrillTemplatesSheet, type DrillTemplate } from "../components/DrillTemplates";
import { DrillTimerModal } from "../components/DrillTimer";
import { TacticalBoardModal } from "../components/TacticalBoard";
import { EquipmentTrackerModal } from "../components/EquipmentTracker";
import { SkillLibrarySheet } from "../components/SkillLibrary";
import { WeatherVenueBanner } from "../components/WeatherVenuePlan";
import { SessionReflectionModal } from "../components/SessionReflection";
import { CampCalendarExportModal } from "../components/CalendarExport";
import { generateGoogleCalendarUrl } from "../lib/calendarExport";
import { DRILL_TYPES, type Attendance, type Drill, type DrillType, type Session } from "../lib/types";

export default function TrainingPage() {
  const s = useSession();
  const campId = s.camp!.id;
  const sessions = useSessions(campId);
  const ids = (sessions.data ?? []).map((x) => x.id);
  const drills = useDrills(ids);
  const attendance = useAttendance(ids);
  const members = useMembers(campId);
  const mut = useTrainingMutations(campId);
  const [adding, setAdding] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [tacticsOpen, setTacticsOpen] = useState(false);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("session"));
  const [toolsOpen, setToolsOpen] = useState(false);
  const open = (sessions.data ?? []).find((x) => x.id === openId) ?? null;

  const players = (members.data ?? []).filter((m) => m.role === "player");
  const sessionList = sessions.data ?? [];
  const totalMinutes = (drills.data ?? []).reduce((t, y) => t + (y.duration_min ?? 0), 0);
  const byDay: { day: string; items: Session[] }[] = [];
  for (const x of sessionList) {
    const last = byDay[byDay.length - 1];
    if (last && last.day === x.session_date) last.items.push(x);
    else byDay.push({ day: x.session_date, items: [x] });
  }

  return (
    <div className="space-y-6">
      <PageTitle
        sub={sessionList.length ? `${sessionList.length} session${sessionList.length === 1 ? "" : "s"} · ${totalMinutes} min of drills` : undefined}
        action={
          <>
            <Button variant="secondary" onClick={() => setToolsOpen(true)} aria-label="Training tools">
              <Wrench size={16} className="text-brand" /> <span className="hidden sm:inline">Tools</span>
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus size={16} /> Session
            </Button>
          </>
        }
      >
        Training log
      </PageTitle>

      <WeatherVenueBanner campId={campId} isStaff={s.isStaff} />

      {sessions.isLoading ? (
        <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      ) : sessionList.length === 0 ? (
        <Empty>No sessions yet. Log today's training: drills, attendance and how hard it felt.</Empty>
      ) : (
        byDay.map(({ day, items }) => (
          <Section key={day} title={dayLabel(day)}>
            <Card className="divide-y divide-line overflow-hidden !p-0">
              {items.map((x) => {
                const d = (drills.data ?? []).filter((y) => y.session_id === x.id);
                const a = (attendance.data ?? []).filter((y) => y.session_id === x.id);
                const present = a.filter((y) => y.status !== "absent").length;
                const minutes = d.reduce((t, y) => t + (y.duration_min ?? 0), 0);
                return (
                  <button key={x.id} type="button" onClick={() => setOpenId(x.id)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/60">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-pale text-brand">
                      <Dumbbell size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{x.title}</span>
                      {x.focus && <span className="block truncate text-sm text-ink-soft">{x.focus}</span>}
                      <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-faint">
                        <span>{d.length} drill{d.length === 1 ? "" : "s"}{minutes ? ` · ${minutes} min` : ""}</span>
                        <span>{present} present</span>
                      </span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-ink-faint" />
                  </button>
                );
              })}
            </Card>
          </Section>
        ))
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="New session">
        <SessionForm busy={mut.addSession.isPending}
          onSubmit={(v) => mut.addSession.mutate(v, {
            onSuccess: (row) => { setAdding(false); setOpenId(row.id); toast.success("Session added"); },
            onError: (e) => toast.error(errorText(e)),
          })} />
      </Sheet>

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open ? `${open.title} · ${fmtDate(open.session_date)}` : ""}>
        {open && (
          <SessionDetail
            session={open}
            drills={(drills.data ?? []).filter((y) => y.session_id === open.id)}
            attendance={(attendance.data ?? []).filter((y) => y.session_id === open.id)}
            players={(members.data ?? []).filter((m) => m.role === "player")}
            canDelete={s.isStaff}
            mut={mut}
            onDeleted={() => setOpenId(null)}
          />
        )}
      </Sheet>

      <Sheet open={toolsOpen} onClose={() => setToolsOpen(false)} title="Training tools">
        <div className="divide-y divide-line rounded-xl border border-line">
          {([
            { icon: Timer, title: "Drill timer", hint: "Intervals and rest countdown", open: setTimerOpen },
            { icon: PenTool, title: "Tactics board", hint: "Sketch positions and patterns", open: setTacticsOpen },
            { icon: BookOpen, title: "Skill & drill library", hint: "Technique cues and practice drills", open: setSkillsOpen },
            { icon: MessageSquare, title: "Post-practice reflection", hint: "What went well, what to work on", open: setReflectionOpen },
            { icon: Package, title: "Camp gear", hint: "Shuttles, rackets and training aids", open: setEquipmentOpen },
            { icon: Calendar, title: "Add sessions to calendar", hint: "Google Calendar or .ics file", open: setCalendarOpen },
          ] as const).map(({ icon: Icon, title, hint, open: openTool }) => (
            <button
              key={title}
              type="button"
              onClick={() => { setToolsOpen(false); openTool(true); }}
              className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2/60"
            >
              <Icon size={17} className="shrink-0 text-brand" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{title}</span>
                <span className="block truncate text-[11px] text-ink-soft">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      </Sheet>

      <DrillTimerModal
        open={timerOpen}
        onClose={() => setTimerOpen(false)}
      />

      <TacticalBoardModal
        open={tacticsOpen}
        onClose={() => setTacticsOpen(false)}
      />

      <EquipmentTrackerModal
        campId={campId}
        open={equipmentOpen}
        onClose={() => setEquipmentOpen(false)}
        players={players}
      />

      <SkillLibrarySheet
        open={skillsOpen}
        onClose={() => setSkillsOpen(false)}
        campId={campId}
        currentPersonId={s.meId ?? null}
        isStaff={s.isStaff}
      />

      <CampCalendarExportModal
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        campName={s.camp?.name ?? "IISc Badminton Camp"}
        sessions={sessions.data ?? []}
        members={members.data ?? []}
      />

      <SessionReflectionModal
        open={reflectionOpen}
        onClose={() => setReflectionOpen(false)}
        campId={campId}
        personId={s.meId ?? null}
        playerName={(members.data ?? []).find((m) => m.id === s.meId)?.full_name}
        sessions={sessions.data ?? []}
      />
    </div>
  );
}

function SessionForm({ onSubmit, busy, initial }: {
  onSubmit: (v: { session_date: string; title: string; focus: string; notes: string; duration_min: number | null }) => void;
  busy: boolean;
  initial?: Session;
}) {
  const [v, setV] = useState({
    session_date: initial?.session_date ?? today(),
    title: initial?.title ?? "Morning session",
    focus: initial?.focus ?? "",
    notes: initial?.notes ?? "",
    duration: initial?.duration_min ? String(initial.duration_min) : "",
  });
  const { duration, ...rest } = v;
  const minutes = duration.trim() ? Math.min(600, Math.max(1, Math.round(Number(duration)))) : null;
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...rest, duration_min: Number.isFinite(minutes) ? minutes : null }); }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" required value={v.session_date} disabled={!!initial} onChange={(e) => setV({ ...v, session_date: e.target.value })} /></Field>
        <Field label="Title"><Input required maxLength={80} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
      </div>
      <Field label="Duration (minutes)" hint="Used for training load: effort (RPE) × minutes.">
        <Input type="number" inputMode="numeric" min={1} max={600} value={v.duration} placeholder="e.g. 90"
          onChange={(e) => setV({ ...v, duration: e.target.value })} />
      </Field>
      <Field label="Focus"><Input maxLength={200} value={v.focus} placeholder="e.g. Rear-court footwork, net kills" onChange={(e) => setV({ ...v, focus: e.target.value })} /></Field>
      <Field label="Notes"><Textarea maxLength={2000} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
      <Button type="submit" className="w-full" disabled={busy}>{initial ? "Save" : "Create session"}</Button>
    </form>
  );
}

const STATUS: { value: Attendance["status"]; label: string }[] = [
  { value: "present", label: "P" }, { value: "late", label: "L" }, { value: "absent", label: "A" },
];

function SessionDetail({ session, drills, attendance, players, canDelete, mut, onDeleted }: {
  session: Session;
  drills: Drill[];
  attendance: Attendance[];
  players: { id: string; full_name: string }[];
  canDelete: boolean;
  mut: ReturnType<typeof useTrainingMutations>;
  onDeleted: () => void;
}) {
  const [drill, setDrill] = useState({ drill_name: "", drill_type: "footwork" as DrillType, duration_min: "", sets: "", reps: "", intensity: "3", notes: "" });
  const [editing, setEditing] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const doneKey = `drills.done.${session.id}`;
  const [completedDrills, setCompletedDrills] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(doneKey) ?? "[]") as string[]); } catch { return new Set(); }
  });
  const [clearing, setClearing] = useState<string | null>(null);
  const [confirmUnmarkAll, setConfirmUnmarkAll] = useState(false);
  const num = (x: string) => (x.trim() ? Number(x) : null);
  const onErr = (e: unknown) => toast.error(errorText(e));

  const toggleDrillDone = (id: string) => {
    setCompletedDrills((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try { localStorage.setItem(doneKey, JSON.stringify([...next])); } catch { /* storage unavailable */ }
      return next;
    });
  };

  const mark = (personId: string, patch: Partial<Attendance>) => {
    const cur = attendance.find((a) => a.person_id === personId);
    mut.setAttendance.mutate({
      session_id: session.id, person_id: personId,
      status: patch.status ?? cur?.status ?? "present",
      rpe: patch.rpe !== undefined ? patch.rpe : cur?.rpe ?? null,
      note: cur?.note ?? null,
    }, { onError: onErr });
  };

  const markAllPresent = () => {
    const rows = players
      .filter((p) => attendance.find((a) => a.person_id === p.id)?.status !== "present")
      .map((p) => {
        const cur = attendance.find((a) => a.person_id === p.id);
        return { session_id: session.id, person_id: p.id, status: "present" as const, rpe: cur?.rpe ?? null, note: cur?.note ?? null };
      });
    if (rows.length === 0) {
      toast.info("Everyone is already marked present");
      return;
    }
    mut.setAttendanceBulk.mutate(rows, {
      onSuccess: () => toast.success(`Marked ${rows.length} player${rows.length === 1 ? "" : "s"} present`),
      onError: onErr,
    });
  };

  const unmark = (personId: string) => {
    mut.deleteAttendance.mutate(
      { session_id: session.id, person_id: personId },
      {
        onSuccess: () => {
          const p = players.find((x) => x.id === personId);
          toast.success(`${p?.full_name ?? "Player"}: Unmarked`);
        },
        onError: onErr,
      }
    );
  };

  const unmarkAll = () => {
    setConfirmUnmarkAll(false);
    mut.clearSessionAttendance.mutate(session.id, {
      onSuccess: () => toast.success("Reset all attendance to unmarked"),
      onError: onErr,
    });
  };

  const handleSelectTemplate = (t: DrillTemplate) => {
    mut.addDrill.mutate({
      session_id: session.id,
      drill_name: t.name,
      drill_type: t.type,
      duration_min: t.duration,
      sets: t.sets,
      reps: t.reps,
      intensity: t.intensity,
      notes: t.notes,
    }, {
      onSuccess: () => toast.success(`Added "${t.name}"`),
      onError: onErr,
    });
  };

  return (
    <div className="space-y-5">
      {editing ? (
        <SessionForm initial={session} busy={mut.updateSession.isPending}
          onSubmit={(v) => mut.updateSession.mutate({ id: session.id, title: v.title, focus: v.focus, notes: v.notes, duration_min: v.duration_min }, {
            onSuccess: () => setEditing(false), onError: onErr,
          })} />
      ) : (
        <div>
          {session.focus && <p className="text-sm"><span className="font-semibold">Focus:</span> {session.focus}</p>}
          {session.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-soft">{session.notes}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit details</Button>
            <a
              href={generateGoogleCalendarUrl(session, "IISc Badminton Camp")}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline px-2.5 py-1 rounded bg-brand/5 border border-brand/20"
            >
              <Calendar size={13} />
              <span>Add to Google Cal</span>
            </a>
            {canDelete && (
              <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setConfirmDelete(true)}>
                Delete session
              </Button>
            )}
          </div>
        </div>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold">Drills</h3>
            {drills.length > 0 && (
              <span className="text-xs text-ink-soft font-mono">
                ({drills.filter((d) => completedDrills.has(d.id)).length}/{drills.length} done · ticks saved on this phone)
              </span>
            )}
          </div>
          <Button size="sm" variant="secondary" onClick={() => setShowTemplates(true)}>
            <Sparkles size={14} className="text-amber-500 mr-1" />
            Routine templates
          </Button>
        </div>
        {drills.length === 0 && <p className="mb-2 text-sm text-ink-soft">No drills yet. Pick a routine above or create one below.</p>}
        <div className="space-y-1.5">
          {drills.map((d) => {
            const isDone = completedDrills.has(d.id);
            return (
              <div
                key={d.id}
                className={cx(
                  "flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 transition-opacity",
                  isDone && "opacity-60 bg-surface-2/60"
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleDrillDone(d.id)}
                  title={isDone ? "Mark drill pending" : "Mark drill completed"}
                  className="mt-0.5 text-ink-soft hover:text-status-success-text transition-colors shrink-0"
                >
                  {isDone ? (
                    <CheckCircle2 size={18} className="text-status-success-text" />
                  ) : (
                    <Circle size={18} />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={cx("text-sm font-semibold", isDone && "line-through text-ink-soft")}>
                    {d.drill_name}{" "}
                    <Badge tone="brand">{DRILL_TYPES.find((t) => t.value === d.drill_type)?.label}</Badge>
                  </p>
                  <p className="text-xs text-ink-soft">
                    {[d.duration_min && `${d.duration_min} min`, d.sets && `${d.sets} sets`, d.reps && `${d.reps} reps`,
                    d.intensity && `intensity ${d.intensity}/5`].filter(Boolean).join(" · ")}
                  </p>
                  {d.notes && <p className="text-xs text-ink-soft">{d.notes}</p>}
                </div>
                {canDelete && (
                  <button aria-label={`Delete ${d.drill_name}`} className="p-1 text-ink-soft hover:text-red-600"
                    onClick={() => mut.deleteDrill.mutate(d.id, { onError: onErr })}><Trash2 size={16} /></button>
                )}
              </div>
            );
          })}
        </div>
        <form className="mt-3 space-y-2 rounded-lg border border-line p-3" onSubmit={(e) => {
          e.preventDefault();
          mut.addDrill.mutate({
            session_id: session.id, drill_name: drill.drill_name.trim(), drill_type: drill.drill_type,
            duration_min: num(drill.duration_min), sets: num(drill.sets), reps: num(drill.reps),
            intensity: num(drill.intensity), notes: drill.notes.trim() || null,
          }, {
            onSuccess: () => setDrill({ ...drill, drill_name: "", duration_min: "", sets: "", reps: "", notes: "" }),
            onError: onErr,
          });
        }}>
          <div className="grid grid-cols-2 gap-2">
            <Input required maxLength={80} placeholder="Drill name" value={drill.drill_name} onChange={(e) => setDrill({ ...drill, drill_name: e.target.value })} />
            <Select aria-label="Drill type" value={drill.drill_type} onChange={(e) => setDrill({ ...drill, drill_type: e.target.value as DrillType })}>
              {DRILL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Input type="number" min={1} max={600} placeholder="Min" aria-label="Duration in minutes" value={drill.duration_min} onChange={(e) => setDrill({ ...drill, duration_min: e.target.value })} />
            <Input type="number" min={1} max={100} placeholder="Sets" aria-label="Sets" value={drill.sets} onChange={(e) => setDrill({ ...drill, sets: e.target.value })} />
            <Input type="number" min={1} max={1000} placeholder="Reps" aria-label="Reps" value={drill.reps} onChange={(e) => setDrill({ ...drill, reps: e.target.value })} />
            <Select aria-label="Intensity" value={drill.intensity} onChange={(e) => setDrill({ ...drill, intensity: e.target.value })}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5</option>)}
            </Select>
          </div>
          <Input maxLength={500} placeholder="Notes (optional)" value={drill.notes} onChange={(e) => setDrill({ ...drill, notes: e.target.value })} />
          <Button type="submit" size="sm" variant="secondary" disabled={mut.addDrill.isPending}><Plus size={14} /> Add drill</Button>
        </form>
      </section>

      <section>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-bold">Attendance & effort</h3>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={markAllPresent} disabled={mut.setAttendanceBulk.isPending}>
              <CheckCheck size={14} className="mr-1 text-brand" />
              Mark all present
            </Button>
            {attendance.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setConfirmUnmarkAll(true)} className="!text-xs text-ink-soft hover:!text-red-600 cursor-pointer">
                <RotateCcw size={13} className="mr-1" />
                Unmark all
              </Button>
            )}
          </div>
        </div>
        <p className="mb-2 text-xs text-ink-soft">P present · L late · A away · ✕ clear. RPE = effort (1–10).</p>
        <div className="divide-y divide-line rounded-lg border border-line">
          {players.map((p) => {
            const a = attendance.find((x) => x.person_id === p.id);
            return (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1 truncate text-sm">{p.full_name}</span>
                <div className="flex gap-1">
                  {STATUS.map((st) => (
                    <button key={st.value} aria-label={`${p.full_name} ${st.value}`} aria-pressed={a?.status === st.value}
                      onClick={() => mark(p.id, { status: st.value })}
                      title={`Mark ${st.value}`}
                      className={cx("h-8 w-8 rounded-md text-xs font-bold transition cursor-pointer active:scale-95",
                        a?.status === st.value
                          ? st.value === "absent" ? "bg-red-600 text-white" : st.value === "late" ? "bg-amber-500 text-white" : "bg-brand text-white"
                          : "bg-surface-2 text-ink-soft hover:bg-surface-3")}>
                      {st.label}
                    </button>
                  ))}
                </div>
                <Select aria-label={`${p.full_name} RPE`} className="!w-16 !px-1.5" value={a?.rpe ?? ""}
                  disabled={!a || a.status === "absent"}
                  onChange={(e) => mark(p.id, { rpe: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">RPE</option>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
                <button
                  type="button"
                  disabled={!a}
                  onClick={() => (a?.rpe != null ? setClearing(p.id) : unmark(p.id))}
                  aria-label={`Clear ${p.full_name}'s attendance`}
                  className="h-8 w-7 rounded-md text-xs text-ink-soft hover:text-red-600 disabled:invisible"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        {canDelete && <div className="mt-3 p-3 bg-surface-2 rounded-lg border border-line flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-ink">Ready to evaluate player performance?</p>
            <p className="text-[11px] text-ink-soft">Record technique, fitness, tactics &amp; attitude scores.</p>
          </div>
          <Link href="/players">
            <Button size="sm" variant="secondary">Assess players →</Button>
          </Link>
        </div>}
      </section>

      <DrillTemplatesSheet
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        onSelect={handleSelectTemplate}
      />

      <ConfirmDialog
        open={confirmUnmarkAll}
        title="Clear attendance for this session?"
        message={`Removes ${attendance.length} check-in${attendance.length === 1 ? "" : "s"}, including any effort ratings. This can't be undone.`}
        confirmLabel="Clear attendance"
        onConfirm={unmarkAll}
        onCancel={() => setConfirmUnmarkAll(false)}
      />

      <ConfirmDialog
        open={!!clearing}
        title={`Clear ${players.find((x) => x.id === clearing)?.full_name ?? "this player"}'s attendance?`}
        message={`Their effort rating (${attendance.find((x) => x.person_id === clearing)?.rpe ?? "–"}/10) is removed too.`}
        confirmLabel="Clear"
        onConfirm={() => { if (clearing) unmark(clearing); setClearing(null); }}
        onCancel={() => setClearing(null)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete training session?"
        message="This will permanently delete this training session along with all logged drills and player attendance records."
        confirmLabel="Delete session"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => {
          setConfirmDelete(false);
          mut.deleteSession.mutate(session.id, { onSuccess: onDeleted, onError: onErr });
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
