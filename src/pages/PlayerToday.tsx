import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Check, ChevronRight, Clock, Flame, MessageSquare, Plus, Radio, Trophy, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../lib/session";
import { useDrills, useMatches, useMatchMutations, useMembers, useSquad, useStandings } from "../lib/api";
import { errorText } from "../lib/supabase";
import { rpeIsDue, useMyCheckIn, useNow } from "../lib/today";
import type { Attendance } from "../lib/types";
import { MatchCard } from "../components/MatchCard";
import { LiveCourtScorer } from "../components/LiveCourtScorer";
import { LiveCourtBoard } from "../components/LiveCourtBoard";
import { AnnouncementBanner, AnnouncementManagerModal } from "../components/Announcements";
import { WeatherVenueBanner } from "../components/WeatherVenuePlan";
import { NextSessionFocusCard } from "../components/NextSessionFocusCard";
import { SessionReflectionModal } from "../components/SessionReflection";
import { SkillLibrarySheet } from "../components/SkillLibrary";
import { WellnessCheckin } from "../components/WellnessCheckin";
import { Badge, Button, Card, Section, cx } from "../components/ui";

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
    .filter((m) => m.status !== "void" && [m.t1_p1, m.t1_p2, m.t2_p1, m.t2_p2].includes(meId))
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
    <div className="space-y-6">
      {/* On the narrowest phones the buttons drop under the greeting instead of squeezing it. */}
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-3">
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-sm font-medium text-ink-soft">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">
            {firstName ? `Hi, ${firstName}` : "Today"}
          </h1>
        </div>
        <Link href="/matches?new=1">
          <Button><Plus size={16} /> Match</Button>
        </Link>
      </div>

      {squadOut && (
        <Link href="/squad" className="block">
          <Card className="flex items-center gap-3 bg-brand-pale p-3.5 ring-brand-border">
            <Trophy size={18} className="shrink-0 text-brand" />
            <p className="flex-1 text-sm font-semibold text-ink">The squad has been announced</p>
            <ChevronRight size={16} className="text-ink-soft" />
          </Card>
        </Link>
      )}

      <AnnouncementBanner campId={campId} meId={meId} isStaff={false} onOpenManager={() => setAnnouncementsOpen(true)} />

      {/* Phones: one column in the order the day happens. Desktop: two columns. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-8">
        <div className="contents lg:flex lg:flex-col lg:gap-6">
          <Section className="order-1" title="Check in">
            <Card className={cx(showCheckInButtons ? "" : "p-3.5")}>
              {showCheckInButtons ? (
                <>
                  <p className="text-lg font-bold tracking-tight text-ink">Are you at the hall today?</p>
                  <p className="mb-4 mt-0.5 text-sm text-ink-soft">
                    Tells your coaches and the pairing helper you're available for matches.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { status: "present", label: "I'm here", Icon: UserCheck, on: "bg-status-success-bg text-status-success-text ring-status-success-border" },
                      { status: "late", label: "Running late", Icon: Clock, on: "bg-status-warn-bg text-status-warn-text ring-status-warn-border" },
                      { status: "absent", label: "Not today", Icon: UserX, on: "bg-status-danger-bg text-status-danger-text ring-status-danger-border" },
                    ] as const).map(({ status, label, Icon, on }) => (
                      <button
                        key={status}
                        type="button"
                        disabled={checkIn.busy}
                        onClick={() => onStatus(status)}
                        aria-pressed={mine?.status === status}
                        className={cx(
                          "flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 text-xs font-semibold ring-1 transition active:scale-[0.97] disabled:opacity-60",
                          mine?.status === status ? on : "bg-surface-2 text-ink ring-transparent hover:bg-surface-3",
                        )}
                      >
                        <Icon size={20} />
                        {label}
                      </button>
                    ))}
                  </div>
                  {changingStatus && (
                    <button type="button" onClick={() => setChangingStatus(false)} className="mt-3 text-xs font-semibold text-ink-soft hover:text-ink">
                      Cancel
                    </button>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cx(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                        mine!.status === "present" ? "bg-status-success-bg text-status-success-text"
                          : mine!.status === "late" ? "bg-status-warn-bg text-status-warn-text"
                          : "bg-status-danger-bg text-status-danger-text",
                      )}
                    >
                      {mine!.status === "absent" ? <UserX size={18} /> : <Check size={18} />}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{STATUS_TEXT[mine!.status]}</p>
                      {mine!.status !== "absent" && !rpeDue && (
                        <p className="text-xs text-ink-soft">After training, you'll rate how hard it felt here.</p>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setChangingStatus(true)}>Change</Button>
                </div>
              )}
            </Card>

            {rpeDue && !changingStatus && (
              <Card className="animate-pop-in">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 font-semibold text-ink">
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
                        "min-h-[44px] rounded-xl text-sm font-bold tabular-nums transition active:scale-95",
                        mine?.rpe === val ? "bg-brand text-white" : "bg-surface-2 text-ink hover:bg-surface-3",
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
          </Section>

          <Section className="order-2" title="Your plan" action={<Link href="/training">Training log</Link>}>
            <Card className="divide-y divide-line overflow-hidden !p-0">
              {todays.length === 0 ? (
                <p className="px-4 py-3 text-sm text-ink-soft">
                  {checkIn.loading ? "Loading…" : "Your coaches haven't posted today's session yet."}
                </p>
              ) : (
                todays.map((x) => {
                  const sessionDrills = (drills.data ?? []).filter((d) => d.session_id === x.id);
                  return (
                    <div key={x.id} className="px-4 py-3">
                      <p className="font-semibold text-ink">{x.title}</p>
                      {x.focus && <p className="text-sm text-ink-soft">{x.focus}</p>}
                      {sessionDrills.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {sessionDrills.map((d) => (
                            <Badge key={d.id} tone="brand">
                              {d.drill_name}{d.duration_min ? ` · ${d.duration_min}m` : ""}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <WeatherVenueBanner campId={campId} isStaff={false} flat />
              {meId && (
                <NextSessionFocusCard campId={campId} personId={meId} playerName={myName} isStaff={false} onOpenSkills={() => setSkillsOpen(true)} flat />
              )}
            </Card>
          </Section>
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-6">
          <Section className="order-3" title="Play">
            <div className="grid grid-cols-2 gap-2">
              <Link href="/matches?new=1" className="flex min-h-[84px] flex-col justify-center gap-1 rounded-2xl bg-brand px-4 text-white shadow-[0_6px_16px_-6px_rgb(15_118_110/0.6)] transition hover:bg-brand-dark active:scale-[0.98]">
                <Plus size={20} />
                <span className="text-sm font-semibold">Record a match</span>
                <span className="text-[11px] text-white/75">About 20 seconds</span>
              </Link>
              <button type="button" onClick={() => setLiveScoring(true)} className="flex min-h-[84px] flex-col justify-center gap-1 rounded-2xl bg-surface px-4 text-left shadow-card ring-1 ring-line transition hover:bg-surface-2 active:scale-[0.98]">
                <Radio size={20} className="text-brand" />
                <span className="text-sm font-semibold text-ink">Live scorer</span>
                <span className="text-[11px] text-ink-soft">Point by point</span>
              </button>
            </div>
            <LiveCourtBoard campId={campId} isStaff={false} players={players} hideWhenIdle />
          </Section>

          <Section className="order-4" title="You" action={<Link href="/me">History &amp; goals</Link>}>
            <Card className="divide-y divide-line overflow-hidden !p-0">
              {myRow ? (
                <div className="grid grid-cols-4 gap-2 px-4 py-3.5 text-center">
                  <Stat label="Rating" value={myRow.rating} />
                  <Stat label={showRank ? "Rank" : "Played"} value={showRank && rank ? `#${rank}` : myRow.played} />
                  <Stat label="Won" value={`${myRow.won}/${myRow.played}`} />
                  <Stat label="Form" value={<FormDots form={myRow.form} />} />
                </div>
              ) : (
                <p className="px-4 py-3 text-sm text-ink-soft">Your rating appears after your first match.</p>
              )}
              {myMatches.length === 0 ? (
                <p className="px-4 py-3 text-sm text-ink-soft">No matches yet. Record one right after you play.</p>
              ) : (
                myMatches.map((m) => <MatchCard key={m.id} flat match={m} people={people} meId={meId} isStaff={false} />)
              )}
              {myMatches.length > 0 && (
                <Link href="/matches" className="block px-4 py-2.5 text-center text-xs font-semibold text-brand hover:bg-surface-2/60">
                  All matches
                </Link>
              )}
            </Card>
          </Section>
        </div>
      </div>

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

/** Last results as small dots, newest first (W green, L red). */
export const FormDots = ({ form }: { form: string }) =>
  form ? (
    <span className="inline-flex h-7 items-center gap-1" aria-label={`Form: ${form.split("").join(" ")}`}>
      {form.split("").map((c, i) => (
        <span key={i} className={cx("h-2.5 w-2.5 rounded-full", c === "W" ? "bg-status-success-text" : "bg-status-danger-text")} />
      ))}
    </span>
  ) : <span>—</span>;

const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="min-w-0">
    <p className="truncate text-lg font-bold tabular-nums text-ink">{value}</p>
    <p className="text-[11px] font-medium text-ink-soft">{label}</p>
  </div>
);
