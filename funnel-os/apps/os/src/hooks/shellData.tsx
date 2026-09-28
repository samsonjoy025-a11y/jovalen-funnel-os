/**
 * Data the shell and the screens both need, fetched once in the shell.
 *
 * ------------------------------------------------------------------ *
 * WHY THIS EXISTS
 * ------------------------------------------------------------------ *
 *
 * `AppShell` needed three counts for the nav rail and the integration list for
 * the notification centre. `Overview` and `Analytics` needed the overview
 * endpoint in full, and `Integrations` needed the same integration list. So
 * several components each called `useQuery` against the same endpoint - and
 * `useQuery` has no cache, because it is deliberately a thin effect wrapper
 * and not a data library. Every visit to Overview or Analytics issued
 * `/api/v1/overview` twice; every visit to Integrations issued
 * `/api/v1/integrations` twice.
 *
 * The interesting part was never the duplicate request. It was the comment
 * `AppShell` carried next to its own call:
 *
 *     // One query for the rail's counts. Three screens each fetching their own
 *     // count would show three different numbers for the same thing whenever
 *     // one of them is stale.
 *
 * That states an invariant - the rail and the screen agree - which the code did
 * not provide. They were separate requests, and nothing stopped a mutation from
 * landing between them, at which point the rail would read "3 actions awaiting
 * a decision" while the screen beneath it read "4". The same pattern reached
 * `Analytics`, where `FreshnessNote` computed the newest `syncedAt` from its
 * own second copy of the metrics list - so the note describing how to read the
 * freshness badges was reading a different response from the one the badges
 * came from.
 *
 * A comment describing behaviour the code does not have is the same defect as a
 * test that asserts nothing. This repo has been bitten by one of each: the
 * `World.record` comment described a `db.test` that did not exist, and every
 * audit entry was consequently written as `actor: unknown`; and an audit sweep
 * passed because every route 404'd and the assertion was checking the wrong
 * list. So the invariant is now structural. One query per endpoint, in one
 * place, and the screens read it rather than asking again.
 *
 * ------------------------------------------------------------------ *
 * WHY IT LIVES IN THE SHELL
 * ------------------------------------------------------------------ *
 *
 * `AppShell` is a layout route that renders its own `<Outlet />`, and every
 * route in the app is nested beneath it, so it is the one component that is an
 * ancestor of both the rail and every screen. Context here covers shell and
 * pages in one step, and a new route cannot escape it by accident - there is no
 * way to render a page without rendering the shell.
 *
 * ------------------------------------------------------------------ *
 * WHY NOT A CACHE IN `useQuery`
 * ------------------------------------------------------------------ *
 *
 * A shared cache keyed by URL would have removed these duplicates and the
 * remaining ones across the other screens at the same time. It was rejected
 * because a cache is a claim about staleness, and this project's test suite
 * makes freshness claims: the audit sweep asserts that mutating routes change
 * the audit count, and screens assert figures that a mutation is meant to move.
 * A TTL cache underneath those assertions can turn a stale read into something
 * that looks stable - and can make a test pass for the wrong reason, which is
 * the failure mode that has cost this repo the most time so far.
 *
 * One extra GET to an in-process API is cheap. A cache that decides when the
 * tests are allowed to see a new value is not. If request count ever does
 * matter, this is the right place to fix it: the sharing is explicit, the
 * invalidation surface is one file, and nothing outside it has to be trusted.
 */

import * as React from 'react';
import { api, useQuery, type Overview, type QueryResult } from '@funnelos/api-client';
import type { IntegrationAccount } from '@funnelos/contracts';

/** Everything the shell owns. `null` before `AppShell` has provided any of it. */
export interface ShellData {
  /** The overview, for the rail's counts and for Overview/Analytics. */
  readonly overview: QueryResult<Overview>;
  /** The integration list, for the notification centre and Integrations. */
  readonly integrations: QueryResult<IntegrationAccount[]>;
}

const ShellDataContext = React.createContext<ShellData | null>(null);

/**
 * Read shared shell data.
 *
 * Throws when there is no provider rather than fetching, because a fallback
 * here would quietly restore the duplicate request this exists to remove and
 * the only symptom would be a second request nobody notices. Every route is
 * nested under the `AppShell` layout, so "no provider" means a route was added
 * outside the layout - a structural mistake worth failing on loudly.
 */
export function useShellData(): ShellData {
  const value = React.useContext(ShellDataContext);
  if (value === null) {
    throw new Error(
      'useShellData was called with no provider. Every route must be nested under the ' +
        '<Route element={<AppShell />}> layout, which owns the shared queries. A screen ' +
        'rendered outside the shell would fall back to fetching its own copy, which is the ' +
        'duplicate this hook was written to remove.',
    );
  }
  return value;
}

/** The overview specifically, for the screens that only need that one. */
export function useShellOverview(): QueryResult<Overview> {
  return useShellData().overview;
}

/** The integration list specifically, for the screen that shows it in full. */
export function useShellIntegrations(): QueryResult<IntegrationAccount[]> {
  return useShellData().integrations;
}

export const ShellDataProvider = ShellDataContext.Provider;

/**
 * Run the shell's queries. Called once, inside `AppShell`, so the queries and
 * the sharing of them cannot be separated by a refactor that moves one.
 */
export function useFetchShellData(): ShellData {
  return {
    overview: useQuery<Overview>((signal) => api.overview.get(signal), []),
    integrations: useQuery<IntegrationAccount[]>((signal) => api.integrations.list(signal), []),
  };
}
