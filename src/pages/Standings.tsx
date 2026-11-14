import { useState } from "react";
import { useSession } from "../lib/session";
import { useStandings } from "../lib/api";
import { Card, Empty, PageTitle, Segmented, cx } from "../components/ui";
import { CATEGORIES } from "../lib/scores";

export default function StandingsPage() {
  const s = useSession();
  const standings = useStandings(s.camp!.id);
  const [gender, setGender] = useState<"all" | "M" | "F">("all");
  const rows = (standings.data ?? []).filter((r) => gender === "all" || r.gender === gender);
  const limited = !s.isStaff && !s.camp!.players_see_all_results;

  return (
    <div>
      <PageTitle>Standings</PageTitle>
      <p className="mb-3 text-xs text-ink-soft">
        Camp-only rating: everyone starts at 1200 and confirmed camp matches move it. Disputed and void matches don't count.
      </p>
      {limited && <p className="mb-3 text-xs text-ink-soft">The camp admin has hidden other players' standings. You see your own row.</p>}
      {!limited && (
        <div className="mb-3">
          <Segmented value={gender} onChange={setGender}
            options={[{ value: "all", label: "All" }, { value: "M", label: "Men" }, { value: "F", label: "Women" }]} />
        </div>
      )}
      {standings.isLoading ? (
        <p className="text-sm text-ink-soft">Loading…</p>
      ) : rows.length === 0 ? (
        <Empty>No players yet.</Empty>
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
              {rows.map((r, i) => (
                <tr key={r.person_id} className={cx("border-t border-line", r.person_id === s.meId && "bg-brand/5")}>
                  <td className="px-3 py-2 text-ink-soft">{limited ? "—" : i + 1}</td>
                  <td className="px-3 py-2">
                    <span className="font-semibold">{r.full_name}</span>
                    <span className="block text-[11px] text-ink-soft">
                      {CATEGORIES.filter((c) => r.by_category?.[c.value])
                        .map((c) => `${c.value} ${r.by_category[c.value].w}–${r.by_category[c.value].l}`)
                        .join(" · ") || "No matches"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{r.rating}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.won}–{r.lost}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.points_for || r.points_against ? (r.points_for - r.points_against > 0 ? "+" : "") + (r.points_for - r.points_against) : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tracking-wider">
                    {r.form.split("").map((c, j) => (
                      <span key={j} className={c === "W" ? "text-emerald-600" : "text-red-500"}>{c}</span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
