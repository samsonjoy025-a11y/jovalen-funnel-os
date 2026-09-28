/**
 * insight-service — owns Insight. A companion read model backs §58's rule that
 * an insight may not render without evidence: the API refuses to return an
 * insight whose evidence is empty, so a client that forgets to check gets a
 * 409 rather than a card with a confident headline and nothing under it.
 */

import type { Envelope, Insight } from '@funnelos/contracts';
import type { Db } from '../db.js';
import { BadRequest, NotFound } from '../store.js';
import type { Router } from '../http.js';

class InsightWithoutEvidence extends Error {
  readonly status = 409;
  constructor(id: string) {
    super(`Insight ${id} has no evidence and may not be rendered (§58).`);
    this.name = 'InsightWithoutEvidence';
  }
}

export function assertRenderable(insight: Insight): void {
  if (insight.evidence.length === 0) throw new InsightWithoutEvidence(insight.id);
}

export function register(db: Db, r: Router): void {
  r.get('/insights', ({ query }): Envelope<Insight[]> => {
    const includeDismissed = query.get('includeDismissed') === 'true';
    const rows = db.insights.where((i) => includeDismissed || !i.dismissed);
    // Ordered by confidence-weighted severity, not by recency. A 41%
    // hypothesis sitting above a 97% fact is how people stop reading the page.
    const order = { critical: 0, warning: 1, info: 2 } as const;
    return {
      data: [...rows].sort((a, b) => order[a.severity] - order[b.severity] || b.confidence - a.confidence),
      meta: { at: new Date().toISOString() },
    };
  });

  r.get('/insights/:id', ({ params }): Envelope<Insight> => {
    const insight = db.insights.require(params.id!);
    assertRenderable(insight);
    return { data: insight, meta: { at: new Date().toISOString() } };
  });

  r.post('/insights/:id/dismiss', ({ params }): Envelope<Insight> => {
    const insight = db.insights.get(params.id!);
    if (!insight) throw new NotFound(`Insight ${params.id}`);
    const next = db.insights.patch(params.id!, { dismissed: true });
    db.world.record({
      action: 'insight.dismissed',
      entity: 'insight',
      entityId: params.id!,
      reason: 'dismissed by a human - it must stop reappearing in the list',
    });
    return { data: next, meta: { at: new Date().toISOString() } };
  });

  r.post('/insights/:id/restore', ({ params }): Envelope<Insight> => {
    const insight = db.insights.get(params.id!);
    if (!insight) throw new NotFound(`Insight ${params.id}`);
    const next = db.insights.patch(params.id!, { dismissed: false });
    // A dismissal that cannot be undone is a filter with no escape hatch, and
    // §87 treats a permanently hidden item as a loss of the user's data rather
    // than a tidy-up. The restore is logged so the pair is visible in one place.
    db.world.record({ action: 'insight.restored', entity: 'insight', entityId: params.id! });
    return { data: next, meta: { at: new Date().toISOString() } };
  });
}

export { BadRequest };
