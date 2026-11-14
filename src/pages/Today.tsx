import { Link } from "wouter";
import { Plus } from "lucide-react";
import { useSession } from "../lib/session";
import { useDrills, useMatches, useMembers, useSessions, useStandings } from "../lib/api";
import { MatchCard } from "../components/MatchCard";
import { Badge, Button, Card, Empty, fmtDate, today } from "../components/ui";
import { DRILL_TYPES } from "../lib/types";

export default function TodayPage() {
  const s = useSession();
  const campId = s.camp!.id;
  const sessions = useSessions(campId);
  const todays = (sessions.data ?? []).filter((x) => x.session_date === today());
  const drills = useDrills(todays.map((x) => x.id));
  const matches = useMatches(campId);
  const members = useMembers(campId);
  const standings = useStandings(campId);
  const mine = (standings.data ?? []).find((r) => r.person_id === s.meId);
  const rank = mine ? (standings.data ?? []).findIndex((r) => r.person_id === s.meId) + 1 : null;
  const recent = (matches.data ?? []).slice(0, 5);
  const isPlayer = s.role === "player";
  const showRank = s.isStaff || s.camp!.players_see_all_results;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Today</h1>
          <p className="text-sm text-ink-soft">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        <Link href="/matches?new=1"><Button><Plus size={16} /> Record match</Button></Link>
      </div>

      {isPlayer && mine && (
        <Card className="grid grid-cols-4 gap-2 text-center">
          <Stat label="Camp rating" value={mine.rating} />
          <Stat label={showRank ? "Rank" : "Played"} value={showRank ? `#${rank}` : mine.played} />
          <Stat label="Won" value={mine.won} />
          <Stat label="Form" value={mine.form || "—"} mono />
        </Card>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold text-ink-soft">Training today</h2>
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
