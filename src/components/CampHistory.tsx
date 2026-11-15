import { useState } from "react";
import { Trophy } from "lucide-react";
import { Avatar, Badge, Button, Card, Sheet, fmtDate } from "./ui";
import type { Camp, Match, Member, Session, Standing } from "../lib/types";

export function CampHistoryModal({
  camp,
  open,
  onClose,
  members,
  matches,
  standings,
  sessions,
}: {
  camp: Camp;
  open: boolean;
  onClose: () => void;
  members: Member[];
  matches: Match[];
  standings: Standing[];
  sessions: Session[];
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "sessions" | "roster" | "records">("overview");

  const confirmedMatches = matches.filter((m) => m.status === "confirmed");
  const totalRallies = standings.reduce((t, s) => t + s.points_for, 0);
  const playerMembers = members.filter((m) => m.role === "player");
  const topRated = [...standings].sort((a, b) => b.rating - a.rating)[0];

  return (
    <Sheet open={open} onClose={onClose} title="Camp History &amp; Archive">
      <div className="space-y-4">
        {/* Camp Status Header */}
        <div className="p-3.5 rounded-xl border border-line bg-gradient-to-br from-brand/5 to-surface space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-ink">{camp.name}</span>
            <Badge tone={camp.status === "active" ? "good" : "neutral"}>
              {camp.status === "active" ? "Active Camp" : "Archived / Closed"}
            </Badge>
          </div>
          <p className="text-xs text-ink-soft">
            {camp.starts_on ? fmtDate(camp.starts_on) : "Start"} – {camp.ends_on ? fmtDate(camp.ends_on) : "Present"}
          </p>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 border-b border-line pb-1 text-xs">
          {[
            { id: "overview", label: "Overview & Stats" },
            { id: "sessions", label: `Sessions (${sessions.length})` },
            { id: "roster", label: `Roster (${members.length})` },
            { id: "records", label: "Final Standings" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as any)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                activeTab === t.id
                  ? "bg-brand-pale text-brand border border-brand-border"
                  : "text-ink-soft hover:text-ink hover:bg-surface-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Overview */}
        {activeTab === "overview" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Card className="text-center p-3">
                <p className="text-xl font-bold text-ink">{playerMembers.length}</p>
                <p className="text-[11px] text-ink-soft">Athletes</p>
              </Card>
              <Card className="text-center p-3">
                <p className="text-xl font-bold text-ink">{confirmedMatches.length}</p>
                <p className="text-[11px] text-ink-soft">Matches Played</p>
              </Card>
              <Card className="text-center p-3">
                <p className="text-xl font-bold text-ink">{sessions.length}</p>
                <p className="text-[11px] text-ink-soft">Training Sessions</p>
              </Card>
              <Card className="text-center p-3">
                <p className="text-xl font-bold text-ink">{totalRallies}</p>
                <p className="text-[11px] text-ink-soft">Rally Points</p>
              </Card>
            </div>

            {topRated && (
              <Card className="p-3 bg-surface-2 border-line flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-full bg-amber-500/10 text-amber-500">
                    <Trophy size={18} />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase font-bold text-ink-soft">Top Rated Performer</p>
                    <p className="text-sm font-bold text-ink">{topRated.full_name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-base font-black text-brand font-mono">{topRated.rating}</span>
                  <span className="block text-[10px] text-ink-soft">Elo Rating</span>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Tab 2: Sessions */}
        {activeTab === "sessions" && (
          <div className="space-y-2">
            {sessions.length === 0 ? (
              <p className="text-xs text-ink-soft text-center py-6 border border-dashed border-line rounded-lg">
                No past sessions recorded.
              </p>
            ) : (
              sessions.map((s) => (
                <Card key={s.id} className="p-3 border-line space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-ink">{s.title}</span>
                    <span className="text-[11px] text-ink-soft">{fmtDate(s.session_date)}</span>
                  </div>
                  {s.focus && <p className="text-xs text-ink-soft">Focus: {s.focus}</p>}
                  {s.duration_min && (
                    <p className="text-[10px] text-brand font-semibold">{s.duration_min} minutes planned</p>
                  )}
                </Card>
              ))
            )}
          </div>
        )}

        {/* Tab 3: Roster */}
        {activeTab === "roster" && (
          <div className="space-y-2">
            <div className="divide-y divide-line border border-line rounded-xl overflow-hidden bg-surface">
              {members.map((m) => (
                <div key={m.id} className="p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar name={m.full_name} size="sm" />
                    <div>
                      <span className="font-semibold text-xs text-ink block">{m.full_name}</span>
                      <span className="text-[10px] text-ink-soft capitalize">{m.role} · {m.gender === "M" ? "Men" : "Women"}</span>
                    </div>
                  </div>
                  <Badge tone={m.role === "player" ? "brand" : "neutral"}>{m.role}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Final Standings */}
        {activeTab === "records" && (
          <div className="space-y-2">
            <div className="divide-y divide-line border border-line rounded-xl overflow-hidden bg-surface text-xs">
              {standings.map((st, i) => (
                <div key={st.person_id} className="p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink-soft w-4 text-center">{i + 1}</span>
                    <Avatar name={st.full_name} size="xs" />
                    <span className="font-semibold text-ink">{st.full_name}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono">
                    <span className="text-ink-soft">{st.won}W – {st.lost}L</span>
                    <span className="font-bold text-brand">{st.rating} Elo</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <Button onClick={onClose}>Close history</Button>
        </div>
      </div>
    </Sheet>
  );
}
