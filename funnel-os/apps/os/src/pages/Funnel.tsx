/**
 * Funnel — §54 stages, §55's eleven dimensions, §104 plan against measured.
 */

import * as React from 'react';
import { Badge, Button, StatusPill } from '@funnelos/ui';
import { font, space } from '@funnelos/ui';
import { api, formatNumber, useQuery, type GapRow } from '@funnelos/api-client';
import type { FunnelStage } from '@funnelos/contracts';
import { useKeyedQuery } from '../hooks/useKeyedQuery.js';
import { PageHeader } from '../shell/AppShell.js';
import { AsyncBoundary, Panel } from '../composites/AsyncBoundary.js';
import { FunnelDiagram, GapTable, StageDetailPanel } from '../composites/Funnel.js';

export function FunnelPage() {
  const funnels = useQuery((signal) => api.funnels.list(signal), []);
  const [funnelId, setFunnelId] = React.useState<string | null>(null);
  const [stageId, setStageId] = React.useState<string | null>(null);

  // Default to the first funnel once the list arrives, rather than rendering
  // an empty rail and a "pick one" message.
  const activeId = funnelId ?? funnels.data?.[0]?.id ?? null;

  // A null id means "nothing selected yet", which is `idle`, not a fetched
  // null. See `hooks/useKeyedQuery.ts` for why that distinction is load-bearing
  // rather than stylistic — briefly, `Promise.resolve(null)` makes `T` nullable
  // and forces a null check at every prop boundary downstream.
  const funnel = useKeyedQuery(activeId === null ? null : [activeId], ([id], signal) =>
    api.funnels.get(id!, signal),
  );

  const gaps = useQuery<GapRow[]>((signal) => api.gaps.list(activeId ?? undefined, signal), [activeId], {
    isEmpty: (rows) => rows.length === 0,
  });

  const activeStageId = stageId ?? funnel.data?.stages[0]?.id ?? null;
  // Both ids, as a pair, because the stage detail is a sub-resource of the
  // funnel: switching funnels must refetch even when the stage id happens to be
  // the same string in both. A single-key hook would drop the funnel id from
  // the dependency list and quietly show the previous funnel's stage.
  const detail = useKeyedQuery(
    activeId !== null && activeStageId !== null ? [activeId, activeStageId] : null,
    ([funnelId, stageId], signal) => api.funnels.stageDetail(funnelId!, stageId!, signal),
  );

  const gapSeverity = React.useMemo(() => {
    const map = new Map<string, 'low' | 'medium' | 'high'>();
    for (const g of gaps.data ?? []) map.set(g.stageId, g.severity as 'low' | 'medium' | 'high');
    return map;
  }, [gaps.data]);

  /**
   * Stage id -> name, built from the loaded funnel.
   *
   * A gap row carries only a `stageId`. Rendering that id straight into the
   * page produces "st_4 — 71% of plan", which is a debugging string in a
   * product surface. Where the id does not resolve — a stage deleted after the
   * gap was recorded — the id is shown *and* labelled as unresolved, because
   * a silent "Unknown stage" would hide a real referential problem and a bare
   * "st_4" hides the fact that it could not be resolved.
   */
  const stageName = React.useCallback(
    (stageId: string): { text: string; resolved: boolean } => {
      const found = funnel.data?.stages.find((s) => s.id === stageId);
      return found ? { text: found.name, resolved: true } : { text: `${stageId} (stage no longer exists)`, resolved: false };
    },
    [funnel.data],
  );

  return (
    <div className="os-page">
      <PageHeader
        title="Funnel"
        subtitle="Stages, how much leaks at each one, and where the blueprint disagrees with what was actually measured."
        actions={
          funnels.data && funnels.data.length > 1 ? (
            <label className="os-row" style={{ gap: space['2'] }}>
              <span className="os-tiny">Funnel</span>
              <select
                value={activeId ?? ''}
                onChange={(e) => {
                  setFunnelId(e.target.value);
                  setStageId(null);
                }}
                style={{
                  minHeight: 'var(--ds-size-target-min)',
                  border: 'var(--ds-border-width-thin) solid var(--ds-border-default)',
                  borderRadius: 'var(--ds-radius-md)',
                  background: 'var(--ds-surface-raised)',
                  padding: `0 ${space['2']}`,
                }}
              >
                {funnels.data.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null
        }
      />

      <div className="os-grid os-grid--wide-first">
        <Panel
          title="Stages"
          actions={
            funnel.data ? (
              <StatusPill tone={funnel.data.status === 'active' ? 'success' : 'neutral'}>{funnel.data.status}</StatusPill>
            ) : null
          }
        >
          <AsyncBoundary
            query={funnel}
            loadingLabel="Loading the funnel"
            emptyTitle="No funnels yet"
            emptyBody="A funnel is the spine of this product: it is how volume, conversion and leakage are measured at each step. Create one and the gap analysis starts running against it automatically."
            emptyAction={<Button variant="solid">Create a funnel</Button>}
          >
            {(f) => (
              <FunnelDiagram
                funnel={f}
                selectedStageId={activeStageId ?? undefined}
                gaps={gapSeverity}
                onSelect={(s: FunnelStage) => setStageId(s.id)}
              />
            )}
          </AsyncBoundary>
        </Panel>

        <Panel title="Plan against measured">
          <AsyncBoundary
            query={gaps}
            loadingLabel="Reconciling plan and measurement"
            emptyTitle="Nothing to reconcile"
            emptyBody="No stage in this funnel is behind its plan. Either the funnel is performing or the blueprint has not been given a target to miss — both are worth knowing."
          >
            {(rows) => (
              <>
                <p className="os-tiny">
                  {rows.filter((g) => g.severity === 'high').length} high ·{' '}
                  {rows.filter((g) => g.severity === 'medium').length} medium ·{' '}
                  {rows.filter((g) => g.severity === 'low').length} low
                </p>
                <ul className="os-col" style={{ gap: space['3'] }}>
                  {rows
                    .slice()
                    .sort((a, b) => a.ratioOfPlan - b.ratioOfPlan)
                    .map((g) => (
                      <li key={g.id}>
                        <button
                          type="button"
                          onClick={() => setStageId(g.stageId)}
                          className="os-col"
                          style={{
                            all: 'unset',
                            cursor: 'pointer',
                            display: 'grid',
                            gap: space['1'],
                            width: '100%',
                            minHeight: 'var(--ds-size-target-min)',
                          }}
                        >
                          <span className="os-row os-row--between">
                            <span style={{ fontSize: font.size.sm, fontWeight: font.weight.medium }}>
                              {stageName(g.stageId).text}
                            </span>
                            <span className="os-num" style={{ fontWeight: font.weight.semibold }}>
                              {(g.ratioOfPlan * 100).toFixed(0)}% of plan
                            </span>
                          </span>
                          <span className="os-tiny">
                            {formatNumber(g.shortfall)} {g.shortfall === 1 ? 'visitor' : 'visitors'} short
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
                <p className="os-tiny">Select a stage to see all eleven dimensions.</p>
              </>
            )}
          </AsyncBoundary>
        </Panel>
      </div>

      <Panel
        title="Stage detail"
        actions={
          activeStageId ? <Badge tone="neutral">{stageName(activeStageId).text}</Badge> : null
        }
      >
        <AsyncBoundary
          query={detail}
          loadingLabel="Loading stage dimensions"
          emptyTitle="No stage selected"
          emptyBody="Choose a stage above to see its eleven dimensions, each with the comparison that gives the number meaning."
        >
          {(d) => <StageDetailPanel detail={d} stageName={stageName(d.stageId).text} />}
        </AsyncBoundary>
      </Panel>

      <Panel title="Every gap in this funnel">
        <AsyncBoundary query={gaps} loadingLabel="Loading gaps">
          {(rows) => (
            <GapTable
              gaps={rows}
              stages={funnel.data?.stages ?? []}
              onSelect={(id) => setStageId(id)}
            />
          )}
        </AsyncBoundary>
      </Panel>
    </div>
  );
}
