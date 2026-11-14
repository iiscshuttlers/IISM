import { useRef } from "react";
import { Printer, ShieldCheck } from "lucide-react";
import { Button, Sheet } from "./ui";
import { CATEGORIES } from "../lib/scores";
import type { Assessment, Attendance, Member, Standing } from "../lib/types";

export function PlayerReportCardModal({
  open,
  onClose,
  member,
  standing,
  rank,
  attendance,
  assessments,
  campName,
}: {
  open: boolean;
  onClose: () => void;
  member: Member;
  standing?: Standing;
  rank?: number | null;
  attendance: Attendance[];
  assessments: Assessment[];
  campName: string;
}) {
  const printRef = useRef<HTMLDivElement>(null);

  const myAtt = attendance.filter((a) => a.person_id === member.id);
  const presentCount = myAtt.filter((a) => a.status === "present" || a.status === "late").length;
  const attPct = myAtt.length ? Math.round((presentCount / myAtt.length) * 100) : 0;
  const rpes = myAtt.map((a) => a.rpe).filter((r): r is number => r !== null && r !== undefined);
  const avgRpe = rpes.length ? (rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(1) : "—";

  const myAssessments = assessments.filter((a) => a.person_id === member.id);
  const latestAssessment = myAssessments[0];

  const handlePrint = () => {
    window.print();
  };

  const winPct = standing && standing.played > 0 ? Math.round((standing.won / standing.played) * 100) : 0;

  return (
    <Sheet open={open} onClose={onClose} title="Camp Performance Report">
      <div className="space-y-4">
        <div className="flex justify-end no-print">
          <Button size="sm" onClick={handlePrint}>
            <Printer size={15} className="mr-1.5" />
            Print / Save PDF
          </Button>
        </div>

        {/* Printable Report Document */}
        <div
          ref={printRef}
          className="p-6 bg-white text-ink border border-line rounded-xl space-y-5 print:border-0 print:p-0"
        >
          {/* Header */}
          <div className="border-b-2 border-brand pb-4 text-center">
            <h2 className="text-xl font-extrabold text-brand uppercase tracking-wider">
              {campName}
            </h2>
            <p className="text-xs text-ink-soft uppercase font-semibold tracking-widest mt-0.5">
              Official Player Performance Report
            </p>
          </div>

          {/* Player Summary */}
          <div className="flex items-center justify-between bg-surface-2 p-3 rounded-lg border border-line">
            <div>
              <h3 className="text-lg font-bold text-ink">{member.full_name}</h3>
              <p className="text-xs text-ink-soft">
                Role: <span className="capitalize font-semibold text-ink">{member.role}</span> ·{" "}
                Gender: {member.gender === "M" ? "Male" : member.gender === "F" ? "Female" : "—"}
              </p>
            </div>
            {standing && (
              <div className="text-right">
                <span className="text-2xl font-black text-brand font-mono">{standing.rating}</span>
                <p className="text-[11px] text-ink-soft font-semibold">
                  {rank ? `Camp Rank #${rank}` : "Elo Rating"}
                </p>
              </div>
            )}
          </div>

          {/* Match & Rating Stats */}
          {standing ? (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-2">
                Match Performance
              </h4>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2 border border-line rounded-lg">
                  <p className="text-base font-bold">{standing.played}</p>
                  <p className="text-[10px] text-ink-soft uppercase">Matches</p>
                </div>
                <div className="p-2 border border-line rounded-lg">
                  <p className="text-base font-bold text-emerald-600">{standing.won} ({winPct}%)</p>
                  <p className="text-[10px] text-ink-soft uppercase">Wins</p>
                </div>
                <div className="p-2 border border-line rounded-lg">
                  <p className="text-base font-bold">{standing.lost}</p>
                  <p className="text-[10px] text-ink-soft uppercase">Losses</p>
                </div>
                <div className="p-2 border border-line rounded-lg">
                  <p className="text-base font-bold font-mono">{standing.form || "—"}</p>
                  <p className="text-[10px] text-ink-soft uppercase">Recent Form</p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Discipline Breakdown */}
          {standing?.by_category && Object.keys(standing.by_category).length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5">
                Discipline Record
              </h4>
              <div className="grid grid-cols-5 gap-1.5 text-center text-xs">
                {CATEGORIES.map((c) => {
                  const rec = standing.by_category[c.value];
                  return (
                    <div key={c.value} className="p-1.5 bg-surface-2 rounded border border-line">
                      <p className="font-bold text-brand">{c.value}</p>
                      <p className="font-mono text-ink text-[11px] mt-0.5">
                        {rec ? `${rec.w}W - ${rec.l}L` : "—"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Training & Effort */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5">
              Training & Commitment
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-surface-2 rounded border border-line">
                <span className="text-ink-soft">Attendance:</span>{" "}
                <strong className="text-ink">{presentCount} sessions ({attPct}%)</strong>
              </div>
              <div className="p-2 bg-surface-2 rounded border border-line">
                <span className="text-ink-soft">Average Effort (RPE):</span>{" "}
                <strong className="text-ink">{avgRpe} / 10</strong>
              </div>
            </div>
          </div>

          {/* Coach Assessment */}
          {latestAssessment && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5">
                Coach Skill Evaluation
              </h4>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2 border border-line rounded-lg">
                  <p className="text-ink-soft text-[10px]">Technique</p>
                  <p className="font-bold text-brand text-sm">{latestAssessment.technique ?? "—"}/5</p>
                </div>
                <div className="p-2 border border-line rounded-lg">
                  <p className="text-ink-soft text-[10px]">Fitness</p>
                  <p className="font-bold text-brand text-sm">{latestAssessment.fitness ?? "—"}/5</p>
                </div>
                <div className="p-2 border border-line rounded-lg">
                  <p className="text-ink-soft text-[10px]">Tactics</p>
                  <p className="font-bold text-brand text-sm">{latestAssessment.tactics ?? "—"}/5</p>
                </div>
                <div className="p-2 border border-line rounded-lg">
                  <p className="text-ink-soft text-[10px]">Attitude</p>
                  <p className="font-bold text-brand text-sm">{latestAssessment.attitude ?? "—"}/5</p>
                </div>
              </div>
              {latestAssessment.note && (
                <p className="text-xs text-ink-soft italic mt-2 p-2 bg-surface-2 rounded border border-line">
                  "{latestAssessment.note}"
                </p>
              )}
            </div>
          )}

          {/* Footer Certificate Seal */}
          <div className="pt-4 border-t border-line flex items-center justify-between text-[11px] text-ink-soft">
            <div className="flex items-center gap-1.5 text-brand font-semibold">
              <ShieldCheck size={16} />
              <span>IISc Badminton Club & Coaching Staff</span>
            </div>
            <span>Date: {new Date().toLocaleDateString("en-IN")}</span>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
