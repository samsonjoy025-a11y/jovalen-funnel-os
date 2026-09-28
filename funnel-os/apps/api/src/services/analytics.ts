/**
 * analytics-service — owns Metric and the derived read models the Overview uses.
 *
 * The plan gives ClickHouse to events and says nothing lands without
 * freshness (§75). So every metric carries `syncedAt` and `completeness`, and
 * this service refuses to hand the OS a number whose source has not been
 * marked. A metric with `completeness: 'partial'` also names the sources that
 * are missing, because §87 requires saying *which* source is incomplete and
 * what it affects — "some data is delayed" is not a disclosure.
 */

import type { Envelope, Metric, TimeSeries } from '@funnelos/contracts';
import type { Db } from '../db.js';
import { NotFound } from '../store.js';
import type { Router } from '../http.js';

export interface Overview {
  metrics: Metric[];
  /**
   * Deliberately includes a metric with an empty trend. The Overview has to
   * demonstrate §87's "insufficient data" state, and a component that only
   * ever renders real numbers never gets tested on the empty one.
   */
  insufficient: Metric[];
  series: { label: string; series: TimeSeries }[];
  goalProgress: Array<{ id: string; name: string; metric: string; target: number; current: number; pct: number; status: string }>;
  counts: { funnels: number; leads: number; openActions: number; newInsights: number; publishedPages: number };
  /** §49/§70. Rendered as a banner, not a footnote. */
  sampleData: { isSample: true; providers: string[]; incomplete: string[] };
}

export function overview(db: Db): Overview {
  const metrics = db.metrics.where((m) => m.completeness === 'complete' || m.trend.length > 0);
  const insufficient = db.metrics.where((m) => m.trend.length === 0);

  return {
    metrics,
    insufficient,
    series: [
      { label: 'Revenue', series: { label: 'Last 30 days', values: db.metrics.get('m_rev')!.trend } },
      { label: 'Qualified leads', series: { label: 'Last 30 days', values: db.metrics.get('m_leads')!.trend } },
      { label: 'ROAS', series: { label: 'Last 30 days', values: db.metrics.get('m_roas')!.trend } },
      { label: 'CPA', series: { label: 'Last 30 days', values: db.metrics.get('m_cpa')!.trend } },
    ],
    goalProgress: db.goals.all().map((g) => ({
      id: g.id,
      name: g.name,
      metric: g.metric,
      target: g.target,
      current: g.current,
      // Rounding up would show a goal as complete when it is 0.1% away, which
      // is the kind of rounding that gets a demo screenshot used as evidence.
      pct: Math.min(100, Math.round((g.current / g.target) * 1000) / 10),
      status: g.status,
    })),
    counts: {
      funnels: db.funnels.size,
      leads: db.leads.size,
      openActions: db.actions.where((a) => a.state === 'awaiting_approval' || a.state === 'proposed').length,
      newInsights: db.insights.where((i) => !i.dismissed).length,
      publishedPages: db.pages.where((p) => p.status === 'published').length,
    },
    sampleData: {
      isSample: true,
      providers: db.integrations.all().map((i) => i.provider),
      incomplete: db.integrations.all().filter((i) => i.errorMessage).map((i) => `${i.provider}: ${i.errorMessage}`),
    },
  };
}

export function register(db: Db, r: Router): void {
  r.get('/metrics', (): Envelope<Metric[]> => ({
    data: db.metrics.all(),
    meta: { at: new Date().toISOString() },
  }));

  r.get('/metrics/:id', ({ params }): Envelope<Metric> => ({
    data: db.metrics.get(params.id!) ?? (() => { throw new NotFound(`Metric ${params.id}`); })(),
    meta: { at: new Date().toISOString() },
  }));

  r.get('/overview', (): Envelope<Overview> => ({
    data: overview(db),
    meta: { at: new Date().toISOString() },
  }));
}
