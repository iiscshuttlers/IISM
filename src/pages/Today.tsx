import { Link, useLocation } from "wouter";
import { Plus, Flame, Check, LineChart } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../lib/session";
import { useAttendance, useDrills, useMatches, useMembers, useSessions, useStandings, useTrainingMutations } from "../lib/api";
import { MatchCard } from "../components/MatchCard";
import { GuideButton } from "../components/GuideModal";
import { PairingHelperModal } from "../components/PairingHelper";
import { CampHighlightsCard } from "../components/CampHighlights";
import { Badge, Button, Card, Empty, fmtDate, today } from "../components/ui";
import { DRILL_TYPES } from "../lib/types";
import { WellnessCheckin } from "../components/WellnessCheckin";
import { InstallCard } from "../components/AppChrome";

export default function TodayPage() {
  const s = useSession();
  const campId = s.camp!.id;
  const [, setLoc] = useLocation();

  const sessions = useSessions(campId);
  const todays = (sessions.data ?? []).filter((x) => x.session_date === today());
  const drills = useDrills(todays.map((x) => x.id));
  const attendance = useAttendance(todays.map((x) => x.id));
  const trainingMut = useTrainingMutations(campId);

  const matches = useMatches(campId);
  const members = useMembers(campId);
  const standings = useStandings(campId);
  const mine = (standings.data ?? []).find((r) => r.person_id === s.meId);
  const rank = mine ? (standings.data ?? []).findIndex((r) => r.person_id === s.meId) + 1 : null;
  const recent = (matches.data ?? []).slice(0, 5);
  const isPlayer = s.role === "player";
  const showRank = s.isStaff || s.camp!.players_see_all_results;

  const playerMembers = (members.data ?? []).filter((m) => m.role === "player");

  // Current user's attendance record for today's first session
  const todaySession = todays[0];
  const myTodayAtt = todaySession
    ? (attendance.data ?? []).find((a) => a.session_id === todaySession.id && a.person_id === s.meId)
    : null;

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
          <GuideButton />
          <Link href="/matches?new=1">
            <Button size="sm">
              <Plus size={16} /> Match
            </Button>
          </Link>
        </div>
      </div>

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
              <span className="text-xs font-bold text-brand bg-brand/10 px-2 py-0.5 rounded-full">
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
                  className={`py-2 rounded-xl font-bold text-xs transition-all flex flex-col items-center justify-center border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 active:scale-95 ${
                    selected
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

      {s.isStaff && (
        <Link href="/insights">
          <Card className="flex items-center gap-3 p-3 hover:border-brand/40">
            <LineChart size={18} className="text-brand" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-ink">Insights for selection</p>
              <p className="text-[11px] text-ink-soft">Compare players, best doubles pairs, training load and readiness.</p>
            </div>
          </Card>
        </Link>
      )}

      {/* Pairing Helper Quick Banner */}
      {playerMembers.length >= 2 && (
        <Card className="flex items-center justify-between p-3 bg-surface-2 border-line">
          <div>
            <p className="font-semibold text-xs text-ink">Planning next practice game?</p>
            <p className="text-[11px] text-ink-soft">Get balanced court pairings based on ratings and court time.</p>
          </div>
          <PairingHelperModal
            players={playerMembers}
            matches={matches.data ?? []}
            standings={standings.data ?? []}
            onSelectMatch={(cat, slots) => {
              setLoc(`/matches?new=1&cat=${cat}&slots=${slots.map((x) => x ?? "").join(",")}`);
            }}
          />
        </Card>
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
    </div>
  );
}

const Stat = ({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) => (
  <div>
    <p className={`text-lg font-bold ${mono ? "font-mono tracking-wider" : ""}`}>{value}</p>
    <p className="text-[11px] text-ink-soft">{label}</p>
  </div>
);
