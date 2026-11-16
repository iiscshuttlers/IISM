import { Suspense, lazy, type ReactNode } from "react";
import { Link, Redirect, Route, Router, Switch, useLocation } from "wouter";
import { Bell, CalendarDays, CircleUser, ClipboardList, Dumbbell, Settings, Swords, Trophy } from "lucide-react";
import { useEffect } from "react";
import { useSession } from "./lib/session";
import { supabaseConfigured } from "./lib/supabase";
import { useActivity, useMembers } from "./lib/api";
import { Avatar, Select, cx } from "./components/ui";
import { LoginPage, NoCampPage, NotOnRosterPage, SetupNeededPage } from "./pages/Gate";
import TodayPage from "./pages/Today";
import PlayerTodayPage from "./pages/PlayerToday";
import MatchesPage from "./pages/Matches";

// Less-used pages load on demand (the service worker still precaches them for offline use).
const StandingsPage = lazy(() => import("./pages/Standings"));
const TrainingPage = lazy(() => import("./pages/Training"));
const SquadPage = lazy(() => import("./pages/Squad"));
const SelectionPage = lazy(() => import("./pages/Selection"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const ActivityPage = lazy(() => import("./pages/Activity"));
const InsightsPage = lazy(() => import("./pages/Insights"));
const MePage = lazy(() => import("./pages/Me"));
import { ConnectionBar, SyncEngine } from "./components/AppChrome";
import { AppLogo } from "./components/AppLogo";
import { applyA11yPrefs, getA11yPrefs } from "./lib/campExtended";

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
            {/* Players get a home screen ordered around their day; staff get the coaching hub. */}
            <Route path="/" component={s.role === "player" ? PlayerTodayPage : TodayPage} />
            <Route path="/me" component={MePage} />
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <AppLogo size={52} className="animate-pulse shadow-md rounded-2xl" />
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand" aria-label="Loading" />
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const s = useSession();
  const [loc] = useLocation();
  const activity = useActivity(s.camp?.id);
  const unread = (activity.data ?? []).filter((a) => !a.read_at).length;
  const members = useMembers(s.camp?.id);
  const myName = (members.data ?? []).find((m) => m.id === s.meId)?.full_name;

  useEffect(() => {
    applyA11yPrefs(getA11yPrefs());
  }, []);

  // Players: their own space (history, goals, reports, settings) is a tab. The squad lives
  // there and on Today once it's announced. Staff keep Selection; "Me" is the header avatar.
  const nav = [
    { href: "/", label: "Today", icon: CalendarDays },
    { href: "/matches", label: "Matches", icon: Swords },
    { href: "/standings", label: "Standings", icon: Trophy },
    { href: "/training", label: "Training", icon: Dumbbell },
    s.isStaff
      ? { href: "/selection", label: "Selection", icon: ClipboardList }
      : { href: "/me", label: "Me", icon: CircleUser },
  ];

  return (
    <div className="mx-auto min-h-screen max-w-3xl pb-28">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-md pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5">
          <div className="min-w-0 flex-1 flex items-center gap-2.5">
            <Link
              href="/"
              className="flex items-center gap-2.5 min-w-0 group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-lg p-0.5 -m-0.5"
              title="Go to Today (home)"
            >
              <AppLogo size={36} className="shadow-xs group-hover:scale-105 transition-transform" />
              <div className="min-w-0">
                <p className="truncate font-bold text-ink text-base group-hover:text-brand transition-colors leading-tight">
                  {s.camp!.name}
                </p>
                <p className="text-[11px] text-ink-soft capitalize truncate leading-tight group-hover:text-ink transition-colors">
                  {s.role ?? "member"} · Training camp
                </p>
              </div>
            </Link>
            {s.camps.length > 1 && (
              <Select
                aria-label="Switch camp"
                value={s.camp!.id}
                onChange={(e) => s.setCampId(e.target.value)}
                className="!w-auto !border-0 !bg-transparent !p-0 font-semibold text-xs text-brand cursor-pointer shrink-0"
              >
                {s.camps.map((c) => (
                  <option key={c.id} value={c.id}>
                    ▾ {c.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <Link href="/activity" aria-label={`Activity${unread ? `, ${unread} unread` : ""}`}
            className="relative rounded-xl p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <Bell size={19} />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-center text-[10px] font-bold text-white shadow-xs animate-pulse">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          {s.isAdmin && (
            <Link href="/settings" aria-label="Camp settings" className="rounded-xl p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <Settings size={19} />
            </Link>
          )}
          <Link
            href="/me"
            aria-label="Me: profile, settings and sign out"
            className={cx(
              "rounded-full p-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              loc === "/me" ? "ring-2 ring-brand" : "hover:ring-2 hover:ring-line",
            )}
          >
            <Avatar name={myName ?? s.auth?.user.email ?? "?"} size="sm" />
          </Link>
        </div>
        <ConnectionBar campId={s.camp!.id} />
      </header>
      <SyncEngine campId={s.camp!.id} />

      <main className="px-3.5 sm:px-4 py-4 sm:py-5">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <div className="mx-auto grid max-w-3xl grid-cols-5 px-1 py-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? loc === "/" : loc.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cx(
                  "flex flex-col items-center justify-center py-1 min-h-[48px] text-[11px] font-medium transition-all duration-150 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1",
                  active
                    ? "text-brand font-bold"
                    : "text-ink-soft hover:text-ink"
                )}
              >
                <span
                  className={cx(
                    "flex items-center justify-center w-11 h-7 rounded-full transition-all duration-200 border",
                    active
                      ? "bg-brand-pale text-brand border-brand-border shadow-xs"
                      : "border-transparent text-ink-soft"
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
    </div>
  );
}
