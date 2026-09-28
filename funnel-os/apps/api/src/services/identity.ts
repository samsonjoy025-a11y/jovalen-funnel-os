/**
 * identity-service — owns User, Session, Workspace, Membership, Role.
 *
 * The plan puts this behind `api-gateway` in Phase 3. There is no auth here:
 * the session is fixed, and `POST /session/role` exists only so the OS's
 * RoleGate can be demonstrated without a login flow. When real identity lands,
 * this module is where the token check goes, and nothing else changes —
 * every other service already receives the workspace from the context rather
 * than from the request body.
 */

import { ROLES, type Envelope, type Role, type User, type Workspace } from '@funnelos/contracts';
import type { Db } from '../db.js';
import { BadRequest } from '../store.js';
import type { Router } from '../http.js';

export interface SessionView {
  user: User;
  workspace: Workspace;
  role: Role;
  businessId: string;
  /** §79: the OS renders a role-scoped NavRail, so the shell needs the list. */
  availableRoles: readonly Role[];
}

export function register(db: Db, r: Router): void {
  r.get('/session', (): Envelope<SessionView> => ({
    data: {
      user: db.session.user,
      workspace: db.session.workspace,
      role: db.session.role,
      businessId: db.businesses.all()[0]!.id,
      availableRoles: ROLES,
    },
    meta: { at: new Date().toISOString() },
  }));

  r.post('/session/role', ({ body }): Envelope<SessionView> => {
    const role = (body as { role?: string } | null)?.role;
    if (!role || !ROLES.includes(role as Role)) {
      throw new BadRequest(`role must be one of ${ROLES.join(', ')}`);
    }
    db.session.role = role as Role;
    return {
      data: {
        user: db.session.user,
        workspace: db.session.workspace,
        role: db.session.role,
        businessId: db.businesses.all()[0]!.id,
        availableRoles: ROLES,
      },
      meta: { at: new Date().toISOString() },
    };
  });
}
