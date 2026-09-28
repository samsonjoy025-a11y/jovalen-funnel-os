/**
 * The shell: brand, topbar, mode banner, notification centre, and the frame
 * the pages render into.
 */

import * as React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Avatar, Badge, Button, Kbd, StatusPill, VisuallyHidden } from '@funnelos/ui';
import { color, font, space } from '@funnelos/ui';
import { formatFreshness } from '@funnelos/api-client';
import { MODES, useSession, type Mode } from '../state/session.js';
import { DESTINATIONS, Icon, NavRail, visibleDestinations } from './NavRail.js';
import { api, useQuery } from '@funnelos/api-client';
import { ShellDataProvider, useFetchShellData } from '../hooks/shellData.js';
import type { IntegrationAccount, Role } from '@funnelos/contracts';

export function AppShell() {
  const { session, mode, error } = useSession();
  const location = useLocation();

  /*
   * The rail's counts, and the screens' overview, are the same request.
   *
   * This used to read:
   *
   *   // One query for the rail's counts. Three screens each fetching their own
   *   // count would show three different numbers for the same thing whenever
   *   // one of them is stale.
   *
   * ...followed by `useQuery((signal) => api.overview.get(signal), [])`, with
   * `Overview` and `Analytics` each making the same call of their own. The
   * invariant the comment described was not the behaviour the code had: three
   * independent requests, no cache between them, and a mutation landing between
   * two of them would leave the rail reading "3" above a screen reading "4".
   *
   * The sharing is now explicit - see `hooks/shellData.tsx` for why it lives
   * here and not in a cache - so the comment can be a description of what the
   * code does rather than a claim about what it should do.
   */
  const shell = useFetchShellData();
  const overview = shell.overview;

  const counts = {
    insights: overview.data?.counts.newInsights,
    actions: overview.data?.counts.openActions,
    leads: overview.data?.counts.leads,
  };

  return (
    <div className="os-shell">
      <a className="os-skip-link" href="#os-main">
        Skip to content
      </a>

      <div className="os-brand">
        <span className="os-brand__mark" aria-hidden="true">
          FO
        </span>
        <span className="os-brand__name">Funnel OS</span>
      </div>

      <header className="os-topbar">
        {session ? (
          <>
            <span className="os-tiny">{session.workspace.name}</span>
            <VisuallyHidden>Current workspace</VisuallyHidden>
          </>
        ) : null}
        <div className="os-topbar__spacer" />
        <NotificationCentre integrations={shell.integrations.data ?? []} />
        <RoleSwitcher />
        <ThemeToggle />
        {session ? <Avatar name={session.user.name} size="sm" /> : null}
      </header>

        {/*
          The provider wraps the rail, the banner and the Outlet together, not
          just the rail. A page is a descendant of this, so `useShellData`
          resolves for every screen, and the refresh button on Overview now
          refreshes the rail's counts at the same time - which is the behaviour
          the old comment was reaching for, arrived at by sharing rather than
          by hoping the two requests agreed.
        */}
        <ShellDataProvider value={shell}>
          <NavRail counts={counts} />

          <main className="os-main" id="os-main" tabIndex={-1}>
            <ModeBanner />
            {error ? (
              <div style={{ padding: space['6'] }}>
                <p className="os-card__title" style={{ color: color.status.danger.fg }}>
                  Cannot reach the API
                </p>
                <p className="os-muted">{error}</p>
                <p className="os-tiny">Start it with: pnpm --filter @funnelos/api dev</p>
              </div>
            ) : null}
            <Outlet />
          </main>
        </ShellDataProvider>
      </div>
  );
}

/* ------------------------------------------------------------------ *
 * §52 ModeBanner
 *
 * States which mode is active, what that mode means, and — because §52 says
 * the nav is scoped by it — whether anything is currently hidden. That last
 * part matters: a destination that vanishes should be explainable, otherwise
 * it looks like a bug.
 * ------------------------------------------------------------------ */

function ModeBanner() {
  const { mode, setMode } = useSession();
  const { session } = useSession();
  const [dismissed, setDismissed] = React.useState(false);

  const all = visibleDestinations(session?.role, 'hybrid');
  const shown = visibleDestinations(session?.role, mode);
  const hidden = all.filter((d) => !shown.some((s) => s.to === d.to));
  const active = MODES.find((m) => m.id === mode)!;

  return (
    <div
      className={`os-mode-banner${mode === 'build' ? ' os-mode-banner--build' : ''}`}
      role="region"
      aria-label="Working mode"
    >
      <span className="os-mode-banner__label">{active.label} mode</span>
      <span>{active.what}</span>

      {hidden.length > 0 ? (
        <span className="os-tiny" style={{ color: 'inherit' }}>
          {hidden.length} {hidden.length === 1 ? 'destination is' : 'destinations are'} hidden in this mode:{' '}
          {hidden.map((d) => d.label).join(', ')}.
        </span>
      ) : null}

      <span className="os-mode-banner__spacer" />

      {!dismissed && mode !== 'hybrid' ? (
        <Button variant="ghost" size="sm" onClick={() => setMode('hybrid')}>
          Use both
        </Button>
      ) : null}
      {!dismissed ? (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="os-tiny"
          style={{ all: 'unset', cursor: 'pointer', minHeight: 'var(--ds-size-target-min)', paddingInline: space['2'] }}
        >
          Hide
          <VisuallyHidden> the mode banner</VisuallyHidden>
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Theme
 *
 * The theme is a user preference, so it is a real control rather than a
 * hard-coded value. `localStorage` is wrapped: a browser with storage
 * disabled throws on `setItem`, and an unhandled throw in a click handler
 * leaves the toggle half-applied.
 * ------------------------------------------------------------------ */

function ThemeToggle() {
  const [theme, setTheme] = React.useState<'light' | 'dark'>(() => {
    const attr = document.documentElement.getAttribute('data-theme');
    return attr === 'dark' ? 'dark' : 'light';
  });

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('funnel-os:theme', theme);
    } catch {
      // Storage unavailable. The theme still applies for this page view.
    }
  }, [theme]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
    >
      <span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span>
      <VisuallyHidden>{theme === 'light' ? 'Dark' : 'Light'} theme</VisuallyHidden>
    </Button>
  );
}

/* ------------------------------------------------------------------ *
 * §79 role switcher
 *
 * Not a login. It exists so the role-scoped rail can be demonstrated, and it
 * says so — a role dropdown in a real product that changes what you can see
 * without re-authenticating would be a privilege-escalation bug, and the label
 * is the first defence against someone shipping that by accident.
 * ------------------------------------------------------------------ */

function RoleSwitcher() {
  const { session, setRole, switchingRole } = useSession();
  if (!session) return null;

  return (
    <label className="os-row" style={{ gap: space['2'] }}>
      <VisuallyHidden>Acting as role (demonstration control, not authentication)</VisuallyHidden>
      <span className="os-tiny" aria-hidden="true">
        Acting as
      </span>
      <select
        value={session.role}
        disabled={switchingRole}
        onChange={(e) => void setRole(e.target.value as Role)}
        style={{
          minHeight: 'var(--ds-size-target-min)',
          border: 'var(--ds-border-width-thin) solid var(--ds-border-default)',
          borderRadius: 'var(--ds-radius-md)',
          background: 'var(--ds-surface-raised)',
          padding: `0 ${space['2']}`,
          fontSize: font.size.sm,
        }}
      >
        {session.availableRoles.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ------------------------------------------------------------------ *
 * §70 notification centre
 *
 * Only surfaces connections that are not healthy. A notification centre that
 * lists eight green ticks is a list nobody reads, and the items that matter —
 * a failed OAuth refresh, spend missing for six days — get lost among them.
 * ------------------------------------------------------------------ */

function NotificationCentre({ integrations }: { integrations: readonly IntegrationAccount[] }) {
  const [open, setOpen] = React.useState(false);
  const problems = integrations.filter((i) => i.state === 'error' || i.state === 'degraded' || i.state === 'disconnected');

  return (
    <div style={{ position: 'relative' }}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={problems.length > 0 ? `Data problems: ${problems.length}` : 'No data problems'}
      >
        <span aria-hidden="true">◔</span>
        {problems.length > 0 ? <Badge tone="danger">{problems.length}</Badge> : <span className="os-tiny">0</span>}
        <VisuallyHidden>{problems.length > 0 ? ` data ${problems.length === 1 ? 'problem' : 'problems'}` : ' data problems'}</VisuallyHidden>
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-label="Data problems"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + var(--ds-space-2))',
            width: 'min(24rem, 90vw)',
            zIndex: 'var(--ds-z-dropdown)',
            background: 'var(--ds-surface-overlay)',
            border: 'var(--ds-border-width-thin) solid var(--ds-border-default)',
            borderRadius: 'var(--ds-card-radius)',
            boxShadow: 'var(--ds-shadow-3)',
            padding: space['3'],
            display: 'flex',
            flexDirection: 'column',
            gap: space['2'],
          }}
        >
          <h2 style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold }}>Data problems</h2>
          {problems.length === 0 ? (
            <p className="os-tiny">Every connection is syncing normally.</p>
          ) : (
            <ul className="os-col" style={{ gap: space['2'] }}>
              {problems.map((i) => (
                <li key={i.id} className="os-col" style={{ gap: space['1'] }}>
                  <div className="os-row" style={{ gap: space['2'] }}>
                    <StatusPill tone={i.state === 'error' ? 'danger' : 'warning'}>{i.state}</StatusPill>
                    <strong style={{ fontSize: font.size.sm }}>{i.provider}</strong>
                  </div>
                  {i.errorMessage ? <p className="os-tiny">{i.errorMessage}</p> : null}
                  <p className="os-tiny">Last sync {formatFreshness(i.lastSyncedAt ?? new Date(0).toISOString()).text}</p>
                </li>
              ))}
            </ul>
          )}
          <Link to="/integrations" className="os-tiny" onClick={() => setOpen(false)}>
            All integrations
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * PageHeader
 * ------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  React.useEffect(() => {
    // The page title is announced and is what a browser tab, a bookmark and a
    // screen-reader landmark list all read. Leaving it as the app name on
    // every screen makes eleven of twelve destinations indistinguishable.
    document.title = `${title} · Funnel OS`;
  }, [title]);

  const { session } = useSession();
  const location = useLocation();
  const current = DESTINATIONS.find((d) => (d.to === '/' ? location.pathname === '/' : location.pathname.startsWith(d.to)));

  return (
    <header className="os-page__header">
      {current ? (
        <span className="os-nav__icon" aria-hidden="true" style={{ marginTop: space['1'] }}>
          <Icon name={current.icon} size={24} />
        </span>
      ) : null}
      <div>
        <h1 className="os-page__title">{title}</h1>
        {subtitle ? <p className="os-page__subtitle">{subtitle}</p> : null}
        {current ? <p className="os-tiny">One of {DESTINATIONS.length} destinations · {session?.role ?? '—'} sees {visibleDestinations(session?.role, 'hybrid').length}</p> : null}
      </div>
      {actions ? <div className="os-page__actions">{actions}</div> : null}
    </header>
  );
}

export { Kbd };
