import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useMembers, useMatches, useStandings, useSessions, useDrills, useAttendance } from "../lib/api";
import { downloadCsv } from "../lib/exportCsv";
import { Button, Card } from "./ui";
import type { Camp } from "../lib/types";

export function CsvExportCard({ camp }: { camp: Camp }) {
  const [exporting, setExporting] = useState<string | null>(null);

  const membersQ = useMembers(camp.id);
  const standingsQ = useStandings(camp.id);
  const matchesQ = useMatches(camp.id);
  const sessionsQ = useSessions(camp.id);

  const sessionIds = (sessionsQ.data ?? []).map((s) => s.id);
  const drillsQ = useDrills(sessionIds);
  const attendanceQ = useAttendance(sessionIds);

  const memberMap = new Map((membersQ.data ?? []).map((m) => [m.id, m]));

  const formatPlayerName = (id: string | null) => (id ? memberMap.get(id)?.full_name ?? id : "");

  const exportStandings = () => {
    try {
      setExporting("standings");
      const list = standingsQ.data ?? [];
      const headers = [
        "Rank",
        "Name",
        "Gender",
        "Rating",
        "Played",
        "Won",
        "Lost",
        "Win %",
        "Points For",
        "Points Against",
        "Points Diff",
        "Recent Form",
      ];
      const rows = list.map((s, idx) => {
        const winPct = s.played > 0 ? Math.round((s.won / s.played) * 100) : 0;
        const diff = s.points_for - s.points_against;
        return [
          idx + 1,
          s.full_name,
          s.gender ?? "",
          s.rating,
          s.played,
          s.won,
          s.lost,
          `${winPct}%`,
          s.points_for,
          s.points_against,
          diff > 0 ? `+${diff}` : diff,
          s.form,
        ];
      });
      const safeCampName = camp.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      downloadCsv(`${safeCampName}-standings-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
      toast.success("Standings CSV exported");
    } catch {
      toast.error("Failed to export standings CSV");
    } finally {
      setExporting(null);
    }
  };

  const exportMatches = () => {
    try {
      setExporting("matches");
      const list = matchesQ.data ?? [];
      const headers = [
        "Played On",
        "Category",
        "Team 1",
        "Team 2",
        "Winner",
        "Scores",
        "Status",
        "Dispute Reason",
        "Disputed By",
        "Recorded By",
        "Created At",
      ];
      const rows = list.map((m) => {
        const t1 = [formatPlayerName(m.t1_p1), formatPlayerName(m.t1_p2)].filter(Boolean).join(" & ");
        const t2 = [formatPlayerName(m.t2_p1), formatPlayerName(m.t2_p2)].filter(Boolean).join(" & ");
        const winner = m.winner_side === 1 ? t1 : t2;
        const scores = m.games?.join(", ") ?? "Winner only";
        return [
          m.played_on,
          m.category,
          t1,
          t2,
          winner,
          scores,
          m.status,
          m.dispute_reason ?? "",
          formatPlayerName(m.disputed_by),
          formatPlayerName(m.recorded_by),
          m.created_at,
        ];
      });
      const safeCampName = camp.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      downloadCsv(`${safeCampName}-matches-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
      toast.success("Matches CSV exported");
    } catch {
      toast.error("Failed to export matches CSV");
    } finally {
      setExporting(null);
    }
  };

  const exportTraining = () => {
    try {
      setExporting("training");
      const sessions = sessionsQ.data ?? [];
      const drills = drillsQ.data ?? [];
      const attendance = attendanceQ.data ?? [];

      const drillBySession = new Map<string, typeof drills>();
      for (const d of drills) {
        const arr = drillBySession.get(d.session_id) ?? [];
        arr.push(d);
        drillBySession.set(d.session_id, arr);
      }

      const attBySession = new Map<string, typeof attendance>();
      for (const a of attendance) {
        const arr = attBySession.get(a.session_id) ?? [];
        arr.push(a);
        attBySession.set(a.session_id, arr);
      }

      const headers = [
        "Session Date",
        "Session Title",
        "Focus",
        "Notes",
        "Drills Summary",
        "Player",
        "Attendance Status",
        "RPE (1-10)",
        "Player Note",
      ];

      const rows: (string | number | null | undefined)[][] = [];

      for (const s of sessions) {
        const sDrills = drillBySession.get(s.id) ?? [];
        const drillSummary = sDrills.length
          ? sDrills.map((d) => `${d.drill_name} (${d.drill_type}${d.duration_min ? `, ${d.duration_min}m` : ""})`).join(" | ")
          : "";

        const sAtt = attBySession.get(s.id) ?? [];
        if (!sAtt.length) {
          rows.push([s.session_date, s.title, s.focus ?? "", s.notes ?? "", drillSummary, "", "", "", ""]);
        } else {
          for (const a of sAtt) {
            rows.push([
              s.session_date,
              s.title,
              s.focus ?? "",
              s.notes ?? "",
              drillSummary,
              formatPlayerName(a.person_id),
              a.status,
              a.rpe ?? "",
              a.note ?? "",
            ]);
          }
        }
      }

      const safeCampName = camp.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      downloadCsv(`${safeCampName}-training-attendance-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
      toast.success("Training & attendance CSV exported");
    } catch {
      toast.error("Failed to export training CSV");
    } finally {
      setExporting(null);
    }
  };

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-bold">Data export (CSV)</h2>
        <Download size={16} className="text-ink-soft" />
      </div>
      <p className="mb-4 text-xs text-ink-soft">
        Download complete camp records for offline analysis, archiving, or team records.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={exporting !== null || standingsQ.isLoading}
          onClick={exportStandings}
        >
          {exporting === "standings" ? "Exporting…" : "Standings CSV"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={exporting !== null || matchesQ.isLoading}
          onClick={exportMatches}
        >
          {exporting === "matches" ? "Exporting…" : "Matches CSV"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={exporting !== null || sessionsQ.isLoading}
          onClick={exportTraining}
        >
          {exporting === "training" ? "Exporting…" : "Training & Attendance CSV"}
        </Button>
      </div>
    </Card>
  );
}
