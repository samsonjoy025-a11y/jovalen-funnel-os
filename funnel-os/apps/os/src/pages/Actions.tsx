/**
 * Actions and Experiments — §66 approved-before-executed, §65 action types,
 * §83 L0-L3 autonomy, §67 inconclusive-is-a-real-outcome.
 *
 * Both screens are about a person deciding whether to let the system act. So
 * the *refusals* carry most of the weight here:
 *
 *   - Approve and Reject are not a pair of equal-looking buttons. Reject opens a
 *     required reason field, because §66 makes the reason part of the decision
 *     and an unexplained rejection is a decision nobody can learn from.
 *   - Execute is only offered from `approved`. The API refuses it from anywhere
 *     else; the button is absent rather than disabled, because a permanently
 *     disabled button is noise and this one is a state-dependent affordance.
 */

import * as React from 'react';
import { Alert, Badge, Button, Field, StatusPill, Textarea } from '@funnelos/ui';
import { font, space } from '@funnelos/ui';
import { api, useMutation, useQuery } from '@funnelos/api-client';
import type { ActionItem, ActionState, AutonomyLevel, Experiment } from '@funnelos/contracts';
import { PageHeader } from '../shell/AppShell.js';
import { AsyncBoundary, Panel } from '../composites/AsyncBoundary.js';

/* ------------------------------------------------------------------ *
 * Action state
 * ------------------------------------------------------------------ */

const ACTION_TONE: Record<ActionState, 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'> = {
  proposed: 'neutral',
  awaiting_approval: 'warning',
  approved: 'info',
  rejected: 'neutral',
  executed: 'success',
  failed: 'danger',
  expired: 'neutral',
};

/**
 * §83's L0-L3.
 *
 * The label is written out because "L2" on its own means nothing to anyone who
 * has not read §83, and this is a screen about delegating authority — where
 * the exact level of authority being delegated is the entire decision.
 */
const AUTONOMY_MEANING: Record<AutonomyLevel, string> = {
  L0: 'L0 — do nothing without a person',
  L1: 'L1 — propose, a person decides every one',
  L2: 'L2 — execute low-risk actions automatically',
  L3: 'L3 — execute anything, including high-risk',
};

const FILTERS: ReadonlyArray<{ value: ActionState | undefined; label: string }> = [
  { value: undefined, label: 'All' },
  { value: 'awaiting_approval', label: 'Awaiting approval' },
  { value: 'approved', label: 'Approved, not executed' },
  { value: 'executed', label: 'Executed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'failed', label: 'Failed' },
];

export function ActionsPage() {
  const [filter, setFilter] = React.useState<ActionState | undefined>(undefined);
  const actions = useQuery((signal) => api.actions.list(filter, signal), [filter]);

  return (
    <div className="os-page">
      <PageHeader
        title="Actions"
        subtitle="Things the system wants to do, and what has been done. Nothing executes without an approval, and every rejection carries a reason — both enforced by the API, not just by the buttons on this page."
      />

      <Panel title="Filter">
        <div className="os-row" style={{ flexWrap: 'wrap', gap: space['2'] }}>
          {FILTERS.map((f) => (
            <Button
              key={f.label}
              size="sm"
              variant={filter === f.value ? 'solid' : 'ghost'}
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </Panel>

      <Panel title="Action queue">
        <AsyncBoundary
          query={actions}
          loadingLabel="Loading actions"
          emptyTitle={filter ? `Nothing ${fVerb(filter)}` : 'No actions'}
          emptyBody={
            filter
              ? 'No action is in that state. The filter is applied by the API, so this is a real empty result.'
              : 'The system has not proposed anything. Actions come from recommendations you accept.'
          }
        >
          {(rows) => (
            <div className="os-col" style={{ gap: space['4'] }}>
              <AutonomyLegend />
              {rows.map((a) => (
                <ActionRow key={a.id} action={a} />
              ))}
            </div>
          )}
        </AsyncBoundary>
      </Panel>
    </div>
  );
}

function fVerb(state: ActionState): string {
  switch (state) {
    case 'awaiting_approval':
      return 'awaiting approval';
    case 'approved':
      return 'approved but not executed';
    case 'executed':
      return 'executed';
    case 'rejected':
      return 'rejected';
    case 'failed':
      return 'failing';
    default:
      return 'proposed';
  }
}

function AutonomyLegend() {
  return (
    <div className="os-row" style={{ flexWrap: 'wrap', gap: space['4'] }}>
      {(Object.keys(AUTONOMY_MEANING) as AutonomyLevel[]).map((lvl) => (
        <span key={lvl} className="os-tiny">
          {AUTONOMY_MEANING[lvl]}
        </span>
      ))}
    </div>
  );
}

function ActionRow({ action }: { action: ActionItem }) {
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState('');

  const approve = useMutation(() => api.actions.approve(action.id), [action.id]);
  const reject = useMutation((r: string) => api.actions.reject(action.id, r), [action.id]);
  const execute = useMutation(() => api.actions.execute(action.id), [action.id]);

  const busy = approve.pending || reject.pending || execute.pending;
  const failed = approve.error ?? reject.error ?? execute.error;
  const done = ['executed', 'rejected', 'expired'].includes(action.state);

  // Anything that changes the action's state invalidates the half-typed
  // rejection. Leaving the text in the box after the action has moved on is
  // how the same reason gets attached to the next one.
  React.useEffect(() => {
    if (done) {
      setRejecting(false);
      setReason('');
    }
  }, [done]);

  return (
    <article className="os-card os-card--flush">
      <div className="os-card__header">
        <Badge tone="neutral">{action.type}</Badge>
        <StatusPill tone={ACTION_TONE[action.state]}>{action.state.replace('_', ' ')}</StatusPill>
        <StatusPill
          tone={action.risk === 'high' ? 'danger' : action.risk === 'medium' ? 'warning' : 'neutral'}
        >
          {action.risk} risk
        </StatusPill>
        <span className="os-tiny os-num">{AUTONOMY_MEANING[action.autonomy]}</span>
      </div>

      <h3 className="os-card__title" style={{ fontSize: font.size.base }}>
        {action.title}
      </h3>
      <p className="os-card__body">{action.description}</p>

      {Object.keys(action.payload).length > 0 ? (
        <details>
          <summary className="os-tiny" style={{ cursor: 'pointer' }}>
            What this would do
          </summary>
          <dl className="os-defs" style={{ marginTop: space['2'] }}>
            {Object.entries(action.payload).map(([k, v]) => (
              <React.Fragment key={k}>
                <dt>{k.replace(/_/g, ' ')}</dt>
                <dd className="os-num">{String(v)}</dd>
              </React.Fragment>
            ))}
          </dl>
        </details>
      ) : null}

      {action.decidedBy || action.reason ? (
        <p className="os-tiny">
          {action.decidedBy ? <span>Decided by {action.decidedBy}. </span> : null}
          {action.reason ? <span>Reason: {action.reason}</span> : null}
        </p>
      ) : null}

      {/*
        §66. The three buttons are shown per state rather than all present and
        greyed out. An action in `executed` does not need three dead controls
        next to it, and a permanently disabled button is the thing users learn
        to click past without reading.
      */}
      {!done ? (
        <div className="os-col" style={{ gap: space['2'] }}>
          <div className="os-row" style={{ flexWrap: 'wrap' }}>
            {action.state === 'proposed' ? (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => approve.run()}>
                Send for approval
              </Button>
            ) : null}

            {action.state === 'awaiting_approval' ? (
              <>
                <Button variant="solid" size="sm" disabled={busy} onClick={() => approve.run()}>
                  Approve
                </Button>
                <Button variant="danger" size="sm" disabled={busy} onClick={() => setRejecting((v) => !v)}>
                  Reject
                </Button>
              </>
            ) : null}

            {/*
              §66 again: execution is offered from `approved` and nowhere else.
              The API enforces this too — a POST to execute from `proposed`
              returns 400 — so this is the friendly half of a rule whose
              unfriendly half lives on the server.
            */}
            {action.state === 'approved' ? (
              <Button variant="solid" size="sm" disabled={busy} onClick={() => execute.run()}>
                Execute now
              </Button>
            ) : null}
          </div>

          {rejecting ? (
            /*
             * A `Field` wraps exactly ONE control, and its `children` is a
             * render prop, not a slot. The first draft put the two buttons in
             * there too, which meant `Field` was labelling a group rather than
             * a control — and the render prop's `id` and `aria-describedby`
             * had nowhere obvious to land, so the §66 explanation was attached
             * to nothing. The buttons are siblings of the Field instead.
             */
            <div className="os-col" style={{ gap: space['2'] }}>
              <Field
                label="Reason for rejecting"
                required
                help="§66 makes the reason part of the decision. It is written to the audit log and is the only way the next suggestion can learn from this one."
              >
                {(field) => (
                  <Textarea
                    {...field}
                    value={reason}
                    rows={3}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Already sent a shipping email this quarter"
                  />
                )}
              </Field>
              <div className="os-row">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy || reason.trim().length === 0}
                  // `title` is a tooltip and unreachable by keyboard, so the
                  // reason a control is disabled is also stated in the button
                  // itself. The disabled state is the only thing preventing an
                  // audit-log entry with no reason in it.
                  onClick={() => reject.run(reason.trim())}
                >
                  {reason.trim().length === 0 ? 'Confirm rejection (reason required)' : 'Confirm rejection'}
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {failed ? (
        <p className="os-tiny" role="alert">
          {failed.message}
        </p>
      ) : null}
    </article>
  );
}

/* ================================================================== *
 * Experiments — §67
 * ================================================================== */

export function ExperimentsPage() {
  const experiments = useQuery((signal) => api.experiments.list(signal), []);

  return (
    <div className="os-page">
      <PageHeader
        title="Experiments"
        subtitle="Tests that are running or have finished, and what they concluded. An inconclusive result is a result: it is reported as one, because the alternative is that a coin-flip gets remembered as a win."
      />

      <Panel title="Experiments">
        <AsyncBoundary
          query={experiments}
          loadingLabel="Loading experiments"
          emptyTitle="No experiments"
          emptyBody="Nothing is being tested. Experiments are created from accepted recommendations that propose a test."
        >
          {(rows) => (
            <div className="os-col" style={{ gap: space['4'] }}>
              {rows.map((e) => (
                <ExperimentRow key={e.id} experiment={e} />
              ))}
            </div>
          )}
        </AsyncBoundary>
      </Panel>
    </div>
  );
}

function ExperimentRow({ experiment }: { experiment: Experiment }) {
  const total = experiment.variants.reduce((sum, v) => sum + v.traffic, 0);
  const splitIsSane = total > 0 && Math.abs(total - 100) < 0.5;

  return (
    <article className="os-card os-card--flush">
      <div className="os-card__header">
        <StatusPill
          tone={experiment.status === 'concluded' ? 'neutral' : experiment.status === 'running' ? 'info' : 'neutral'}
        >
          {experiment.status}
        </StatusPill>
        {experiment.startedAt ? (
          <span className="os-tiny">
            started <time dateTime={experiment.startedAt}>{experiment.startedAt.slice(0, 10)}</time>
          </span>
        ) : null}
      </div>

      <h3 className="os-card__title" style={{ fontSize: font.size.base }}>
        {experiment.hypothesis}
      </h3>

      {/*
        The traffic split, with a check that it actually sums to 100. A split of
        60/30 means 10% of visitors see neither variant, and the result then
        reads as a comparison between 60% of traffic and 30% — which looks
        like a result and is not one.
      */}
      <div className="os-col" style={{ gap: space['2'] }}>
        <span className="os-tiny">Traffic split</span>
        <div className="os-row" style={{ gap: space['2'] }}>
          {experiment.variants.map((v) => (
            <span key={v.id} className="os-row" style={{ gap: space['1'] }}>
              <Badge tone="neutral">{v.name}</Badge>
              <span className="os-num os-tiny">{v.traffic}%</span>
            </span>
          ))}
        </div>
        {!splitIsSane ? (
          <Alert tone="danger" title="The traffic split does not add up to 100%">
            These variants are allocated {total}% of traffic. Any comparison between them is confounded by
            who did not see them, and the result below should not be read as a difference between the
            variants.
          </Alert>
        ) : null}
      </div>

      <dl className="os-defs">
        <dt>Primary metric</dt>
        <dd>{experiment.primaryMetric}</dd>
        <dt>Secondary</dt>
        <dd>{experiment.secondaryMetrics.length > 0 ? experiment.secondaryMetrics.join(', ') : 'none'}</dd>
      </dl>

      {experiment.result ? (
        <ExperimentResult result={experiment.result} variantName={(id) => experiment.variants.find((v) => v.id === id)?.name ?? id} />
      ) : (
        <p className="os-tiny">
          {experiment.status === 'concluded'
            ? 'Concluded with no recorded result. That is itself a fault in the pipeline — a concluded experiment with no verdict should not be reachable.'
            : 'No result yet.'}
        </p>
      )}
    </article>
  );
}

/**
 * §67. The verdict is rendered as the API states it, including
 * `inconclusive`, and an inconclusive result is given its own tone and its own
 * wording rather than being styled as a small win. "No difference detected" and
 * "the control was better" are different sentences, and collapsing them is how
 * a null result gets quoted as a success.
 */
function ExperimentResult({
  result,
  variantName,
}: {
  result: NonNullable<Experiment['result']>;
  variantName: (id: string) => string;
}) {
  const tone =
    result.verdict === 'winner' ? 'success' : result.verdict === 'loser' ? 'danger' : 'warning';

  return (
    <div className="os-col" style={{ gap: space['2'] }}>
      <div className="os-row">
        <StatusPill tone={tone}>{result.verdict}</StatusPill>
        <span className="os-tiny os-num">confidence {(result.confidence * 100).toFixed(0)}%</span>
      </div>

      <p style={{ margin: 0, fontSize: font.size.sm }}>{result.narrative}</p>

      <div className="os-table-scroll">
        <table className="os-table">
          <caption>Primary metric by variant, with the change against the control.</caption>
          <thead>
            <tr>
              <th scope="col">Variant</th>
              <th scope="col" className="os-table__num">
                Value
              </th>
              <th scope="col" className="os-table__num">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {result.primary.map((row) => (
              <tr key={row.variantId}>
                <th scope="row" style={{ fontWeight: font.weight.medium }}>
                  {variantName(row.variantId)}
                </th>
                <td className="os-table__num">{row.value}</td>
                <td className="os-table__num">
                  {row.delta > 0 ? '+' : ''}
                  {(row.delta * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
