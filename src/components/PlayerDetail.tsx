import { useState, useMemo } from "react";
import { Dumbbell, ArrowRightLeft, FileText } from "lucide-react";
import { Badge, Button, Card, Sheet } from "./ui";
import { CATEGORIES } from "../lib/scores";
import { PlayerReportCardModal } from "./PlayerReportCard";
import type { Assessment, Attendance, Match, Member, Standing } from "../lib/types";

export function PlayerDetailSheet({
  personId,
  onClose,
  members,
  standings,
  matches,
  attendance,
  assessments,
  isStaff,
  onCompare,
}: {
  personId: string | null;
  onClose: () => void;
  members: Member[];
  standings: Standing[];
  matches: Match[];
  attendance: Attendance[];
  assessments: Assessment[];
  isStaff: boolean;
  onCompare?: (p1Id: string) => void;
}) {
  const member = useMemo(() => members.find((m) => m.id === personId), [members, personId]);
  const standing = useMemo(() => standings.find((s) => s.person_id === personId), [standings, personId]);
  const rank = useMemo(() => {
    if (!personId) return null;
    const idx = standings.findIndex((s) => s.person_id === personId);
    return idx >= 0 ? idx + 1 : null;
  }, [standings, personId]);

  // Player matches
  const playerMatches = useMemo(() => {
    if (!personId) return [];
    return matches.filter((m) => [m.t1_p1, m.t1_p2, m.t2_p1, m.t2_p2].includes(personId)).slice(0, 8);
  }, [matches, personId]);

  // Attendance stats
  const attStats = useMemo(() => {
    if (!personId) return { total: 0, present: 0, rpes: [] as number[], avgRpe: null as number | null };
    const myAtt = attendance.filter((a) => a.person_id === personId);
    const presentCount = myAtt.filter((a) => a.status === "present" || a.status === "late").length;
    const rpeValues = myAtt.map((a) => a.rpe).filter((r): r is number => r !== null && r !== undefined);
    const avg = rpeValues.length ? Math.round((rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) * 10) / 10 : null;
    return {
      total: myAtt.length,
      present: presentCount,
      rpes: rpeValues,
      avgRpe: avg,
    };
  }, [attendance, personId]);

  // Assessments for staff
  const myAssessments = useMemo(() => {
    if (!personId || !isStaff) return [];
    return assessments.filter((a) => a.person_id === personId);
  }, [assessments, personId, isStaff]);

  const [showReport, setShowReport] = useState(false);

  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m.full_name])), [members]);
  const formatName = (id: string | null) => (id ? memberMap.get(id) ?? "Unknown" : "");

  if (!member) return null;

  const winPct = standing && standing.played > 0 ? Math.round((standing.won / standing.played) * 100) : 0;
  const ptsDiff = standing ? standing.points_for - standing.points_against : 0;

  return (
    <Sheet open={!!personId} onClose={onClose} title={member.full_name}>
      <div className="space-y-4">
        {/* Header Profile Card */}
        <Card className="bg-gradient-to-br from-brand/5 to-surface">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center text-brand font-bold text-lg">
                {member.full_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-lg text-ink leading-tight">{member.full_name}</h3>
                <div className="flex items-center gap-2 text-xs text-ink-soft mt-0.5">
                  <span>{member.gender === "M" ? "Male" : member.gender === "F" ? "Female" : "Gender not set"}</span>
                  <span>·</span>
                  <span className="capitalize">{member.role}</span>
                </div>
              </div>
            </div>

            {standing && (
              <div className="text-right">
                <span className="text-2xl font-black text-brand tabular-nums">{standing.rating}</span>
                <p className="text-[11px] font-semibold text-ink-soft">
                  {rank ? `Rank #${rank}` : "Rating"}
                </p>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="mt-3 pt-3 border-t border-line flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="text-xs"
              onClick={() => setShowReport(true)}
            >
              <FileText size={13} className="mr-1" />
              Report Card / Certificate
            </Button>

            {onCompare && standing && standing.played > 0 && (
              <Button
                variant="secondary"
                size="sm"
                className="text-xs"
                onClick={() => {
                  onClose();
                  onCompare(member.id);
                }}
              >
                <ArrowRightLeft size={13} className="mr-1" />
                Head-to-head
              </Button>
            )}
          </div>
        </Card>

        {/* Stats Grid */}
        {standing ? (
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="p-2.5 rounded-lg bg-surface border border-line">
              <p className="text-base font-bold text-ink">{standing.played}</p>
              <p className="text-[10px] uppercase font-semibold text-ink-soft">Played</p>
            </div>
            <div className="p-2.5 rounded-lg bg-surface border border-line">
              <p className="text-base font-bold text-emerald-600">{standing.won} ({winPct}%)</p>
              <p className="text-[10px] uppercase font-semibold text-ink-soft">Wins</p>
            </div>
            <div className="p-2.5 rounded-lg bg-surface border border-line">
              <p className="text-base font-bold text-ink tabular-nums">
                {ptsDiff > 0 ? `+${ptsDiff}` : ptsDiff}
              </p>
              <p className="text-[10px] uppercase font-semibold text-ink-soft">Pts Diff</p>
            </div>
            <div className="p-2.5 rounded-lg bg-surface border border-line">
              <p className="text-base font-bold font-mono tracking-wider">
                {standing.form || "—"}
              </p>
              <p className="text-[10px] uppercase font-semibold text-ink-soft">Form</p>
            </div>
          </div>
        ) : (
          <div className="p-3 text-center text-xs text-ink-soft bg-surface-2 rounded-lg">
            No matches played in this camp yet.
          </div>
        )}

        {/* Category Breakdown */}
        {standing && standing.by_category && Object.keys(standing.by_category).length > 0 && (
          <Card>
            <h4 className="text-xs font-bold text-ink-soft uppercase tracking-wider mb-2">Category Record</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => {
                const rec = standing.by_category[cat.value];
                if (!rec) return null;
                return (
                  <div key={cat.value} className="flex items-center justify-between p-2 rounded bg-surface-2 text-xs">
                    <span className="font-bold text-brand">{cat.value}</span>
                    <span className="font-mono text-ink">
                      {rec.w}W – {rec.l}L
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Attendance & Effort */}
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-ink-soft uppercase tracking-wider">Training & Effort</h4>
            <Dumbbell size={14} className="text-ink-soft" />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-2 rounded bg-surface-2">
              <p className="text-xs text-ink-soft">Attendance</p>
              <p className="text-base font-bold text-ink">
                {attStats.present}
                {attStats.total > 0 && (
                  <span className="text-xs font-normal text-ink-soft ml-1">
                    ({Math.round((attStats.present / attStats.total) * 100)}%)
                  </span>
                )}
              </p>
            </div>
            <div className="p-2 rounded bg-surface-2">
              <p className="text-xs text-ink-soft">Avg Effort (RPE)</p>
              <p className="text-base font-bold text-ink">
                {attStats.avgRpe ? `${attStats.avgRpe} / 10` : "—"}
              </p>
            </div>
          </div>
        </Card>

        {/* Staff Assessments (visible only to coaches/admins) */}
        {isStaff && (
          <Card>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-ink-soft uppercase tracking-wider">Coach Evaluations</h4>
              <Badge tone="brand">Staff only</Badge>
            </div>
            {myAssessments.length === 0 ? (
              <p className="text-xs text-ink-soft italic">No coach assessment logged yet.</p>
            ) : (
              <div className="space-y-3">
                {myAssessments.map((a) => (
                  <div key={a.id} className="p-2.5 rounded bg-surface-2 space-y-1.5 text-xs">
                    <div className="flex justify-between text-ink-soft text-[11px]">
                      <span>{a.assessed_on}</span>
                      <span>Coach: {formatName(a.coach_id)}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-center font-semibold pt-1">
                      <div className="p-1 bg-surface rounded border border-line">
                        <span className="text-ink-soft block text-[10px]">Technique</span>
                        <span className="text-brand font-bold">{a.technique ?? "—"}/5</span>
                      </div>
                      <div className="p-1 bg-surface rounded border border-line">
                        <span className="text-ink-soft block text-[10px]">Fitness</span>
                        <span className="text-brand font-bold">{a.fitness ?? "—"}/5</span>
                      </div>
                      <div className="p-1 bg-surface rounded border border-line">
                        <span className="text-ink-soft block text-[10px]">Tactics</span>
                        <span className="text-brand font-bold">{a.tactics ?? "—"}/5</span>
                      </div>
                      <div className="p-1 bg-surface rounded border border-line">
                        <span className="text-ink-soft block text-[10px]">Attitude</span>
                        <span className="text-brand font-bold">{a.attitude ?? "—"}/5</span>
                      </div>
                    </div>
                    {a.note && <p className="text-ink pt-1 text-[11px]">"{a.note}"</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Recent Matches */}
        <section className="space-y-2">
          <h4 className="text-xs font-bold text-ink-soft uppercase tracking-wider">Recent Matches</h4>
          {playerMatches.length === 0 ? (
            <p className="text-xs text-ink-soft italic">No matches recorded for this player yet.</p>
          ) : (
            <div className="space-y-1.5">
              {playerMatches.map((m) => {
                const isT1 = m.t1_p1 === personId || m.t1_p2 === personId;
                const won = (isT1 && m.winner_side === 1) || (!isT1 && m.winner_side === 2);
                const t1 = [formatName(m.t1_p1), formatName(m.t1_p2)].filter(Boolean).join(" & ");
                const t2 = [formatName(m.t2_p1), formatName(m.t2_p2)].filter(Boolean).join(" & ");

                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-surface border border-line text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] text-white ${
                          won ? "bg-emerald-600" : "bg-red-500"
                        }`}
                      >
                        {won ? "W" : "L"}
                      </span>
                      <span className="font-semibold text-brand">{m.category}</span>
                      <span className="text-ink">
                        {t1} <span className="text-ink-soft">vs</span> {t2}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="font-mono text-ink-soft font-medium">
                        {m.games?.join(", ") || "Winner only"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <PlayerReportCardModal
        open={showReport}
        onClose={() => setShowReport(false)}
        member={member}
        standing={standing}
        rank={rank}
        attendance={attendance}
        assessments={assessments}
        campName="IISc Badminton Training Camp"
      />
    </Sheet>
  );
}
