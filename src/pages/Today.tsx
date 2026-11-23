import { useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Plus, LineChart, Radio, Sparkles, Calendar,
  UserCheck, Play, Megaphone,
  Package, HeartPulse, History, BookOpen,
  Search, Share2, RotateCcw, Table2
} from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../lib/session";
import {
  useAssessments, useAttendance, useDrills, useMatches, useMatchMutations, useMembers,
  useSessions, useStandings, useTrainingMutations,
} from "../lib/api";
import { MatchCard } from "../components/MatchCard";
import { PairingHelperModal } from "../components/PairingHelper";
import { AnnouncementBanner, AnnouncementManagerModal } from "../components/Announcements";
import { WeatherVenueBanner } from "../components/WeatherVenuePlan";
import { NextSessionFocusCard } from "../components/NextSessionFocusCard";
import { LiveCourtBoard } from "../components/LiveCourtBoard";
import { MountOnFirstOpen, lazyNamed } from "../components/Deferred";
import { shareDailyScheduleOnWhatsApp } from "../lib/whatsappShare";
import { useLeave, useVenuePlan } from "../lib/sharedData";
import { leaveByPerson, leaveReasonLabel } from "../lib/leave";
import { DEFAULT_SESSION } from "../lib/today";
import { errorText } from "../lib/supabase";
import { CoachAttention } from "../components/CoachAttention";
import { Avatar, Button, Card, ConfirmDialog, Empty, Section, cx, today } from "../components/ui";
import type { Attendance } from "../lib/types";

// Sheets that open on tap load on first use, so the home screen's first download stays small.
const LiveCourtScorer = lazyNamed(() => import("../components/LiveCourtScorer"), "LiveCourtScorer");
const EquipmentTrackerModal = lazyNamed(() => import("../components/EquipmentTracker"), "EquipmentTrackerModal");
const InjuryTrackerModal = lazyNamed(() => import("../components/InjuryTracker"), "InjuryTrackerModal");
const CampHistoryModal = lazyNamed(() => import("../components/CampHistory"), "CampHistoryModal");
const PersonalMatchHistoryModal = lazyNamed(() => import("../components/PersonalMatchHistory"), "PersonalMatchHistoryModal");
const SessionReflectionModal = lazyNamed(() => import("../components/SessionReflection"), "SessionReflectionModal");
const SkillLibrarySheet = lazyNamed(() => import("../components/SkillLibrary"), "SkillLibrarySheet");
const CampCalendarExportModal = lazyNamed(() => import("../components/CalendarExport"), "CampCalendarExportModal");
const QuickCommandPalette = lazyNamed(() => import("../components/QuickCommandPalette"), "QuickCommandPalette");
const PlayerDetailSheet = lazyNamed(() => import("../components/PlayerDetail"), "PlayerDetailSheet");

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
  /** Taps still saving: the status shown until the server agrees (null = being cleared). */
  const [pending, setPending] = useState<Record<string, Attendance["status"] | null>>({});
  const tapSeq = useRef<Record<string, number>>({});
  /** Player whose check-in is about to be cleared along with an effort rating. */
  const [confirmClear, setConfirmClear] = useState<string | null>(null);
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

  // Players the admin marked on leave today (0010). They're left out of "All present", the
  // not-marked count and the pairing helper, unless they turn up anyway.
  const leave = useLeave(campId);
  const awayToday = useMemo(() => leaveByPerson(leave.data ?? [], today()), [leave.data]);
  const availablePlayers = useMemo(
    () => playerMembers.filter((p) => !awayToday.has(p.id) || attendanceMap[p.id] === "present" || attendanceMap[p.id] === "late"),
    [playerMembers, awayToday, attendanceMap],
  );

  // The register: present, late, away, on leave, then not marked; A–Z within each. Sorting uses
  // the tapped status straight away, so a row moves once instead of again when the save lands.
  const register = useMemo(() => {
    const rank = { present: 0, late: 1, absent: 2 } as const;
    return playerMembers
      .map((p) => {
        const status = (p.id in pending ? pending[p.id] : attendanceMap[p.id]) ?? null;
        const leaveRow = awayToday.get(p.id) ?? null;
        return { p, status, leave: leaveRow, order: status ? rank[status] : leaveRow ? 3 : 4 };
      })
      .sort((a, b) => a.order - b.order || a.p.full_name.localeCompare(b.p.full_name));
  }, [playerMembers, pending, attendanceMap, awayToday]);

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
        .filter((p) => !awayToday.has(p.id) && attendanceOf(sessionId, p.id)?.status !== "present")
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
    trainingMut.clearSessionAttendance.mutate(todaySession.id, {
      onSuccess: () => toast.success("Attendance cleared for today"),
      onError: onErr,
    });
  };

  /** Shows the new status at once and saves it; a later tap on the same row wins. */
  const commitStatus = (playerId: string, next: Attendance["status"] | null) => {
    const n = (tapSeq.current[playerId] ?? 0) + 1;
    tapSeq.current[playerId] = n;
    setPending((m) => ({ ...m, [playerId]: next }));
    (next ? setStatusFor(playerId, next) : clearFor(playerId))
      .catch(onErr)
      .finally(() => {
        if (tapSeq.current[playerId] !== n) return;
        setPending((m) => {
          const rest = { ...m };
          delete rest[playerId];
          return rest;
        });
      });
  };

  /** Tap a status to set it; tap the lit one again to clear (asks first if it would drop an effort rating). */
  const handleRegisterTap = (playerId: string, st: Attendance["status"], current: Attendance["status"] | null) => {
    if (current !== st) return commitStatus(playerId, st);
    const rpe = todaySession ? attendanceOf(todaySession.id, playerId)?.rpe : null;
    if (rpe != null) setConfirmClear(playerId);
    else commitStatus(playerId, null);
  };
  const confirmClearRpe = confirmClear && todaySession ? attendanceOf(todaySession.id, confirmClear)?.rpe : null;

  // Roster breakdown
  const presentCount = playerMembers.filter((p) => attendanceMap[p.id] === "present").length;
  const lateCount = playerMembers.filter((p) => attendanceMap[p.id] === "late").length;
  const absentCount = playerMembers.filter((p) => attendanceMap[p.id] === "absent").length;
  const unmarkedCount = playerMembers.filter((p) => !attendanceMap[p.id] && !awayToday.has(p.id)).length;

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
              <span className="flex items-center gap-4">
                <Link href="/attendance" className="inline-flex items-center gap-1 hover:underline">
                  <Table2 size={13} /> All days
                </Link>
                <button type="button" onClick={shareBriefing} className="inline-flex items-center gap-1 hover:underline">
                  <Share2 size={13} /> Share briefing
                </button>
              </span>
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
              {/* Register: one row per player, sorted by status. Two columns once the card is wide enough. */}
              <div className="@container -mt-1">
                <ul className="@2xl:columns-2 @2xl:gap-x-6">
                  {register.map(({ p, status, leave: away }) => (
                    <li key={p.id} className="flex break-inside-avoid items-center gap-2.5 border-b border-line/70 py-1.5 last:border-b-0">
                      <span className="hidden @xs:block"><Avatar name={p.full_name} size="sm" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-[13px] font-medium leading-snug text-ink">{p.full_name}</p>
                        {away && (
                          <p className="text-[11px] leading-tight text-ink-faint">On leave · {leaveReasonLabel(away.reason)}</p>
                        )}
                      </div>
                      <div role="group" aria-label={`${p.full_name}: attendance`} className="flex shrink-0 gap-1">
                        {(["present", "late", "absent"] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleRegisterTap(p.id, st, status)}
                            aria-pressed={status === st}
                            title={status === st ? "Tap again to clear" : `Mark ${STATUS_LABEL[st].toLowerCase()}`}
                            className={cx(
                              "min-h-[36px] rounded-lg border px-2 text-xs font-semibold transition active:scale-95 @sm:px-2.5",
                              status === st ? STATUS_TONE[st] : "border-line bg-surface text-ink-soft hover:bg-surface-2 hover:text-ink",
                            )}
                          >
                            {STATUS_LABEL[st]}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-[11px] text-ink-soft">
                Tap Present, Late or Away for each player. Tap it again to clear.
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
                players={availablePlayers}
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
      <MountOnFirstOpen when={liveScoring}>
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
      </MountOnFirstOpen>

      {/* Announcements Manager Modal */}
      <AnnouncementManagerModal
        campId={campId}
        open={announcementOpen}
        onClose={() => setAnnouncementOpen(false)}
        members={members.data ?? []}
        authorName={s.isStaff ? "Coach" : "Staff"}
      />

      {/* Equipment Tracker Modal */}
      <MountOnFirstOpen when={equipmentOpen}>
        <EquipmentTrackerModal
          campId={campId}
          open={equipmentOpen}
          onClose={() => setEquipmentOpen(false)}
          players={playerMembers}
        />
      </MountOnFirstOpen>

      {/* Injury Tracker Modal */}
      <MountOnFirstOpen when={injuryOpen}>
        <InjuryTrackerModal
          campId={campId}
          open={injuryOpen}
          onClose={() => setInjuryOpen(false)}
          meId={s.meId ?? null}
          isStaff={s.isStaff}
          players={playerMembers}
        />
      </MountOnFirstOpen>

      {/* Camp History Modal */}
      <MountOnFirstOpen when={historyOpen}>
        <CampHistoryModal
          camp={s.camp!}
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          members={members.data ?? []}
          matches={matches.data ?? []}
          standings={standings.data ?? []}
          sessions={sessions.data ?? []}
        />
      </MountOnFirstOpen>

      {/* Personal Match History & Rating Progression Modal */}
      <MountOnFirstOpen when={matchHistoryOpen}>
        <PersonalMatchHistoryModal
          open={matchHistoryOpen}
          onClose={() => setMatchHistoryOpen(false)}
          personId={s.meId ?? null}
          members={members.data ?? []}
          matches={matches.data ?? []}
          standings={standings.data ?? []}
        />
      </MountOnFirstOpen>

      {/* Session Reflection Modal */}
      <MountOnFirstOpen when={reflectionOpen}>
        <SessionReflectionModal
          open={reflectionOpen}
          onClose={() => setReflectionOpen(false)}
          campId={campId}
          personId={s.meId ?? null}
          playerName={myName}
          sessions={sessions.data ?? []}
        />
      </MountOnFirstOpen>

      {/* Skill & Drill Library Sheet */}
      <MountOnFirstOpen when={skillLibraryOpen}>
        <SkillLibrarySheet
          open={skillLibraryOpen}
          onClose={() => setSkillLibraryOpen(false)}
          campId={campId}
          currentPersonId={s.meId ?? null}
          isStaff={s.isStaff}
        />
      </MountOnFirstOpen>

      {/* Camp Calendar Export Modal */}
      <MountOnFirstOpen when={calendarOpen}>
        <CampCalendarExportModal
          open={calendarOpen}
          onClose={() => setCalendarOpen(false)}
          campName={s.camp?.name ?? "IISc Badminton Camp"}
          sessions={sessions.data ?? []}
          matches={matches.data ?? []}
          members={members.data ?? []}
        />
      </MountOnFirstOpen>

      <ConfirmDialog
        open={!!confirmClear}
        title={`Clear ${confirmClear ? nameOf(confirmClear) : "this player"}'s check-in?`}
        message={`This also removes the effort rating they logged${confirmClearRpe != null ? ` (${confirmClearRpe}/10)` : ""}.`}
        confirmLabel="Clear check-in"
        onConfirm={() => {
          const id = confirmClear;
          setConfirmClear(null);
          if (id) commitStatus(id, null);
        }}
        onCancel={() => setConfirmClear(null)}
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
      <MountOnFirstOpen when={commandOpen}>
        <QuickCommandPalette
          open={commandOpen}
          onClose={() => setCommandOpen(false)}
          members={members.data ?? []}
          onSelectPlayer={(id) => setSelectedPersonId(id)}
        />
      </MountOnFirstOpen>

      {/* Quick Player Detail Inspection Sheet */}
      <MountOnFirstOpen when={!!selectedPersonId}>
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
      </MountOnFirstOpen>
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
