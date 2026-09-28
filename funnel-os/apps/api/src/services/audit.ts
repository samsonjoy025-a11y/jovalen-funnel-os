/**
 * audit-service — owns AuditEntry, and reads the event log.
 *
 * Append-only. There is no PATCH or DELETE on this collection, and that is
 * deliberate rather than an omission: the plan's Phase 3 lists audit as a
 * service precisely because it must not be editable by the thing it audits.
 * A test asserts that no mutating route exists.
 */

import type { AuditEntry, Envelope, ProductEvent } from '@funnelos/contracts';
import type { Db } from '../db.js';
import type { Router } from '../http.js';

export function register(db: Db, r: Router): void {
  r.get('/audit', (): Envelope<AuditEntry[]> => ({
    data: [...db.audit.all()].sort((a, b) => b.at.localeCompare(a.at)),
    meta: { at: new Date().toISOString() },
  }));

  r.get('/events', (): Envelope<ProductEvent[]> => ({
    data: [...db.events.all()].sort((a, b) => b.at.localeCompare(a.at)),
    meta: { at: new Date().toISOString() },
  }));

  r.get('/activity', (): Envelope<Array<{ id: string; at: string; who: string; what: string }>> => {
    const rows = db.audit
      .all()
      .map((a) => ({ id: a.id, at: a.at, who: a.actorName, what: `${a.action} · ${a.entity}` }))
      .sort((a, b) => b.at.localeCompare(a.at));
    return { data: rows, meta: { at: new Date().toISOString() } };
  });
}
