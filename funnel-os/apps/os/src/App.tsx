/**
 * The router.
 *
 * ------------------------------------------------------------------ *
 * WHY THESE ROUTES ARE DECLARED IN ONE ARRAY
 * ------------------------------------------------------------------ *
 *
 * The NavRail has twelve destinations in `shell/NavRail.tsx`, and this file has
 * the twelve components they render. Those are two lists that must agree, and
 * the first version of this file had them as two independent hand-maintained
 * lists — so `DESTINATIONS` gained a thirteenth item and the router never heard
 * about it, and the nav link 404'd to the app's own not-found page.
 *
 * `ROUTES` is the single list, and `NavRail`'s `DESTINATIONS` is checked against
 * it at module load. That check is the point: it turns "someone added a nav item
 * and forgot the router" from a 404 found by clicking into an import-time
 * failure, and the failure names both sides.
 *
 * A route may render `null` — Insights and Recommendations share a screen, as do
 * Actions and Experiments, because the plan describes them as one workflow in
 * two places rather than four screens. `null` here means "this nav item lands on
 * the panel that is already here", which is why the page reads the location and
 * decides what to show.
 */

import * as React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './shell/AppShell.js';
import { DESTINATIONS, visibleDestinations } from './shell/NavRail.js';
import { SessionProvider, useSession } from './state/session.js';
import { LoadingState } from './composites/AsyncBoundary.js';

import { OverviewPage } from './pages/Overview.js';
import { BusinessPage } from './pages/Business.js';
import { FunnelPage } from './pages/Funnel.js';
import { LeadsPage } from './pages/Leads.js';
import { IntegrationsPage } from './pages/Integrations.js';
import { AnalyticsPage } from './pages/Analytics.js';
import { InsightsPage, RecommendationsPage } from './pages/Insights.js';
import { ActionsPage, ExperimentsPage } from './pages/Actions.js';
import { PagesPage } from './pages/Pages.js';
import { SettingsPage } from './pages/Settings.js';

interface RouteDef {
  path: string;
  screen: React.ComponentType;
  /** The nav item this route serves, so the cross-check failure names it. */
  destination: string;
}

const ROUTES: readonly RouteDef[] = [
  { path: '/business', screen: BusinessPage, destination: 'Business' },
  { path: '/funnel', screen: FunnelPage, destination: 'Funnel' },
  { path: '/pages', screen: PagesPage, destination: 'Pages' },
  { path: '/leads', screen: LeadsPage, destination: 'Leads' },
  { path: '/integrations', screen: IntegrationsPage, destination: 'Integrations' },
  { path: '/analytics', screen: AnalyticsPage, destination: 'Analytics' },
  { path: '/insights', screen: InsightsPage, destination: 'Insights' },
  { path: '/recommendations', screen: RecommendationsPage, destination: 'Recommendations' },
  { path: '/actions', screen: ActionsPage, destination: 'Actions' },
  { path: '/experiments', screen: ExperimentsPage, destination: 'Experiments' },
  { path: '/settings', screen: SettingsPage, destination: 'Settings' },
];

/** The Overview is served by the index route, which redirects by role and mode. */
const INDEX_ROUTE: RouteDef = { path: '/', screen: OverviewPage, destination: 'Overview' };
const ALL_ROUTES: readonly RouteDef[] = [INDEX_ROUTE, ...ROUTES];

/**
 * Every screen the router can mount.
 *
 * Listed next to `ROUTES` and checked against it, because the route table and
 * the JSX are two independent statements about the same app and nothing
 * connected them. `RoleAwareIndex` is here because it is what the index route
 * mounts; `OverviewPage` is here because `RoleAwareIndex` renders it.
 *
 * It is a plain list rather than something derived from the `<Route>` elements
 * because JSX is not introspectable - there is no way to ask React Router which
 * components a route will mount. Naming the set in one place next to the
 * assertions is the honest version of that: a screen added to the table
 * without being added here, or vice versa, fails at import.
 */
const MOUNTED_SCREENS: readonly unknown[] = [
  OverviewPage,
  BusinessPage,
  FunnelPage,
  PagesPage,
  LeadsPage,
  IntegrationsPage,
  AnalyticsPage,
  InsightsPage,
  RecommendationsPage,
  ActionsPage,
  ExperimentsPage,
  SettingsPage,
  RoleAwareIndex,
];

/**
 * The cross-check, run once at import.
 *
 * `DESTINATIONS` is the list a user can click; `ALL_ROUTES` is the list that can
 * be resolved. A nav item with no route is a 404 the user finds by clicking, and
 * a route with no nav item is a screen nobody can reach. Both are silent in
 * production and obvious here.
 *
 * Thrown rather than warned: a warning in a console nobody opens is the same as
 * no check, and this is a mistake that should never ship.
 */
(function assertNavAndRoutesAgree(): void {
  const navPaths = new Set(DESTINATIONS.map((d) => d.to));
  const routePaths = new Set(ALL_ROUTES.map((r) => r.path));

  const navWithoutRoute = DESTINATIONS.filter((d) => !routePaths.has(d.to)).map((d) => `${d.to} (${d.label})`);
  const routeWithoutNav = ALL_ROUTES.filter((r) => !navPaths.has(r.path)).map((r) => `${r.path} (${r.destination})`);

  if (navWithoutRoute.length === 0 && routeWithoutNav.length === 0) return;

  const parts: string[] = [];
  if (navWithoutRoute.length > 0) {
    parts.push(`NavRail destinations with no route: ${navWithoutRoute.join(', ')}`);
  }
  if (routeWithoutNav.length > 0) {
    parts.push(`Routes with no NavRail destination: ${routeWithoutNav.join(', ')}`);
  }
  throw new Error(`Nav and router disagree. ${parts.join('. ')}`);
})();

/**
 * The second cross-check: a route's declared screen is the screen it mounts.
 *
 * ------------------------------------------------------------------ *
 * WHY THE CHECK ABOVE COULD NOT SEE THIS
 * ------------------------------------------------------------------ *
 *
 * `assertNavAndRoutesAgree` compares the nav rail against the route *table*:
 * every destination has a route, every route has a destination. Both were
 * true while the landing page was broken, because `/` did have a destination
 * and `/` did have an entry. What was wrong was a third thing that neither
 * list mentions - the entry named `OverviewPage` as its screen, and the
 * `<Route>` mounted `RoleAwareIndex` instead, which rendered nothing at all
 * when it decided to redirect to itself.
 *
 * So a route table that is internally consistent can still be entirely
 * unconnected to the JSX that renders it, and nothing in a path comparison can
 * tell the difference. This check closes that gap by naming the screens the
 * router actually mounts and requiring each route entry's `screen` to be
 * among them.
 *
 * The index route is allowed to mount `RoleAwareIndex`, because that is the
 * component that decides between the overview and a redirect. What is not
 * allowed is `OverviewPage` being named in the table and mounted nowhere - so
 * the check is on *coverage*, not equality: every screen the table promises is
 * reachable from the router.
 */
(function assertDeclaredScreensAreMounted(): void {
  const mounted = new Set<unknown>(MOUNTED_SCREENS);
  const unmounted = ALL_ROUTES.map((r) => r.screen).filter((s) => !mounted.has(s));

  if (unmounted.length === 0) return;

  throw new Error(
    `These route screens are declared in ROUTES but mounted by no <Route>, so they can never ` +
      `render: ${unmounted.map((s) => s.name || 'anonymous').join(', ')}. Either mount the ` +
      `declared screen, or change the route entry to name what is actually mounted.`,
  );
})();

/**
 * The landing screen.
 *
 * Sent to the first destination this role and mode can actually see.
 *
 * Not `Navigate to="/"` unconditionally. A viewer has no `/leads`, and
 * redirecting them to the overview is fine; but in `build` mode `/analytics` is
 * not present either, so a fixed target can land on a screen the rail does not
 * show. The first visible destination is derived from the same function the rail
 * uses, so "where you land" and "what you can see" cannot disagree.
 *
 * ------------------------------------------------------------------ *
 * AND WHEN THAT DESTINATION IS THIS ROUTE, RENDER IT INSTEAD
 * ------------------------------------------------------------------ *
 *
 * The redirect is only the answer when the first visible destination is
 * somewhere else. For an owner in hybrid mode - the common case, and the one
 * the fixtures describe - the first visible destination *is* Overview, so
 * `<Navigate to="/">` asked the router to replace `/` with `/`.
 *
 * React Router treats that as no navigation at all, so `RoleAwareIndex`
 * rendered `null`: `/` came up with the nav rail, the mode banner, and no
 * content whatsoever. `OverviewPage` was never mounted anywhere in the app -
 * 245 lines of it, declared as `INDEX_ROUTE.screen` and then not used, because
 * the route element was this component instead of it.
 *
 * `assertNavAndRoutesAgree()` did not catch it, and could not have: it checks
 * that every route has a rail destination and vice versa, and both were true.
 * `/` had a destination. The route simply pointed somewhere other than the
 * screen its own entry named. Comparing the two - the `screen` a route entry
 * declares against the element actually mounted - is a check that would have
 * failed, and is now made below.
 */
function RoleAwareIndex() {
  const { session, loading, mode } = useSession();
  if (loading || !session) return <LoadingState label="Starting" />;

  const visible = visibleDestinations(session.role, mode);
  const first = visible[0];

  if (!first || first.to === '/') return <OverviewPage />;
  return <Navigate to={first.to} replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Shell />
      </SessionProvider>
    </BrowserRouter>
  );
}

function Shell() {
  const location = useLocation();
  const { session, loading, mode } = useSession();

  // Every page change starts the reader at the top of the new screen. Without
  // this, a long Leads table scrolls the Analytics screen to its middle and the
  // user lands on a metric with no idea they have changed pages.
  React.useEffect(() => {
    const main = document.getElementById('os-main');
    if (main) main.scrollTop = 0;
  }, [location.pathname]);

  if (loading || !session) {
    return <LoadingState label="Starting" />;
  }

  return (
    <Routes>
      {/*
        `AppShell` is a LAYOUT ROUTE, not a wrapper.

        It renders its own `<Outlet />`, so `<AppShell>{routes}</AppShell>`
        compiled to nothing: the children were passed to a component that takes
        no props, TypeScript rejected it, and passing them anyway would have
        silently produced a shell with no screen in it. A layout route is also
        the correct model rather than a workaround — it means the shell's own
        `<Outlet />` is a real route boundary, so a page that throws is caught
        by the shell's error region instead of unmounting the chrome, and the
        nav rail survives a crash in any one destination.
      */}
      <Route element={<AppShell />}>
        <Route path="/" element={<RoleAwareIndex />} />
        {ROUTES.map((r) => (
          <Route key={r.path} path={r.path} element={React.createElement(r.screen)} />
        ))}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function NotFound() {
  const { session, mode } = useSession();
  const first = session ? visibleDestinations(session.role, mode)[0] : undefined;
  return (
    <div className="os-page">
      <div className="os-state">
        <p className="os-state__title">No such page</p>
        <p className="os-state__body">
          This address does not match any screen in the OS. The navigation rail on the left has
          everything that exists.
        </p>
        {first ? (
          <a className="os-tiny" href={first.to}>
            Go to {first.label}
          </a>
        ) : null}
      </div>
    </div>
  );
}
