import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Plus, LineChart, Radio, Sparkles, Calendar,
  UserCheck, Play, Megaphone,
  Package, HeartPulse, History, BookOpen,
  Search, Share2, RotateCcw
} from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../lib/session";
import {
  useAssessments, useAttendance, useDrills, useMatches, useMatchMutations, useMembers,
  useSessions, useStandings, useTrainingMutations,
} from "../lib/api";
import { MatchCard } from "../components/MatchCard";
import { PairingHelperModal } from "../components/PairingHelper";
import { LiveCourtScorer } from "../components/LiveCourtScorer";
import { AnnouncementBanner, AnnouncementManagerModal } from "../components/Announcements";
import { EquipmentTrackerModal } from "../components/EquipmentTracker";
import { InjuryTrackerModal } from "../components/InjuryTracker";
import { CampHistoryModal } from "../components/CampHistory";
import { PersonalMatchHistoryModal } from "../components/PersonalMatchHistory";
import { SessionReflectionModal } from "../components/SessionReflection";
import { SkillLibrarySheet } from "../components/SkillLibrary";
import { WeatherVenueBanner } from "../components/WeatherVenuePlan";
import { NextSessionFocusCard } from "../components/NextSessionFocusCard";
import { CampCalendarExportModal } from "../components/CalendarExport";
import { LiveCourtBoard } from "../components/LiveCourtBoard";
import { QuickCommandPalette } from "../components/QuickCommandPalette";
import { PlayerDetailSheet } from "../components/PlayerDetail";
import { shareDailyScheduleOnWhatsApp } from "../lib/whatsappShare";
import { useVenuePlan } from "../lib/sharedData";
import { DEFAULT_SESSION } from "../lib/today";
import { errorText } from "../lib/supabase";
import { CoachAttention } from "../components/CoachAttention";
import { Avatar, Button, Card, ConfirmDialog, Empty, Section, cx, today } from "../components/ui";
import type { Attendance } from "../lib/types";

const STATUS_LABEL: Record<Attendance["status"], string> = { present: "Present", late: "Late", absent: "Away" };
const STATUS_TONE: Record<Attendance["status"], string> = {
  present: "border-status-success-border bg-status-success-bg text-status-success-text",
  late: "border-status-warn-border bg-status-warn-bg text-status-warn-text",
  absent: "border-status-danger-border bg-status-danger-bg text-status-danger-text",
};

export default function TodayPage() {
  const s = useSession();
  const campId = s.camp!.id;
  const [, setLoc] = useLocation();
  const [liveScoring, setLiveScoring] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [injuryOpen, setInjuryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [matchHistoryOpen, setMatchHistoryOpen] = useState(false);
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [skillLibraryOpen, setSkillLibraryOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  /** Player whose attendance options are open (tap a marked chip). */
  const [attendanceFor, setAttendanceFor] = useState<string | null>(null);
  const [confirmUnmarkAll, setConfirmUnmarkAll] = useState(false);

  const sessions = useSessions(campId);
  const todays = (sessions.data ?? []).filter((x) => x.session_date === today());
  const drills = useDrills(todays.map((x) => x.id));
  const attendance = useAttendance(todays.map((x) => x.id));
  const assessments = useAssessments(campId, s.isStaff);
  const trainingMut = useTrainingMutations(campId);
  const matchMut = useMatchMutations(campId);
  const venuePlan = useVenuePlan(campId);

  const matches = useMatches(campId);
  const members = useMembers(campId);
  const standings = useStandings(campId);
  const myName = (members.data ?? []).find((m) => m.id === s.meId)?.full_name;
  const recent = (matches.data ?? []).filter((m) => m.status !== "void").slice(0, 5);

  const playerMembers = useMemo(
    () => (members.data ?? []).filter((m) => m.role === "player"),
    [members.data]
  );

  // Today's primary training session
  const todaySession = todays[0];

  // Attendance map for today's session
  const attendanceMap = useMemo(() => {
    const map: Record<string, Attendance["status"]> = {};
    for (const a of attendance.data ?? []) {
      if (!todaySession || a.session_id === todaySession.id) {
        map[a.person_id] = a.status;
      }
    }
    return map;
  }, [attendance.data, todaySession]);

  // Current user's attendance record for today's first session
  const myTodayAtt = todaySession
    ? (attendance.data ?? []).find((a) => a.session_id === todaySession.id && a.person_id === s.meId)
    : null;

  const onErr = (e: unknown) => toast.error(errorText(e));
  const nameOf = (id: string) => playerMembers.find((m) => m.id === id)?.full_name ?? "Player";
  const attendanceOf = (sessionId: string, personId: string) =>
    (attendance.data ?? []).find((a) => a.session_id === sessionId && a.person_id === personId);

  /** Today's session, created first if there isn't one (safe when several phones do it at once). */
  const sessionIdForToday = async () =>
    todaySession?.id ?? (await trainingMut.ensureSession.mutateAsync({ session_date: today(), ...DEFAULT_SESSION })).id;

  const setStatusFor = async (personId: string, status: Attendance["status"]) => {
    const sessionId = await sessionIdForToday();
    const cur = attendanceOf(sessionId, personId);
    await trainingMut.setAttendance.mutateAsync({
      session_id: sessionId, person_id: personId, status, rpe: cur?.rpe ?? null, note: cur?.note ?? null,
    });
  };

  const clearFor = async (personId: string) => {
    if (!todaySession) return;
    await trainingMut.deleteAttendance.mutateAsync({ session_id: todaySession.id, person_id: personId });
  };

  const handleSetMyStatus = (status: Attendance["status"]) => {
    if (!s.meId) return;
    // Tapping your current status again clears it.
    const clearing = myTodayAtt?.status === status;
    (clearing ? clearFor(s.meId) : setStatusFor(s.meId, status))
      .then(() => toast.success(clearing ? "Check-in cleared" : `Check-in: ${STATUS_LABEL[status]}`))
      .catch(onErr);
  };

  const handleStartTodaySession = () => {
    sessionIdForToday().then(() => toast.success("Started today's session")).catch(onErr);
  };

  /** One request for everyone not yet present; keeps any effort ratings already logged. */
  const handleMarkAllPresent = async () => {
    try {
      const sessionId = await sessionIdForToday();
      const rows = playerMembers
        .filter((p) => attendanceOf(sessionId, p.id)?.status !== "present")
        .map((p) => {
          const cur = attendanceOf(sessionId, p.id);
          return { session_id: sessionId, person_id: p.id, status: "present" as const, rpe: cur?.rpe ?? null, note: cur?.note ?? null };
        });
      if (rows.length === 0) {
        toast.info("Everyone is already marked present");
        return;
      }
      await trainingMut.setAttendanceBulk.mutateAsync(rows);
      toast.success(`Marked ${rows.length} player${rows.length === 1 ? "" : "s"} present`);
    } catch (e) {
      onErr(e);
    }
  };

  const handleUnmarkAll = () => {
    if (!todaySession) return;
    setConfirmUnmarkAll(false);
    setAttendanceFor(null);
    trainingMut.clearSessionAttendance.mutate(todaySession.id, {
      onSuccess: () => toast.success("Attendance cleared for today"),
      onError: onErr,
    });
  };

  /** Unmarked player: one tap marks them present. Marked player: open the options instead of cycling. */
  const handleChipTap = (playerId: string) => {
    if (!attendanceMap[playerId]) {
      setAttendanceFor(null);
      setStatusFor(playerId, "present").then(() => toast.success(`${nameOf(playerId)}: present`)).catch(onErr);
    } else {
      setAttendanceFor((cur) => (cur === playerId ? null : playerId));
    }
  };

  const applyChoice = (playerId: string, choice: Attendance["status"] | "clear") => {
    setAttendanceFor(null);
    const run = choice === "clear" ? clearFor(playerId) : setStatusFor(playerId, choice);
    run
      .then(() => toast.success(`${nameOf(playerId)}: ${choice === "clear" ? "unmarked" : STATUS_LABEL[choice].toLowerCase()}`))
      .catch(onErr);
  };

  // Roster breakdown
  const presentCount = playerMembers.filter((p) => attendanceMap[p.id] === "present").length;
  const lateCount = playerMembers.filter((p) => attendanceMap[p.id] === "late").length;
  const absentCount = playerMembers.filter((p) => attendanceMap[p.id] === "absent").length;
  const unmarkedCount = playerMembers.filter((p) => !attendanceMap[p.id]).length;

  const shareBriefing = () =>
    shareDailyScheduleOnWhatsApp({
      campName: s.camp?.name ?? "IISc Badminton Camp",
      session: todaySession,
      weatherPlan: venuePlan.data ?? null,
      presentCount,
      totalSquad: playerMembers.length,
    });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = myName?.split(" ")[0];
  const tools: { label: string; icon: typeof Plus; onClick?: () => void; href?: string }[] = [
    { label: "Insights", icon: LineChart, href: "/insights" },
    { label: "Injuries", icon: HeartPulse, onClick: () => setInjuryOpen(true) },
    { label: "Notices", icon: Megaphone, onClick: () => setAnnouncementOpen(true) },
    { label: "Skills", icon: BookOpen, onClick: () => setSkillLibraryOpen(true) },
    { label: "Gear", icon: Package, onClick: () => setEquipmentOpen(true) },
    { label: "Calendar", icon: Calendar, onClick: () => setCalendarOpen(true) },
    { label: "Archive", icon: History, onClick: () => setHistoryOpen(true) },
  ];

  return (
    <div className="space-y-6">
      {/* Greeting and the one thing you do most: record a match */}
      {/* On the narrowest phones the buttons drop under the greeting instead of squeezing it. */}
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-3">
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-sm font-medium text-ink-soft">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">
            {greeting}{firstName ? `, ${firstName}` : ""}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            aria-label="Search players, pages and techniques"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-soft shadow-card ring-1 ring-line transition hover:text-ink"
          >
            <Search size={18} />
          </button>
          <Link href="/matches?new=1">
            <Button><Plus size={16} /> Match</Button>
          </Link>
        </div>
      </div>

      <AnnouncementBanner campId={campId} meId={s.meId ?? null} isStaff={s.isStaff} onOpenManager={() => setAnnouncementOpen(true)} />

      {/* Phones: one column in reading order. Desktop: the day on the left, play and plan on the right. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-8">
        <div className="contents lg:flex lg:flex-col lg:gap-6">
          <Section
            className="order-1"
            title="At the hall"
            action={
              <button type="button" onClick={shareBriefing} className="inline-flex items-center gap-1 hover:underline">
                <Share2 size={13} /> Share briefing
              </button>
            }
          >
            <Card className="space-y-4">
              <div className="grid grid-cols-4 gap-2 text-center">
                {([
                  { n: presentCount, label: "Present", cls: "text-status-success-text" },
                  { n: lateCount, label: "Late", cls: "text-status-warn-text" },
                  { n: absentCount, label: "Away", cls: "text-status-danger-text" },
                  { n: unmarkedCount, label: "Not marked", cls: "text-ink-soft" },
                ]).map((x) => (
                  <div key={x.label} className="rounded-xl bg-surface-2/70 py-2">
                    <p className={cx("text-xl font-bold tabular-nums", x.cls)}>{x.n}</p>
                    <p className="text-[11px] font-medium text-ink-soft">{x.label}</p>
                  </div>
                ))}
              </div>

              {s.meId && (
                <div className="flex items-center gap-2">
                  <span className="w-9 shrink-0 text-xs font-semibold text-ink-soft">You</span>
                  <div className="grid flex-1 grid-cols-3 gap-1.5">
                    {(["present", "late", "absent"] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleSetMyStatus(st)}
                        aria-pressed={myTodayAtt?.status === st}
                        title={myTodayAtt?.status === st ? "Tap again to clear" : `Mark yourself ${STATUS_LABEL[st].toLowerCase()}`}
                        className={cx(
                          "min-h-[36px] rounded-lg text-xs font-semibold transition active:scale-95",
                          myTodayAtt?.status === st ? STATUS_TONE[st] : "bg-surface-2 text-ink hover:bg-surface-3",
                        )}
                      >
                        {STATUS_LABEL[st]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="h-px bg-line" />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-ink-soft">Players</p>
                <div className="flex items-center gap-1">
                  {!todaySession ? (
                    <Button size="sm" variant="secondary" onClick={handleStartTodaySession}>
                      <Play size={14} /> Start today's session
                    </Button>
                  ) : (
                    <>
                      {presentCount + lateCount + absentCount > 0 && (
                        <Button size="sm" variant="ghost" onClick={() => setConfirmUnmarkAll(true)} className="!text-xs">
                          <RotateCcw size={13} /> Unmark all
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={handleMarkAllPresent} disabled={trainingMut.setAttendanceBulk.isPending}>
                        <UserCheck size={14} /> All present
                      </Button>
                    </>
                  )}
                </div>
              </div>
          <div className="flex flex-wrap gap-1.5">
            {playerMembers.map((p) => {
              const status = attendanceMap[p.id];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleChipTap(p.id)}
                  aria-expanded={status ? attendanceFor === p.id : undefined}
                  title={status ? `${STATUS_LABEL[status]}. Tap for options` : "Tap to mark present"}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition cursor-pointer active:scale-95 ${attendanceFor === p.id ? "ring-2 ring-brand " : ""}${
                    status === "present"
                      ? "bg-status-success-bg text-status-success-text border-status-success-border font-semibold shadow-2xs"
                      : status === "late"
                      ? "bg-status-warn-bg text-status-warn-text border-status-warn-border"
                      : status === "absent"
                      ? "bg-status-danger-bg/60 text-status-danger-text border-status-danger-border opacity-70 line-through"
                      : "bg-surface-2 text-ink-soft border-line hover:border-brand/40"
                  }`}
                >
                  <Avatar name={p.full_name} size="xs" />
                  <span>{p.full_name}</span>
                  <span className="text-[10px] font-bold opacity-80">
                    {status === "present" ? "✓" : status === "late" ? "⏳" : status === "absent" ? "✕" : "+"}
                  </span>
                </button>
              );
            })}
          </div>
          {attendanceFor && attendanceMap[attendanceFor] && (() => {
            const cur = attendanceOf(todaySession?.id ?? "", attendanceFor);
            return (
              <div className="mt-3 rounded-xl border border-brand/40 bg-brand-pale/30 p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-ink">{nameOf(attendanceFor)}</p>
                  <button type="button" onClick={() => setAttendanceFor(null)} aria-label="Close options" className="px-1 text-xs text-ink-soft hover:text-ink">✕</button>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {(["present", "late", "absent"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => applyChoice(attendanceFor, st)}
                      aria-pressed={attendanceMap[attendanceFor] === st}
                      className={`min-h-[40px] rounded-lg border text-xs font-semibold ${attendanceMap[attendanceFor] === st ? "border-brand-border bg-brand-pale text-brand" : "border-line bg-surface text-ink"}`}
                    >
                      {STATUS_LABEL[st]}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => applyChoice(attendanceFor, "clear")}
                    className="min-h-[40px] rounded-lg border border-line bg-surface text-xs font-semibold text-status-danger-text"
                  >
                    Clear
                  </button>
                </div>
                {cur?.rpe != null && (
                  <p className="mt-1.5 text-[11px] text-ink-soft">Clear also removes their effort rating ({cur.rpe}/10).</p>
                )}
              </div>
            );
          })()}
          <p className="text-[11px] text-ink-soft mt-2">
            Tap a player to mark them present. Tap a marked player to change or clear it.
          </p>
            </Card>
          </Section>

          <Section className="order-2" title="Needs you">
            <CoachAttention
              campId={campId}
              camp={s.camp!}
              isAdmin={s.isAdmin}
              players={playerMembers}
              matches={matches.data ?? []}
              assessments={assessments.data ?? []}
              todayAttendance={(attendance.data ?? []).filter((a) => a.session_id === todaySession?.id)}
              sessionMinutes={todaySession?.duration_min}
              onOpenPlayer={setSelectedPersonId}
              onOpenInjuries={() => setInjuryOpen(true)}
            />
          </Section>

          <Section className="order-5" title="Recent matches" action={<Link href="/matches">See all</Link>}>
            {recent.length === 0 ? (
              <Empty>No matches yet. Record one right after a game.</Empty>
            ) : (
              <Card className="divide-y divide-line overflow-hidden !p-0">
                {recent.map((m) => (
                  <MatchCard key={m.id} flat match={m} people={members.data ?? []} meId={s.meId} isStaff={s.isStaff} />
                ))}
              </Card>
            )}
          </Section>
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-6">
          <Section className="order-3" title="Play">
            <div className="grid grid-cols-3 gap-2">
              <ActionTile icon={Radio} label="Live scorer" onClick={() => setLiveScoring(true)} />
              <ActionTile icon={Plus} label="Record" href="/matches?new=1" primary />
              <PairingHelperModal
                players={playerMembers}
                matches={matches.data ?? []}
                standings={standings.data ?? []}
                attendanceMap={attendanceMap}
                onSelectMatch={(cat, slots) => setLoc(`/matches?new=1&cat=${cat}&slots=${slots.map((x) => x ?? "").join(",")}`)}
                renderTrigger={(open) => <ActionTile icon={Sparkles} label="Next pairing" onClick={open} />}
              />
            </div>
            <LiveCourtBoard
              campId={campId}
              isStaff={s.isStaff}
              players={playerMembers}
              onRecordMatchOnCourt={(courtNum) => setLoc(`/matches?new=1&court=${courtNum}`)}
            />
          </Section>

          <Section className="order-4" title="Today's plan" action={<Link href="/training">Training log</Link>}>
            <Card className="divide-y divide-line overflow-hidden !p-0">
              {todays.length === 0 ? (
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <p className="text-sm text-ink-soft">No session for today yet.</p>
                  <Button size="sm" variant="secondary" onClick={handleStartTodaySession}><Play size={14} /> Start</Button>
                </div>
              ) : (
                todays.map((x) => (
                  <Link key={x.id} href={`/training?session=${x.id}`} className="block px-4 py-3 transition hover:bg-surface-2/60">
                    <p className="font-semibold text-ink">{x.title}</p>
                    {x.focus && <p className="text-sm text-ink-soft">{x.focus}</p>}
                    {(drills.data ?? []).some((d) => d.session_id === x.id) && (
                      <p className="mt-1 text-xs text-ink-soft">
                        {(drills.data ?? []).filter((d) => d.session_id === x.id).map((d) => d.drill_name).join(" · ")}
                      </p>
                    )}
                  </Link>
                ))
              )}
              {todays.length > 1 && (
                <p className="px-4 py-2 text-[11px] text-ink-soft">
                  {todays.length} sessions today. Open one to edit it or delete a duplicate.
                </p>
              )}
              <WeatherVenueBanner campId={campId} isStaff={s.isStaff} flat />
              {s.meId && (
                <NextSessionFocusCard campId={campId} personId={s.meId} playerName={myName} isStaff={s.isStaff} onOpenSkills={() => setSkillLibraryOpen(true)} flat />
              )}
            </Card>
          </Section>

          <Section className="order-6" title="Tools">
            <div className="flex flex-wrap gap-2">
              {tools.map((t) => {
                const inner = (
                  <>
                    <t.icon size={15} className="text-brand" />
                    <span>{t.label}</span>
                  </>
                );
                const cls = "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-xs font-semibold text-ink shadow-card ring-1 ring-line transition hover:bg-surface-2";
                return t.href ? (
                  <Link key={t.label} href={t.href} className={cls}>{inner}</Link>
                ) : (
                  <button key={t.label} type="button" onClick={t.onClick} className={cls}>{inner}</button>
                );
              })}
            </div>
          </Section>
        </div>
      </div>

      {/* Live Court Scorer Modal */}
      <LiveCourtScorer
        open={liveScoring}
        onClose={() => setLiveScoring(false)}
        players={playerMembers}
        onSaveMatch={async (m) => {
          const r = await matchMut.record.mutateAsync(m);
          if (r.queued) toast.success("No signal: saved on this phone. It will send automatically.");
        }}
        busy={matchMut.record.isPending}
      />

      {/* Announcements Manager Modal */}
      <AnnouncementManagerModal
        campId={campId}
        open={announcementOpen}
        onClose={() => setAnnouncementOpen(false)}
        members={members.data ?? []}
        authorName={s.isStaff ? "Coach" : "Staff"}
      />

      {/* Equipment Tracker Modal */}
      <EquipmentTrackerModal
        campId={campId}
        open={equipmentOpen}
        onClose={() => setEquipmentOpen(false)}
        players={playerMembers}
      />

      {/* Injury Tracker Modal */}
      <InjuryTrackerModal
        campId={campId}
        open={injuryOpen}
        onClose={() => setInjuryOpen(false)}
        meId={s.meId ?? null}
        isStaff={s.isStaff}
        players={playerMembers}
      />

      {/* Camp History Modal */}
      <CampHistoryModal
        camp={s.camp!}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        members={members.data ?? []}
        matches={matches.data ?? []}
        standings={standings.data ?? []}
        sessions={sessions.data ?? []}
      />

      {/* Personal Match History & Rating Progression Modal */}
      <PersonalMatchHistoryModal
        open={matchHistoryOpen}
        onClose={() => setMatchHistoryOpen(false)}
        personId={s.meId ?? null}
        members={members.data ?? []}
        matches={matches.data ?? []}
        standings={standings.data ?? []}
      />

      {/* Session Reflection Modal */}
      <SessionReflectionModal
        open={reflectionOpen}
        onClose={() => setReflectionOpen(false)}
        campId={campId}
        personId={s.meId ?? null}
        playerName={myName}
        sessions={sessions.data ?? []}
      />

      {/* Skill & Drill Library Sheet */}
      <SkillLibrarySheet
        open={skillLibraryOpen}
        onClose={() => setSkillLibraryOpen(false)}
        campId={campId}
        currentPersonId={s.meId ?? null}
        isStaff={s.isStaff}
      />

      {/* Camp Calendar Export Modal */}
      <CampCalendarExportModal
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        campName={s.camp?.name ?? "IISc Badminton Camp"}
        sessions={sessions.data ?? []}
        matches={matches.data ?? []}
        members={members.data ?? []}
      />

      <ConfirmDialog
        open={confirmUnmarkAll}
        title="Clear today's attendance?"
        message={`Removes check-ins for ${presentCount + lateCount + absentCount} player${presentCount + lateCount + absentCount === 1 ? "" : "s"}, including any effort ratings they logged. This can't be undone.`}
        confirmLabel="Clear attendance"
        onConfirm={handleUnmarkAll}
        onCancel={() => setConfirmUnmarkAll(false)}
      />

      {/* Quick Command Palette (⌘K) */}
      <QuickCommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        members={members.data ?? []}
        onSelectPlayer={(id) => setSelectedPersonId(id)}
      />

      {/* Quick Player Detail Inspection Sheet */}
      <PlayerDetailSheet
        campId={campId}
        personId={selectedPersonId}
        onClose={() => setSelectedPersonId(null)}
        members={members.data ?? []}
        standings={standings.data ?? []}
        matches={matches.data ?? []}
        attendance={attendance.data ?? []}
        assessments={assessments.data ?? []}
        isStaff={s.isStaff}
      />
    </div>
  );
}

/** A square action in the Play row. */
function ActionTile({ icon: Icon, label, onClick, href, primary = false }: {
  icon: typeof Plus; label: string; onClick?: () => void; href?: string; primary?: boolean;
}) {
  const cls = cx(
    "flex min-h-[76px] w-full flex-col items-center justify-center gap-1.5 rounded-2xl px-2 text-xs font-semibold transition active:scale-[0.97]",
    primary ? "bg-brand text-white shadow-[0_6px_16px_-6px_rgb(15_118_110/0.6)] hover:bg-brand-dark" : "bg-surface text-ink shadow-card ring-1 ring-line hover:bg-surface-2",
  );
  const inner = (
    <>
      <Icon size={20} className={primary ? "text-white" : "text-brand"} />
      <span>{label}</span>
    </>
  );
  return href ? <Link href={href} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}
