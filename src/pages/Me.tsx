import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  Bell, BookOpen, Calendar, ChevronRight, HeartPulse, History, LogOut, Megaphone, MessageSquare,
  LineChart, Package, Settings, SlidersHorizontal, TrendingUp, Trophy,
} from "lucide-react";
import { useSession } from "../lib/session";
import { useMatches, useMembers, useSessions, useStandings } from "../lib/api";
import { outbox } from "../lib/outbox";
import { Avatar, Button, Card, ConfirmDialog, PageTitle } from "../components/ui";
import { PlayerGoalsSection } from "../components/PlayerGoals";
import { PersonalMatchHistoryModal } from "../components/PersonalMatchHistory";
import { SessionReflectionModal } from "../components/SessionReflection";
import { InjuryTrackerModal } from "../components/InjuryTracker";
import { SkillLibrarySheet } from "../components/SkillLibrary";
import { CampCalendarExportModal } from "../components/CalendarExport";
import { EquipmentTrackerModal } from "../components/EquipmentTracker";
import { CampHistoryModal } from "../components/CampHistory";
import { AnnouncementManagerModal } from "../components/Announcements";
import { AccessibilityModal } from "../components/AccessibilityModal";
import { GuideButton } from "../components/GuideModal";
import { InstallCard } from "../components/AppChrome";
import { PhoneAlertsRow } from "../components/PhoneAlerts";

type Sheet = "history" | "reflections" | "injuries" | "skills" | "calendar" | "gear" | "archive" | "announcements" | "display" | null;

/** Everything about you in one place: your record, goals and private reports, camp tools, settings and sign-out. */
export default function MePage() {
  const s = useSession();
  const campId = s.camp!.id;
  const meId = s.meId ?? null;
  const isPlayer = s.role === "player";
  const members = useMembers(campId);
  const standings = useStandings(campId);
  const matches = useMatches(campId);
  const sessions = useSessions(campId);
  const [open, setOpen] = useState<Sheet>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const close = () => setOpen(null);

  const people = members.data ?? [];
  const players = people.filter((m) => m.role === "player");
  const me = people.find((m) => m.id === meId);
  const myRow = (standings.data ?? []).find((r) => r.person_id === meId);
  const rank = myRow ? (standings.data ?? []).findIndex((r) => r.person_id === meId) + 1 : null;
  const showRank = s.isStaff || s.camp!.players_see_all_results;
  const unsent = outbox.all().filter((i) => !i.error).length;

  return (
    <div className="space-y-5">
      <PageTitle action={<GuideButton variant="secondary" />}>Me</PageTitle>

      <Card className="flex items-center gap-3">
        <Avatar name={me?.full_name ?? s.auth?.user.email ?? "?"} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-ink">{me?.full_name ?? "Camp member"}</p>
          <p className="truncate text-xs capitalize text-ink-soft">{s.role ?? "member"} · {s.camp!.name}</p>
          {s.auth?.user.email && <p className="truncate text-[11px] text-ink-soft">{s.auth.user.email}</p>}
        </div>
      </Card>

      {isPlayer && (
        <section className="space-y-2">
          <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-faint">Your camp record</h2>
          {myRow ? (
            <Card>
              <div className="grid grid-cols-4 gap-2 text-center">
                <Stat label="Rating" value={myRow.rating} />
                <Stat label={showRank ? "Rank" : "Played"} value={showRank && rank ? `#${rank}` : myRow.played} />
                <Stat label="Won" value={`${myRow.won}/${myRow.played}`} />
                <Stat label="Form" value={myRow.form || "—"} mono />
              </div>
              <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => setOpen("history")}>
                <TrendingUp size={14} className="text-brand" /> Match & rating history
              </Button>
            </Card>
          ) : (
            <Card className="text-xs text-ink-soft">Your record appears here after your first match.</Card>
          )}
          {meId && (
            <Card>
              <PlayerGoalsSection campId={campId} personId={meId} isCoach={false} />
            </Card>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-faint">{isPlayer ? "Just for you and your coaches" : "Your records"}</h2>
        <Card className="divide-y divide-line !p-0">
          <Row icon={<MessageSquare size={17} />} title="Post-practice reflections" hint="What went well, what to work on next" onClick={() => setOpen("reflections")} />
          <Row
            icon={<HeartPulse size={17} className="text-status-warn-text" />}
            title={s.isStaff ? "Physio & injury board" : "Soreness & injury reports"}
            hint={s.isStaff ? "Players' reports and your follow-ups" : "Private: only you and your coaches see these"}
            onClick={() => setOpen("injuries")}
          />
          {isPlayer && <Row icon={<Trophy size={17} />} title="Squad" hint="The selected squad, once it's announced" href="/squad" />}
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-faint">Camp</h2>
        <Card className="divide-y divide-line !p-0">
          {s.isStaff && <Row icon={<LineChart size={17} />} title="Insights & coaching prompts" hint="Compare players, pairs, training load and readiness" href="/insights" />}
          <Row icon={<Megaphone size={17} />} title="Announcements" hint={s.isStaff ? "Post and manage notices" : "Every notice from your coaches"} onClick={() => setOpen("announcements")} />
          <Row icon={<BookOpen size={17} />} title="Skill & drill library" hint="Technique cues and practice drills" onClick={() => setOpen("skills")} />
          <Row icon={<Calendar size={17} />} title="Add sessions to my calendar" onClick={() => setOpen("calendar")} />
          <Row icon={<Package size={17} />} title="Camp gear" hint="Shuttles, rackets and training aids" onClick={() => setOpen("gear")} />
          <Row icon={<History size={17} />} title="Camp archive" hint="Past sessions, results and standings" onClick={() => setOpen("archive")} />
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-faint">App</h2>
        <Card className="divide-y divide-line !p-0">
          <Row icon={<SlidersHorizontal size={17} />} title="Display & accessibility" hint="Text size, outdoor contrast, motion" onClick={() => setOpen("display")} />
          <Row icon={<Bell size={17} />} title="Notifications" hint="Match updates and alerts" href="/activity" />
          {meId && (
            <PhoneAlertsRow personId={meId} campId={campId} muted={!!me?.activity_muted} campActivityOn={s.camp!.activity_enabled} />
          )}
          {s.isAdmin && <Row icon={<Settings size={17} />} title="Camp settings" hint="Roster, visibility and exports" href="/settings" />}
        </Card>
        <InstallCard />
      </section>

      <Button variant="secondary" className="w-full text-status-danger-text" onClick={() => setConfirmSignOut(true)}>
        <LogOut size={16} /> Sign out
      </Button>

      <PersonalMatchHistoryModal open={open === "history"} onClose={close} personId={meId} members={people} matches={matches.data ?? []} standings={standings.data ?? []} />
      <SessionReflectionModal open={open === "reflections"} onClose={close} campId={campId} personId={meId} playerName={me?.full_name} sessions={sessions.data ?? []} />
      <InjuryTrackerModal open={open === "injuries"} onClose={close} campId={campId} meId={meId} isStaff={s.isStaff} players={players} />
      <SkillLibrarySheet open={open === "skills"} onClose={close} campId={campId} currentPersonId={meId} isStaff={s.isStaff} />
      <CampCalendarExportModal open={open === "calendar"} onClose={close} campName={s.camp!.name} sessions={sessions.data ?? []} matches={matches.data ?? []} members={people} />
      <EquipmentTrackerModal open={open === "gear"} onClose={close} campId={campId} players={players} />
      <CampHistoryModal open={open === "archive"} onClose={close} camp={s.camp!} members={people} matches={matches.data ?? []} standings={standings.data ?? []} sessions={sessions.data ?? []} />
      <AnnouncementManagerModal open={open === "announcements"} onClose={close} campId={campId} members={people} />
      <AccessibilityModal open={open === "display"} onClose={close} />

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out of camp?"
        message={
          unsent > 0
            ? `${unsent} unsent match result${unsent === 1 ? " is" : "s are"} waiting to sync. Signing out deletes ${unsent === 1 ? "it" : "them"} from this phone. Sign out anyway?`
            : "You'll need your login to get back in."
        }
        confirmLabel="Sign out"
        onConfirm={async () => {
          setConfirmSignOut(false);
          await s.signOut();
        }}
        onCancel={() => setConfirmSignOut(false)}
      />
    </div>
  );
}

function Row({ icon, title, hint, onClick, href }: { icon: ReactNode; title: string; hint?: string; onClick?: () => void; href?: string }) {
  const body = (
    <span className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-2/60">
      <span className="shrink-0 text-brand">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        {hint && <span className="block truncate text-[11px] text-ink-soft">{hint}</span>}
      </span>
      <ChevronRight size={16} className="shrink-0 text-ink-soft" />
    </span>
  );
  return href ? (
    <Link href={href} className="block">{body}</Link>
  ) : (
    <button type="button" onClick={onClick} className="block w-full">{body}</button>
  );
}

const Stat = ({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) => (
  <div>
    <p className={`text-lg font-bold text-ink ${mono ? "font-mono tracking-wider" : ""}`}>{value}</p>
    <p className="text-[11px] text-ink-soft">{label}</p>
  </div>
);
