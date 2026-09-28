/**
 * FunnelDiagram and StageDetailPanel — §23, §54, §55.
 *
 * §54 makes stages configurable and leakage a first-class concept; §55 requires
 * eleven dimensions as a tabbed drill-down. Both are rendered here with the
 * rule that the *comparison* is part of the value, not a nicety: a stage
 * showing "4,920" means nothing next to a plan of 6,930, and §60 forbids
 * presenting a number without the context that gives it meaning.
 */

import * as React from 'react';
import { Badge, StatusPill, Tabs, type TabDefinition } from '@funnelos/ui';
import { color, font, space } from '@funnelos/ui';
import { STAGE_DIMENSIONS, type Funnel, type FunnelStage, type StageDetail } from '@funnelos/contracts';
import { formatNumber } from '@funnelos/api-client';
import { DataQualityBadge } from './Metrics.js';

/* ------------------------------------------------------------------ *
 * FunnelDiagram
 * ------------------------------------------------------------------ */

export function FunnelDiagram({
  funnel,
  selectedStageId,
  onSelect,
  gaps,
}: {
  funnel: Funnel;
  selectedStageId?: string;
  onSelect: (stage: FunnelStage) => void;
  /** Stage ids with a plan/measured gap at 'high' severity — highlighted. */
  gaps?: ReadonlyMap<string, 'low' | 'medium' | 'high'>;
}) {
  const stages = [...funnel.stages].sort((a, b) => a.order - b.order);
  const top = stages[0]?.volume ?? 1;

  return (
    <div className="os-funnel" role="list" aria-label={`Funnel: ${funnel.name}`}>
      {stages.map((stage, i) => {
        const prev = stages[i - 1];
        const stepRate = prev && prev.volume > 0 ? stage.volume / prev.volume : null;
        const gapSeverity = gaps?.get(stage.id);
        const isSelected = stage.id === selectedStageId;
        // Bar width is relative to the *top* stage, not the previous one. A
        // funnel drawn to the previous stage's width exaggerates the
        // difference between a 2% drop and a 60% drop.
        const fillPct = Math.max(2, Math.round((stage.volume / top) * 100));

        return (
          <div
            key={stage.id}
            role="listitem"
            className="os-funnel__stage"
            aria-current={isSelected}
          >
            <span className="os-funnel__fill" style={{ width: `${fillPct}%` }} aria-hidden="true" />

            <button
              type="button"
              onClick={() => onSelect(stage)}
              aria-current={isSelected}
              style={{
                all: 'unset',
                display: 'contents',
                cursor: 'pointer',
                minHeight: 'var(--ds-size-target-min)',
                width: '100%',
              }}
            >
              <span className="os-funnel__label">
                {stage.order}. {stage.name}
                {gapSeverity ? (
                  <>
                    {' '}
                    <DataQualityBadge issue="inconsistent" severity={gapSeverity} />
                  </>
                ) : null}
              </span>
            </button>

            <span className="os-funnel__volume">{formatNumber(stage.volume, true)}</span>
            <span className="os-funnel__rate">
              {stepRate === null ? (
                <span className="os-tiny">entry</span>
              ) : (
                <>
                  {(stepRate * 100).toFixed(1)}%
                  <span className="os-sr-only">
                    {' '}
                    of the previous stage
                  </span>
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * §104 plan vs measured
 * ------------------------------------------------------------------ */

export function GapTable({
  gaps,
  stages,
  onSelect,
}: {
  gaps: ReadonlyArray<{ id: string; funnelId: string; stageId: string; planned: number; measured: number; severity: string; note: string; shortfall: number; ratioOfPlan: number }>;
  stages: readonly FunnelStage[];
  onSelect?: (stageId: string) => void;
}) {
  const nameOf = (id: string) => stages.find((s) => s.id === id)?.name ?? id;

  if (gaps.length === 0) {
    return (
      <p className="os-muted">
        No stage is behind its plan. Nothing to reconcile between the blueprint and what was measured.
      </p>
    );
  }

  return (
    <div className="os-table-scroll">
      <table className="os-table">
        <caption>
          §104: where the blueprint and the measurement disagree. The ratio is the honest unit — a shortfall
          of 2,010 visits means nothing without knowing it was a 29% miss.
        </caption>
        <thead>
          <tr>
            <th scope="col">Stage</th>
            <th scope="col" className="os-table__num">
              Planned
            </th>
            <th scope="col" className="os-table__num">
              Measured
            </th>
            <th scope="col" className="os-table__num">
              % of plan
            </th>
            <th scope="col">Severity</th>
            <th scope="col">Note</th>
          </tr>
        </thead>
        <tbody>
          {gaps.map((g) => (
            <tr key={g.id}>
              <th scope="row">
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(g.stageId)}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      minHeight: 'var(--ds-size-target-min)',
                      color: 'var(--ds-content-link)',
                    }}
                  >
                    {nameOf(g.stageId)}
                  </button>
                ) : (
                  nameOf(g.stageId)
                )}
              </th>
              <td className="os-table__num">{formatNumber(g.planned)}</td>
              <td className="os-table__num">{formatNumber(g.measured)}</td>
              <td className="os-table__num" style={{ fontWeight: font.weight.semibold, color: g.ratioOfPlan < 0.8 ? color.status.danger.fg : undefined }}>
                {(g.ratioOfPlan * 100).toFixed(1)}%
              </td>
              <td>
                <StatusPill tone={g.severity === 'high' ? 'danger' : g.severity === 'medium' ? 'warning' : 'info'}>
                  {g.severity}
                </StatusPill>
              </td>
              <td style={{ maxWidth: '28rem' }}>{g.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * §55 StageDetailPanel — eleven dimensions, tabbed
 * ------------------------------------------------------------------ */

const SEVERITY_TONE = { ok: 'success', watch: 'warning', problem: 'danger' } as const;

export function StageDetailPanel({ detail, stageName }: { detail: StageDetail; stageName: string }) {
  const tabs: TabDefinition[] = React.useMemo(
    () =>
      STAGE_DIMENSIONS.map((key) => {
        const d = detail.dimensions[key];
        return {
          value: key,
          label: key.charAt(0).toUpperCase() + key.slice(1),
          content: (
            <div className="os-col">
              <div className="os-row" style={{ gap: space['3'] }}>
                <strong style={{ fontSize: font.size['2xl'], fontWeight: font.weight.bold }}>{d.value}</strong>
                {d.severity ? <StatusPill tone={SEVERITY_TONE[d.severity]}>{d.severity}</StatusPill> : null}
              </div>
              {/* The comparison is required, not conditional. A dimension with
                  no comparison available says so in the same weight as one
                  that does, so "we don't know" and "it's normal" never look
                  alike. */}
              <p className="os-muted">
                <strong style={{ color: color.content.secondary }}>Compared with: </strong>
                {d.comparison ?? 'No comparison available for this dimension.'}
              </p>
            </div>
          ),
        };
      }),
    [detail],
  );

  return (
    <section aria-label={`Stage detail: ${stageName}`}>
      <Tabs
        tabs={tabs}
        /*
         * The tablist needs a name, and it needs a name that says *what* is
         * being tabbed rather than a generic "tabs". A screen-reader user
         * arriving by way of the landmark list hears "volume, conversion,
         * leakage, velocity…" and has no idea which stage they are looking at
         * — the stage name is the only thing on the page that identifies it.
         */
        label={`${stageName} — ${STAGE_DIMENSIONS.length} dimensions`}
        defaultValue="volume"
      />
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * A small inline bar, for the places a percentage is the point
 * ------------------------------------------------------------------ */

export function Bar({
  value,
  max = 100,
  tone = 'brand',
  label,
}: {
  value: number;
  max?: number;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  label: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const fill = {
    brand: 'var(--ds-color-primary-600)',
    success: 'var(--ds-status-success-solid)',
    warning: 'var(--ds-status-warning-solid)',
    danger: 'var(--ds-status-danger-solid)',
  }[tone];

  return (
    <div
      role="meter"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      style={{
        height: space['2'],
        background: 'var(--ds-surface-sunken)',
        borderRadius: 'var(--ds-radius-full)',
        overflow: 'hidden',
      }}
    >
      <div style={{ width: `${pct}%`, height: '100%', background: fill, borderRadius: 'var(--ds-radius-full)' }} />
    </div>
  );
}

export { Badge };
