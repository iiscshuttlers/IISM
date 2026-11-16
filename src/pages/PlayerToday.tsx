import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Check, ChevronRight, Clock, Flame, MessageSquare, Plus, Radio, Trophy, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../lib/session";
import { useDrills, useMatches, useMatchMutations, useMembers, useSquad, useStandings } from "../lib/api";
import { errorText } from "../lib/supabase";
import { rpeIsDue, useMyCheckIn, useNow } from "../lib/today";
import { DRILL_TYPES, type Attendance } from "../lib/types";
import { MatchCard } from "../components/MatchCard";
import { LiveCourtScorer } from "../components/LiveCourtScorer";
import { LiveCourtBoard } from "../components/LiveCourtBoard";
import { AnnouncementBanner, AnnouncementManagerModal } from "../components/Announcements";
import { WeatherVenueBanner } from "../components/WeatherVenuePlan";
import { NextSessionFocusCard } from "../components/NextSessionFocusCard";
import { SessionReflectionModal } from "../components/SessionReflection";
import { SkillLibrarySheet } from "../components/SkillLibrary";
import { WellnessCheckin } from "../components/WellnessCheckin";
import { InstallCard } from "../components/AppChrome";
import { Badge, Button, Card, Empty, cx } from "../components/ui";

const STATUS_TEXT: Record<Attendance["status"], string> = {
  present: "You're checked in",
  late: "Marked as arriving late",
  absent: "Marked away today",
};

/**
 * A player's home screen, in the order the day happens: notices, check in, today's plan,
 * record a match, how you're doing, and (after training) how hard it was.
 */
export default function PlayerTodayPage() {
  const s = useSession();
  const campId = s.camp!.id;
  const meId = s.meId ?? null;
  const now = useNow();

  const checkIn = useMyCheckIn(campId, meId);
  const { todaySession, todays, mine } = checkIn;
  const drills = useDrills(todays.map((x) => x.id));
  const matches = useMatches(campId);
  const members = useMembers(campId);
  const standings = useStandings(campId);
  const squad = useSquad(campId);
  const matchMut = useMatchMutations(campId);

  const [changingStatus, setChangingStatus] = useState(false);
  const [liveScoring, setLiveScoring] = useState(false);
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);

  const people = members.data ?? [];
  const players = useMemo(() => people.filter((m) => m.role === "player"), [people]);
  const myName = people.find((m) => m.id === meId)?.full_name;
  const firstName = myName?.split(" ")[0];
  const myRow = (standings.data ?? []).find((r) => r.person_id === meId);
  const showRank = s.camp!.players_see_all_results;
  const rank = myRow ? (standings.data ?? []).findIndex((r) => r.person_id === meId) + 1 : null;
  const myMatches = (matches.data ?? [])
    .filter((m) => [m.t1_p1, m.t1_p2, m.t2_p1, m.t2_p2].includes(meId))
    .slice(0, 3);
  const squadOut = (squad.data ?? []).some((r) => r.published);

  const showCheckInButtons = !mine || changingStatus;
  const rpeDue = rpeIsDue(mine, todaySession?.duration_min, now);

  const onStatus = async (status: Attendance["status"]) => {
    try {
      await checkIn.setStatus(status);
      setChangingStatus(false);
      toast.success(status === "present" ? "Checked in. Have a good session!" : status === "late" ? "Coaches know you're on your way" : "Marked away for today");
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const onRpe = async (rpe: number) => {
    try {
      await checkIn.setRpe(rpe);
      toast.success(`Effort logged: ${rpe}/10`);
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{firstName ? `Hi, ${firstName}` : "Today"}</h1>
          <p className="text-sm text-ink-soft">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <Link href="/matches?new=1">
          <Button size="sm"><Plus size={16} /> Match</Button>
        </Link>
      </div>

      {squadOut && (
        <Link href="/squad">
          <Card className="flex items-center gap-3 border-brand-border bg-brand-pale/40 p-3">
            <Trophy size={18} className="shrink-0 text-brand" />
            <p className="flex-1 text-sm font-semibold text-ink">The squad has been announced</p>
            <ChevronRight size={16} className="text-ink-soft" />
          </Card>
        </Link>
      )}

      <AnnouncementBanner campId={campId} meId={meId} isStaff={false} onOpenManager={() => setAnnouncementsOpen(true)} />

      {/* 1. Check in */}
      <Card className={cx(showCheckInButtons ? "border-brand/40" : "p-3")}>
        {showCheckInButtons ? (
          <>
            <p className="font-bold text-ink">Are you at the hall today?</p>
            <p className="mb-3 mt-0.5 text-xs text-ink-soft">
              Checking in tells your coaches and the pairing helper you're available for matches.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { status: "present", label: "I'm here", Icon: UserCheck, on: "border-status-success-border bg-status-success-bg text-status-success-text" },
                { status: "late", label: "Running late", Icon: Clock, on: "border-status-warn-border bg-status-warn-bg text-status-warn-text" },
                { status: "absent", label: "Not today", Icon: UserX, on: "border-status-danger-border bg-status-danger-bg text-status-danger-text" },
              ] as const).map(({ status, label, Icon, on }) => (
                <button
                  key={status}
                  type="button"
                  disabled={checkIn.busy}
                  onClick={() => onStatus(status)}
                  aria-pressed={mine?.status === status}
                  className={cx(
                    "flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl border px-2 text-xs font-bold transition active:scale-95 disabled:opacity-60",
                    mine?.status === status ? on : "border-line bg-surface-2 text-ink",
                  )}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </div>
            {changingStatus && (
              <button type="button" onClick={() => setChangingStatus(false)} className="mt-2 text-xs font-semibold text-ink-soft hover:text-ink">
                Cancel
              </button>
            )}
          </>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={cx(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  mine!.status === "present" ? "bg-status-success-bg text-status-success-text"
                    : mine!.status === "late" ? "bg-status-warn-bg text-status-warn-text"
                    : "bg-status-danger-bg text-status-danger-text",
                )}
              >
                {mine!.status === "absent" ? <UserX size={16} /> : <Check size={16} />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{STATUS_TEXT[mine!.status]}</p>
                {mine!.status !== "absent" && !rpeDue && (
                  <p className="text-[11px] text-ink-soft">After training, you'll rate how hard it felt here.</p>
                )}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setChangingStatus(true)}>Change</Button>
          </div>
        )}
      </Card>

      {/* After training: effort (RPE) and a quick reflection */}
      {rpeDue && !changingStatus && (
        <Card className="border-brand/30">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 font-bold text-ink">
              <Flame size={16} className="text-amber-500" /> How hard was today?
            </p>
            {mine?.rpe != null && <Badge tone="brand">{mine.rpe}/10 logged</Badge>}
          </div>
          <p className="mb-3 text-xs text-ink-soft">1 = very light, 10 = completely exhausted. Coaches use this to manage your training load.</p>
          <div className="grid grid-cols-5 gap-1.5">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((val) => (
              <button
                key={val}
                type="button"
                disabled={checkIn.busy}
                onClick={() => onRpe(val)}
                aria-pressed={mine?.rpe === val}
                aria-label={`Effort ${val} out of 10`}
                className={cx(
                  "min-h-[44px] rounded-xl border text-sm font-bold transition active:scale-95",
                  mine?.rpe === val ? "border-brand-border bg-brand-pale text-brand" : "border-line bg-surface-2 text-ink hover:border-brand-border",
                )}
              >
                {val}
              </button>
            ))}
          </div>
          {mine?.rpe != null && (
            <button
              type="button"
              onClick={() => setReflectionOpen(true)}
              className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
            >
              <MessageSquare size={13} /> Add a 1-minute reflection
            </button>
          )}
        </Card>
      )}

      {meId && <WellnessCheckin campId={campId} meId={meId} />}

      {/* 2. Today's plan */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-ink-soft">Today's plan</h2>
        {todays.length === 0 ? (
          <Empty>{checkIn.loading ? "Loading…" : "Your coaches haven't posted today's session yet."}</Empty>
        ) : (
          todays.map((x) => {
            const sessionDrills = (drills.data ?? []).filter((d) => d.session_id === x.id);
            return (
              <Card key={x.id}>
                <p className="font-semibold text-ink">{x.title}</p>
                {x.focus && <p className="text-sm text-ink-soft">Focus: {x.focus}</p>}
                {sessionDrills.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {sessionDrills.map((d) => (
                      <Badge key={d.id} tone="brand">
                        {d.drill_name}{d.duration_min ? ` · ${d.duration_min}m` : ""} ({DRILL_TYPES.find((t) => t.value === d.drill_type)?.label})
                      </Badge>
                    ))}
                  </div>
                )}
              </Card>
            );
          })
        )}
        <WeatherVenueBanner campId={campId} isStaff={false} />
        {meId && (
          <NextSessionFocusCard campId={campId} personId={meId} playerName={myName} isStaff={false} onOpenSkills={() => setSkillsOpen(true)} />
        )}
      </section>

      {/* 3. Play */}
      <div className="grid grid-cols-2 gap-2">
        <Link href="/matches?new=1">
          <Card className="flex h-full flex-col gap-1 border-brand/40 bg-brand-pale/30 p-3 transition hover:border-brand">
            <Plus size={18} className="text-brand" />
            <p className="text-sm font-bold text-ink">Record a match</p>
            <p className="text-[11px] text-ink-soft">Takes about 20 seconds</p>
          </Card>
        </Link>
        <button type="button" onClick={() => setLiveScoring(true)} className="text-left">
          <Card className="flex h-full flex-col gap-1 p-3 transition hover:border-brand/50">
            <Radio size={18} className="text-brand" />
            <p className="text-sm font-bold text-ink">Live scorer</p>
            <p className="text-[11px] text-ink-soft">Keep score point by point</p>
          </Card>
        </button>
      </div>

      <LiveCourtBoard campId={campId} isStaff={false} players={players} hideWhenIdle />

      {/* 4. How you're doing */}
      {myRow && (
        <Link href="/me">
          <Card className="transition hover:border-brand/40">
            <div className="grid grid-cols-4 gap-2 text-center">
              <Stat label="Rating" value={myRow.rating} />
              <Stat label={showRank ? "Rank" : "Played"} value={showRank && rank ? `#${rank}` : myRow.played} />
              <Stat label="Won" value={`${myRow.won}/${myRow.played}`} />
              <Stat label="Form" value={myRow.form || "—"} mono />
            </div>
            <p className="mt-2 flex items-center justify-center gap-1 text-[11px] font-semibold text-brand">
              Your history, goals and reports <ChevronRight size={12} />
            </p>
          </Card>
        </Link>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink-soft">Your recent matches</h2>
          <Link href="/matches" className="text-xs font-semibold text-brand">All matches</Link>
        </div>
        {myMatches.length === 0 ? (
          <Empty>No matches yet. Record one right after you play.</Empty>
        ) : (
          <div className="space-y-2">
            {myMatches.map((m) => (
              <MatchCard key={m.id} match={m} people={people} meId={meId} isStaff={false} />
            ))}
          </div>
        )}
      </section>

      <InstallCard />

      <LiveCourtScorer
        open={liveScoring}
        onClose={() => setLiveScoring(false)}
        players={players}
        onSaveMatch={async (m) => {
          const r = await matchMut.record.mutateAsync(m);
          if (r.queued) toast.success("No signal: saved on this phone. It will send automatically.");
        }}
        busy={matchMut.record.isPending}
      />
      <AnnouncementManagerModal campId={campId} open={announcementsOpen} onClose={() => setAnnouncementsOpen(false)} members={people} />
      <SessionReflectionModal
        open={reflectionOpen}
        onClose={() => setReflectionOpen(false)}
        campId={campId}
        personId={meId}
        playerName={myName}
        sessions={checkIn.sessions.data ?? []}
      />
      <SkillLibrarySheet open={skillsOpen} onClose={() => setSkillsOpen(false)} campId={campId} currentPersonId={meId} isStaff={false} />
    </div>
  );
}

const Stat = ({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) => (
  <div>
    <p className={cx("text-lg font-bold text-ink", mono && "font-mono tracking-wider")}>{value}</p>
    <p className="text-[11px] text-ink-soft">{label}</p>
  </div>
);
