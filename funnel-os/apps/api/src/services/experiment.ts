/**
 * experiment-service — owns Experiment and its result.
 *
 * §67's requirement is that an inconclusive result is a real outcome. The API
 * enforces the corollary: a concluded experiment must carry a verdict, and
 * `verdict: 'inconclusive'` may not carry a confidence above 0.5. A 0.9
 * confidence that the result was inconclusive is a contradiction, and it is the
 * shape a model produces when it is nudged toward decisiveness.
 */

import type { Envelope, Experiment } from '@funnelos/contracts';
import type { Db } from '../db.js';
import { BadRequest } from '../store.js';
import type { Router } from '../http.js';

export function assertCoherent(exp: Experiment): void {
  if (exp.status !== 'concluded') return;
  const result = exp.result;
  if (!result) throw new BadRequest(`Experiment ${exp.id} is concluded but has no result.`);
  if (result.verdict === 'inconclusive' && result.confidence > 0.5) {
    throw new BadRequest(
      `Experiment ${exp.id} is inconclusive but reports ${result.confidence} confidence. An inconclusive result cannot also be a confident one.`,
    );
  }
  const variantIds = new Set(exp.variants.map((v) => v.id));

  /*
   * Shape first, then contents.
   *
   * The previous version went straight to `for (const row of result.primary)`
   * and looked up `row.variantId`. A caller that sends `primary` as a sentence
   * — which is a very natural mistake, because `narrative` is the field you
   * would expect prose in, and because there is no schema at the edge to stop
   * it — gets that string iterated CHARACTER BY CHARACTER, so every `row` is
   * one letter, `row.variantId` is `undefined`, and the server answers
   *
   *   "reports a result for unknown variant undefined"
   *
   * which names a nonexistent variant and says nothing about the actual fault.
   * The 400 is correct in its status and useless as a diagnosis. Checking
   * `Array.isArray` first costs one line and turns that into a message the
   * caller can act on.
   */
  if (!Array.isArray(result.primary)) {
    throw new BadRequest(
      `Experiment ${exp.id} has a malformed result. \`primary\` must be an array of ` +
        `{ variantId, value, delta } rows - one per variant - and a string was supplied.`,
    );
  }
  if (result.primary.length === 0) {
    throw new BadRequest(
      `Experiment ${exp.id} concluded with no per-variant results. §67 makes an inconclusive ` +
        `outcome recordable, which means recording what was measured, not recording nothing.`,
    );
  }
  for (const row of result.primary) {
    if (typeof row !== 'object' || row === null) {
      throw new BadRequest(
        `Experiment ${exp.id} has a malformed \`primary\` row: expected an object with ` +
          `{ variantId, value, delta }, got ${typeof row}.`,
      );
    }
    if (!variantIds.has(row.variantId)) {
      throw new BadRequest(
        `Experiment ${exp.id} reports a result for unknown variant "${row.variantId}". ` +
          `This experiment has: ${exp.variants.map((v) => v.id).join(', ')}.`,
      );
    }
    for (const n of ['value', 'delta'] as const) {
      if (typeof row[n] !== 'number' || !Number.isFinite(row[n])) {
        throw new BadRequest(
          `Experiment ${exp.id} has a non-numeric \`${n}\` for variant "${row.variantId}": ` +
            `${JSON.stringify(row[n])}. A result that cannot be plotted is not a result.`,
        );
      }
    }
  }
}

export function register(db: Db, r: Router): void {
  r.get('/experiments', (): Envelope<Experiment[]> => {
    for (const exp of db.experiments.all()) assertCoherent(exp);
    return { data: db.experiments.all(), meta: { at: new Date().toISOString() } };
  });

  r.get('/experiments/:id', ({ params }): Envelope<Experiment> => {
    const exp = db.experiments.require(params.id!);
    assertCoherent(exp);
    return { data: exp, meta: { at: new Date().toISOString() } };
  });

  r.post('/experiments/:id/conclude', ({ params, body }): Envelope<Experiment> => {
    const exp = db.experiments.require(params.id!);
    if (exp.status !== 'running') {
      throw new BadRequest(`Only a running experiment can conclude. This one is ${exp.status}.`);
    }
    const { verdict, confidence, primary, narrative } = (body ?? {}) as Partial<NonNullable<Experiment['result']>>;
    if (!verdict || confidence === undefined || !primary || !narrative?.trim()) {
      throw new BadRequest('A conclusion needs verdict, confidence, primary results and a narrative.');
    }
    const next: Experiment = {
      ...exp,
      status: 'concluded',
      concludedAt: new Date().toISOString(),
      result: { verdict, confidence, primary, narrative: narrative.trim() },
    };
    assertCoherent(next);
    db.world.record({
      action: 'experiment.concluded',
      entity: 'experiment',
      entityId: exp.id,
      from: 'running',
      to: 'concluded',
      reason: `${verdict} at confidence ${confidence}`,
    });
    return { data: db.experiments.patch(exp.id, next), meta: { at: new Date().toISOString() } };
  });
}
