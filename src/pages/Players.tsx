import { useMemo, useState } from "react";
import { Link } from "wouter";
import { LineChart, ListOrdered, Search } from "lucide-react";
import { useSession } from "../lib/session";
import { useAssessments, useAttendance, useDrills, useMatches, useMembers, useSessions, useStandings } from "../lib/api";
import { Avatar, Button, Card, Chip, Empty, Input, PageTitle, ChipRow, Skeleton, cx } from "../components/ui";
import { PlayerDetailSheet } from "../components/PlayerDetail";
import { fuzzyFilter } from "../lib/fuzzy";
import { TRAINING_EVENTS, eventsLabel, type TrainingEvent } from "../lib/disciplines";
import { AssessSheet } from "../components/Assessment";
import { useLeave } from "../lib/sharedData";
import { attendanceSummary } from "../lib/leave";

type SortBy = "rating" | "coach" | "attendance" | "name";
const SORTS: { value: SortBy; label: string }[] = [
  { value: "rating", label: "Rating" },
  { value: "coach", label: "Coach score" },
  { value: "attendance", label: "Attendance" },
  { value: "name", label: "Name" },
];

/** Staff view of every player: results, attendance, training load and coach scores in one list. */
export default function PlayersPage() {
  const s = useSession();
  const camp = s.camp!;
  const members = useMembers(camp.id);
  const standings = useStandings(camp.id);
  const matches = useMatches(camp.id);
  const sessions = useSessions(camp.id);
  const ids = (sessions.data ?? []).map((x) => x.id);
  const drills = useDrills(ids);
  const attendance = useAttendance(ids);
  const assessments = useAssessments(camp.id, true);
  const leave = useLeave(camp.id);
  const [gender, setGender] = useState<"all" | "M" | "F">("all");
  const [sortBy, setSortBy] = useState<SortBy>("rating");
  const [event, setEvent] = useState<TrainingEvent | "all" | "none">("all");
  const [search, setSearch] = useState("");
  const [assessing, setAssessing] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);

  const board = useMemo(() => {
    const players = (members.data ?? []).filter((m) => m.role === "player");
    const minutesBySession: Record<string, number> = {};
    for (const d of drills.data ?? []) minutesBySession[d.session_id] = (minutesBySession[d.session_id] ?? 0) + (d.duration_min ?? 0);
    return players.map((p) => {
      const st = (standings.data ?? []).find((r) => r.person_id === p.id);
      const att = (attendance.data ?? []).filter((a) => a.person_id === p.id);
      const attended = att.filter((a) => a.status !== "absent");
      const rpes = attended.map((a) => a.rpe).filter((x): x is number => x != null);
      const asmt = (assessments.data ?? []).filter((a) => a.person_id === p.id);
      const scores = asmt.flatMap((a) => [a.technique, a.fitness, a.tactics, a.attitude]).filter((x): x is number => x != null);
      return {
        ...p,
        rating: st?.rating ?? 1200,
        played: st?.played ?? 0,
        won: st?.won ?? 0,
        // Sessions missed on leave the admin marked don't count against them.
        attendancePct: attendanceSummary(p.id, sessions.data ?? [], attendance.data ?? [], leave.data ?? []).pct,
        drillMinutes: attended.reduce((t, a) => t + (minutesBySession[a.session_id] ?? 0), 0),
        avgRpe: rpes.length ? (rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(1) : null,
        avgAssessment: scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null,
        assessmentCount: asmt.length,
      };
    });
  }, [members.data, standings.data, sessions.data, drills.data, attendance.data, assessments.data, leave.data]);

  const sortValue = (r: (typeof board)[number]): number =>
    sortBy === "coach" ? (r.avgAssessment ? Number(r.avgAssessment) : -1)
      : sortBy === "attendance" ? r.attendancePct ?? -1
      : r.rating;
  const q = search.trim();
  const sorted = board
    .filter((r) => gender === "all" || r.gender === gender)
    .filter((r) => event === "all" || (event === "none" ? !r.events?.length : r.events?.includes(event)))
    .sort((a, b) => (sortBy === "name" ? a.full_name.localeCompare(b.full_name) : sortValue(b) - sortValue(a) || b.rating - a.rating));
  // While searching, best match first (typos forgiven); otherwise the chosen sort.
  const rows = fuzzyFilter(sorted, q, (r) => r.full_name);
  const men = board.filter((r) => r.gender === "M").length;
  const women = board.filter((r) => r.gender === "F").length;
  // Hidden until migration 0009 has run (then every player has a list, maybe empty).
  const hasEvents = board.some((r) => r.events !== undefined);
  const eventCount = (e: TrainingEvent | "none") =>
    board.filter((r) => (e === "none" ? !r.events?.length : r.events?.includes(e))).length;
  const loading = members.isLoading || standings.isLoading;

  return (
    <div>
      <PageTitle
        sub={`${board.length} players`}
        action={
          <div className="flex gap-2">
            {/* The weighted shortlist is for the camp admin only. */}
            {s.isAdmin && (
              <Link href="/shortlist">
                <Button variant="secondary"><ListOrdered size={16} /> Shortlist</Button>
              </Link>
            )}
            <Link href="/insights">
              <Button variant="secondary"><LineChart size={16} /> Compare</Button>
            </Link>
          </div>
        }
      >
        Players
      </PageTitle>

      <div className="mb-5 space-y-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a player" className="pl-9" aria-label="Find a player" />
        </div>
        <ChipRow>
          <Chip active={gender === "all"} onClick={() => setGender("all")}>Everyone · {board.length}</Chip>
          <Chip active={gender === "M"} onClick={() => setGender("M")}>Men · {men}</Chip>
          <Chip active={gender === "F"} onClick={() => setGender("F")}>Women · {women}</Chip>
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />
          <span className="shrink-0 text-xs font-medium text-ink-faint">Sort</span>
          {SORTS.map((o) => (
            <Chip key={o.value} active={sortBy === o.value} onClick={() => setSortBy(o.value)}>{o.label}</Chip>
          ))}
        </ChipRow>
        {hasEvents && (
          <ChipRow>
            <span className="shrink-0 text-xs font-medium text-ink-faint">Training for</span>
            <Chip active={event === "all"} onClick={() => setEvent("all")}>Any</Chip>
            {TRAINING_EVENTS.map((e) => (
              <Chip key={e.value} active={event === e.value} onClick={() => setEvent(e.value)}>{e.label} · {eventCount(e.value)}</Chip>
            ))}
            <Chip active={event === "none"} onClick={() => setEvent("none")}>Not set · {eventCount("none")}</Chip>
          </ChipRow>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : rows.length === 0 ? (
        <Empty>
          {q ? `No player matches “${search.trim()}”.`
            : board.length ? "No players match these filters."
            : "No players on the roster yet. Add them in Settings."}
        </Empty>
      ) : (
        <Card className="divide-y divide-line overflow-hidden !p-0">
          {/* Column labels for the wide layout. */}
          <div className="hidden items-center gap-4 bg-surface-2/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint md:flex">
            <span className="flex-1">Player</span>
            <span className="w-16 text-right">Rating</span>
            <span className="w-20 text-right">Won</span>
            <span className="w-16 text-right">Attend</span>
            <span className="w-16 text-right">Drills</span>
            <span className="w-14 text-right">RPE</span>
            <span className="w-16 text-right">Coach</span>
            <span className="w-20" />
          </div>
          {rows.map((r, i) => (
            <div key={r.id} className="px-4 py-3 transition-colors hover:bg-surface-2/50">
              <div className="flex items-center gap-3 md:gap-4">
                <button type="button" onClick={() => setInspecting(r.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-ink-faint">{i + 1}</span>
                  <Avatar name={r.full_name} />
                  <span className="min-w-0">
                    <span className="block font-semibold leading-snug text-ink [overflow-wrap:anywhere] md:truncate">{r.full_name}</span>
                    {r.events && r.events.length > 0 && (
                      <span className="block text-[11px] font-semibold text-brand">{eventsLabel(r.events)}</span>
                    )}
                    <span className="block text-xs text-ink-soft md:hidden">
                      {r.played ? `${r.won}/${r.played} won` : "No matches yet"}
                    </span>
                  </span>
                </button>
                <span className="shrink-0 text-right font-bold tabular-nums text-brand md:w-16">{r.rating}</span>
                <Cell className="w-20">{r.played ? `${r.won}/${r.played}` : "—"}</Cell>
                <Cell className="w-16">{r.attendancePct != null ? `${r.attendancePct}%` : "—"}</Cell>
                <Cell className="w-16">{r.drillMinutes}m</Cell>
                <Cell className="w-14">{r.avgRpe ?? "—"}</Cell>
                <Cell className="w-16">{r.avgAssessment ? `${r.avgAssessment}/5` : "—"}</Cell>
                <span className="hidden shrink-0 md:block">
                  <Button size="sm" variant="secondary" onClick={() => setAssessing(r.id)} className="w-20">Assess</Button>
                </span>
              </div>
              {/* Phones: the numbers and Assess sit under the name, so the name keeps the full width. */}
              <div className="mt-2 flex items-center gap-3 min-[400px]:pl-[76px] md:hidden">
                <div className="grid min-w-0 flex-1 grid-cols-4 gap-2 text-xs">
                  <Mini label="Attend" value={r.attendancePct != null ? `${r.attendancePct}%` : "—"} />
                  <Mini label="Drills" value={`${r.drillMinutes}m`} />
                  <Mini label="RPE" value={r.avgRpe ?? "—"} />
                  <Mini label="Coach" value={r.avgAssessment ? `${r.avgAssessment}/5` : "—"} />
                </div>
                <Button size="sm" variant="secondary" onClick={() => setAssessing(r.id)} className="shrink-0">Assess</Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <AssessSheet
        campId={camp.id}
        person={board.find((r) => r.id === assessing) ?? null}
        history={assessments.data ?? []}
        onClose={() => setAssessing(null)}
      />

      <PlayerDetailSheet
        campId={camp.id}
        personId={inspecting}
        onClose={() => setInspecting(null)}
        members={members.data ?? []}
        standings={standings.data ?? []}
        matches={matches.data ?? []}
        attendance={attendance.data ?? []}
        assessments={assessments.data ?? []}
        isStaff={true}
      />
    </div>
  );
}

const Cell = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={cx("hidden text-right text-sm tabular-nums text-ink-soft md:block", className)}>{children}</span>
);

const Mini = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <p className="font-semibold tabular-nums text-ink">{value}</p>
    <p className="text-[11px] text-ink-faint">{label}</p>
  </div>
);
