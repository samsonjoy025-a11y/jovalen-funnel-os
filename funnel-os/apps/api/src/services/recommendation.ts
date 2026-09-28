/**
 * recommendation-service — owns Recommendation, and enforces §64's ten fields.
 *
 * The API rejects a recommendation that arrives with any of the ten missing.
 * That is a strange thing to enforce on a fixture-backed process, because the
 * fixtures are the ones supplying the rows — but it is exactly the check that
 * has to exist before a model writes them, and putting it in the service means
 * the model path and the fixture path cannot diverge.
 *
 * §63 is enforced here too: `confirmed: false` may not reach `accepted`.
 * Accepting an unconfirmed AI recommendation is the failure the whole §63
 * placeholder exists to prevent, and the natural place to stop it is the
 * transition, not the button.
 */

import type { Envelope, Recommendation } from '@funnelos/contracts';
import type { Db } from '../db.js';
import { BadRequest } from '../store.js';
import type { Router } from '../http.js';

const TEN_FIELDS: ReadonlyArray<keyof Recommendation> = [
  'id',
  'businessId',
  'title',
  'rationale',
  'impact',
  'effort',
  'confidence',
  'evidence',
  'confirmed',
  'status',
] as const;

export function assertComplete(rec: Recommendation): void {
  const missing = TEN_FIELDS.filter((f) => rec[f] === undefined || rec[f] === null);
  if (missing.length > 0) {
    throw new BadRequest(`Recommendation is missing required §64 field(s): ${missing.join(', ')}`);
  }
  if (!Array.isArray(rec.evidence) || rec.evidence.length === 0) {
    throw new BadRequest('Recommendation requires at least one evidence item (§64).');
  }
}

export interface Ranked extends Recommendation {
  /** §64: impact, confidence and effort must be a *visible, sortable* priority.
   *  The score exists so "sort by priority" means one documented thing. */
  priority: number;
  priorityBand: 'do-now' | 'plan' | 'skip';
}

export function rank(rec: Recommendation): Ranked {
  const impactWeight = { high: 3, medium: 2, low: 1 }[rec.impact];
  const effortWeight = { high: 3, medium: 2, low: 1 }[rec.effort];
  const score = Math.round(((impactWeight * rec.confidence * 10) / effortWeight) * 10) / 10;
  return {
    ...rec,
    priority: score,
    priorityBand: score >= 7 ? 'do-now' : score >= 4 ? 'plan' : 'skip',
  };
}

export function register(db: Db, r: Router): void {
  r.get('/recommendations', ({ query }): Envelope<Ranked[]> => {
    const includeDismissed = query.get('includeDismissed') === 'true';
    const rows = db.recommendations.where((rec) => includeDismissed || rec.status !== 'dismissed');
    for (const rec of rows) assertComplete(rec);
    return {
      data: [...rows].map(rank).sort((a, b) => b.priority - a.priority),
      meta: { at: new Date().toISOString() },
    };
  });

  r.post('/recommendations/:id/accept', ({ params }): Envelope<Ranked> => {
    const rec = db.recommendations.require(params.id!);
    if (!rec.confirmed) {
      throw new BadRequest(
        'This recommendation is unconfirmed AI content (§63). Confirm it before accepting — accepting is a human decision and cannot be automated.',
      );
    }
    const next = db.recommendations.patch(rec.id, { status: 'accepted', confirmed: true });
    // §84. Accepting is the moment a suggestion becomes somebody's decision, so
    // the log records that a human - not the model - made it.
    db.world.record({
      action: 'recommendation.accepted',
      entity: 'recommendation',
      entityId: rec.id,
      from: rec.status,
      to: 'accepted',
      reason: rec.rationale,
    });
    return { data: rank(next), meta: { at: new Date().toISOString() } };
  });

  r.post('/recommendations/:id/dismiss', ({ params }): Envelope<Ranked> => {
    const rec = db.recommendations.require(params.id!);
    const next = db.recommendations.patch(rec.id, { status: 'dismissed' });
    db.world.record({
      action: 'recommendation.dismissed',
      entity: 'recommendation',
      entityId: rec.id,
      from: rec.status,
      to: 'dismissed',
    });
    return { data: rank(next), meta: { at: new Date().toISOString() } };
  });

  r.post('/recommendations/:id/confirm', ({ params }): Envelope<Ranked> => {
    const rec = db.recommendations.require(params.id!);
    const next = db.recommendations.patch(rec.id, { confirmed: true });
    // Confirmation is separately logged from acceptance on purpose: §63 is
    // about two different humans' decisions, and collapsing them would make it
    // impossible to see afterwards that the model was checked before it was
    // taken.
    db.world.record({
      action: 'recommendation.confirmed',
      entity: 'recommendation',
      entityId: rec.id,
      reason: 'AI content confirmed by a human before acceptance',
    });
    return { data: rank(next), meta: { at: new Date().toISOString() } };
  });
}
