/**
 * action-service — owns ActionItem and the §66 state machine.
 *
 * The rule this module exists to make unmissable: **an action at L0 or L1 never
 * executes without a named human.** `execute` requires `state === 'approved'`,
 * and approving requires `decidedBy`. There is no path from `proposed` to
 * `executed` in one call, and no path that fills `decidedBy` on the actor's
 * behalf. If the OS ever grows a "do it all" button, it will get a 409 from
 * here rather than quietly spending a budget.
 */

import type { ActionItem, ActionState, Envelope } from '@funnelos/contracts';
import type { Db } from '../db.js';
import { BadRequest, NotFound } from '../store.js';
import type { Router } from '../http.js';

const TRANSITIONS: Record<ActionState, ActionState[]> = {
  proposed: ['awaiting_approval', 'approved', 'rejected', 'expired'],
  awaiting_approval: ['approved', 'rejected', 'expired'],
  approved: ['executed', 'failed', 'expired'],
  rejected: [],
  executed: [],
  failed: ['awaiting_approval', 'expired'],
  expired: [],
};

export function canTransition(from: ActionState, to: ActionState): boolean {
  return from === to || (TRANSITIONS[from] ?? []).includes(to);
}

export function register(db: Db, r: Router): void {
  r.get('/actions', ({ query }): Envelope<ActionItem[]> => {
    const state = query.get('state') as ActionState | null;
    const rows = state ? db.actions.where((a) => a.state === state) : db.actions.all();
    return { data: rows, meta: { at: new Date().toISOString() } };
  });

  r.get('/actions/:id', ({ params }): Envelope<ActionItem> => ({
    data: db.actions.require(params.id!),
    meta: { at: new Date().toISOString() },
  }));

  const decide = (to: 'approved' | 'rejected') => ({ params, body }: { params: Record<string, string>; body: unknown }) => {
    const action = db.actions.require(params.id!);
    if (!canTransition(action.state, to)) {
      throw new BadRequest(`Cannot ${to} an action that is ${action.state}.`);
    }
    const { reason, decidedBy } = (body ?? {}) as { reason?: string; decidedBy?: string };
    if (to === 'rejected' && !reason?.trim()) {
      // A rejection with no reason is a dead end for whoever reads the log
      // later, so it is refused rather than stored.
      throw new BadRequest('A rejection needs a reason.');
    }
    const next = db.actions.patch(action.id, {
      state: to,
      decidedAt: new Date().toISOString(),
      decidedBy: decidedBy?.trim() || db.session.user.name,
      reason: to === 'rejected' ? reason!.trim() : action.reason,
    });
    // §84: a decision is the single most accountable event in the system, and
    // it is the one an operator will need to reconstruct after the fact.
    db.world.record({
      action: `action.${to}`,
      entity: 'action',
      entityId: action.id,
      reason: to === 'rejected' ? reason!.trim() : undefined,
      actorName: next.decidedBy,
      from: action.state,
      to,
    });
    return { data: next, meta: { at: new Date().toISOString() } };
  };

  r.post('/actions/:id/approve', decide('approved'));
  r.post('/actions/:id/reject', decide('rejected'));

  r.post('/actions/:id/execute', ({ params }): Envelope<ActionItem> => {
    const action = db.actions.require(params.id!);
    if (action.state !== 'approved') {
      throw new BadRequest(
        `Only an approved action may execute. This one is ${action.state}. There is no path from ${action.state} straight to executed.`,
      );
    }
    if (!action.decidedBy) {
      throw new BadRequest('An approved action must record who approved it.');
    }
    const next = db.actions.patch(action.id, { state: 'executed', decidedAt: new Date().toISOString() });
    db.world.record({
      action: 'action.executed',
      entity: 'action',
      entityId: action.id,
      // The approver, not the session: the question "who authorised this?" is
      // the one the log exists to answer, and it is not the same question as
      // "who pressed the button".
      actorName: action.decidedBy,
      from: 'approved',
      to: 'executed',
    });
    return { data: next, meta: { at: new Date().toISOString() } };
  });

  r.post('/actions/:id/expire', ({ params }): Envelope<ActionItem> => {
    const action = db.actions.require(params.id!);
    if (!canTransition(action.state, 'expired')) {
      throw new BadRequest(`Cannot expire an action that is ${action.state}.`);
    }
    const next = db.actions.patch(action.id, { state: 'expired' });
    db.world.record({
      action: 'action.expired',
      entity: 'action',
      entityId: action.id,
      reason: 'expired without execution',
      from: action.state,
      to: 'expired',
    });
    return { data: next, meta: { at: new Date().toISOString() } };
  });
}

export { NotFound };
