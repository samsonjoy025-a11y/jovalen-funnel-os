/**
 * Settings — §79's roles, §83's autonomy, and the audit log.
 *
 * Two things live here that are worth stating plainly rather than burying:
 *
 *   1. The role selector is a *demonstration* of the role model, not an
 *      authentication control. Anyone can switch to any role, because there is
 *      no authentication in this build. The panel says so at the top rather than
 *      letting someone conclude that the gate is real.
 *   2. The audit log is the record of who decided what. It is rendered from the
 *      API's own `actorName`, including the synthetic actors the system uses for
 *      autonomous execution, because "Automatic (L2)" acting on your business is
 *      exactly the kind of thing that has to be attributable.
 */

import * as React from 'react';
import { Alert, Badge, SegmentedControl } from '@funnelos/ui';
import { font, space } from '@funnelos/ui';
import { api, useQuery } from '@funnelos/api-client';
import type { AutonomyLevel, Role } from '@funnelos/contracts';
import { can, ROLE_CAPABILITIES, useSession, type Capability } from '../state/session.js';
import { PageHeader } from '../shell/AppShell.js';
import { AsyncBoundary, Panel } from '../composites/AsyncBoundary.js';

/** The real roles, read off the model rather than restated. */
const ROLES = Object.keys(ROLE_CAPABILITIES) as Role[];

/** The real capability list, likewise. INFERRED — see `session.tsx`. */
const CAPABILITIES = Object.keys(ROLE_CAPABILITIES.owner) as Capability[];

const ROLE_MEANING: Record<Role, string> = {
  owner: 'Everything, including who else has access to the workspace.',
  admin: 'Everything except changing who has access.',
  marketer: 'Can build and publish pages and work leads, but cannot decide actions or connect data.',
  analyst: 'Read-only. The nav does not grey out what they cannot do — the items are absent, because a disabled nav item is a promise that clicking might do something.',
};

export function SettingsPage() {
  const { session, setRole, switchingRole } = useSession();
  const audit = useQuery((signal) => api.audit.list(signal), []);
  const activity = useQuery((signal) => api.activity.list(signal), []);

  if (!session) {
    return (
      <div className="os-page">
        <PageHeader title="Settings" subtitle="Loading your session." />
      </div>
    );
  }

  const role = session.role;

  return (
    <div className="os-page">
      <PageHeader
        title="Settings"
        subtitle="Who can do what, how much the system is allowed to do on its own, and a record of everything that has been decided."
      />

      <Alert tone="warning" title="There is no authentication in this build">
        The role selector below switches role for whoever is looking, with no password and no session
        check. It demonstrates that the role model is enforced consistently across the app — the API reads
        the same role and applies the same rules — but it is not a security control and must not be
        mistaken for one. Real authentication is Phase 0 work the plan schedules but does not detail.
      </Alert>

      <Panel title="Your role">
        <div className="os-col" style={{ gap: space['3'] }}>
          <SegmentedControl
            legend="Active role"
            value={role}
            onChange={(next) => {
              void setRole(next);
            }}
            options={ROLES.map((r) => ({ value: r, label: r }))}
          />
          <p className="os-tiny">{ROLE_MEANING[role]}</p>
          {switchingRole ? <p className="os-tiny">Switching…</p> : null}
        </div>
      </Panel>

      <Panel title="What this role can do" flush>
        <div className="os-table-scroll">
          <table className="os-table">
            <caption>
              Capabilities per role, as <code>ROLE_CAPABILITIES</code> defines them. The API reads the same
              table, so a capability marked unavailable here is a 403 there — this table is a convenience,
              not the control.
            </caption>
            <thead>
              <tr>
                <th scope="col">Capability</th>
                {ROLES.map((r) => (
                  <th key={r} scope="col" className="os-table__num">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((cap) => (
                <tr key={cap}>
                  <th scope="row" style={{ fontWeight: font.weight.medium }}>
                    {cap}
                  </th>
                  {ROLES.map((r) => {
                    const allowed = can(r, cap);
                    return (
                      <td key={r} className="os-table__num">
                        {/*
                          Not a tick and a cross. The glyph is decorative and the
                          word carries the meaning, because a lone "✗" is read as
                          multiplication by anyone scanning, and is announced
                          as whatever the screen reader decides a dingbat is.
                        */}
                        <span className="os-row" style={{ gap: space['1'], justifyContent: 'flex-end' }}>
                          <span aria-hidden="true">{allowed ? '✓' : '—'}</span>
                          <span>{allowed ? 'Yes' : 'No'}</span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Autonomy">
        <div className="os-col" style={{ gap: space['3'] }}>
          {/*
            Display-only. There is no `PATCH /settings/autonomy` route, because
            the plan does not define where autonomy is stored. Inventing a
            control that posts nowhere is how a settings page ends up
            appearing to save a preference that it silently discards.
          */}
          {(['L0', 'L1', 'L2', 'L3'] as AutonomyLevel[]).map((lvl) => (
            <div key={lvl} className="os-row os-row--between" style={{ gap: space['3'] }}>
              <span style={{ fontSize: font.size.sm, fontWeight: font.weight.medium }}>{lvl}</span>
              <span className="os-tiny">{AUTONOMY_MEANING[lvl]}</span>
            </div>
          ))}
          <Alert tone="info" title="Not adjustable here yet">
            Autonomy is currently fixed at L2 by the fixture data. The plan describes the level as
            configurable but does not say where it is stored, so no control is offered rather than one
            that would not persist.
          </Alert>
        </div>
      </Panel>

      <Panel title="Audit log" flush>
        <AsyncBoundary
          query={audit}
          loadingLabel="Loading audit log"
          emptyTitle="Nothing has been decided yet"
          emptyBody="Approvals, rejections, dismissals, publishes and syncs are all written here. Nothing in this workspace has triggered one."
        >
          {(rows) => (
            <div className="os-table-scroll">
              <table className="os-table">
                <caption>
                  Every decision the system has recorded, newest first. Actor names are resolved by the
                  audit service; autonomous steps are attributed to the level that took them, not to a
                  person.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Actor</th>
                    <th scope="col">Action</th>
                    <th scope="col">Entity</th>
                    <th scope="col" className="os-table__num">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id}>
                      <th scope="row" style={{ fontWeight: font.weight.medium }}>
                        {e.actorName}
                      </th>
                      <td>{e.action}</td>
                      <td>
                        {e.entity} <span className="os-tiny">{e.entityId}</span>
                        {Object.entries(e.metadata).length > 0 ? (
                          <div className="os-row" style={{ flexWrap: 'wrap', gap: space['1'], marginBlockStart: space['1'] }}>
                            {Object.entries(e.metadata).map(([k, v]) => (
                              <Badge key={k} tone="neutral">
                                {k}: {v}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td className="os-table__num">
                        <time dateTime={e.at}>{e.at.slice(0, 16).replace('T', ' ')}</time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AsyncBoundary>
      </Panel>

      <Panel title="Recent workspace activity">
        <AsyncBoundary
          query={activity}
          loadingLabel="Loading activity"
          emptyTitle="No recent activity"
          emptyBody="Nothing has happened in this workspace recently."
        >
          {(rows) => (
            <ol className="os-timeline">
              {rows.map((a) => (
                <li key={a.id} className="os-timeline__item">
                  <div className="os-row os-row--between">
                    <span style={{ fontSize: font.size.sm }}>{a.what}</span>
                    <time dateTime={a.at} className="os-timeline__when os-num">
                      {a.at.slice(0, 16).replace('T', ' ')}
                    </time>
                  </div>
                  <p className="os-tiny" style={{ margin: 0 }}>
                    {a.who}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </AsyncBoundary>
      </Panel>
    </div>
  );
}


const AUTONOMY_MEANING: Record<AutonomyLevel, string> = {
  L0: 'Nothing happens without a person. The system may suggest.',
  L1: 'The system proposes and a person approves every action.',
  L2: 'Low-risk actions execute without asking. High-risk still need approval.',
  L3: 'Everything executes automatically, including high-risk actions.',
};
