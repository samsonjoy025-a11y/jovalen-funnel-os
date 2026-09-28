/**
 * business-service — owns Business, Audience, Goal, FunnelAssessment, OnboardingState.
 */

import type { Audience, Business, Envelope, Goal, OnboardingState } from '@funnelos/contracts';
import type { Db } from '../db.js';
import type { Router } from '../http.js';

export function register(db: Db, r: Router): void {
  r.get('/business', (): Envelope<Business> => ({
    data: db.businesses.all()[0]!,
    meta: { at: new Date().toISOString(), workspaceId: db.session.workspace.id },
  }));

  r.patch('/business', ({ body }): Envelope<Business> => {
    const b = db.businesses.all()[0]!;
    // `id` and `workspaceId` are not client-writable. A business can be
    // renamed; it cannot be moved to another tenant by accident through a
    // form field named id, which is the whole point of A2 at the API edge.
    const { id: _id, workspaceId: _ws, ...changes } = (body ?? {}) as Partial<Business>;
    const next = db.businesses.patch(b.id, changes);
    // §84. The business record is what every metric is labelled with, so a
    // silent edit to it re-labels history. Audited like any other write.
    db.world.record({
      action: 'business.updated',
      entity: 'business',
      entityId: b.id,
      reason: `changed: ${Object.keys(changes).join(', ')}`,
    });
    return { data: next, meta: { at: new Date().toISOString() } };
  });

  r.get('/goals', (): Envelope<Goal[]> => ({
    data: db.goals.all(),
    meta: { at: new Date().toISOString() },
  }));

  r.patch('/goals/:id', ({ params, body }): Envelope<Goal> => {
    const goal = db.goals.require(params.id!);
    const { id: _id, businessId: _b, ...changes } = (body ?? {}) as Partial<Goal>;
    const next = db.goals.patch(params.id!, changes);
    db.world.record({
      action: 'goal.updated',
      entity: 'goal',
      entityId: goal.id,
      reason: `changed: ${Object.keys(changes).join(', ')}`,
    });
    return { data: next, meta: { at: new Date().toISOString() } };
  });

  r.get('/audiences', (): Envelope<Audience[]> => ({
    data: db.audiences.all(),
    meta: { at: new Date().toISOString() },
  }));

  r.get('/onboarding', (): Envelope<OnboardingState> => ({
    data: db.onboarding.all()[0]!,
    meta: { at: new Date().toISOString() },
  }));
}
