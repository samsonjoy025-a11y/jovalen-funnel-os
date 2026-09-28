/**
 * Integrations — §49 sync state, §70's state machine, and the sample-data badge.
 *
 * This is the page with the highest honesty obligation in the app. Every number
 * elsewhere in the OS arrives through one of these connections, and every one of
 * them is a fixture. So the badge is not decoration: §70 requires a visible
 * "Sample data" marker on any fixture-backed connection, and it is rendered
 * first, before the provider name, so it cannot be missed by someone skimming
 * for the green tick.
 */

import * as React from 'react';
import { Alert, Badge, Button, StatusPill } from '@funnelos/ui';
import { font, space } from '@funnelos/ui';
import { api, formatNumber, useMutation, useQuery, type QueryResult } from '@funnelos/api-client';
import type { IntegrationTransitionTable, IntegrationAccount, IntegrationState } from '@funnelos/contracts';
import { PageHeader } from '../shell/AppShell.js';
import { useShellIntegrations } from '../hooks/shellData.js';
import { AsyncBoundary, Panel } from '../composites/AsyncBoundary.js';

/**
 * Tone per connection state.
 *
 * A complete record over `IntegrationState`, not a partial one: `degraded` is
 * the state most likely to be forgotten, and it is exactly the one that must not
 * fall through to grey. A degraded connection is serving numbers that are stale,
 * and grey reads as "nothing to see here".
 */
const STATE_TONE: Record<IntegrationState, 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'> = {
  not_connected: 'neutral',
  connecting: 'info',
  connected: 'success',
  syncing: 'info',
  degraded: 'warning',
  error: 'danger',
  disconnected: 'neutral',
  disabled: 'neutral',
};

/** Wording for the state, so the raw snake_case never reaches the screen. */
const STATE_LABEL: Record<IntegrationState, string> = {
  not_connected: 'Not connected',
  connecting: 'Connecting',
  connected: 'Connected',
  syncing: 'Syncing',
  degraded: 'Degraded',
  error: 'Error',
  disconnected: 'Disconnected',
  disabled: 'Disabled',
};

export function IntegrationsPage() {
  /*
   * The list is the shell's, not a second copy.
   *
   * `AppShell` already fetches `/integrations` for the notification centre, and
   * both are mounted at once on this screen, so a private query meant two
   * requests for one list - and two answers, with the notification badge
   * describing a degraded connection from one and the card below it describing
   * it from the other.
   */
  const accounts = useShellIntegrations();
  const table = useQuery((signal) => api.integrations.transitions(signal), []);

  return (
    <div className="os-page">
      <PageHeader
        title="Integrations"
        subtitle="Where every number in this system comes from. A connection that is degraded still produces figures, and those figures are stale - so the state of each connection is stated next to it rather than in a separate health page nobody opens."
      />

      <Alert tone="warning" title="No real data source is connected" live="polite">
        Every connection below is a fixture. The OS will happily compute a
        conversion rate from them, which is why the sample badge is on the card and not only on this
        banner — a number without its provenance next to it is a number you cannot trust.
      </Alert>

      <Panel title="Connections">
        <AsyncBoundary
          query={accounts}
          loadingLabel="Loading connections"
          emptyTitle="No connections"
          emptyBody="Nothing is connected, so every figure elsewhere in the OS is empty or estimated. Connecting a source is the first thing worth doing."
        >
          {(rows) => (
            <div className="os-grid os-grid--cards">
              {rows.map((a) => (
                <IntegrationCard
                  key={a.id}
                  account={a}
                  allowed={table.data?.[a.state] ?? []}
                />
              ))}
            </div>
          )}
        </AsyncBoundary>
      </Panel>

      <StateMachinePanel table={table} />
    </div>
  );
}

function IntegrationCard({
  account,
  allowed,
}: {
  account: IntegrationAccount;
  allowed: readonly IntegrationState[];
}) {
  const move = useMutation((to: IntegrationState) => api.integrations.transition(account.id, to), [account.id]);

  return (
    <article className="os-card os-card--flush">
      <div className="os-card__header">
        <div className="os-col" style={{ gap: space['1'], minInlineSize: 0 }}>
          <h3 className="os-card__title">{account.provider}</h3>
          {/*
            Before the provider name, not after. A reader who stops at the
            title has still been told the data is not real.
          */}
          {account.sampleData ? (
            <Badge tone="warning" dotLabel="Sample data">
              Sample data
            </Badge>
          ) : null}
        </div>
        <StatusPill tone={STATE_TONE[account.state]}>{STATE_LABEL[account.state]}</StatusPill>
      </div>

      <p className="os-card__body">{account.accountName}</p>

      <dl className="os-defs">
        <dt>Last synced</dt>
        <dd>{account.lastSyncedAt ? formatTimestamp(account.lastSyncedAt) : 'never'}</dd>
        <dt>Next sync</dt>
        <dd>{account.nextSyncAt ? formatTimestamp(account.nextSyncAt) : 'not scheduled'}</dd>
        <dt>Records</dt>
        <dd className="os-num">{formatNumber(account.recordsSynced, true)}</dd>
      </dl>

      {account.errorMessage ? (
        <Alert tone="danger" title="Last sync failed">
          {account.errorMessage}
        </Alert>
      ) : null}

      <div className="os-col" style={{ gap: space['2'] }}>
        <span className="os-tiny">
          {allowed.length === 0
            ? 'No transitions are available from this state.'
            : `Move to: ${allowed.map((s) => STATE_LABEL[s]).join(', ')}`}
        </span>
        <div className="os-row" style={{ flexWrap: 'wrap', gap: space['2'] }}>
          {allowed.length === 0 ? null : allowed.map((to) => (
            <Button
              key={to}
              size="sm"
              variant={to === 'error' ? 'danger' : 'secondary'}
              disabled={move.pending}
              onClick={() => move.run(to)}
            >
              {STATE_LABEL[to]}
            </Button>
          ))}
        </div>
        {move.error ? (
          <p className="os-tiny" role="alert">
            {move.error.message}
          </p>
        ) : null}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * The state machine, shown
 *
 * The table is the API's. The page draws it rather than restating it, so if §70
 * changes, this panel changes with it. A static illustration of a state machine
 * next to a live implementation of the same machine is a document that will
 * eventually be wrong, and it will be believed because it is a diagram.
 * ------------------------------------------------------------------ */

/*
 * The transition table is passed in rather than fetched.
 *
 * This panel took its own `useQuery(api.integrations.transitions)`, so the page
 * asked for the §70 table twice. What made that worth fixing rather than
 * tolerating is what the panel is for: it is the published state machine, and
 * the buttons on the cards above are enabled from `allowed` transitions that
 * come from the *other* response. Two reads of the table the rules are derived
 * from means the diagram and the affordances could describe different machines.
 *
 * The prop is the whole `QueryResult`, not the bare table, so `AsyncBoundary`
 * below still owns the loading and error states. Handing over just the data
 * would have forced this panel to re-implement both, and the version that
 * silently stopped rendering while loading is the one nobody writes on purpose.
 */
function StateMachinePanel({ table }: { table: QueryResult<IntegrationTransitionTable> }) {
  const states = Object.keys(table.data ?? {}) as IntegrationState[];

  return (
    <Panel title="How a connection can change state" flush>
      <AsyncBoundary query={table} loadingLabel="Loading state machine">
        {() => (
          <div className="os-table-scroll">
            <table className="os-table">
              <caption>
                Every state and the states it may move to, as published by the API. A transition not listed
                here is refused with a 400 rather than silently applied — a client that put a failed
                connection back to &quot;connected&quot; would show a healthy tick over data that never
                arrived.
              </caption>
              <thead>
                <tr>
                  <th scope="col">From</th>
                  <th scope="col">May move to</th>
                </tr>
              </thead>
              <tbody>
                {states.map((from) => {
                  const to = table.data?.[from] ?? [];
                  return (
                    <tr key={from}>
                      <th scope="row" style={{ fontWeight: font.weight.medium }}>
                        <StatusPill tone={STATE_TONE[from]}>{STATE_LABEL[from]}</StatusPill>
                      </th>
                      <td>
                        {to.length === 0 ? (
                          <span className="os-muted">terminal — no outgoing transitions</span>
                        ) : (
                          <span className="os-row" style={{ flexWrap: 'wrap', gap: space['1'] }}>
                            {to.map((t) => (
                              <Badge key={t} tone={STATE_TONE[t]}>
                                {STATE_LABEL[t]}
                              </Badge>
                            ))}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AsyncBoundary>
    </Panel>
  );
}

const tsFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short',
});

function formatTimestamp(iso: string): string {
  return tsFmt.format(new Date(iso));
}
