/**
 * §75 freshness, §60 claims, §58 evidence, §74 data quality.
 *
 * These four are grouped because they are the honesty layer: everything that
 * stops a number from being read as more solid than it is.
 *
 * The rule they share — a value without its provenance is not renderable.
 */

import * as React from 'react';
import { Badge, StatusPill, type Tone } from '@funnelos/ui';
import { color, font, space } from '@funnelos/ui';
import type { ClaimType, Evidence, Metric } from '@funnelos/contracts';
import { formatDateTime, formatDelta, formatFreshness, formatMetric, type DeltaIntent } from '@funnelos/api-client';

/* ------------------------------------------------------------------ *
 * §75 SourceFreshnessBadge
 * ------------------------------------------------------------------ */

export function SourceFreshnessBadge({
  syncedAt,
  source,
  sampleData,
  now,
}: {
  syncedAt: string;
  source?: string;
  sampleData?: boolean;
  now?: number;
}) {
  const f = formatFreshness(syncedAt, now);
  const tone: Tone = f.level === 'fresh' ? 'success' : f.level === 'recent' ? 'info' : f.level === 'unknown' ? 'neutral' : 'warning';

  return (
    <span className="os-row" style={{ gap: space['1'] }}>
      <StatusPill tone={tone}>
        {/* The level word is in the accessible text, not only in the colour.
            "6 hours ago" in amber and "2 hours ago" in green are the same
            sentence to a screen reader, and the colour is the whole point. */}
        {f.level === 'stale' ? `Stale · ${f.text}` : f.level === 'unknown' ? f.text : f.text}
      </StatusPill>
      {sampleData ? (
        <Badge tone="warning" dotLabel="Sample data">
          Sample data
        </Badge>
      ) : null}
      {source ? <span className="os-tiny">{source}</span> : null}
      <span className="os-sr-only">
        Last synced {f.text}
        {sampleData ? '. This is sample data, not a real connection.' : ''}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * §74 DataQualityBadge
 * ------------------------------------------------------------------ */

export type DataIssue = 'missing' | 'partial' | 'stale' | 'inconsistent' | 'unattributed';

const ISSUE_LABEL: Record<DataIssue, string> = {
  missing: 'Missing',
  partial: 'Partial',
  stale: 'Stale',
  inconsistent: 'Inconsistent',
  unattributed: 'Unattributed',
};

const SEVERITY_TONE: Record<'low' | 'medium' | 'high', Tone> = {
  low: 'info',
  medium: 'warning',
  high: 'danger',
};

export function DataQualityBadge({ issue, severity }: { issue: DataIssue; severity: 'low' | 'medium' | 'high' }) {
  return (
    <Badge tone={SEVERITY_TONE[severity]}>
      {ISSUE_LABEL[issue]} · {severity} severity
    </Badge>
  );
}

/* ------------------------------------------------------------------ *
 * §60 Claim
 *
 * Four claim types, and the type is stated in words as well as colour. A
 * hypothesis that looks like a fact is the specific failure §60 exists to
 * prevent, and colour alone does not prevent it for a reader who cannot
 * distinguish the fill — or for anyone printing the page in black and white.
 * ------------------------------------------------------------------ */

const CLAIM_STYLE: Record<ClaimType, { bg: string; fg: string; label: string }> = {
  fact: { bg: 'var(--ds-claim-fact-bg)', fg: 'var(--ds-claim-fact-fg)', label: 'Fact' },
  analysis: { bg: 'var(--ds-claim-analysis-bg)', fg: 'var(--ds-claim-analysis-fg)', label: 'Analysis' },
  hypothesis: { bg: 'var(--ds-claim-hypothesis-bg)', fg: 'var(--ds-claim-hypothesis-fg)', label: 'Hypothesis' },
  recommendation: {
    bg: 'var(--ds-claim-recommendation-bg)',
    fg: 'var(--ds-claim-recommendation-fg)',
    label: 'Recommendation',
  },
};

export function Claim({
  type,
  children,
  showLabel = true,
}: {
  type: ClaimType;
  children: React.ReactNode;
  showLabel?: boolean;
}) {
  const s = CLAIM_STYLE[type];
  return (
    <span
      style={{
        background: s.bg,
        color: s.fg,
        border: `var(--ds-border-width-thin) solid currentColor`,
        borderRadius: 'var(--ds-radius-md)',
        padding: `${space['1']} ${space['2']}`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: space['2'],
        fontSize: font.size.sm,
      }}
    >
      {showLabel ? (
        <strong style={{ fontWeight: font.weight.semibold, whiteSpace: 'nowrap' }}>{s.label}</strong>
      ) : null}
      <span>{children}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * §58 EvidenceList — required before an insight may render
 * ------------------------------------------------------------------ */

export function EvidenceList({ evidence, compact }: { evidence: readonly Evidence[]; compact?: boolean }) {
  if (evidence.length === 0) {
    // §58. Reaching this is a bug, and the honest rendering of a bug is to say
    // the evidence is missing rather than to render the claim without it.
    return (
      <div className="os-evidence" role="alert">
        <strong style={{ color: color.status.danger.fg }}>No evidence supplied</strong>
        <span>This claim may not be shown without evidence.</span>
      </div>
    );
  }

  return (
    <table className="os-evidence">
      <caption className="os-sr-only">Evidence for this claim</caption>
      <tbody>
        {evidence.map((e) => (
          <tr key={e.id} className="os-evidence__row">
            <th scope="row" className="os-evidence__label">
              {e.metricName}
            </th>
            <td>
              <span className="os-evidence__value">{e.value}</span>
              {compact ? null : (
                <>
                  <div className="os-evidence__label">{e.comparisonWindow}</div>
                  <div className="os-evidence__label">
                    {e.source} · {formatDateTime(e.syncedAt)}
                  </div>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ *
 * §63 ConfirmRequired — the placeholder for unconfirmed AI content
 * ------------------------------------------------------------------ */

export function ConfirmRequired({ onConfirm, onDismiss, busy }: { onConfirm: () => void; onDismiss?: () => void; busy?: boolean }) {
  return (
    <div
      className="os-sample-banner"
      role="group"
      aria-label="Unconfirmed AI content"
      style={{ borderColor: 'var(--ds-status-ai-border)', background: 'var(--ds-status-ai-bg)', color: 'var(--ds-status-ai-fg)' }}
    >
      <span aria-hidden="true" style={{ fontWeight: font.weight.bold }}>
        AI
      </span>
      <div className="os-sample-banner__body">
        <strong className="os-sample-banner__title">Not yet confirmed by a person</strong>
        This was generated by a model and no human has checked it. Read the evidence before acting.
      </div>
      <div className="os-row">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          style={{
            minHeight: 'var(--ds-size-target-min)',
            padding: `0 ${space['3']}`,
            borderRadius: 'var(--ds-radius-md)',
            border: 'var(--ds-border-width-thin) solid currentColor',
            background: 'transparent',
            color: 'inherit',
            cursor: busy ? 'progress' : 'pointer',
            fontWeight: font.weight.semibold,
          }}
        >
          I have read the evidence
        </button>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            style={{
              minHeight: 'var(--ds-size-target-min)',
              padding: `0 ${space['3']}`,
              borderRadius: 'var(--ds-radius-md)',
              border: '1px solid transparent',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * §87's "insufficient data" — a metric with no trend is not a zero
 * ------------------------------------------------------------------ */

export function InsufficientDataCard({ metric, why }: { metric: Metric; why: string }) {
  return (
    <article className="os-card">
      <div className="os-card__header">
        <h3 className="os-card__title">{metric.name}</h3>
        <Badge tone="neutral">Insufficient data</Badge>
      </div>
      {/* Not "0". A zero is a measurement; this is the absence of one, and
          rendering it as 0 would put a false value into a totals calculation. */}
      <p className="os-card__body">
        <strong style={{ color: color.content.secondary }}>Not enough data to show a trend.</strong> {why}
      </p>
      <p className="os-tiny">
        {metric.source} · last synced {formatFreshness(metric.syncedAt).text}
      </p>
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * MetricCard — §1.3
 * ------------------------------------------------------------------ */

const DELTA_INTENT: Record<Metric['unit'], DeltaIntent> = {
  currency: 'up-is-good',
  count: 'up-is-good',
  percent: 'up-is-good',
  // Ratio is ambiguous — ROAS up is good, "bounce rate up" is not — so the
  // caller states it. The default here is the pessimistic one: showing a rise
  // as good when it is not is the worse error of the two.
  ratio: 'down-is-good',
};

export function MetricCard({
  metric,
  intent,
  now,
}: {
  metric: Metric;
  /** Override for a ratio whose direction is metric-specific (ROAS vs CPA). */
  intent?: DeltaIntent;
  now?: number;
}) {
  const delta = formatDelta(metric.value, metric.previousValue, intent ?? DELTA_INTENT[metric.unit], {
    format: (n) => formatMetric(n, metric.unit),
  });
  const deltaColor =
    delta.direction === 'flat' ? color.delta.flat : delta.good ? color.delta.positive : color.delta.negative;

  return (
    <article className="os-card">
      <div className="os-card__header">
        <h3 className="os-card__title" style={{ fontSize: font.size.sm, color: color.content.secondary, fontWeight: font.weight.medium }}>
          {metric.name}
        </h3>
        <StatusPill tone="neutral">{metric.period.label}</StatusPill>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: space['2'], flexWrap: 'wrap' }}>
        <span style={{ fontSize: font.size['3xl'], fontWeight: font.weight.bold, letterSpacing: 'var(--ds-font-tracking-tight)' }}>
          {formatMetric(metric.value, metric.unit)}
        </span>
        {/* The arrow is decorative; the word and the sign carry the meaning. */}
        <span style={{ color: deltaColor, fontWeight: font.weight.semibold, fontSize: font.size.sm }}>
          <span aria-hidden="true">{delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '■'}</span>{' '}
          {delta.text}
          <span className="os-sr-only">
            {delta.direction === 'up' ? ' up' : delta.direction === 'down' ? ' down' : ' unchanged'} from{' '}
            {formatMetric(metric.previousValue, metric.unit)} in the previous period
            {delta.good ? '' : ' — this is not an improvement'}
          </span>
        </span>
      </div>

      <Sparkline values={metric.trend} label={metric.name} good={delta.good} />

      <div className="os-row os-row--between">
        <SourceFreshnessBadge syncedAt={metric.syncedAt} sampleData={metric.completeness === 'partial' || metric.source.startsWith('Sample')} now={now} />
      </div>

      {metric.completeness === 'partial' && metric.incompleteSources?.length ? (
        <p className="os-tiny" style={{ color: color.status.warning.fg }}>
          Missing: {metric.incompleteSources.join(', ')}. Treat this figure as a floor, not a total.
        </p>
      ) : null}
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * Sparkline — a chart, which §86 requires have a textual equivalent
 * ------------------------------------------------------------------ */

export function Sparkline({
  values,
  label,
  good = true,
  height = 40,
  color: override,
}: {
  values: number[];
  label: string;
  good?: boolean;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) {
    return (
      <p className="os-tiny" style={{ height }}>
        Not enough points to draw a trend.
      </p>
    );
  }

  const w = 100;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} L${w},${height} L0,${height} Z`;
  const stroke = override ?? (good ? 'var(--ds-delta-positive)' : 'var(--ds-delta-negative)');
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const changePct = ((last - first) / Math.abs(first || 1)) * 100;

  return (
    <svg
      className="os-spark"
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      style={{ height }}
      role="img"
      aria-label={`${label}: ${values.length} points from ${first} to ${last}, ${
        changePct >= 0 ? 'up' : 'down'
      } ${Math.abs(changePct).toFixed(1)}% across the period. Exact values are in the table below.`}
    >
      <path className="os-spark__area" d={area} fill={stroke} />
      <path className="os-spark__line" d={line} stroke={stroke} />
    </svg>
  );
}
