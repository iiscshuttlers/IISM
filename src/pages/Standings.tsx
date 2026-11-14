import { useState, useMemo } from "react";
import { ArrowRightLeft, Search } from "lucide-react";
import { useSession } from "../lib/session";
import { useAssessments, useAttendance, useMatches, useMembers, useSessions, useStandings } from "../lib/api";
import { Button, Card, Empty, Input, PageTitle, Segmented, cx } from "../components/ui";
import { CATEGORIES } from "../lib/scores";
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
  const [search, setSearch] = useState("");
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

  const playerMembers = useMemo(() => {
    return (members.data ?? []).filter((m) => m.role === "player");
  }, [members.data]);

  const handleOpenCompare = (p1Id?: string) => {
    setCompareP1(p1Id ?? null);
    setComparing(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle>Standings</PageTitle>
        {playerMembers.length >= 2 && !limited && (
          <Button variant="secondary" size="sm" onClick={() => handleOpenCompare()}>
            <ArrowRightLeft size={14} className="mr-1.5" />
            Head-to-head
          </Button>
        )}
      </div>

      <p className="text-xs text-ink-soft">
        Camp-only rating: everyone starts at 1200 and confirmed camp matches move it. Disputed and void matches don't count.
      </p>

      {limited && (
        <p className="text-xs text-ink-soft bg-surface-2 p-2 rounded">
          The camp admin has hidden other players' standings. You see your own row.
        </p>
      )}

      {!limited && (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="w-full sm:w-60">
            <Segmented
              value={gender}
              onChange={setGender}
              options={[
                { value: "all", label: "All" },
                { value: "M", label: "Men" },
                { value: "F", label: "Women" },
              ]}
            />
          </div>
          <div className="relative flex-1">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search player…"
              className="pl-8 !py-1 text-xs"
            />
          </div>
        </div>
      )}

      {standings.isLoading ? (
        <p className="text-sm text-ink-soft">Loading standings…</p>
      ) : rows.length === 0 ? (
        <Empty>{search ? "No players match your search." : "No players yet."}</Empty>
      ) : (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-ink-soft">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Player</th>
                <th className="px-3 py-2 text-right">Rating</th>
                <th className="px-3 py-2 text-right">W–L</th>
                <th className="px-3 py-2 text-right">Pts ±</th>
                <th className="px-3 py-2 text-left">Form</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
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
                    <td className="px-3 py-2.5 text-xs text-ink-soft">{limited ? "—" : i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-ink">{r.full_name}</span>
                        {isMe && <span className="text-[10px] text-brand font-bold">(You)</span>}
                      </div>
                      <span className="block text-[11px] text-ink-soft">
                        {CATEGORIES.filter((c) => r.by_category?.[c.value])
                          .map((c) => `${c.value} ${r.by_category[c.value].w}–${r.by_category[c.value].l}`)
                          .join(" · ") || "No matches"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-brand tabular-nums">{r.rating}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                      <span className="font-semibold text-ink">{r.won}</span>
                      <span className="text-ink-soft"> / {r.played}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                      {r.points_for || r.points_against ? (
                        <span className={ptsDiff > 0 ? "text-emerald-600 font-semibold" : ptsDiff < 0 ? "text-red-500 font-semibold" : "text-ink-soft"}>
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
                              className={`w-4 h-4 rounded-full flex items-center justify-center font-bold text-[9px] text-white ${
                                c === "W" ? "bg-emerald-600" : "bg-red-500"
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
        </Card>
      )}

      {/* Player Detail Sheet */}
      <PlayerDetailSheet
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
