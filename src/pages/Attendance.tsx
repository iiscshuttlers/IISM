import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useSession } from "../lib/session";
import { useAttendance, useMembers, useSessions } from "../lib/api";
import { useLeave } from "../lib/sharedData";
import { leaveOn, leaveReasonLabel } from "../lib/leave";
import { attendanceGrid, sortGridRows, type GridMark, type GridSort } from "../lib/attendanceGrid";
import { Card, Chip, ChipRow, Empty, PageTitle, Skeleton, cx, fmtDate, today } from "../components/ui";

const MARK: Record<Exclude<GridMark, null>, { short: string; label: string; tone: string }> = {
  present: { short: "P", label: "Present", tone: "bg-status-success-bg text-status-success-text" },
  late: { short: "L", label: "Late", tone: "bg-status-warn-bg text-status-warn-text" },
  absent: { short: "A", label: "Away", tone: "bg-status-danger-bg text-status-danger-text" },
  leave: { short: "Lv", label: "On leave", tone: "bg-surface-3/70 text-ink-soft" },
};

const SORTS: { value: GridSort; label: string }[] = [
  { value: "name", label: "A–Z" },
  { value: "lowest", label: "Lowest first" },
];

const day = (d: string) => new Date(`${d}T00:00:00`);

/** Staff view: every player against every session so far, newest day on the left. */
export default function AttendancePage() {
  const s = useSession();
  const campId = s.camp!.id;
  const members = useMembers(campId);
  const sessions = useSessions(campId);
  const attendance = useAttendance((sessions.data ?? []).map((x) => x.id));
  const leave = useLeave(campId);
  const [gender, setGender] = useState<"all" | "M" | "F">("all");
  const [sortBy, setSortBy] = useState<GridSort>("name");
  const now = today();

  const players = useMemo(() => (members.data ?? []).filter((m) => m.role === "player"), [members.data]);
  const grid = useMemo(
    () => attendanceGrid(
      players.filter((p) => gender === "all" || p.gender === gender),
      sessions.data ?? [], attendance.data ?? [], leave.data ?? [], now,
    ),
    [players, gender, sessions.data, attendance.data, leave.data, now],
  );
  const rows = sortGridRows(grid.rows, sortBy);
  const men = players.filter((p) => p.gender === "M").length;
  const women = players.filter((p) => p.gender === "F").length;
  const loading = members.isLoading || sessions.isLoading || attendance.isLoading;

  return (
    <div>
      <PageTitle sub={loading ? undefined : `${grid.columns.length} session${grid.columns.length === 1 ? "" : "s"} · ${players.length} players`}>
        Attendance
      </PageTitle>

      <div className="mb-4 space-y-3">
        <ChipRow>
          <Chip active={gender === "all"} onClick={() => setGender("all")}>Everyone · {players.length}</Chip>
          <Chip active={gender === "M"} onClick={() => setGender("M")}>Men · {men}</Chip>
          <Chip active={gender === "F"} onClick={() => setGender("F")}>Women · {women}</Chip>
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />
          <span className="shrink-0 text-xs font-medium text-ink-faint">Sort</span>
          {SORTS.map((o) => (
            <Chip key={o.value} active={sortBy === o.value} onClick={() => setSortBy(o.value)}>{o.label}</Chip>
          ))}
        </ChipRow>
        <ul aria-label="Key" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-soft">
          {Object.values(MARK).map((m) => (
            <li key={m.short} className="flex items-center gap-1.5">
              <span aria-hidden className={cx("flex h-5 w-6 items-center justify-center rounded text-[10px] font-bold", m.tone)}>{m.short}</span>
              {m.label}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-5 w-6 rounded ring-1 ring-inset ring-line" /> Not marked
          </li>
        </ul>
      </div>

      {loading ? (
        <Skeleton className="h-72" />
      ) : players.length === 0 ? (
        <Empty>No players on the roster yet. Add them in Settings.</Empty>
      ) : grid.columns.length === 0 ? (
        <Empty>No sessions yet. Attendance marked on Today or in the training log shows up here, one column per session.</Empty>
      ) : rows.length === 0 ? (
        <Empty>No players match this filter.</Empty>
      ) : (
        <Card className="overflow-hidden !p-0">
          <div role="region" aria-label="Attendance by player and date" tabIndex={0}
            className="max-h-[70vh] overflow-auto overscroll-x-contain focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 top-0 z-20 border-b border-r border-line bg-surface pb-2 pl-4 pr-2 text-left align-bottom">
                    <span className="flex items-end justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                      <span>Player</span>
                      <span title="Sessions they came to. Days on leave don't count against them.">Attend</span>
                    </span>
                    <span className="mt-1 block text-right text-[11px] font-normal text-ink-faint">Came</span>
                  </th>
                  {grid.columns.map(({ session: x, came, part }, c) => {
                    const d = day(x.session_date);
                    const month = d.toLocaleDateString("en-IN", { month: "short" });
                    const prev = grid.columns[c - 1]?.session.session_date;
                    const newMonth = !prev || prev.slice(0, 7) !== x.session_date.slice(0, 7);
                    return (
                      <th key={x.id} scope="col" className="sticky top-0 z-10 border-b border-line bg-surface px-0.5 pb-2 pt-2 align-bottom font-normal">
                        <Link href={`/training?session=${x.id}`} title={`${x.title} · ${fmtDate(x.session_date)}. Open in the training log`}
                          className="mx-auto flex w-10 flex-col items-center rounded-lg py-1 leading-tight transition-colors hover:bg-surface-2">
                          <span className="text-[10px] font-semibold uppercase text-ink-faint">{d.toLocaleDateString("en-IN", { weekday: "short" })}</span>
                          <span className={cx("text-sm font-bold tabular-nums", x.session_date === now ? "text-brand" : "text-ink")}>{d.getDate()}</span>
                          <span className="h-3.5 whitespace-nowrap text-[10px] text-ink-faint">
                            {[newMonth ? month : "", part ? `#${part}` : ""].filter(Boolean).join(" ")}
                          </span>
                        </Link>
                        <span className="mt-1 block text-center text-[11px] font-semibold tabular-nums text-ink-soft">
                          {came}<span className="sr-only"> came</span>
                        </span>
                      </th>
                    );
                  })}
                  <th aria-hidden className="sticky top-0 z-10 w-full border-b border-line bg-surface" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ player: p, marks, summary }) => (
                  <tr key={p.id} className="group">
                    <th scope="row" className="sticky left-0 z-10 border-b border-r border-line bg-surface py-1 pl-4 pr-2 text-left font-normal transition-colors group-hover:bg-surface-2">
                      <span className="flex w-32 items-center justify-between gap-2 sm:w-52">
                        <span className="truncate font-medium text-ink" title={p.full_name}>{p.full_name}</span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-soft"
                          title={`${summary.attended} of ${summary.expected} sessions${summary.excused ? ` (${summary.excused} on leave)` : ""}`}>
                          {summary.pct != null ? `${summary.pct}%` : "—"}
                        </span>
                      </span>
                    </th>
                    {marks.map((m, c) => {
                      const x = grid.columns[c].session;
                      const why = m === "leave" ? leaveOn(leave.data ?? [], p.id, x.session_date) : undefined;
                      const label = m ? `${MARK[m].label}${why ? ` (${leaveReasonLabel(why.reason)})` : ""}` : "Not marked";
                      return (
                        <td key={x.id} className="border-b border-line px-0.5 py-1 text-center transition-colors group-hover:bg-surface-2/60"
                          title={`${p.full_name} · ${fmtDate(x.session_date)}: ${label}`}>
                          <span className={cx("mx-auto flex h-7 w-10 items-center justify-center rounded-md text-[11px] font-bold", m && MARK[m].tone)}>
                            {m && <span aria-hidden>{MARK[m].short}</span>}
                            <span className="sr-only">{label}</span>
                          </span>
                        </td>
                      );
                    })}
                    <td aria-hidden className="border-b border-line transition-colors group-hover:bg-surface-2/60" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="mt-3 text-xs text-ink-soft">
        One column per session, newest on the left. Tap a date to open that session and change a mark. The percentage counts
        sessions up to today; days on leave don't count against a player.
      </p>
    </div>
  );
}
