import { Suspense, lazy, type ReactNode } from "react";
import { Link, Redirect, Route, Router, Switch, useLocation } from "wouter";
import { Bell, CalendarDays, ClipboardList, Dumbbell, LogOut, Settings, Sun, Swords, Trophy, Users } from "lucide-react";
import { useState } from "react";
import { useSession } from "./lib/session";
import { supabaseConfigured } from "./lib/supabase";
import { useActivity } from "./lib/api";
import { Button, ConfirmDialog, Select, cx } from "./components/ui";
import { outbox } from "./lib/outbox";
import { LoginPage, NoCampPage, NotOnRosterPage, SetupNeededPage } from "./pages/Gate";
import TodayPage from "./pages/Today";
import MatchesPage from "./pages/Matches";

// Less-used pages load on demand (the service worker still precaches them for offline use).
const StandingsPage = lazy(() => import("./pages/Standings"));
const TrainingPage = lazy(() => import("./pages/Training"));
const SquadPage = lazy(() => import("./pages/Squad"));
const SelectionPage = lazy(() => import("./pages/Selection"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const ActivityPage = lazy(() => import("./pages/Activity"));
const InsightsPage = lazy(() => import("./pages/Insights"));
import { ConnectionBar, SyncEngine, applyOutdoor, readOutdoor } from "./components/AppChrome";

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
        <Suspense fallback={<Splash />}>
        <Switch>
          <Route path="/" component={TodayPage} />
          <Route path="/matches" component={MatchesPage} />
          <Route path="/standings" component={StandingsPage} />
          <Route path="/training" component={TrainingPage} />
          <Route path="/squad" component={SquadPage} />
          <Route path="/activity" component={ActivityPage} />
          {s.isStaff && <Route path="/selection" component={SelectionPage} />}
          {s.isStaff && <Route path="/insights" component={InsightsPage} />}
          {s.isAdmin && <Route path="/settings" component={SettingsPage} />}
          <Route><Redirect to="/" /></Route>
        </Switch>
        </Suspense>
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
  const [outdoor, setOutdoor] = useState(readOutdoor);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

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
    <div className="mx-auto min-h-screen max-w-3xl pb-28">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-md pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="min-w-0 flex-1">
            {s.camps.length > 1 ? (
              <Select
                aria-label="Camp"
                value={s.camp!.id}
                onChange={(e) => s.setCampId(e.target.value)}
                className="!w-auto max-w-full !border-0 !bg-transparent !p-0 font-bold text-base truncate"
              >
                {s.camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            ) : (
              <p className="truncate font-bold text-ink text-base">{s.camp!.name}</p>
            )}
            <p className="text-[11px] text-ink-soft capitalize truncate leading-tight">{s.role ?? "member"} · Training camp</p>
          </div>
          <button type="button" aria-pressed={outdoor} aria-label="Outdoor mode (high contrast)"
            title="Outdoor mode: high contrast, bigger buttons"
            onClick={() => { applyOutdoor(!outdoor); setOutdoor(!outdoor); }}
            className={cx("rounded-xl p-2 transition hover:bg-surface-2", outdoor ? "text-brand bg-brand/10" : "text-ink-soft")}>
            <Sun size={19} />
          </button>
          <Link href="/activity" aria-label={`Activity${unread ? `, ${unread} unread` : ""}`}
            className="relative rounded-xl p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink">
            <Bell size={19} />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold text-white shadow-xs animate-pulse">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          {s.isAdmin && (
            <Link href="/settings" aria-label="Camp settings" className="rounded-xl p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink">
              <Settings size={19} />
            </Link>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmSignOut(true)}
            aria-label="Sign out"
            className="!min-h-[36px] !px-2 text-ink-soft hover:text-rose-600"
          >
            <LogOut size={18} />
          </Button>
        </div>
        <ConnectionBar campId={s.camp!.id} />
      </header>
      <SyncEngine campId={s.camp!.id} />

      <main className="px-3.5 sm:px-4 py-4 sm:py-5">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line/80 bg-surface/95 backdrop-blur-md pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <div className="mx-auto grid max-w-3xl grid-cols-5 px-1 py-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? loc === "/" : loc.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cx(
                  "flex flex-col items-center justify-center py-1 min-h-[48px] text-[11px] font-medium transition-all duration-150 rounded-xl",
                  active
                    ? "text-brand font-bold"
                    : "text-ink-soft hover:text-ink"
                )}
              >
                <span
                  className={cx(
                    "flex items-center justify-center w-11 h-7 rounded-full transition-all duration-200",
                    active ? "bg-brand/12 text-brand dark:bg-brand/25 shadow-xs" : ""
                  )}
                >
                  <Icon size={19} strokeWidth={active ? 2.5 : 2} />
                </span>
                <span className="mt-0.5 tracking-tight">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out of camp?"
        message={
          outbox.all().filter((i) => !i.error).length > 0
            ? `${outbox.all().filter((i) => !i.error).length} unsent match results are waiting to sync. Signing out will clear them from this phone. Sign out anyway?`
            : "You will need your login to sign back into this camp."
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
