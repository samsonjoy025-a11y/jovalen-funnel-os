/**
 * The NavRail — §52's twelve destinations, role-scoped (§79) and
 * mode-aware (§52).
 *
 * ------------------------------------------------------------------ *
 * WHAT IS INFERRED
 * ------------------------------------------------------------------ *
 *
 * §52 is cited eleven times in the plan and reproduced nowhere. What the plan
 * does state, and what this implements:
 *
 *   - there are twelve destinations
 *   - the rail is role-scoped (§79)
 *   - "Build" is visible only where build capabilities are relevant
 *   - it is labelled "Build / Improve Funnel", not "Build", so a business owner
 *     is not shown product terminology
 *
 * The twelve names below are ours, ordered to match the plan's own phase order,
 * which is the one ordering signal the document does give. When the PRD lands,
 * this list is the thing to check first — it is one array.
 */

import * as React from 'react';
import { NavLink } from 'react-router-dom';
import { VisuallyHidden } from '@funnelos/ui';
import { font, space } from '@funnelos/ui';
import { can, useSession, type Capability, type Mode } from '../state/session.js';

export type IconName =
  | 'overview'
  | 'business'
  | 'funnel'
  | 'pages'
  | 'leads'
  | 'integrations'
  | 'analytics'
  | 'insights'
  | 'recommendations'
  | 'actions'
  | 'experiments'
  | 'settings';

export interface Destination {
  to: string;
  label: string;
  icon: IconName;
  /** Absent means visible in every mode. */
  modes?: readonly Mode[];
  /** The capability required to see it at all. */
  requires?: Capability;
  /** Which count to show in the rail, if any. */
  countKey?: 'insights' | 'actions' | 'leads';
  description: string;
}

export const DESTINATIONS: readonly Destination[] = [
  { to: '/', label: 'Overview', icon: 'overview', description: 'Where the business stands right now.' },
  { to: '/business', label: 'Business', icon: 'business', requires: 'view', description: 'Goals, audiences and onboarding.' },
  { to: '/funnel', label: 'Funnel', icon: 'funnel', requires: 'view', description: 'Stages, leakage, and plan against measured.' },
  {
    to: '/pages',
    label: 'Pages',
    icon: 'pages',
    requires: 'edit-pages',
    modes: ['build', 'hybrid'],
    description: 'Landing pages and the forms on them.',
  },
  { to: '/leads', label: 'Leads', icon: 'leads', requires: 'manage-leads', countKey: 'leads', description: 'The pipeline.' },
  {
    to: '/integrations',
    label: 'Integrations',
    icon: 'integrations',
    requires: 'manage-integrations',
    description: 'Where the data comes from, and how fresh it is.',
  },
  {
    to: '/analytics',
    label: 'Analytics',
    icon: 'analytics',
    requires: 'view',
    modes: ['optimize', 'hybrid'],
    description: 'Every metric, with its source and its freshness.',
  },
  { to: '/insights', label: 'Insights', icon: 'insights', requires: 'view', modes: ['optimize', 'hybrid'], countKey: 'insights', description: 'What the data is saying.' },
  {
    to: '/recommendations',
    label: 'Recommendations',
    icon: 'recommendations',
    requires: 'view',
    modes: ['optimize', 'hybrid'],
    description: 'What to do, and why.',
  },
  {
    to: '/actions',
    label: 'Actions',
    icon: 'actions',
    requires: 'decide-actions',
    modes: ['optimize', 'hybrid'],
    countKey: 'actions',
    description: 'Things waiting on a person.',
  },
  {
    to: '/experiments',
    label: 'Experiments',
    icon: 'experiments',
    requires: 'view',
    modes: ['build', 'optimize', 'hybrid'],
    description: 'What is being tested, and what it actually proved.',
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: 'settings',
    requires: 'manage-workspace',
    description: 'Workspace, role, and what this build is.',
  },
];

export function visibleDestinations(role: Parameters<typeof can>[0], mode: Mode): Destination[] {
  return DESTINATIONS.filter((d) => {
    if (d.requires && !can(role, d.requires)) return false;
    if (d.modes && !d.modes.includes(mode)) return false;
    return true;
  });
}

/* ------------------------------------------------------------------ *
 * Icons
 *
 * Inline SVG rather than an icon package: twelve glyphs do not justify a
 * dependency, and `currentColor` means they follow the theme for free. Each
 * is `aria-hidden` — the label beside it is the accessible name, and a
 * decorative SVG announced as "graphic" is noise on every nav item.
 * ------------------------------------------------------------------ */

const PATHS: Record<IconName, React.ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
  business: <><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /></>,
  funnel: <><path d="M3 4h18l-7 8v7l-4 2v-9L3 4Z" /></>,
  pages: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>,
  leads: <><circle cx="9" cy="8" r="3" /><path d="M3 21c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 11h6M19 8v6" /></>,
  integrations: <><path d="M9 3v6M15 3v6" /><rect x="6" y="9" width="12" height="6" rx="2" /><path d="M12 15v6" /></>,
  analytics: <><path d="M3 21h18" /><path d="M6 17V9M11 17V5M16 17v-6M21 17v-9" /></>,
  insights: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>,
  recommendations: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5V16h8v-2.5A6 6 0 0 0 12 3Z" /></>,
  actions: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /><path d="m9 15 2 2 4-4" /></>,
  experiments: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6A2 2 0 0 0 19 18l-5-9V3" /><path d="M7.5 14h9" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></>,
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * The rail
 * ------------------------------------------------------------------ */

export function NavRail({ counts }: { counts?: Partial<Record<'insights' | 'actions' | 'leads', number>> }) {
  const { session, mode } = useSession();
  const items = visibleDestinations(session?.role, mode);

  // Build destinations are grouped under the label the plan requires. The
  // heading is not a nav item; it is a group label, and it uses `role="group"`
  // with an accessible name so a screen reader announces the grouping rather
  // than reading twelve items as a flat list.
  const buildItems = items.filter((d) => d.modes?.includes('build'));
  const restItems = items.filter((d) => !d.modes?.includes('build'));

  return (
    <nav className="os-nav" aria-label="Main">
      <ul>
        {restItems.map((d) => (
          <NavItem key={d.to} destination={d} count={d.countKey ? counts?.[d.countKey] : undefined} />
        ))}
      </ul>

      {buildItems.length > 0 ? (
        <div role="group" aria-labelledby="os-nav-build-label">
          <p className="os-nav__group-label" id="os-nav-build-label">
            {/* §52's exact requirement: not "Build". */}
            Build / Improve Funnel
          </p>
          <ul>
            {buildItems.map((d) => (
              <NavItem key={d.to} destination={d} count={d.countKey ? counts?.[d.countKey] : undefined} />
            ))}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}

function NavItem({ destination, count }: { destination: Destination; count?: number }) {
  const attention = destination.countKey === 'actions' && typeof count === 'number' && count > 0;
  const isRoot = destination.to === '/';

  return (
    <li>
      <NavLink
        to={destination.to}
        end={isRoot}
        className="os-nav__link"
        title={destination.description}
        style={{ fontSize: font.size.sm }}
      >
        <span className="os-nav__icon">
          <Icon name={destination.icon} />
        </span>
        <span className="os-nav__label">{destination.label}</span>
        {typeof count === 'number' && count > 0 ? (
          <>
            <span className={`os-nav__count${attention ? ' os-nav__count--attention' : ''}`}>{count}</span>
            {/* The collapsed rail hides the number visually; without this the
                count disappears entirely from a screen reader at narrow widths. */}
            <VisuallyHidden>
              {count} {destination.countKey === 'actions' ? 'awaiting a decision' : destination.countKey === 'insights' ? 'new insights' : 'leads'}
            </VisuallyHidden>
          </>
        ) : null}
      </NavLink>
    </li>
  );
}

export { space };
