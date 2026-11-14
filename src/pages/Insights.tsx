import { useMemo, useState } from "react";
import { AlertTriangle, HeartPulse, Users, UsersRound } from "lucide-react";
import { useSession } from "../lib/session";
import {
  useAssessments, useAttendance, useDrills, useMatches, useMembers, useSelection, useSessions, useStandings, useWellness,
} from "../lib/api";
import { confidence, pairStats, readiness, trainingLoad } from "../lib/insights";
import { Badge, Card, Empty, PageTitle, Segmented, Select, cx, fmtDate } from "../components/ui";
import type { Member } from "../lib/types";

type Tab = "compare" | "pairs" | "load";

/** Staff-only analysis for selection: side-by-side comparison, doubles pairs, load and wellness. */
export default function InsightsPage() {
  const s = useSession();
  const [tab, setTab] = useState<Tab>("compare");
  return (
    <div className="space-y-4">
      <PageTitle>Insights</PageTitle>
      <Segmented<Tab> value={tab} onChange={setTab} options={[
        { value: "compare", label: "Compare" },
        { value: "pairs", label: "Pairs" },
        { value: "load", label: "Load & wellness" },
      ]} />
      {tab === "compare" && <Compare campId={s.camp!.id} />}
      {tab === "pairs" && <Pairs campId={s.camp!.id} />}
      {tab === "load" && <Load campId={s.camp!.id} />}
    </div>
  );
}

function usePlayers(campId: string): Member[] {
  const members = useMembers(campId);
  return useMemo(() => (members.data ?? []).filter((m) => m.role === "player"), [members.data]);
}

// ───────── Compare ─────────

function Compare({ campId }: { campId: string }) {
  const players = usePlayers(campId);
  const standings = useStandings(campId);
  const matches = useMatches(campId);
  const sessions = useSessions(campId);
  const ids = (sessions.data ?? []).map((x) => x.id);
  const drills = useDrills(ids);
  const attendance = useAttendance(ids);
  const assessments = useAssessments(campId, true);
  const wellness = useWellness(campId);
  const selection = useSelection(campId, true);
  const [picked, setPicked] = useState<string[]>([]);

  const pairs = useMemo(() => pairStats(matches.data ?? []), [matches.data]);
  const load = useMemo(
    () => trainingLoad(sessions.data ?? [], drills.data ?? [], attendance.data ?? []),
    [sessions.data, drills.data, attendance.data],
  );
  const name = (id: string) => players.find((p) => p.id === id)?.full_name ?? "—";

  const cols = picked.map((id) => {
    const st = standings.data?.find((r) => r.person_id === id);
    const att = (attendance.data ?? []).filter((a) => a.person_id === id);
    const sessCount = (sessions.data ?? []).length;
    const asmt = (assessments.data ?? []).filter((a) => a.person_id === id);
    const avg = (k: "technique" | "fitness" | "tactics" | "attitude") => {
      const v = asmt.map((a) => a[k]).filter((x): x is number => x != null);
      return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "—";
    };
    const well = (wellness.data ?? []).filter((w) => w.person_id === id).slice(0, 7);
    const best = pairs.filter((p) => (p.a === id || p.b === id) && p.played >= 2)
      .sort((x, y) => y.won / y.played - x.won / x.played)[0];
    const conf = confidence(st?.glicko_rd);
    return {
      id,
      rows: [
        ["Rating (Elo)", st ? String(st.rating) : "—"],
        ["Strength range", st?.glicko != null ? `${st.glicko - 2 * st.glicko_rd}–${st.glicko + 2 * st.glicko_rd}` : "—"],
        ["Confidence", st ? conf.label : "—"],
        ["Played · won", st ? `${st.played} · ${st.won}` : "—"],
        ["Win %", st?.played ? `${Math.round((100 * st.won) / st.played)}%` : "—"],
        ["Points ±", st && (st.points_for || st.points_against) ? String(st.points_for - st.points_against) : "—"],
        ["Form", st?.form || "—"],
        ["Attendance", sessCount ? `${Math.round((100 * att.filter((a) => a.status !== "absent").length) / sessCount)}%` : "—"],
        ["Load, last 7 days", String(load.find((l) => l.person_id === id)?.week ?? 0)],
        ["Readiness (7-day avg)", well.length ? `${Math.round(well.reduce((t, w) => t + readiness(w), 0) / well.length)}/100` : "—"],
        ["Technique", avg("technique")],
        ["Fitness", avg("fitness")],
        ["Tactics", avg("tactics")],
        ["Attitude", avg("attitude")],
        ["Best partner", best ? `${name(best.a === id ? best.b : best.a)} (${best.won}/${best.played})` : "—"],
        ["Decision", (selection.data ?? []).find((r) => r.person_id === id)?.decision?.replace("_", " ") ?? "undecided"],
      ] as [string, string][],
    };
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-soft">Pick up to three players to compare side by side. The strength range is the Glicko-2 rating ± 2 deviations (about 95% likely); it narrows as a player plays more.</p>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <Select key={i} aria-label={`Player ${i + 1}`} value={picked[i] ?? ""}
            onChange={(e) => {
              const next = [...picked];
              if (e.target.value) next[i] = e.target.value; else next.splice(i, 1);
              setPicked(next.filter(Boolean));
            }}>
            <option value="">{`Player ${i + 1}`}</option>
            {players.filter((p) => p.id === picked[i] || !picked.includes(p.id))
              .map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </Select>
        ))}
      </div>
      {cols.length === 0 ? <Empty>Choose players above.</Empty> : (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-ink-soft">
              <tr>
                <th className="px-3 py-2 text-left font-semibold" />
                {cols.map((c) => <th key={c.id} className="px-3 py-2 text-right font-bold text-ink">{name(c.id)}</th>)}
              </tr>
            </thead>
            <tbody>
              {cols[0].rows.map(([label], r) => (
                <tr key={label} className="border-t border-line">
                  <td className="px-3 py-2 text-xs text-ink-soft">{label}</td>
                  {cols.map((c) => <td key={c.id} className="px-3 py-2 text-right tabular-nums capitalize">{c.rows[r][1]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ───────── Pairs ─────────

function Pairs({ campId }: { campId: string }) {
  const players = usePlayers(campId);
  const matches = useMatches(campId);
  const [min, setMin] = useState<"1" | "2" | "3">("2");
  const name = (id: string) => players.find((p) => p.id === id)?.full_name ?? "Former player";
  const rows = useMemo(() => pairStats(matches.data ?? []), [matches.data]).filter((p) => p.played >= Number(min));

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-soft">
        Doubles partnerships. <b>Lift</b> compares their win rate together with each partner's win rate with anyone else:
        a positive lift means the pair is better than the sum of its parts.
      </p>
      <div className="flex items-center gap-2 text-xs text-ink-soft">
        <span>At least</span>
        <div className="w-40"><Segmented value={min} onChange={setMin} options={[{ value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }]} /></div>
        <span>matches together</span>
      </div>
      {rows.length === 0 ? <Empty><UsersRound className="mx-auto mb-1" size={20} />No doubles pairs with enough matches yet.</Empty> : (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-ink-soft">
              <tr>
                <th className="px-3 py-2 text-left">Pair</th>
                <th className="px-3 py-2 text-right">W / P</th>
                <th className="px-3 py-2 text-right">Win %</th>
                <th className="px-3 py-2 text-right">Lift</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={`${p.a}|${p.b}`} className="border-t border-line">
                  <td className="px-3 py-2 font-semibold text-ink">{name(p.a)} &amp; {name(p.b)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.won} / {p.played}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Math.round((100 * p.won) / p.played)}%</td>
                  <td className={cx("px-3 py-2 text-right tabular-nums font-semibold",
                    p.lift == null ? "text-ink-soft" : p.lift > 0.05 ? "text-emerald-600" : p.lift < -0.05 ? "text-red-500" : "text-ink")}>
                    {p.lift == null ? "—" : `${p.lift > 0 ? "+" : ""}${Math.round(p.lift * 100)}%`}
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

// ───────── Load & wellness ─────────

function Load({ campId }: { campId: string }) {
  const players = usePlayers(campId);
  const sessions = useSessions(campId);
  const ids = (sessions.data ?? []).map((x) => x.id);
  const drills = useDrills(ids);
  const attendance = useAttendance(ids);
  const wellness = useWellness(campId);
  const load = useMemo(
    () => trainingLoad(sessions.data ?? [], drills.data ?? [], attendance.data ?? []),
    [sessions.data, drills.data, attendance.data],
  );
  const today = new Date().toLocaleDateString("en-CA");

  const rows = players.map((p) => {
    const l = load.find((x) => x.person_id === p.id);
    const w = (wellness.data ?? []).filter((x) => x.person_id === p.id);
    const latest = w[0];
    return { p, l, latest, fresh: latest?.day === today, score: latest ? readiness(latest) : null };
  }).sort((a, b) => (a.score ?? 101) - (b.score ?? 101));
  const flagged = rows.filter((r) => r.l?.spike || (r.fresh && r.score !== null && r.score < 40));

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-soft">
        Load = effort (RPE 1–10) × session minutes, from attendance. A <b>spike</b> is a week more than 50% above the week before,
        a common injury warning sign. Readiness comes from each player's daily check-in (sleep, soreness, energy, mood).
      </p>
      {flagged.length > 0 && (
        <Card className="border-amber-400/60 bg-amber-50 dark:bg-amber-900/20">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-amber-900 dark:text-amber-200">
            <AlertTriangle size={16} /> Check in with
          </p>
          <ul className="text-sm text-amber-900 dark:text-amber-100">
            {flagged.map((r) => (
              <li key={r.p.id}>
                {r.p.full_name}
                {r.l?.spike && " — load spike this week"}
                {r.fresh && r.score !== null && r.score < 40 && ` — low readiness today (${r.score})`}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {players.length === 0 ? <Empty><Users className="mx-auto mb-1" size={20} />No players yet.</Empty> : (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-ink-soft">
              <tr>
                <th className="px-3 py-2 text-left">Player</th>
                <th className="px-3 py-2 text-right">Load 7d</th>
                <th className="px-3 py-2 text-right">Prev 7d</th>
                <th className="px-3 py-2 text-right"><HeartPulse size={13} className="inline" /> Readiness</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, l, latest, fresh, score }) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-3 py-2 font-semibold text-ink">
                    {p.full_name} {l?.spike && <Badge tone="warn">Spike</Badge>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{l?.week ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{l?.prevWeek ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {score === null ? <span className="text-ink-soft">—</span> : (
                      <span className={cx("font-semibold", score < 40 ? "text-red-500" : score < 65 ? "text-amber-600" : "text-emerald-600")}>
                        {score}
                        {!fresh && latest && <span className="ml-1 text-[10px] font-normal text-ink-soft">{fmtDate(latest.day)}</span>}
                      </span>
                    )}
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
