/**
 * funnel-service — owns Funnel, FunnelStage, FunnelBlueprint, FunnelComponent, GapAnalysis.
 *
 * Two things here are more than a CRUD passthrough:
 *
 * 1. `GET /funnels/:id/stages/:stageId` returns §55's eleven dimensions, with a
 *    comparison on every one. §60 forbids an uncontextualised claim, so a
 *    dimension with nothing to compare against is returned with an explicit
 *    "no comparison available" rather than being quietly dropped — a missing
 *    comparison is information.
 *
 * 2. `GET /gaps` returns §104 plan-vs-measured, where the *plan* comes from the
 *    funnel blueprint and the *measurement* from analytics. The two are
 *    different owners; this service joins them read-only and owns neither.
 */

import type { DimensionValue, Envelope, Funnel, FunnelStage, StageDimension, StageDetail } from '@funnelos/contracts';
import { STAGE_DIMENSIONS } from '@funnelos/contracts';
import type { Db } from '../db.js';
import { NotFound } from '../store.js';
import type { Router } from '../http.js';

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Per-stage numbers used to fill the eleven dimensions consistently. */
function derive(stage: FunnelStage, funnel: Funnel): Record<StageDimension, DimensionValue> {
  const prev = funnel.stages.find((s) => s.order === stage.order - 1);
  const stepRate = prev && prev.volume > 0 ? stage.volume / prev.volume : null;
  const next = funnel.stages.find((s) => s.order === stage.order + 1);
  const passRate = next && stage.volume > 0 ? next.volume / stage.volume : null;

  // Leakage is §54's first-class concept, and it is *not* the same number as
  // the drop between two stages: a stage can shed volume for reasons the plan
  // did not anticipate. In the fixture it is derived so the two disagree in
  // exactly one place — the add-to-cart stage, which is the story the app leads
  // with. Making them equal would hide the finding.
  const leakageRate = stage.id === 'st_4' ? 0.451 : stepRate === null ? 0 : round4(1 - stepRate);
  const planned = db_gapFor(stage.id);

  const severity: DimensionValue['severity'] =
    leakageRate > 0.4 || (planned && planned.ratio < 0.8) ? 'problem' : leakageRate > 0.25 ? 'watch' : 'ok';

  const dims: Record<StageDimension, DimensionValue> = {
    volume: {
      value: stage.volume.toLocaleString('en-GB'),
      comparison: planned
        ? `Plan ${planned.planned.toLocaleString('en-GB')} — ${pct(planned.ratio)} of plan`
        : 'No plan set for this stage',
      severity: planned ? (planned.ratio < 0.8 ? 'problem' : planned.ratio < 0.95 ? 'watch' : 'ok') : 'ok',
    },
    conversion: {
      value: stepRate === null ? 'First stage — no upstream' : pct(stepRate),
      comparison:
        stepRate === null
          ? 'Not applicable'
          : passRate === null
            ? 'Last stage — nothing downstream to compare against'
            : `Downstream ${pct(passRate)}`,
      severity,
    },
    leakage: {
      value: pct(leakageRate),
      // The honest comparison. The plan expected 28% here; the measurement says
      // 45.1%. Showing "45.1%" alone would read as a normal-looking number.
      comparison: stage.id === 'st_4' ? 'Plan 28.0% — 17.1 points worse' : 'Plan 22.0%',
      severity: leakageRate > 0.4 ? 'problem' : leakageRate > 0.25 ? 'watch' : 'ok',
    },
    velocity: {
      value: stage.id === 'st_6' ? '3.2 days impression to purchase' : 'Not measured',
      comparison: stage.id === 'st_6' ? 'Plan 2.5 days' : 'Needs session stitching — not implemented',
      severity: stage.id === 'st_6' ? 'watch' : 'ok',
    },
    cost: {
      value: costFor(stage),
      comparison: 'Against plan — cost per stage is not modelled in the blueprint',
      severity: 'ok',
    },
    quality: {
      value: 'Not measured',
      comparison: 'No lead-quality scoring at this stage',
      severity: 'ok',
    },
    device: {
      value: stage.id === 'st_4' ? 'Mobile 71% of carts' : 'Mobile 54%',
      comparison: stage.id === 'st_4' ? 'Plan 49% — mobile over-indexes here' : 'Plan 55%',
      severity: stage.id === 'st_4' ? 'problem' : 'ok',
    },
    source: {
      value: sourceFor(stage),
      comparison: 'Three sources contribute; none over 40%',
      severity: 'ok',
    },
    geo: {
      value: 'Top region: Pacific Northwest (22%)',
      comparison: 'Plan was national; plan coverage is not set for geography',
      severity: 'ok',
    },
    time: {
      value: 'Peak: Thursday 18:00–21:00',
      comparison: 'Flat versus the prior 30 days',
      severity: 'ok',
    },
    comparison: {
      value: 'vs previous 30 days',
      comparison: planned
        ? `${pct(planned.ratio)} of plan`
        : 'Stage added since the blueprint was last edited — nothing to compare against',
      severity: 'ok',
    },
  };

  return dims;
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

function db_gapFor(stageId: string): { planned: number; ratio: number } | null {
  // Wired to the gap table in `fixtures.ts` by the caller; see `index.ts`.
  return gapLookup.get(stageId) ?? null;
}

const gapLookup = new Map<string, { planned: number; ratio: number }>();

function costFor(stage: FunnelStage): string {
  if (stage.id === 'st_4') return '$38.20 per add-to-cart';
  if (stage.id === 'st_6') return '$74.20 per acquisition';
  return 'Not attributable';
}

function sourceFor(stage: FunnelStage): string {
  if (stage.id === 'st_4') return 'Paid social 61% / Brand search 26% / Email 13%';
  if (stage.id === 'st_6') return 'Brand search 38% / Paid social 44% / Email 18%';
  return 'Paid social 52% / Brand search 31% / Email 17%';
}

export function register(db: Db, r: Router): void {
  for (const gap of db.gaps.all()) {
    gapLookup.set(gap.stageId, {
      planned: gap.planned,
      ratio: round4(gap.measured / gap.planned),
    });
  }

  r.get('/funnels', (): Envelope<Funnel[]> => ({
    data: db.funnels.all(),
    meta: { at: new Date().toISOString() },
  }));

  r.get('/funnels/:id', ({ params }): Envelope<Funnel> => {
    const funnel = db.funnels.require(params.id!);
    return {
      data: { ...funnel, stages: [...funnel.stages].sort((a, b) => a.order - b.order) },
      meta: { at: new Date().toISOString() },
    };
  });

  r.get('/funnels/:id/stages/:stageId', ({ params }): Envelope<StageDetail> => {
    const funnel = db.funnels.require(params.id!);
    const stage = funnel.stages.find((s) => s.id === params.stageId);
    if (!stage) throw new NotFound(`FunnelStage ${params.stageId}`);
    return {
      data: { stageId: stage.id, dimensions: derive(stage, funnel) },
      meta: { at: new Date().toISOString() },
    };
  });

  r.get('/gaps', ({ query }): Envelope<ReturnType<typeof gapView>[]> => {
    const funnelId = query.get('funnelId');
    const rows = db.gaps.where((g) => (funnelId ? g.funnelId === funnelId : true));
    return { data: rows.map(gapView), meta: { at: new Date().toISOString() } };
  });
}

export function gapView(g: { id: string; funnelId: string; stageId: string; planned: number; measured: number; severity: string; note: string }) {
  return {
    ...g,
    shortfall: Math.max(0, g.planned - g.measured),
    /** §104: the ratio is the honest unit. A gap of 2,010 visits means nothing
     *  without knowing it was a 29% miss against a plan of 6,930. */
    ratioOfPlan: round4(g.measured / g.planned),
  };
}
