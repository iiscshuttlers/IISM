import type { ReactNode } from "react";
import { Link, Redirect, Route, Router, Switch, useLocation } from "wouter";
import { Bell, CalendarDays, ClipboardList, Dumbbell, LogOut, Settings, Swords, Trophy, Users } from "lucide-react";
import { useSession } from "./lib/session";
import { supabaseConfigured } from "./lib/supabase";
import { useActivity } from "./lib/api";
import { Button, Select, cx } from "./components/ui";
import { LoginPage, NoCampPage, NotOnRosterPage, SetupNeededPage } from "./pages/Gate";
import TodayPage from "./pages/Today";
import MatchesPage from "./pages/Matches";
import StandingsPage from "./pages/Standings";
import TrainingPage from "./pages/Training";
import SquadPage from "./pages/Squad";
import SelectionPage from "./pages/Selection";
import SettingsPage from "./pages/Settings";
import ActivityPage from "./pages/Activity";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function App() {
  const s = useSession();
  if (!supabaseConfigured) return <SetupNeededPage />;
  if (s.loading) return <Splash />;
  if (!s.auth) return <LoginPage />;
  if (!s.meId) return <NotOnRosterPage />;
  if (!s.camp) return <NoCampPage />;
  return (
    <Router base={base}>
      <Shell>
        <Switch>
          <Route path="/" component={TodayPage} />
          <Route path="/matches" component={MatchesPage} />
          <Route path="/standings" component={StandingsPage} />
          <Route path="/training" component={TrainingPage} />
          <Route path="/squad" component={SquadPage} />
          <Route path="/activity" component={ActivityPage} />
          {s.isStaff && <Route path="/selection" component={SelectionPage} />}
          {s.isAdmin && <Route path="/settings" component={SettingsPage} />}
          <Route><Redirect to="/" /></Route>
        </Switch>
      </Shell>
    </Router>
  );
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-brand" aria-label="Loading" />
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const s = useSession();
  const [loc] = useLocation();
  const activity = useActivity(s.camp?.id);
  const unread = (activity.data ?? []).filter((a) => !a.read_at).length;

  const nav = [
    { href: "/", label: "Today", icon: CalendarDays },
    { href: "/matches", label: "Matches", icon: Swords },
    { href: "/standings", label: "Standings", icon: Trophy },
    { href: "/training", label: "Training", icon: Dumbbell },
    s.isStaff
      ? { href: "/selection", label: "Selection", icon: ClipboardList }
      : { href: "/squad", label: "Squad", icon: Users },
  ];

  return (
    <div className="mx-auto min-h-screen max-w-3xl pb-24">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            {s.camps.length > 1 ? (
              <Select
                aria-label="Camp"
                value={s.camp!.id}
                onChange={(e) => s.setCampId(e.target.value)}
                className="!w-auto max-w-full !border-0 !bg-transparent !p-0 font-bold"
              >
                {s.camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            ) : (
              <p className="truncate font-bold text-ink">{s.camp!.name}</p>
            )}
            <p className="text-xs text-ink-soft capitalize">{s.role ?? "member"} · Training camp</p>
          </div>
          <Link href="/activity" aria-label={`Activity${unread ? `, ${unread} unread` : ""}`}
            className="relative rounded-lg p-2 text-ink-soft hover:bg-surface-2">
            <Bell size={20} />
            {unread > 0 && (
              <span className="absolute right-1 top-1 min-w-[16px] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold text-white">
                {unread}
              </span>
            )}
          </Link>
          {s.isAdmin && (
            <Link href="/settings" aria-label="Camp settings" className="rounded-lg p-2 text-ink-soft hover:bg-surface-2">
              <Settings size={20} />
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={s.signOut} aria-label="Sign out"><LogOut size={18} /></Button>
        </div>
      </header>

      <main className="px-4 py-5">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? loc === "/" : loc.startsWith(href);
            return (
              <Link key={href} href={href}
                className={cx("flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold",
                  active ? "text-brand" : "text-ink-soft")}>
                <Icon size={20} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
