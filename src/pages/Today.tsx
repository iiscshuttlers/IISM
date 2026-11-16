import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Plus, Flame, Check, LineChart, Radio, Sparkles, Calendar,
  UserCheck, Clock, UserX, Users, Play, Zap, Megaphone,
  Package, HeartPulse, History, BookOpen, TrendingUp, MessageSquare,
  Search, Share2
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
import { PlayerGoalsSection } from "../components/PlayerGoals";
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
import { getWeatherVenuePlan } from "../lib/campExtended";
import { Avatar, Badge, Button, Card, Empty, fmtDate, today } from "../components/ui";
import { DRILL_TYPES } from "../lib/types";
import { WellnessCheckin } from "../components/WellnessCheckin";
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

  const sessions = useSessions(campId);
  const todays = (sessions.data ?? []).filter((x) => x.session_date === today());
  const drills = useDrills(todays.map((x) => x.id));
  const attendance = useAttendance(todays.map((x) => x.id));
  const assessments = useAssessments(campId, s.isStaff);
  const trainingMut = useTrainingMutations(campId);
  const matchMut = useMatchMutations(campId);

  const matches = useMatches(campId);
  const members = useMembers(campId);
  const standings = useStandings(campId);
  const mine = (standings.data ?? []).find((r) => r.person_id === s.meId);
  const myName = (members.data ?? []).find((m) => m.id === s.meId)?.full_name;
  const rank = mine ? (standings.data ?? []).findIndex((r) => r.person_id === s.meId) + 1 : null;
  const recent = (matches.data ?? []).slice(0, 5);
  const isPlayer = s.role === "player";
  const showRank = s.isStaff || s.camp!.players_see_all_results;

  const playerMembers = useMemo(
    () => (members.data ?? []).filter((m) => m.role === "player"),
    [members.data]
  );

  // Today's primary training session
  const todaySession = todays[0];

  // Attendance map for today's session
  const attendanceMap = useMemo(() => {
    const map: Record<string, "present" | "late" | "absent"> = {};
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

  const handleSetMyStatus = (status: "present" | "late" | "absent") => {
    if (!s.meId) return;
    if (!todaySession) {
      // Auto-create session if none exists
      trainingMut.addSession.mutate(
        {
          session_date: today(),
          title: "Today's Training & Matches",
          focus: "Practice & Matchplay",
          notes: "",
          duration_min: 120,
        },
        {
          onSuccess: (res) => {
            trainingMut.setAttendance.mutate({
              session_id: res.id,
              person_id: s.meId!,
              status,
              rpe: null,
              note: null,
            });
            toast.success(`Check-in recorded: ${status === "present" ? "Present on court" : status === "late" ? "Late" : "Unavailable"}`);
          },
        }
      );
      return;
    }

    trainingMut.setAttendance.mutate(
      {
        session_id: todaySession.id,
        person_id: s.meId,
        status,
        rpe: myTodayAtt?.rpe ?? null,
        note: myTodayAtt?.note ?? null,
      },
      {
        onSuccess: () => {
          const label = status === "present" ? "Present on court" : status === "late" ? "Late" : "Rest / Unavailable";
          toast.success(`Check-in updated: ${label}`);
        },
      }
    );
  };

  const handleSetMyRpe = (rpeVal: number) => {
    if (!todaySession || !s.meId) return;
    trainingMut.setAttendance.mutate(
      {
        session_id: todaySession.id,
        person_id: s.meId,
        status: myTodayAtt?.status ?? "present",
        rpe: rpeVal,
        note: myTodayAtt?.note ?? null,
      },
      {
        onSuccess: () => toast.success(`Logged effort: RPE ${rpeVal}/10`),
      }
    );
  };

  const handleStartTodaySession = () => {
    trainingMut.addSession.mutate(
      {
        session_date: today(),
        title: "Today's Training & Matches",
        focus: "Practice & Matchplay",
        notes: "",
        duration_min: 120,
      },
      {
        onSuccess: () => toast.success("Started today's session"),
      }
    );
  };

  const handleMarkAllPresent = () => {
    const applyAll = (sessionId: string) => {
      for (const p of playerMembers) {
        const cur = (attendance.data ?? []).find((a) => a.session_id === sessionId && a.person_id === p.id);
        if (cur?.status !== "present") {
          trainingMut.setAttendance.mutate({
            session_id: sessionId,
            person_id: p.id,
            status: "present",
            rpe: cur?.rpe ?? null,
            note: cur?.note ?? null,
          });
        }
      }
      toast.success("Marked all players present");
    };

    if (!todaySession) {
      trainingMut.addSession.mutate(
        {
          session_date: today(),
          title: "Today's Training & Matches",
          focus: "Practice & Matchplay",
          notes: "",
          duration_min: 120,
        },
        {
          onSuccess: (res) => applyAll(res.id),
        }
      );
    } else {
      applyAll(todaySession.id);
    }
  };

  const handleTogglePlayerAttendance = (playerId: string) => {
    const cur = attendanceMap[playerId];
    const nextStatus: "present" | "late" | "absent" =
      !cur ? "present" : cur === "present" ? "late" : cur === "late" ? "absent" : "present";

    const applyStatus = (sessionId: string) => {
      const curAtt = (attendance.data ?? []).find((a) => a.session_id === sessionId && a.person_id === playerId);
      trainingMut.setAttendance.mutate(
        {
          session_id: sessionId,
          person_id: playerId,
          status: nextStatus,
          rpe: curAtt?.rpe ?? null,
          note: curAtt?.note ?? null,
        },
        {
          onSuccess: () => {
            const pName = playerMembers.find((m) => m.id === playerId)?.full_name ?? "Player";
            const label = nextStatus === "present" ? "Present on court" : nextStatus === "late" ? "Marked Late" : "Marked Away";
            toast.success(`${pName}: ${label}`);
          },
        }
      );
    };

    if (!todaySession) {
      trainingMut.addSession.mutate(
        {
          session_date: today(),
          title: "Today's Training & Matches",
          focus: "Practice & Matchplay",
          notes: "",
          duration_min: 120,
        },
        {
          onSuccess: (res) => applyStatus(res.id),
        }
      );
    } else {
      applyStatus(todaySession.id);
    }
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

      {/* Role-Tailored Hub: Athlete View */}
      {isPlayer && (
        <Card className="bg-gradient-to-r from-teal-500/10 via-brand-pale/40 to-surface border-brand/30 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Avatar name={myName || "Athlete"} size="md" />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-base text-ink">Welcome back, {myName || "Athlete"}</h2>
                  <Badge tone={myTodayAtt?.status === "present" ? "good" : myTodayAtt?.status === "late" ? "warn" : "neutral"}>
                    {myTodayAtt?.status === "present" ? "On Court" : myTodayAtt?.status === "late" ? "Arriving Late" : "Check-in Pending"}
                  </Badge>
                </div>
                <p className="text-xs text-ink-soft">
                  {myTodayAtt?.status === "present"
                    ? "You are checked in for today's session and available for matches."
                    : "Tap 'Present' below when you reach the badminton hall."}
                </p>
              </div>
            </div>
            {mine && (
              <div className="flex items-center gap-3 bg-surface/80 rounded-xl px-3 py-1.5 border border-line self-start sm:self-auto">
                <div className="text-center">
                  <p className="text-xs text-ink-soft">Rating</p>
                  <p className="text-sm font-bold text-brand">{mine.rating}</p>
                </div>
                {showRank && rank && (
                  <div className="text-center border-l border-line pl-3">
                    <p className="text-xs text-ink-soft">Rank</p>
                    <p className="text-sm font-bold text-ink">#{rank}</p>
                  </div>
                )}
                <div className="text-center border-l border-line pl-3">
                  <p className="text-xs text-ink-soft">Form</p>
                  <p className="text-sm font-bold font-mono text-ink">{mine.form || "—"}</p>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

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
                  weatherPlan: getWeatherVenuePlan(campId),
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
            <p className="text-[11px] text-ink-soft">Score presets & slots</p>
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

      {/* Player / Staff Self-Check-in */}
      {(isPlayer || (s.isStaff && s.meId)) && (
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
            Mark your attendance so coaches and the pairing suggester know you are available for court matches.
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
                <Button size="sm" variant="secondary" onClick={handleMarkAllPresent}>
                  <UserCheck size={14} /> Mark All Present
                </Button>
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
                  onClick={() => handleTogglePlayerAttendance(p.id)}
                  title={status ? `Current: ${status}. Click to cycle (Present -> Late -> Away)` : "Click to mark Present"}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition cursor-pointer hover:scale-105 active:scale-95 ${
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
          <p className="text-[11px] text-ink-soft mt-2 italic">
            Tip: Tap any player chip to cycle attendance (Present → Late → Away), or tap Mark All Present.
          </p>
        </Card>
      )}

      {isPlayer && mine && (
        <Card className="grid grid-cols-4 gap-2 text-center bg-gradient-to-br from-brand/5 to-surface">
          <Stat label="Camp rating" value={mine.rating} />
          <Stat label={showRank ? "Rank" : "Played"} value={showRank ? `#${rank}` : mine.played} />
          <Stat label="Won" value={mine.won} />
          <Stat label="Form" value={mine.form || "—"} mono />
        </Card>
      )}

      {/* Quick Player Effort Logger */}
      {isPlayer && todaySession && (
        <Card className="border-brand/30 bg-surface">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 font-bold text-sm text-ink">
              <Flame size={16} className="text-amber-500" />
              <span>How hard was today's session? (RPE)</span>
            </div>
            {myTodayAtt?.rpe && (
              <span className="text-xs font-bold text-brand bg-brand-pale px-2 py-0.5 rounded-full border border-brand-border">
                RPE {myTodayAtt.rpe}/10 logged
              </span>
            )}
          </div>
          <p className="text-xs text-ink-soft mb-3">
            Tap your perceived exertion level (1 = very light warm-up, 10 = max exhaustion).
          </p>
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((val) => {
              const selected = myTodayAtt?.rpe === val;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleSetMyRpe(val)}
                  className={`py-2 rounded-xl font-bold text-xs transition-all flex flex-col items-center justify-center border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 active:scale-95 ${selected
                    ? "bg-brand-pale text-brand border-brand-border font-black shadow-xs"
                    : "bg-surface-2 text-ink border-line hover:border-brand-border hover:text-brand"
                    }`}
                >
                  <span>{val}</span>
                  {selected && <Check size={10} className="mt-0.5" />}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <InstallCard />

      {isPlayer && s.meId && <WellnessCheckin campId={campId} meId={s.meId} />}

      {isPlayer && s.meId && (
        <PlayerGoalsSection
          campId={campId}
          personId={s.meId}
          isCoach={s.isStaff}
        />
      )}

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

const Stat = ({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) => (
  <div>
    <p className={`text-lg font-bold ${mono ? "font-mono tracking-wider" : ""}`}>{value}</p>
    <p className="text-[11px] text-ink-soft">{label}</p>
  </div>
);
