/**
 * Business - goals, audiences, and onboarding state.
 *
 * §51. The plan treats business context as something the OS *asks for* during
 * onboarding rather than something a user configures later, so this page has
 * two jobs: show what is set, and show what is not.
 *
 * Everything on this page is read-only on purpose. The write paths for goals
 * and audiences exist in the API (`PATCH /goals/:id`) but the plan does not
 * describe their forms, so shipping a form here would mean inventing a shape
 * the PRD owns. The page says so rather than guessing.
 */

import { Alert, Badge, Button, Progress, StatusPill } from '@funnelos/ui';
import { font, space } from '@funnelos/ui';
import { api, formatNumber, useQuery } from '@funnelos/api-client';
import type { OnboardingState } from '@funnelos/contracts';
import { PageHeader } from '../shell/AppShell.js';
import { AsyncBoundary, Panel } from '../composites/AsyncBoundary.js';

export function BusinessPage() {
  const business = useQuery((signal) => api.business.get(signal), []);
  const goals = useQuery((signal) => api.goals.list(signal), []);
  const audiences = useQuery((signal) => api.audiences.list(signal), []);
  const onboarding = useQuery((signal) => api.onboarding.get(signal), []);

  return (
    <div className="os-page">
      <PageHeader
        title="Business"
        subtitle="What the OS is optimising for. Every recommendation it makes traces back to these goals, so a goal nobody reads is worse than no goal at all - the system will confidently pursue it."
      />

      <div className="os-grid os-grid--halves">
        <AsyncBoundary query={business} loadingLabel="Loading business context">
          {(b) => (
            <Panel title="Business">
              <dl className="os-defs">
                <dt>Name</dt>
                <dd>{b.name}</dd>
                <dt>Website</dt>
                <dd>
                  <a href={b.website} target="_blank" rel="noreferrer noopener">
                    {b.website}
                  </a>
                </dd>
                <dt>Industry</dt>
                <dd>{b.industry}</dd>
                <dt>Monthly budget</dt>
                <dd className="os-num">
                  {new Intl.NumberFormat('en-GB', {
                    style: 'currency',
                    currency: b.currency,
                    maximumFractionDigits: 0,
                  }).format(b.monthlyBudget)}
                </dd>
                <dt>Target ROAS</dt>
                <dd className="os-num">
                  {/*
                    Optional in the contract, so rendered as an absence rather
                    than as a zero. "0.00x" reads as a measurement — a target of
                    no return — where the truth is that nobody has set one, and
                    a business with no target ROAS genuinely has one number
                    fewer than the rest of this list.
                  */}
                  {b.targetRoas === undefined ? (
                    <span className="os-muted">not set</span>
                  ) : (
                    `${b.targetRoas.toFixed(2)}x`
                  )}
                </dd>
              </dl>
              <p className="os-tiny">
                INFERRED - the plan does not enumerate the Business fields. The PRD does.
              </p>
            </Panel>
          )}
        </AsyncBoundary>

        <Panel title="Onboarding">
          <AsyncBoundary
            query={onboarding}
            loadingLabel="Loading onboarding state"
            emptyTitle="No onboarding record"
            emptyBody="The OS cannot tell you how far through setup you are if it has no onboarding record to read."
          >
            {(o) => <OnboardingStepper state={o} />}
          </AsyncBoundary>
        </Panel>
      </div>

      <Panel title="Goals" flush>
        <AsyncBoundary
          query={goals}
          loadingLabel="Loading goals"
          emptyTitle="No goals set"
          emptyBody="Without a target the system can say what happened but not whether it was good. Set one goal, measured against something real."
        >
          {(rows) => (
            <div className="os-table-scroll">
              <table className="os-table">
                <caption>
                  Goal progress against the current period. The percentage is computed here from the goal's
                  own current and target values, capped at 100 - a goal at 140% of target is not a progress
                  bar that runs off the end of its track.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Goal</th>
                    <th scope="col">Metric</th>
                    <th scope="col" className="os-table__num">
                      Current
                    </th>
                    <th scope="col" className="os-table__num">
                      Target
                    </th>
                    <th scope="col" style={{ width: '14rem' }}>
                      Progress
                    </th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((g) => {
                    const pct = g.target === 0 ? 0 : Math.min(100, Math.round((g.current / g.target) * 1000) / 10);
                    return (
                      <tr key={g.id}>
                        <th scope="row" style={{ fontWeight: font.weight.medium }}>
                          {g.name}
                        </th>
                        <td>
                          <Badge tone="neutral">{g.metric}</Badge>
                        </td>
                        <td className="os-table__num">{formatNumber(g.current, true)}</td>
                        <td className="os-table__num">{formatNumber(g.target, true)}</td>
                        <td>
                          <Progress value={pct} max={100} label={`${g.name} progress`} />
                          <span className="os-tiny os-num">
                            {pct}%{g.current / g.target > 1 ? ' - target exceeded' : ''}
                          </span>
                        </td>
                        <td>
                          <StatusPill tone={g.status === 'achieved' ? 'success' : 'neutral'}>{g.status}</StatusPill>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </AsyncBoundary>
      </Panel>

      <Panel title="Audiences">
        <AsyncBoundary
          query={audiences}
          loadingLabel="Loading audiences"
          emptyTitle="No audiences defined"
          emptyBody="An audience is who the funnel is for. Without one, campaign and page recommendations optimise for volume rather than for the people who actually buy."
        >
          {(rows) => (
            <div className="os-grid os-grid--cards">
              {rows.map((a) => (
                <article key={a.id} className="os-card os-card--flush">
                  <div className="os-card__header">
                    <h3 className="os-card__title">{a.name}</h3>
                    <span className="os-num" style={{ fontWeight: font.weight.semibold }}>
                      {formatNumber(a.size, true)}
                    </span>
                  </div>
                  <p className="os-card__body">{a.description}</p>
                  <div className="os-row">
                    {a.channels.map((c) => (
                      <Badge key={c} tone="neutral">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </AsyncBoundary>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Onboarding stepper
 *
 * Shown here as a *status*, not as a wizard. §45 makes onboarding a guided
 * flow, and a user already inside the OS does not want to be pushed back
 * through it - but they do need to see what is unfinished, because an
 * incomplete onboarding is the usual reason a later screen is empty.
 *
 * The step list comes from the API, not from this file. A stepper is exactly
 * the kind of component that is tempting to hardcode, and a hardcoded stepper
 * drifts from the real setup state without anyone noticing, because it still
 * looks like a stepper.
 * ------------------------------------------------------------------ */

function OnboardingStepper({ state }: { state: OnboardingState }) {
  const done = state.steps.filter((s) => s.state === 'complete').length;
  const total = state.steps.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const current = state.steps.find((s) => s.state === 'current');

  return (
    <div className="os-col" style={{ gap: space['3'] }}>
      <div className="os-row os-row--between">
        <span style={{ fontSize: font.size.sm }}>
          <strong>{done}</strong> of {total} steps complete
        </span>
        <StatusPill tone={state.completed ? 'success' : 'warning'}>{pct}%</StatusPill>
      </div>

      <Progress value={pct} max={100} label="Onboarding progress" />

      <ol className="os-col" style={{ gap: space['1'] }}>
        {state.steps.map((s, i) => {
          const isCurrent = s.state === 'current';
          return (
            <li
              key={s.step}
              className="os-row"
              style={{ gap: space['3'], minHeight: 'var(--ds-size-target-min)' }}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span
                aria-hidden="true"
                className="os-num"
                style={{
                  width: space['5'],
                  textAlign: 'center',
                  fontWeight: font.weight.semibold,
                  color:
                    s.state === 'complete'
                      ? 'var(--ds-status-success-fg)'
                      : isCurrent
                        ? 'var(--ds-color-primary-600)'
                        : 'var(--ds-content-tertiary)',
                }}
              >
                {s.state === 'complete' ? '\u2713' : i + 1}
              </span>

              <span
                style={{
                  fontSize: font.size.sm,
                  color: s.state === 'complete' ? 'var(--ds-content-secondary)' : 'var(--ds-content-primary)',
                }}
              >
                {s.label}
              </span>

              {/*
                State is not colour-only and not shape-only: the word is present
                in the accessible tree, and the row carries `aria-current` when
                it is the next step. A tick glyph alone would read as "three
                of these look the same" to anyone who cannot see the colour.
              */}
              {s.state !== 'complete' ? (
                <span className="os-sr-only">{isCurrent ? 'next step' : 'not started'}</span>
              ) : (
                <span className="os-sr-only">complete</span>
              )}
              {isCurrent ? <StatusPill tone="warning">next</StatusPill> : null}
            </li>
          );
        })}
      </ol>

      {current ? (
        <Alert tone="info" title={`Next: ${current.label}`} live="polite">
          Connecting a data source is what turns the numbers on this system from a demonstration into a
          reading. Until then, every figure is from the sample workspace.
        </Alert>
      ) : null}
    </div>
  );
}
