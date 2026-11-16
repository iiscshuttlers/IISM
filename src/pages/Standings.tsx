import { useState, useMemo } from "react";
import { ArrowRightLeft, Info, Search } from "lucide-react";
import { useSession } from "../lib/session";
import { useAssessments, useAttendance, useMatches, useMembers, useSessions, useStandings } from "../lib/api";
import { Avatar, Button, Card, Chip, Empty, Input, PageTitle, Segmented, Skeleton, cx } from "../components/ui";
import { CATEGORIES } from "../lib/scores";
import { confidence } from "../lib/insights";
import { DISCIPLINES, hasDisciplineRatings, rankByDiscipline, type Discipline } from "../lib/disciplines";
import { PlayerDetailSheet } from "../components/PlayerDetail";
import { HeadToHeadModal } from "../components/HeadToHead";

export default function StandingsPage() {
  const s = useSession();
  const campId = s.camp!.id;

  const standings = useStandings(campId);
  const members = useMembers(campId);
  const matches = useMatches(campId);
  const sessions = useSessions(campId);
  const sessionIds = useMemo(() => (sessions.data ?? []).map((x) => x.id), [sessions.data]);
  const attendance = useAttendance(sessionIds);
  const assessments = useAssessments(campId, s.isStaff);

  const [gender, setGender] = useState<"all" | "M" | "F">("all");
  const [discipline, setDiscipline] = useState<Discipline>("all");
  const [search, setSearch] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareP1, setCompareP1] = useState<string | null>(null);

  const limited = !s.isStaff && !s.camp!.players_see_all_results;

  const allRows = standings.data ?? [];
  const rows = useMemo(() => {
    return allRows
      .filter((r) => gender === "all" || r.gender === gender)
      .filter((r) => !search.trim() || r.full_name.toLowerCase().includes(search.toLowerCase().trim()));
  }, [allRows, gender, search]);

  // Overall, or one discipline's own rating (only once the server provides them: migration 0006).
  const showDisciplines = hasDisciplineRatings(allRows);
  const view: Discipline = showDisciplines ? discipline : "all";
  const ranked = useMemo(() => rankByDiscipline(rows, view), [rows, view]);
  const disciplineLabel = DISCIPLINES.find((d) => d.value === view)!.label.toLowerCase();

  const playerMembers = useMemo(() => {
    return (members.data ?? []).filter((m) => m.role === "player");
  }, [members.data]);

  const handleOpenCompare = (p1Id?: string) => {
    setCompareP1(p1Id ?? null);
    setComparing(true);
  };

  return (
    <div className="space-y-4">
      <PageTitle
        sub={
          <button type="button" onClick={() => setHelpOpen((o) => !o)} aria-expanded={helpOpen}
            className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
            <Info size={14} /> How ratings work
          </button>
        }
        action={playerMembers.length >= 2 && !limited ? (
          <Button variant="secondary" onClick={() => handleOpenCompare()}>
            <ArrowRightLeft size={16} /> Head-to-head
          </Button>
        ) : undefined}
      >
        Standings
      </PageTitle>

      {helpOpen && (
        <Card className="animate-fade-in space-y-2 text-sm text-ink-soft">
          <p>Everyone starts at <b className="text-ink">1200</b>. Each confirmed match moves the rating: beating a stronger side gains more, and doubles use the pair's average. Disputed and void matches don't count.</p>
          <p>The coloured dot shows how settled a rating is. It turns green once there are enough matches to trust it.</p>
          {showDisciplines && <p>Singles, Doubles and Mixed each have their own rating that moves only with that kind of match. Overall counts every match.</p>}
        </Card>
      )}

      {limited && (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-ink-soft">
          The camp admin has hidden other players' standings. You see your own row.
        </p>
      )}

      {showDisciplines && (
        <Segmented<Discipline>
          value={discipline}
          onChange={setDiscipline}
          options={DISCIPLINES.map((d) => ({ value: d.value, label: d.label }))}
        />
      )}

      {!limited && (
        <div className="flex items-center gap-2">
          <div className="flex shrink-0 gap-1.5">
            <Chip active={gender === "all"} onClick={() => setGender("all")}>All</Chip>
            <Chip active={gender === "M"} onClick={() => setGender("M")}>Men</Chip>
            <Chip active={gender === "F"} onClick={() => setGender("F")}>Women</Chip>
          </div>
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a player"
              aria-label="Find a player"
              className="h-8 !rounded-full !py-0 pl-9 text-[13px]"
            />
          </div>
        </div>
      )}

      {standings.isLoading ? (
        <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : rows.length === 0 ? (
        <Empty>{search ? "No players match your search." : "No players yet."}</Empty>
      ) : (
        <>
        <Card className="!p-0 sm:hidden">
          <ul className="divide-y divide-line">
            {ranked.map(({ row: r, stat, rank }) => {
              const isMe = r.person_id === s.meId;
              const ptsDiff = r.points_for - r.points_against;
              return (
                <li key={r.person_id}>
                  <button
                    type="button"
                    onClick={() => setSelectedPersonId(r.person_id)}
                    className={cx("flex w-full items-center gap-2.5 px-3 py-2.5 text-left", isMe && "bg-brand/5")}
                  >
                    <span className="w-6 shrink-0 text-center text-xs font-semibold text-ink-soft">{limited || rank === null ? "—" : rank}</span>
                    <Avatar name={r.full_name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {r.full_name}{isMe && <span className="ml-1 text-[10px] font-bold text-brand">(You)</span>}
                      </span>
                      <span className="block truncate text-[11px] text-ink-soft">
                        {view === "all" ? (
                          <>
                            {r.won}/{r.played} won
                            {(r.points_for || r.points_against) ? ` · ${ptsDiff > 0 ? "+" : ""}${ptsDiff} pts` : ""}
                            {r.form ? ` · ${r.form}` : ""}
                          </>
                        ) : stat.played ? `${stat.won}/${stat.played} ${disciplineLabel} won` : `No ${disciplineLabel} matches yet`}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={cx("block text-base font-bold tabular-nums", stat.played || view === "all" ? "text-brand" : "text-ink-soft")}>{stat.rating}</span>
                      {view === "all" && <ConfidenceDot rd={r.glicko_rd} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card className="hidden overflow-x-auto !p-0 shadow-sm border border-line/80 sm:block">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-surface-2 text-xs text-ink-soft">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Player</th>
                <th className="px-3 py-2 text-right">{view === "all" ? "Rating" : `${DISCIPLINES.find((d) => d.value === view)!.label} rating`}</th>
                <th className="px-3 py-2 text-right">W–L</th>
                <th
                  className="px-3 py-2 text-right"
                  title="Net rally points: points scored minus points conceded in matches"
                >
                  Rally ±
                </th>
                <th className="px-3 py-2 text-left">Form</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ row: r, stat, rank }) => {
                const isMe = r.person_id === s.meId;
                const ptsDiff = r.points_for - r.points_against;

                return (
                  <tr
                    key={r.person_id}
                    onClick={() => setSelectedPersonId(r.person_id)}
                    className={cx(
                      "border-t border-line cursor-pointer hover:bg-surface-2/60 transition-colors",
                      isMe && "bg-brand/5 font-semibold"
                    )}
                  >
                    <td className="px-3 py-2.5 text-xs text-ink-soft">{limited || rank === null ? "—" : rank}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar name={r.full_name} size="sm" />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-ink">{r.full_name}</span>
                            {isMe && <span className="text-[10px] text-brand font-bold">(You)</span>}
                          </div>
                          <span className="block text-[11px] text-ink-soft">
                            {CATEGORIES.filter((c) => r.by_category?.[c.value] && DISCIPLINES.find((d) => d.value === view)!.categories.includes(c.value))
                              .map((c) => `${c.value} ${r.by_category[c.value].w}–${r.by_category[c.value].l}`)
                              .join(" · ") || "No matches"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className={cx("font-bold", stat.played || view === "all" ? "text-brand" : "text-ink-soft")}>{stat.rating}</span>
                      {view === "all" && <ConfidenceDot rd={r.glicko_rd} />}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                      <span className="font-semibold text-ink">{stat.won}</span>
                      <span className="text-ink-soft"> / {stat.played}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                      {r.points_for || r.points_against ? (
                        <span className={ptsDiff > 0 ? "text-status-success-text font-bold" : ptsDiff < 0 ? "text-status-danger-text font-bold" : "text-ink-soft"}>
                          {ptsDiff > 0 ? `+${ptsDiff}` : ptsDiff}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        {r.form ? (
                          r.form.split("").map((c, j) => (
                            <span
                              key={j}
                              className={`w-4 h-4 rounded-full flex items-center justify-center font-bold text-[9px] text-white shadow-2xs ${
                                c === "W" ? "bg-status-success-text" : "bg-status-danger-text"
                              }`}
                            >
                              {c}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-ink-soft">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="p-2.5 bg-surface-2/60 border-t border-line text-[11px] text-ink-soft flex flex-wrap items-center justify-between gap-2">
            <span><strong>Rating:</strong> starts at 1200, moves with each match</span>
            <span><strong>W–L:</strong> Matches won / played</span>
            <span><strong>Rally ±:</strong> Game points scored minus conceded (+42 / -42)</span>
          </div>
        </Card>
        </>
      )}

      {/* Player Detail Sheet */}
      <PlayerDetailSheet
        campId={campId}
        personId={selectedPersonId}
        onClose={() => setSelectedPersonId(null)}
        members={members.data ?? []}
        standings={allRows}
        matches={matches.data ?? []}
        attendance={attendance.data ?? []}
        assessments={assessments.data ?? []}
        isStaff={s.isStaff}
        onCompare={(p1Id) => handleOpenCompare(p1Id)}
      />

      {/* Head to Head Comparator Modal */}
      <HeadToHeadModal
        open={comparing}
        onClose={() => {
          setComparing(false);
          setCompareP1(null);
        }}
        players={playerMembers}
        matches={matches.data ?? []}
        standings={allRows}
        initialP1Id={compareP1}
      />
    </div>
  );
}

function ConfidenceDot({ rd }: { rd: number | undefined }) {
  if (rd === undefined) return null;
  const c = confidence(rd);
  const color = c.tone === "good" ? "bg-status-success-text" : c.tone === "warn" ? "bg-status-warn-text" : "bg-status-danger-text";
  return (
    <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] font-medium text-ink-soft"
      title={`How settled this rating is: ${c.label}. It firms up as the player plays more matches.`}>
      <span className={cx("inline-block h-1.5 w-1.5 rounded-full", color)} aria-hidden />
      {c.label}
    </span>
  );
}
