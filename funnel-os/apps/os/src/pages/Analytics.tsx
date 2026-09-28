/**
 * Analytics — §75's metrics, and the sample-data/freshness obligations.
 *
 * This screen exists to be inspected. Its job is to make it impossible to
 * quote a number from it without also seeing where it came from and when it
 * was last true. Every metric carries a source and a sync time; anything the
 * API reports as insufficient renders as an explicit card rather than a zero,
 * because a zero reads as a measurement and "we cannot tell" does not.
 */

import * as React from 'react';
import { Alert, Badge, StatusPill } from '@funnelos/ui';
import { font, space } from '@funnelos/ui';
import { api, formatNumber, useQuery } from '@funnelos/api-client';
import { useShellOverview } from '../hooks/shellData.js';
import { PageHeader } from '../shell/AppShell.js';
import { AsyncBoundary, Panel } from '../composites/AsyncBoundary.js';
import type { Metric } from '@funnelos/contracts';
import { InsufficientDataCard, MetricCard, SourceFreshnessBadge } from '../composites/Metrics.js';

export function AnalyticsPage() {
  const metrics = useQuery((signal) => api.metrics.list(signal), []);
  // Shared with the rail rather than fetched again - see hooks/shellOverview.tsx.
  const overview = useShellOverview();
  const events = useQuery((signal) => api.events.list(signal), []);

  return (
    <div className="os-page">
      <PageHeader
        title="Analytics"
        subtitle="Every figure in the OS, with its source and the moment it was last true. A number without both is an assertion, and this screen is where assertions are supposed to be checked."
      />

      <Panel title="Metrics">
        <AsyncBoundary
          query={metrics}
          loadingLabel="Loading metrics"
          emptyTitle="No metrics are being tracked"
          emptyBody="Nothing is producing numbers yet. Connect a data source and the metrics this funnel can be judged on appear here."
        >
          {(rows) => (
            <div className="os-grid os-grid--metrics">
              {rows.map((m) => (
                <MetricCard key={m.id} metric={m} />
              ))}
            </div>
          )}
        </AsyncBoundary>
      </Panel>

      <Panel title="Not enough data to say">
        {/*
          The insufficiency test is the API's, not this page's. `overview()`
          already answers "which metrics cannot be reported" from `trend.length`,
          and a second rule written here would be free to disagree with it — and
          would disagree silently, because a metric dropped from this list looks
          exactly like a metric that is fine.
        */}
        <AsyncBoundary
          query={overview}
          loadingLabel="Checking coverage"
          emptyTitle="No overview"
          emptyBody="The overview could not be loaded, so the coverage of individual metrics is unknown rather than good."
        >
          {(o) =>
            o.insufficient.length === 0 ? (
              <p className="os-muted">
                No metric is currently below the reporting threshold. Anything that drops under it will
                appear here rather than as a number you might quote.
              </p>
            ) : (
              <div className="os-grid os-grid--cards">
                {o.insufficient.map((m) => (
                  <InsufficientDataCard
                    key={m.id}
                    metric={m}
                    // Composed from the metric's own fields rather than a
                    // generic sentence. §87 requires naming which part is
                    // missing, and "no data" does not name it — this states the
                    // sources and the window, which is at least checkable.
                    why={
                      m.incompleteSources && m.incompleteSources.length > 0
                        ? `Missing from ${m.incompleteSources.join(', ')} for ${m.period.label}. Nothing is being estimated in its place.`
                        : `No observations were recorded during ${m.period.label}, so no trend can be drawn and no rate of change can be quoted.`
                    }
                  />
                ))}
              </div>
            )
          }
        </AsyncBoundary>
      </Panel>

      <Panel title="Recent events" flush>
        <AsyncBoundary
          query={events}
          loadingLabel="Loading events"
          emptyTitle="No events recorded"
          emptyBody="Nothing has happened in this workspace that produced an event. The funnel, pages and integrations screens all write events as they are used."
        >
          {(rows) => (
            <div className="os-table-scroll">
              <table className="os-table">
                <caption>
                  The most recent product events, newest first. The name is shown verbatim rather than
                  re-worded, because these names are what other systems will be matching on.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col">Properties</th>
                    <th scope="col">Actor</th>
                    <th scope="col" className="os-table__num">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 40).map((e) => (
                    <tr key={e.id}>
                      <th scope="row" style={{ fontWeight: font.weight.medium }}>
                        <code>{e.name}</code>
                      </th>
                      <td>
                        {Object.entries(e.properties).length === 0 ? (
                          <span className="os-muted">none</span>
                        ) : (
                          <span className="os-row" style={{ flexWrap: 'wrap', gap: space['1'] }}>
                            {Object.entries(e.properties).map(([k, v]) => (
                              <Badge key={k} tone="neutral">
                                {k}: {String(v)}
                              </Badge>
                            ))}
                          </span>
                        )}
                      </td>
                      {/*
                        `actorId` and nothing else. The events service does not
                        join an actor name, and rendering `'anon'` as though it
                        were a person would be a fabrication. The audit log on
                        the Settings screen is where names are resolved.
                      */}
                      <td>
                        <code className="os-tiny">{e.actorId}</code>
                      </td>
                      <td className="os-table__num">
                        <time dateTime={e.at}>{e.at.slice(0, 16).replace('T', ' ')}</time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 40 ? (
                <p className="os-tiny" style={{ padding: space['3'], paddingInline: space['4'] }}>
                  Showing 40 of {formatNumber(rows.length, true)} events. The full list is not paginated
                  because the plan does not specify an event retention window.
                </p>
              ) : null}
            </div>
          )}
        </AsyncBoundary>
      </Panel>

      <FreshnessNote metrics={metrics.data ?? []} />
    </div>
  );
}

/**
 * The freshness rule, stated on the page rather than encoded only in badge
 * colours. A badge whose meaning is "recent" is not self-explaining to anyone,
 * and it is completely invisible to a screen-reader user unless the wording is
 * also written down somewhere they can reach.
 */
/*
 * `metrics` is passed in rather than fetched.
 *
 * This component took its own `useQuery(api.metrics.list)` copy, so the
 * Analytics screen asked the API for the same list twice - once here and once
 * for the cards above. Two requests for one list is not a performance problem
 * at this size, but the second one is a second *answer*, and the note below
 * computes the newest `syncedAt` to decide how the badges should be read. It
 * was therefore reading a different response from the one describing the
 * badges it explains, and the two could disagree.
 *
 * Taking the list as a prop makes the dependency explicit: the note can only
 * describe the metrics it was given.
 */
function FreshnessNote({ metrics }: { metrics: Metric[] }) {
  const now = React.useMemo(() => {
    // Anchored to the newest `syncedAt` rather than `Date.now()`. The fixtures
    // are generated against a fixed instant, so relative to the real clock
    // every one of them is months stale and the whole screen would be amber.
    const stamps = metrics.map((m) => Date.parse(m.syncedAt)).filter((n) => !Number.isNaN(n));
    return stamps.length > 0 ? Math.max(...stamps) : Date.now();
  }, [metrics]);

  return (
    <Panel title="How to read a freshness badge">
      <div className="os-col" style={{ gap: space['3'] }}>
        <div className="os-row" style={{ flexWrap: 'wrap', gap: space['4'] }}>
          <LegendItem level="fresh" text="under an hour since the last successful sync" />
          <LegendItem level="recent" text="one to six hours" />
          <LegendItem level="stale" text="over six hours, or the connection is degraded" />
          <LegendItem level="unknown" text="never synced — treat every number as absent" />
        </div>
        <Alert tone="info" title="These timestamps are the sample workspace's, not the clock's">
          The fixtures are anchored to a fixed instant so that freshness badges do not all decay into
          "stale" the moment the server restarts. What you are seeing is the system behaving correctly
          against sample data, not a live connection.
        </Alert>
        {metrics.length > 0 ? (
          <p className="os-tiny">
            Newest sync across tracked metrics:{' '}
            <SourceFreshnessBadge
              syncedAt={metrics
                .map((m) => m.syncedAt)
                .sort()
                .at(-1)!}
              sampleData
              now={now}
            />
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

function LegendItem({ level, text }: { level: 'fresh' | 'recent' | 'stale' | 'unknown'; text: string }) {
  return (
    <span className="os-row" style={{ gap: space['2'] }}>
      <StatusPill
        tone={level === 'fresh' ? 'success' : level === 'stale' ? 'warning' : level === 'unknown' ? 'neutral' : 'info'}
      >
        {level}
      </StatusPill>
      <span className="os-tiny">{text}</span>
    </span>
  );
}
