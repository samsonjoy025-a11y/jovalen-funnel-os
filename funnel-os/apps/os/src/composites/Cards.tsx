/**
 * InsightCard, RecommendationCard, ActionCard — §58, §64, §65, §66, §83.
 *
 * These three are the AI surface, and they share one principle that is worth
 * stating because it constrains the layout: **the machine's output is never
 * presented in the same visual register as a human's.** An AI card carries a
 * visible AI marker, states whether a person has confirmed it, and shows its
 * evidence inline. A card that looks identical whether it was written by a model
 * or by a colleague is how an unreviewed suggestion becomes a decision.
 */

import * as React from 'react';
import { Badge, Button, StatusPill, type Tone } from '@funnelos/ui';
import { color, font, space } from '@funnelos/ui';
import type { ActionItem, Insight, Recommendation } from '@funnelos/contracts';
import { formatDate, formatDateTime } from '@funnelos/api-client';
import { Claim, ConfirmRequired, EvidenceList } from './Metrics.js';

/* ------------------------------------------------------------------ *
 * shared
 * ------------------------------------------------------------------ */

function AiMarker({ confirmed }: { confirmed: boolean }) {
  return (
    <Badge tone={confirmed ? 'neutral' : 'brand'} dotLabel={confirmed ? 'AI, confirmed' : 'AI, unconfirmed'}>
      {confirmed ? 'AI · confirmed' : 'AI · unconfirmed'}
    </Badge>
  );
}

function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone: Tone = pct >= 80 ? 'success' : pct >= 55 ? 'info' : 'warning';
  return (
    <span className="os-row" style={{ gap: space['1'] }}>
      <StatusPill tone={tone}>{pct}% confidence</StatusPill>
      {/* §83's point: confidence is a number the model produced, so it is
          labelled as an estimate rather than a measurement. */}
      <span className="os-tiny">model estimate, not a measurement</span>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * InsightCard — §58
 * ------------------------------------------------------------------ */

export function InsightCard({
  insight,
  onDismiss,
  dismissBusy,
}: {
  insight: Insight;
  onDismiss?: (id: string) => void;
  dismissBusy?: boolean;
}) {
  const [showEvidence, setShowEvidence] = React.useState(false);
  const severityTone: Tone = insight.severity === 'critical' ? 'danger' : insight.severity === 'warning' ? 'warning' : 'info';

  return (
    <article className="os-card" aria-labelledby={`insight-${insight.id}`}>
      <div className="os-card__header">
        <Claim type={insight.claimType}>{insight.claim}</Claim>
        <StatusPill tone={severityTone}>{insight.severity}</StatusPill>
      </div>

      <div className="os-row">
        <Confidence value={insight.confidence} />
        <span className="os-tiny">· {formatDate(insight.createdAt)}</span>
      </div>

      {/* §58 makes evidence a precondition, not a link at the bottom. It is
          collapsed by default only because the page holds five of these at
          once; it is one keystroke away and always present in the DOM. */}
      <button
        type="button"
        onClick={() => setShowEvidence((v) => !v)}
        aria-expanded={showEvidence}
        aria-controls={`evidence-${insight.id}`}
        style={{
          all: 'unset',
          cursor: 'pointer',
          color: color.content.link,
          minHeight: 'var(--ds-size-target-min)',
          display: 'inline-flex',
          alignItems: 'center',
          fontSize: font.size.sm,
        }}
      >
        {showEvidence ? 'Hide' : 'Show'} the {insight.evidence.length} pieces of evidence
      </button>

      <div id={`evidence-${insight.id}`} hidden={!showEvidence}>
        <EvidenceList evidence={insight.evidence} />
      </div>

      {onDismiss ? (
        <div className="os-row" style={{ marginTop: 'auto' }}>
          <Button variant="ghost" size="sm" disabled={dismissBusy} onClick={() => onDismiss(insight.id)}>
            Not useful
          </Button>
        </div>
      ) : null}
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * RecommendationCard — §64's ten fields, and a visible priority
 * ------------------------------------------------------------------ */

const BAND: Record<'do-now' | 'plan' | 'skip', { label: string; tone: Tone }> = {
  'do-now': { label: 'Do now', tone: 'danger' },
  plan: { label: 'Plan this cycle', tone: 'warning' },
  skip: { label: 'Skip for now', tone: 'neutral' },
};

export function RecommendationCard({
  rec,
  onAccept,
  onConfirm,
  onDismiss,
  busy,
}: {
  rec: Recommendation & { priority: number; priorityBand: 'do-now' | 'plan' | 'skip' };
  onAccept?: (id: string) => void;
  onConfirm?: (id: string) => void;
  onDismiss?: (id: string) => void;
  busy?: boolean;
}) {
  const [showEvidence, setShowEvidence] = React.useState(false);
  const band = BAND[rec.priorityBand];
  const decided = rec.status === 'accepted' || rec.status === 'dismissed';

  return (
    <article className="os-card" aria-labelledby={`rec-${rec.id}`}>
      <div className="os-card__header">
        <h3 className="os-card__title" id={`rec-${rec.id}`}>
          {rec.title}
        </h3>
        <StatusPill tone={band.tone}>{band.label}</StatusPill>
      </div>

      <div className="os-row">
        <AiMarker confirmed={rec.confirmed} />
        {/* §64: impact, confidence and effort must be *visible* as a priority,
            not buried in a score. All three are stated, and the band is the
            composite. */}
        <Badge tone="neutral">impact {rec.impact}</Badge>
        <Badge tone="neutral">effort {rec.effort}</Badge>
        <Confidence value={rec.confidence} />
      </div>

      <p className="os-card__body">{rec.rationale}</p>

      <button
        type="button"
        onClick={() => setShowEvidence((v) => !v)}
        aria-expanded={showEvidence}
        aria-controls={`rec-evidence-${rec.id}`}
        style={{
          all: 'unset',
          cursor: 'pointer',
          color: color.content.link,
          minHeight: 'var(--ds-size-target-min)',
          display: 'inline-flex',
          alignItems: 'center',
          fontSize: font.size.sm,
        }}
      >
        {showEvidence ? 'Hide' : 'Show'} the {rec.evidence.length} pieces of evidence
      </button>
      <div id={`rec-evidence-${rec.id}`} hidden={!showEvidence}>
        <EvidenceList evidence={rec.evidence} />
      </div>

      {rec.confirmed ? null : <ConfirmRequired onConfirm={() => onConfirm?.(rec.id)} onDismiss={() => onDismiss?.(rec.id)} busy={busy} />}

      {rec.status === 'accepted' ? (
        // No timestamp. The API does not return one, and rendering
        // `new Date()` here would put a plausible-looking time on a record
        // that has none — the sort of small invention that makes a log
        // untrustworthy. It is recorded in the audit trail instead, which is
        // the place a real time belongs.
        <p className="os-tiny" style={{ color: color.status.success.fg }}>
          Accepted by a person. The time is in the audit log.
        </p>
      ) : null}
      {rec.status === 'dismissed' ? <p className="os-tiny">Dismissed.</p> : null}

      {!decided && onAccept ? (
        <div className="os-row" style={{ marginTop: 'auto' }}>
          {/* §63. The accept button is present but the API refuses an
              unconfirmed recommendation with a 409, so the UI marks it rather
              than hiding it — a user who has read the evidence can confirm and
              accept in two steps, and the second step is the one that counts
              as a human decision. */}
          <Button variant="solid" disabled={busy} onClick={() => onAccept(rec.id)}>
            {rec.confirmed ? 'Accept' : 'Accept (confirm first)'}
          </Button>
          {onDismiss ? (
            <Button variant="ghost" disabled={busy} onClick={() => onDismiss(rec.id)}>
              Dismiss
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * ActionCard — §65 types, §66 states, §83 autonomy
 * ------------------------------------------------------------------ */

const ACTION_STATE_TONE: Record<ActionItem['state'], Tone> = {
  proposed: 'neutral',
  awaiting_approval: 'warning',
  approved: 'info',
  rejected: 'neutral',
  executed: 'success',
  failed: 'danger',
  expired: 'neutral',
};

const ACTION_TYPE_LABEL: Record<ActionItem['type'], string> = {
  send_email: 'Send an email',
  adjust_budget: 'Change ad budget',
  pause_campaign: 'Pause a campaign',
  create_experiment: 'Start an experiment',
  update_routing: 'Change lead routing',
};

export function ActionCard({
  action,
  onApprove,
  onReject,
  onExecute,
  busy,
}: {
  action: ActionItem;
  onApprove?: (id: string) => void;
  onReject?: (id: string, reason: string) => void;
  onExecute?: (id: string) => void;
  busy?: boolean;
}) {
  const [reason, setReason] = React.useState('');
  const [showReject, setShowReject] = React.useState(false);

  const isOpen = action.state === 'awaiting_approval' || action.state === 'proposed';
  const canExecute = action.state === 'approved';
  const closed = action.state === 'rejected' || action.state === 'executed' || action.state === 'expired' || action.state === 'failed';

  return (
    <article className="os-card" aria-labelledby={`action-${action.id}`}>
      <div className="os-card__header">
        <h3 className="os-card__title" id={`action-${action.id}`}>
          {action.title}
        </h3>
        <StatusPill tone={ACTION_STATE_TONE[action.state]}>{action.state.replace('_', ' ')}</StatusPill>
      </div>

      <div className="os-row">
        <Badge tone="neutral">{ACTION_TYPE_LABEL[action.type]}</Badge>
        {/* §83: the autonomy level is what says whether this needs a human at
            all. L0/L1 always do. Showing it makes the rule inspectable. */}
        <Badge tone={action.autonomy === 'L0' || action.autonomy === 'L1' ? 'warning' : 'neutral'}>
          {action.autonomy} autonomy
        </Badge>
        <Badge tone={action.risk === 'high' ? 'danger' : action.risk === 'medium' ? 'warning' : 'neutral'}>
          {action.risk} risk
        </Badge>
        {!action.requiresApproval ? <Badge tone="info">no approval needed</Badge> : null}
      </div>

      <p className="os-card__body">{action.description}</p>

      <details>
        <summary style={{ cursor: 'pointer', minHeight: 'var(--ds-size-target-min)', display: 'list-item', fontSize: font.size.sm }}>
          What exactly would change
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

      {action.decidedBy ? (
        <p className="os-tiny">
          Decided by <strong>{action.decidedBy}</strong>
          {action.decidedAt ? ` on ${formatDateTime(action.decidedAt)}` : ''}
        </p>
      ) : null}

      {action.reason ? (
        <p className="os-tiny" style={{ color: color.content.secondary }}>
          <strong>Reason:</strong> {action.reason}
        </p>
      ) : null}

      {isOpen && onApprove ? (
        <div className="os-row" style={{ marginTop: 'auto' }}>
          <Button variant="solid" disabled={busy} onClick={() => onApprove(action.id)}>
            Approve
          </Button>
          {onReject ? (
            <Button variant="secondary" disabled={busy} onClick={() => setShowReject((v) => !v)} aria-expanded={showReject}>
              Reject
            </Button>
          ) : null}
        </div>
      ) : null}

      {showReject && onReject ? (
        <div className="os-col" style={{ gap: space['2'] }}>
          <label className="os-col" style={{ gap: space['1'] }}>
            <span className="os-tiny">Why are you rejecting this?</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              style={{
                border: 'var(--ds-border-width-default) solid var(--ds-border-default)',
                borderRadius: 'var(--ds-radius-md)',
                padding: space['2'],
                background: 'var(--ds-surface-raised)',
                minHeight: 'var(--ds-size-target-min)',
                font: 'inherit',
              }}
            />
          </label>
          <div className="os-row">
            <Button
              variant="danger"
              disabled={busy || reason.trim().length === 0}
              onClick={() => {
                onReject(action.id, reason.trim());
                setReason('');
                setShowReject(false);
              }}
            >
              Confirm rejection
            </Button>
            <Button variant="ghost" onClick={() => setShowReject(false)}>
              Cancel
            </Button>
          </div>
          {reason.trim().length === 0 ? (
            <p className="os-tiny" style={{ color: color.status.danger.fg }}>
              A rejection needs a reason. Someone reading the log later will not know why this was turned down.
            </p>
          ) : null}
        </div>
      ) : null}

      {canExecute && onExecute ? (
        <div className="os-row" style={{ marginTop: 'auto' }}>
          <Button variant="solid" disabled={busy} onClick={() => onExecute(action.id)}>
            Execute now
          </Button>
          <span className="os-tiny">Approved by {action.decidedBy}. Executing changes live data.</span>
        </div>
      ) : null}

      {closed ? <p className="os-tiny" style={{ marginTop: 'auto' }}>Closed. No further action available.</p> : null}
    </article>
  );
}
