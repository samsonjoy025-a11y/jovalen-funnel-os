/**
 * integration-service — owns IntegrationAccount and the §70 state machine.
 *
 * `sampleData` is required, not optional. `connect` refuses to produce a
 * connection with `sampleData: false` because nothing in this process has
 * written real rows, so the only honest state for a "connected" fixture is a
 * connected *fixture*. The check lives in the state transition, not in the UI,
 * because a UI-only check is a check the next API route can forget.
 */

import type {
  Envelope,
  IntegrationAccount,
  IntegrationState,
  IntegrationTransitionTable,
} from '@funnelos/contracts';
import type { Db } from '../db.js';
import { assertRealBacking } from '../db.js';
import { BadRequest } from '../store.js';
import type { Router } from '../http.js';

/**
 * §70's state machine. Transitions are declared, not implied — the API refuses
 * an illegal one rather than letting a client put a failed connection back to
 * "connected" and have the UI show a green tick over data that never arrived.
 */
const TRANSITIONS: IntegrationTransitionTable = {
  not_connected: ['connecting'],
  connecting: ['connected', 'error'],
  connected: ['syncing', 'degraded', 'disconnected', 'error', 'disabled'],
  syncing: ['connected', 'degraded', 'error'],
  degraded: ['syncing', 'connected', 'error', 'disabled'],
  error: ['connecting', 'disabled'],
  disconnected: ['connecting', 'disabled'],
  disabled: ['connecting'],
};

export function canTransition(from: IntegrationState, to: IntegrationState): boolean {
  if (from === to) return true;
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function register(db: Db, r: Router): void {
  r.get('/integrations', (): Envelope<IntegrationAccount[]> => ({
    data: db.integrations.all(),
    meta: { at: new Date().toISOString() },
  }));

  /**
   * The state machine itself, so the client can offer only the transitions this
   * server accepts.
   *
   * Registered before any parameterised route on purpose. `match()` is
   * first-match-wins, so if a `GET /integrations/:id` is ever added, this
   * literal has to be declared first or `transition-table` would be read as an
   * id and 404 with a confusing message about a missing integration.
   */
  r.get('/integrations/transition-table', (): Envelope<IntegrationTransitionTable> => ({
    data: TRANSITIONS,
    meta: { at: new Date().toISOString() },
  }));

  r.post('/integrations/:id/transition', ({ params, body }): Envelope<IntegrationAccount> => {
    const to = (body as { to?: string } | null)?.to as IntegrationState | undefined;
    const account = db.integrations.require(params.id!);
    if (!to) throw new BadRequest('to is required');
    if (!canTransition(account.state, to)) {
      throw new BadRequest(`Cannot move integration from ${account.state} to ${to}. Allowed: ${(TRANSITIONS[account.state] ?? []).join(', ') || 'none'}`);
    }
    const next = db.integrations.patch(account.id, {
      state: to,
      // Connecting something that is not there yet still yields fixture data.
      // The alternative — pretending a OAuth handshake happened — is a lie the
      // Integrations page would have to display.
      accountName: to === 'connecting' || to === 'connected' ? account.accountName || `${account.provider} (demo connection)` : account.accountName,
    });
    assertRealBacking(next);
    // §84. A connection state change is what decides whether a business's
    // numbers are real, so it is the transition most worth being able to
    // reconstruct. `from` goes into `metadata` precisely so the row is readable
    // without a second query.
    db.world.record({
      action: 'integration.transitioned',
      entity: 'integration',
      entityId: account.id,
      from: account.state,
      to,
    });
    return { data: next, meta: { at: new Date().toISOString() } };
  });
}
