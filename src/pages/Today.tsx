import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Plus, LineChart, Radio, Sparkles, Calendar,
  UserCheck, Clock, UserX, Users, Play, Zap, Megaphone,
  Package, HeartPulse, History, BookOpen, TrendingUp, MessageSquare,
  Search, Share2, RotateCcw
} from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../lib/session";
import {
  useAssessments, useAttendance, useDrills, useMatches, useMatchMutations, useMembers,
  useSessions, useStandings, useTrainingMutations,
} from "../lib/api";
import { MatchCard } from "../components/MatchCard";
import { GuideButton } from "../components/GuideModal";
import { PairingHelperModal } from "../components/PairingHelper";
import { CampHighlightsCard } from "../components/CampHighlights";
import { LiveCourtScorer } from "../components/LiveCourtScorer";
import { AnnouncementBanner, AnnouncementManagerModal } from "../components/Announcements";
import { EquipmentTrackerModal } from "../components/EquipmentTracker";
import { InjuryTrackerModal } from "../components/InjuryTracker";
import { CampHistoryModal } from "../components/CampHistory";
import { PersonalMatchHistoryModal } from "../components/PersonalMatchHistory";
import { SessionReflectionModal, SessionReflectionBanner } from "../components/SessionReflection";
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
import { AdminSetupChecklist } from "../components/AdminChecklist";
import { Avatar, Badge, Button, Card, ConfirmDialog, Empty, fmtDate, today } from "../components/ui";
import { DRILL_TYPES, type Attendance } from "../lib/types";

const STATUS_LABEL: Record<Attendance["status"], string> = { present: "Present", late: "Late", absent: "Away" };
import { InstallCard } from "../components/AppChrome";

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
  const recent = (matches.data ?? []).slice(0, 5);

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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Today</h1>
          <p className="text-sm text-ink-soft">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-xl border border-line bg-surface hover:bg-surface-2 text-ink-soft hover:text-ink transition shadow-2xs"
            title="Quick search players, techniques, pages (⌘K or /)"
          >
            <Search size={14} className="text-brand" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden sm:inline-block font-mono text-[10px] bg-surface-2 border border-line px-1 rounded text-ink-soft">⌘K</kbd>
          </button>
          <GuideButton />
          <Link href="/matches?new=1">
            <Button size="sm">
              <Plus size={16} /> Match
            </Button>
          </Link>
        </div>
      </div>

      {/* Camp Announcements Alert */}
      <AnnouncementBanner
        campId={campId}
        meId={s.meId ?? null}
        isStaff={s.isStaff}
        onOpenManager={() => setAnnouncementOpen(true)}
      />

      {/* Weather & Venue-Aware Planning Banner */}
      <WeatherVenueBanner campId={campId} isStaff={s.isStaff} />

      {/* Role-Tailored Hub: Staff / Admin View */}
      {s.isStaff && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-2 border border-line">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand" />
            <span className="text-xs font-semibold text-ink">
              {s.isAdmin ? "Admin & Coaching Command" : "Coaching Staff Hub"}
            </span>
            <span className="text-xs text-ink-soft">
              · {presentCount}/{playerMembers.length} athletes present
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                shareDailyScheduleOnWhatsApp({
                  campName: s.camp?.name ?? "IISc Badminton Camp",
                  session: todaySession,
                  weatherPlan: venuePlan.data ?? null,
                  presentCount,
                  totalSquad: playerMembers.length,
                });
              }}
              className="!text-emerald-700 dark:!text-emerald-400 !border-emerald-600/30 !bg-emerald-500/10 hover:!bg-emerald-500/20 text-xs py-1 h-auto"
            >
              <Share2 size={13} />
              <span>WhatsApp Briefing</span>
            </Button>
          </div>
        </div>
      )}

      {s.isAdmin && <AdminSetupChecklist camp={s.camp!} />}

      {s.isStaff && (
        <CoachAttention
          campId={campId}
          players={playerMembers}
          matches={matches.data ?? []}
          assessments={assessments.data ?? []}
          todayAttendance={(attendance.data ?? []).filter((a) => a.session_id === todaySession?.id)}
          sessionMinutes={todaySession?.duration_min}
          onOpenPlayer={setSelectedPersonId}
          onOpenInjuries={() => setInjuryOpen(true)}
        />
      )}

      {/* Next Session Focus (Small, trackable focus from coach or self) */}
      {s.meId && (
        <NextSessionFocusCard
          campId={campId}
          personId={s.meId}
          playerName={myName}
          isStaff={s.isStaff}
          onOpenSkills={() => setSkillLibraryOpen(true)}
        />
      )}

      {/* Courtside 4-Action Hub */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => setLiveScoring(true)}
          className="p-3 rounded-xl border border-line bg-surface hover:border-brand/60 hover:bg-brand-pale/30 transition text-left flex flex-col justify-between group shadow-xs"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="p-1.5 rounded-lg bg-brand-pale text-brand group-hover:scale-105 transition-transform">
              <Radio size={18} />
            </span>
            <span className="text-[10px] uppercase font-bold text-brand tracking-wider">Live</span>
          </div>
          <div>
            <p className="font-bold text-sm text-ink group-hover:text-brand transition-colors">Courtside Scorer</p>
            <p className="text-[11px] text-ink-soft">Touch points & haptics</p>
          </div>
        </button>

        <Link
          href="/matches?new=1"
          className="p-3 rounded-xl border border-line bg-surface hover:border-brand/60 hover:bg-brand-pale/30 transition text-left flex flex-col justify-between group shadow-xs"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="p-1.5 rounded-lg bg-surface-2 text-ink group-hover:scale-105 transition-transform">
              <Zap size={18} />
            </span>
            <span className="text-[10px] uppercase font-bold text-ink-soft tracking-wider">Fast</span>
          </div>
          <div>
            <p className="font-bold text-sm text-ink group-hover:text-brand transition-colors">Record Match</p>
            <p className="text-[11px] text-ink-soft">Tap players, quick scores</p>
          </div>
        </Link>

        <div className="p-3 rounded-xl border border-line bg-surface hover:border-brand/60 hover:bg-brand-pale/30 transition text-left flex flex-col justify-between group shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 group-hover:scale-105 transition-transform">
              <Sparkles size={18} />
            </span>
            <span className="text-[10px] uppercase font-bold text-amber-600 tracking-wider">AI</span>
          </div>
          <div>
            <p className="font-bold text-sm text-ink group-hover:text-brand transition-colors mb-1">Next Pairing</p>
            <PairingHelperModal
              players={playerMembers}
              matches={matches.data ?? []}
              standings={standings.data ?? []}
              attendanceMap={attendanceMap}
              onSelectMatch={(cat, slots) => {
                setLoc(`/matches?new=1&cat=${cat}&slots=${slots.map((x) => x ?? "").join(",")}`);
              }}
            />
          </div>
        </div>

        <Link
          href="/training"
          className="p-3 rounded-xl border border-line bg-surface hover:border-brand/60 hover:bg-brand-pale/30 transition text-left flex flex-col justify-between group shadow-xs"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="p-1.5 rounded-lg bg-surface-2 text-ink group-hover:scale-105 transition-transform">
              <Calendar size={18} />
            </span>
            <span className="text-[10px] uppercase font-bold text-ink-soft tracking-wider">Plan</span>
          </div>
          <div>
            <p className="font-bold text-sm text-ink group-hover:text-brand transition-colors">Training Log</p>
            <p className="text-[11px] text-ink-soft">Drills & attendance</p>
          </div>
        </Link>
      </div>

      {/* Live Court Board (Courts 1–4 Grid) */}
      <LiveCourtBoard
        campId={campId}
        isStaff={s.isStaff}
        players={playerMembers}
        onRecordMatchOnCourt={(courtNum) => {
          setLoc(`/matches?new=1&court=${courtNum}`);
        }}
      />

      {/* Camp Utility Shortcuts */}
      <div className="flex flex-wrap items-center gap-2">
        {s.meId && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setMatchHistoryOpen(true)}
            className="flex items-center gap-1.5 !text-xs font-semibold"
          >
            <TrendingUp size={14} className="text-brand" />
            <span>My Match &amp; Rating History</span>
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setSkillLibraryOpen(true)}
          className="flex items-center gap-1.5 !text-xs"
        >
          <BookOpen size={14} className="text-brand" />
          <span>Skill &amp; Drill Library</span>
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setCalendarOpen(true)}
          className="flex items-center gap-1.5 !text-xs"
        >
          <Calendar size={14} className="text-brand" />
          <span>Add to Calendar</span>
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setReflectionOpen(true)}
          className="flex items-center gap-1.5 !text-xs"
        >
          <MessageSquare size={14} className="text-brand" />
          <span>Post-Practice Check-in</span>
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setAnnouncementOpen(true)}
          className="flex items-center gap-1.5 !text-xs"
        >
          <Megaphone size={14} className="text-brand" />
          <span>Announcements</span>
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setEquipmentOpen(true)}
          className="flex items-center gap-1.5 !text-xs"
        >
          <Package size={14} className="text-brand" />
          <span>Equipment &amp; Gear</span>
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setInjuryOpen(true)}
          className="flex items-center gap-1.5 !text-xs"
        >
          <HeartPulse size={14} className="text-status-warn-text" />
          <span>{s.isStaff ? "Physio & Injury Board" : "Report Soreness / Injury"}</span>
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setHistoryOpen(true)}
          className="flex items-center gap-1.5 !text-xs"
        >
          <History size={14} className="text-ink-soft" />
          <span>Camp Archive</span>
        </Button>
      </div>

      {/* Staff self check-in */}
      {s.meId && (
        <Card className="border-brand/30 bg-surface">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 font-bold text-sm text-ink">
              <UserCheck size={16} className="text-brand" />
              <span>Are you at the hall today?</span>
            </div>
            {myTodayAtt?.status && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${myTodayAtt.status === "present"
                ? "bg-status-success-bg text-status-success-text border border-status-success-border"
                : myTodayAtt.status === "late"
                  ? "bg-status-warn-bg text-status-warn-text border border-status-warn-border"
                  : "bg-status-danger-bg text-status-danger-text border border-status-danger-border"
                }`}>
                {myTodayAtt.status === "present" ? "Present on court" : myTodayAtt.status === "late" ? "Arriving late" : "Rest / Unavailable"}
              </span>
            )}
          </div>
          <p className="text-xs text-ink-soft mb-3">
            Mark yourself in so the pairing helper knows you're on court. Tap your status again to clear it.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleSetMyStatus("present")}
              className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${myTodayAtt?.status === "present"
                ? "bg-status-success-bg text-status-success-text border-status-success-border shadow-xs"
                : "bg-surface-2 text-ink border-line hover:border-status-success-border"
                }`}
            >
              <UserCheck size={14} className="text-status-success-text" />
              <span>Present</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetMyStatus("late")}
              className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${myTodayAtt?.status === "late"
                ? "bg-status-warn-bg text-status-warn-text border-status-warn-border shadow-xs"
                : "bg-surface-2 text-ink border-line hover:border-status-warn-border"
                }`}
            >
              <Clock size={14} className="text-status-warn-text" />
              <span>Late</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetMyStatus("absent")}
              className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${myTodayAtt?.status === "absent"
                ? "bg-status-danger-bg text-status-danger-text border-status-danger-border shadow-xs"
                : "bg-surface-2 text-ink border-line hover:border-status-danger-border"
                }`}
            >
              <UserX size={14} className="text-status-danger-text" />
              <span>Away</span>
            </button>
          </div>
        </Card>
      )}

      {/* Post-Practice Reflection Check-in Banner */}
      <SessionReflectionBanner onClick={() => setReflectionOpen(true)} />

      {/* Staff Live Roster Availability View */}
      {s.isStaff && (
        <Card className="border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <div className="flex items-center gap-1.5 font-bold text-sm text-ink">
                <Users size={16} className="text-brand" />
                <span>Live Hall Availability</span>
              </div>
              <p className="text-xs text-ink-soft">
                {presentCount} Present · {lateCount} Late · {absentCount} Away · {unmarkedCount} Unmarked
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!todaySession ? (
                <Button size="sm" variant="secondary" onClick={handleStartTodaySession}>
                  <Play size={14} /> Start Today's Session
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="secondary" onClick={handleMarkAllPresent} disabled={trainingMut.setAttendanceBulk.isPending}>
                    <UserCheck size={14} /> Mark All Present
                  </Button>
                  {presentCount + lateCount + absentCount > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => setConfirmUnmarkAll(true)} className="!text-xs text-ink-soft hover:!text-status-danger-text">
                      <RotateCcw size={13} /> Unmark all
                    </Button>
                  )}
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
      )}

      <InstallCard />

      {s.isStaff && (
        <Link href="/insights">
          <Card className="flex items-center gap-3 p-3 hover:border-brand/40">
            <LineChart size={18} className="text-brand" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-ink">Insights &amp; coaching prompts</p>
              <p className="text-[11px] text-ink-soft">Compare players, best doubles pairs, training load, readiness and AI prompts.</p>
            </div>
          </Card>
        </Link>
      )}

      {/* Camp Awards & Leaders */}
      <CampHighlightsCard
        standings={standings.data ?? []}
      />

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink-soft">Training today</h2>
          <Link href="/training" className="text-xs font-semibold text-brand">Training log</Link>
        </div>
        {todays.length === 0 ? (
          <Empty>
            No session logged for today. <Link href="/training" className="font-semibold text-brand">Log one</Link>
          </Empty>
        ) : (
          <div className="space-y-2">
            {todays.map((x) => (
              <Card key={x.id}>
                <p className="font-semibold">{x.title}</p>
                {x.focus && <p className="text-sm text-ink-soft">Focus: {x.focus}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(drills.data ?? []).filter((d) => d.session_id === x.id).map((d) => (
                    <Badge key={d.id} tone="brand">
                      {d.drill_name}{d.duration_min ? ` · ${d.duration_min}m` : ""} ({DRILL_TYPES.find((t) => t.value === d.drill_type)?.label})
                    </Badge>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink-soft">Recent matches</h2>
          <Link href="/matches" className="text-xs font-semibold text-brand">See all</Link>
        </div>
        {recent.length === 0 ? (
          <Empty>No matches recorded yet.</Empty>
        ) : (
          <div className="space-y-2">
            {recent.map((m) => (
              <MatchCard key={m.id} match={m} people={members.data ?? []} meId={s.meId} isStaff={s.isStaff} />
            ))}
          </div>
        )}
        {recent.length > 0 && (
          <p className="mt-2 text-xs text-ink-soft">Last match {fmtDate(recent[0].played_on)}.</p>
        )}
      </section>

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
