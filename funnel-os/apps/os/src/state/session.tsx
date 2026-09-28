/**
 * Session and mode.
 *
 * Two pieces of state the whole shell depends on, so they live in one context
 * rather than being fetched by each screen.
 *
 * `role` is server state — the API owns it (`POST /session/role`) and the
 * NavRail is *scoped* by it (§79). Keeping a client-only copy would let the nav
 * and the API disagree, and the disagreement would look like a permissions bug.
 *
 * `mode` is the one genuinely client-side piece. §52 defines three modes —
 * Build, Optimize, Hybrid — and rules about where "Build" is visible, but does
 * not say who owns the choice. It is a preference, not a permission, so it is
 * local state persisted to localStorage.
 */

import * as React from 'react';
import { api, useMutation, useQuery, type Session } from '@funnelos/api-client';
import type { Role } from '@funnelos/contracts';

export type Mode = 'build' | 'optimize' | 'hybrid';

export const MODES: ReadonlyArray<{ id: Mode; label: string; what: string }> = [
  { id: 'build', label: 'Build', what: 'Creating and improving the funnel itself' },
  { id: 'optimize', label: 'Optimize', what: 'Acting on what the data already shows' },
  { id: 'hybrid', label: 'Hybrid', what: 'Both — the default' },
];

const MODE_KEY = 'funnel-os:mode';

function readMode(): Mode {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    return raw === 'build' || raw === 'optimize' || raw === 'hybrid' ? raw : 'hybrid';
  } catch {
    return 'hybrid';
  }
}

export interface SessionContextValue {
  session: Session | null;
  loading: boolean;
  error: string | null;
  mode: Mode;
  setMode: (mode: Mode) => void;
  setRole: (role: Role) => Promise<void>;
  switchingRole: boolean;
  refetch: () => void;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const query = useQuery<Session>((signal) => api.session.get(signal), []);
  const [mode, setModeState] = React.useState<Mode>(readMode);

  const roleMutation = useMutation((role: Role) => api.session.setRole(role));

  const setMode = React.useCallback((next: Mode) => {
    setModeState(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Private browsing. The mode still applies for this session; it just will
      // not survive a reload, which is a far better outcome than throwing.
    }
  }, []);

  const setRole = React.useCallback(
    async (role: Role) => {
      await roleMutation.run(role);
      // The server is the source of truth for the role, so the shell re-reads
      // rather than optimistically setting it. An optimistic role would render
      // a nav the API does not honour.
      query.refetch();
    },
    [roleMutation, query],
  );

  const value = React.useMemo<SessionContextValue>(
    () => ({
      session: query.data,
      loading: query.status === 'loading',
      error: query.status === 'error' ? query.error.message : null,
      mode,
      setMode,
      setRole,
      switchingRole: roleMutation.pending,
      refetch: query.refetch,
    }),
    [query, mode, setMode, setRole, roleMutation.pending],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

/* ------------------------------------------------------------------ *
 * §79 — role-scoped navigation.
 *
 * The plan says the NavRail is role-scoped and never enumerates the roles or
 * the scoping. These four roles and this capability table are the smallest set
 * that produces four visibly different nav rails, which is the only thing §79
 * is used for here. INFERRED, and marked in `packages/contracts` too.
 * ------------------------------------------------------------------ */

export type Capability =
  | 'view'
  | 'edit-pages'
  | 'publish'
  | 'manage-leads'
  | 'manage-integrations'
  | 'decide-actions'
  | 'manage-workspace';

export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  owner: ['view', 'edit-pages', 'publish', 'manage-leads', 'manage-integrations', 'decide-actions', 'manage-workspace'],
  admin: ['view', 'edit-pages', 'publish', 'manage-leads', 'manage-integrations', 'decide-actions', 'manage-workspace'],
  marketer: ['view', 'edit-pages', 'publish', 'manage-leads'],
  // An analyst sees and reads. They cannot change anything, and the nav does
  // not merely grey the items out — they are absent, because a disabled nav
  // item is a promise that clicking might do something.
  analyst: ['view'],
};

export function can(role: Role | undefined, capability: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role].includes(capability);
}
