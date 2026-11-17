import { Suspense, lazy, type ReactNode } from "react";
import { Link, Redirect, Route, Router, Switch, useLocation } from "wouter";
import { Bell, CalendarDays, CircleUser, Dumbbell, LineChart, ListOrdered, Settings, Swords, Trophy, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSession } from "./lib/session";
import { emailLinkInUrl, supabaseConfigured } from "./lib/supabase";
import { useActivity, useMembers } from "./lib/api";
import { Avatar, Select, cx } from "./components/ui";
import { EmailLinkPage, LoginPage, NoCampPage, NotOnRosterPage, SetupNeededPage } from "./pages/Gate";
import TodayPage from "./pages/Today";
import PlayerTodayPage from "./pages/PlayerToday";
import MatchesPage from "./pages/Matches";

// Less-used pages load on demand (the service worker still precaches them for offline use).
const StandingsPage = lazy(() => import("./pages/Standings"));
const TrainingPage = lazy(() => import("./pages/Training"));
const SquadPage = lazy(() => import("./pages/Squad"));
const PlayersPage = lazy(() => import("./pages/Players"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const ActivityPage = lazy(() => import("./pages/Activity"));
const InsightsPage = lazy(() => import("./pages/Insights"));
const ShortlistPage = lazy(() => import("./pages/Shortlist"));
const MePage = lazy(() => import("./pages/Me"));
import { ConnectionBar, SyncEngine } from "./components/AppChrome";
import { AppLogo } from "./components/AppLogo";
import { useToastsBelow } from "./components/AppToaster";
import { applyA11yPrefs, getA11yPrefs } from "./lib/campExtended";
import { useKeepPushSubscription } from "./lib/push";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function App() {
  const s = useSession();
  const [emailLink, setEmailLink] = useState(emailLinkInUrl);
  if (!supabaseConfigured) return <SetupNeededPage />;
  if (emailLink) return <EmailLinkPage link={emailLink} onDone={() => setEmailLink(null)} />;
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
            {s.isStaff && <Route path="/players" component={PlayersPage} />}
            {s.isStaff && <Route path="/selection"><Redirect to="/players" replace /></Route>}
            {s.isStaff && <Route path="/insights" component={InsightsPage} />}
            {s.isAdmin && <Route path="/shortlist" component={ShortlistPage} />}
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
      <AppLogo size={56} className="animate-shimmer rounded-2xl" />
      <span className="sr-only">Loading</span>
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
  useKeepPushSubscription(s.meId, s.camp?.id);
  const headerRef = useRef<HTMLElement>(null);
  useToastsBelow(headerRef);

  useEffect(() => {
    applyA11yPrefs(getA11yPrefs());
  }, []);

  // Players: their own space (history, goals, reports, settings) is a tab. The squad lives
  // there and on Today once it's announced. Staff get Players instead; "Me" is the header avatar.
  const nav = [
    { href: "/", label: "Today", icon: CalendarDays },
    { href: "/matches", label: "Matches", icon: Swords },
    { href: "/standings", label: "Standings", icon: Trophy },
    { href: "/training", label: "Training", icon: Dumbbell },
    s.isStaff
      ? { href: "/players", label: "Players", icon: Users }
      : { href: "/me", label: "Me", icon: CircleUser },
  ];
  // The desktop sidebar also lists what phones reach from the top bar.
  const more = [
    { href: "/activity", label: "Activity", icon: Bell, badge: unread },
    ...(s.isStaff ? [{ href: "/insights", label: "Insights", icon: LineChart, badge: 0 }] : []),
    ...(s.isStaff ? [{ href: "/me", label: "Me", icon: CircleUser, badge: 0 }] : []),
    ...(s.isAdmin ? [{ href: "/shortlist", label: "Shortlist", icon: ListOrdered, badge: 0 }] : []),
    ...(s.isAdmin ? [{ href: "/settings", label: "Settings", icon: Settings, badge: 0 }] : []),
  ];
  const isActive = (href: string) => (href === "/" ? loc === "/" : loc.startsWith(href));
  // Dashboards get room for two columns on big screens; forms stay a comfortable width.
  const wide = loc === "/" || loc.startsWith("/standings") || loc.startsWith("/players") || loc.startsWith("/insights");

  const campSwitcher = s.camps.length > 1 && (
    <Select
      aria-label="Switch camp"
      value={s.camp!.id}
      onChange={(e) => s.setCampId(e.target.value)}
      className="!w-auto shrink-0 cursor-pointer !border-0 !bg-transparent !p-0 text-xs font-semibold text-brand"
    >
      {s.camps.map((c) => (
        <option key={c.id} value={c.id}>▾ {c.name}</option>
      ))}
    </Select>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop: sidebar navigation */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface/60 px-3 py-5 backdrop-blur lg:flex">
        <Link href="/" className="flex items-center gap-2.5 rounded-xl px-2 py-1.5" title="Go to Today">
          <AppLogo size={36} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold leading-tight text-ink">{s.camp!.name}</p>
            <p className="truncate text-xs capitalize leading-tight text-ink-soft">{s.role ?? "member"} · Training camp</p>
          </div>
        </Link>
        {campSwitcher && <div className="px-2 pt-1">{campSwitcher}</div>}
        <nav className="mt-6 space-y-0.5" aria-label="Main">
          {nav.map(({ href, label, icon: Icon }) => (
            <SideLink key={href} href={href} label={label} Icon={Icon} active={isActive(href)} />
          ))}
          <div className="my-3 h-px bg-line" />
          {more.map(({ href, label, icon: Icon, badge }) => (
            <SideLink key={href} href={href} label={label} Icon={Icon} active={isActive(href)} badge={badge} />
          ))}
        </nav>
        <Link href="/me" className="mt-auto flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-surface-2">
          <Avatar name={myName ?? s.auth?.user.email ?? "?"} size="md" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">{myName ?? "Me"}</span>
            <span className="block truncate text-xs text-ink-soft">Profile &amp; settings</span>
          </span>
        </Link>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Phones and tablets: compact top bar */}
        <header ref={headerRef} className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-1 px-3 py-2 sm:px-5">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-lg" title="Go to Today">
                <AppLogo size={32} />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold leading-tight text-ink">{s.camp!.name}</p>
                  <p className="truncate text-[11px] capitalize leading-tight text-ink-soft">{s.role ?? "member"} · Training camp</p>
                </div>
              </Link>
              {campSwitcher}
            </div>
            <Link href="/activity" aria-label={`Activity${unread ? `, ${unread} unread` : ""}`}
              className="relative rounded-full p-2.5 text-ink-soft transition hover:bg-surface-2 hover:text-ink">
              <Bell size={20} />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-bg">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            {s.isAdmin && (
              <Link href="/settings" aria-label="Camp settings" className="rounded-full p-2.5 text-ink-soft transition hover:bg-surface-2 hover:text-ink">
                <Settings size={20} />
              </Link>
            )}
            <Link
              href="/me"
              aria-label="Me: profile, settings and sign out"
              className={cx("ml-0.5 rounded-full p-0.5 transition", loc === "/me" ? "ring-2 ring-brand" : "hover:ring-2 hover:ring-line")}
            >
              <Avatar name={myName ?? s.auth?.user.email ?? "?"} size="md" />
            </Link>
          </div>
          <ConnectionBar campId={s.camp!.id} />
        </header>
        <div className="sticky top-0 z-30 hidden lg:block">
          <ConnectionBar campId={s.camp!.id} />
        </div>
        <SyncEngine campId={s.camp!.id} />

        <main
          key={loc}
          className={cx(
            "mx-auto w-full animate-page-in px-4 pb-32 pt-4 sm:px-6 sm:pt-6 lg:px-10 lg:pb-16 lg:pt-10",
            wide ? "max-w-3xl lg:max-w-6xl" : "max-w-3xl",
          )}
        >
          {children}
        </main>
      </div>

      {/* Phones and tablets: bottom tabs */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-surface/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-3xl grid-cols-5 px-1.5 pb-1 pt-1.5">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] transition-colors duration-150",
                  active ? "font-semibold text-ink" : "font-medium text-ink-soft",
                )}
              >
                <span className={cx(
                  "flex h-8 w-14 items-center justify-center rounded-full transition-[background-color,color] duration-200",
                  active ? "bg-brand-pale text-brand" : "text-ink-soft",
                )}>
                  <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                </span>
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function SideLink({ href, label, Icon, active, badge = 0 }: {
  href: string; label: string; Icon: typeof Bell; active: boolean; badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
        active ? "bg-brand-pale font-semibold text-brand" : "font-medium text-ink-soft hover:bg-surface-2 hover:text-ink",
      )}
    >
      <Icon size={18} strokeWidth={active ? 2.4 : 2} />
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-4 text-white">{badge > 99 ? "99+" : badge}</span>
      )}
    </Link>
  );
}
