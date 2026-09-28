/**
 * Overview.
 *
 * The screen that has to be most honest, because it is the one people screenshot
 * and put in a deck. So: a persistent sample-data banner, a freshness badge on
 * every number, a partial-data warning wherever a source is missing, and an
 * explicit insufficient-data card rather than a zero.
 */

import * as React from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Progress, StatusPill } from '@funnelos/ui';
import { color, font, space } from '@funnelos/ui';
import { formatNumber } from '@funnelos/api-client';
import { useSession } from '../state/session.js';
import { useShellOverview } from '../hooks/shellData.js';
import { PageHeader } from '../shell/AppShell.js';
import { AsyncBoundary, Panel } from '../composites/AsyncBoundary.js';
import { InsufficientDataCard, MetricCard } from '../composites/Metrics.js';
import { Bar } from '../composites/Funnel.js';

export function OverviewPage() {
  const { session } = useSession();
  /*
   * The shell's query, not a second one.
   *
   * `refetch` is the shell's, so the Refresh button below re-reads the rail's
   * counts in the same pass. With a private query it would have refreshed the
   * page and left the number above it stale - the exact disagreement this
   * screen's own copy of the counts is most likely to expose, since they sit
   * a few hundred pixels apart on the same screen.
   */
  const query = useShellOverview();

  return (
    <div className="os-page">
      <PageHeader
        title="Overview"
        subtitle="Where the business stands. Every number below names its source and how fresh it is — that is not decoration, it is the only way to tell a real reading from a stale one."
        actions={
          <>
            <Button variant="secondary" onClick={query.refetch}>
              Refresh
            </Button>
            <Button asChild variant="ghost">
              <Link to="/analytics">All metrics</Link>
            </Button>
          </>
        }
      />

      <AsyncBoundary
        query={query}
        loadingLabel="Loading your numbers"
        emptyTitle="No connected data yet"
        emptyBody="Nothing can be shown until at least one data source is connected. Connect a source on the Integrations page and the numbers will appear here with their freshness."
        emptyAction={
          <Button asChild variant="solid">
            <Link to="/integrations">Go to Integrations</Link>
          </Button>
        }
      >
        {(overview) => (
          <>
            <SampleDataBanner providers={overview.sampleData.providers} incomplete={overview.sampleData.incomplete} />

            <section className="os-grid os-grid--metrics" aria-label="Key metrics">
              {overview.metrics.map((m) => (
                <MetricCard key={m.id} metric={m} intent={m.id === 'm_roas' ? 'up-is-good' : m.id === 'm_cpa' ? 'down-is-good' : undefined} />
              ))}
            </section>

            {overview.insufficient.length > 0 ? (
              <section className="os-grid os-grid--cards" aria-label="Metrics without enough data">
                {overview.insufficient.map((m) => (
                  <InsufficientDataCard
                    key={m.id}
                    metric={m}
                    why={`This needs a source that is not connected (${m.incompleteSources?.join(', ') ?? 'unknown'}). The figure is not zero — it has not been measured.`}
                  />
                ))}
              </section>
            ) : null}

            <div className="os-grid os-grid--wide-first">
              <Panel
                title="Goals"
                actions={
                  <Link to="/business" className="os-tiny">
                    Edit goals
                  </Link>
                }
              >
                <ul className="os-col" style={{ gap: space['4'] }}>
                  {overview.goalProgress.map((g) => (
                    <li key={g.id} className="os-col" style={{ gap: space['2'] }}>
                      <div className="os-row os-row--between">
                        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.medium }}>{g.name}</span>
                        <StatusPill tone={g.status === 'achieved' ? 'success' : g.pct >= 90 ? 'info' : 'neutral'}>
                          {g.status === 'achieved' ? 'Achieved' : `${g.pct}%`}
                        </StatusPill>
                      </div>
                      <Progress value={g.pct} max={100} label={g.name} />
                      <p className="os-tiny os-num">
                        {g.metric}: {formatNumber(g.current, g.current >= 10_000)} of {formatNumber(g.target, g.target >= 10_000)}
                        {g.status === 'achieved' ? '' : ` · ${formatNumber(g.target - g.current, g.target - g.current >= 10_000)} to go`}
                      </p>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title="Needs you">
                <ul className="os-col" style={{ gap: space['3'] }}>
                  <CountRow to="/actions" label="Actions awaiting a decision" value={overview.counts.openActions} attention />
                  <CountRow to="/insights" label="Unread insights" value={overview.counts.newInsights} />
                  <CountRow to="/leads" label="Leads in the pipeline" value={overview.counts.leads} />
                  <CountRow to="/funnel" label="Active funnels" value={overview.counts.funnels} />
                  <CountRow to="/pages" label="Published pages" value={overview.counts.publishedPages} />
                </ul>
                <p className="os-tiny" style={{ marginTop: 'auto' }}>
                  Signed in as {session?.user.name} · {session?.role}
                </p>
              </Panel>
            </div>

            <Panel title="Trends over the last 30 days" flush>
              <div className="os-grid os-grid--halves" style={{ padding: space['4'] }}>
                {overview.series.map((s) => (
                  <SeriesCard key={s.label} label={s.label} values={s.series.values} />
                ))}
              </div>
            </Panel>
          </>
        )}
      </AsyncBoundary>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SampleDataBanner({ providers, incomplete }: { providers: string[]; incomplete: string[] }) {
  return (
    <div className="os-sample-banner" role="region" aria-label="Sample data notice">
      <span aria-hidden="true" style={{ fontWeight: font.weight.bold }}>
        !
      </span>
      <div className="os-sample-banner__body">
        <strong className="os-sample-banner__title">This is sample data</strong>
        Every figure on this screen is invented. No business has these results. It is here so the
        interface can be judged and used — not to be believed or quoted. Once a real integration writes
        rows, these markers disappear on their own.
        <ul className="os-sample-banner__list">
          <li>Marked as sample: {providers.join(', ')}</li>
          {incomplete.length > 0 ? <li>Also currently failing: {incomplete.join('; ')}</li> : null}
        </ul>
      </div>
    </div>
  );
}

function CountRow({ to, label, value, attention }: { to: string; label: string; value: number; attention?: boolean }) {
  return (
    <li>
      <Link
        to={to}
        className="os-row os-row--between"
        style={{ textDecoration: 'none', minHeight: 'var(--ds-size-target-min)' }}
      >
        <span style={{ fontSize: font.size.sm, color: color.content.secondary }}>{label}</span>
        <span
          className="os-num"
          style={{
            fontWeight: font.weight.semibold,
            color: attention && value > 0 ? color.status.danger.fg : color.content.primary,
          }}
        >
          {formatNumber(value)}
        </span>
      </Link>
    </li>
  );
}

/**
 * §86: a chart has a textual equivalent that is always available. The values
 * are not behind a toggle here — the endpoints and the change are in the
 * accessible name, and the exact series is a disclosure.
 */
function SeriesCard({ label, values }: { label: string; values: number[] }) {
  const [open, setOpen] = React.useState(false);
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const change = first === 0 ? 0 : ((last - first) / Math.abs(first)) * 100;
  const min = Math.min(...values);
  const max = Math.max(...values);

  return (
    <div className="os-col" style={{ gap: space['2'] }}>
      <div className="os-row os-row--between">
        <strong style={{ fontSize: font.size.sm }}>{label}</strong>
        <span className="os-tiny os-num">
          {first.toLocaleString('en-GB')} → {last.toLocaleString('en-GB')} ({change >= 0 ? '+' : '−'}
          {Math.abs(change).toFixed(1)}%)
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: space['12'] }} role="img" aria-label={`${label} over 30 days. From ${first} to ${last}, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(1)} percent.`}>
        {values.map((v, i) => (
          <div
            key={i}
            title={`Day ${i + 1}: ${v}`}
            style={{
              flex: 1,
              // Floor at 1px so a genuinely small value is still visible. A
              // zero-height bar reads as "no data" rather than "a small number".
              height: `${Math.max(4, ((v - min) / (max - min || 1)) * 100)}%`,
              background: 'var(--ds-series-1)',
              borderRadius: 'var(--ds-radius-sm) var(--ds-radius-sm) 0 0',
            }}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          all: 'unset',
          cursor: 'pointer',
          color: color.content.link,
          fontSize: font.size.xs,
          minHeight: 'var(--ds-size-target-min)',
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        {open ? 'Hide' : 'Show'} the {values.length} values
      </button>
      {open ? (
        <ol className="os-tiny os-col" style={{ gap: space['1'], maxHeight: space['24'], overflowY: 'auto' }}>
          {values.map((v, i) => (
            <li key={i} className="os-row os-row--between os-num">
              <span>Day {i + 1}</span>
              <span>{v.toLocaleString('en-GB')}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

