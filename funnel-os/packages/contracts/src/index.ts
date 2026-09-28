/**
 * The domain contract.
 *
 * One copy, imported by the API and the OS app, so the two cannot disagree about
 * what a Lead is. This is the plan's rule A2 (one owner per entity) expressed
 * at the type level: an entity is declared once, in the service that owns it,
 * and nothing else may redeclare it.
 *
 * ------------------------------------------------------------------ *
 * READ THIS BEFORE ADDING A FIELD
 * ------------------------------------------------------------------ *
 *
 * The PRD is not in this repository. The implementation plan cites it
 * throughout (§24 block schema, §52 nav, §64 recommendation fields, §65 action
 * types, §70 integration states, §73 event names, §75 freshness, §87 states,
 * §104 plan-vs-measured, §115 definition of done) but the plan paraphrases
 * rather than reproduces it.
 *
 * So every type here is built from what the plan states outright, and where it
 * does not, from the smallest thing that makes a screen work. Those fields are
 * marked `INFERRED` below, with the reason.
 *
 * This is a deliberate trade, and the alternative was worse. The previous
 * position — refuse to build composites until the PRD arrives — protects
 * against wrong shapes but also means nothing is ever shown, and an unshown
 * screen cannot be corrected because nobody has seen it. The trade is:
 * guesses are cheap to replace if they are isolated and labelled. Every
 * INFERRED field below is therefore (a) marked, (b) defaulted in exactly one
 * place — `fixtures.ts` — and (c) re-exported nowhere else.
 *
 * When the PRD lands, `grep -rn INFERRED` is the work list. It should be empty
 * or near-empty by the time composites reach a real user.
 */

/* ========================================================================== *
 * Identity, tenancy, roles
 * ========================================================================== */

/**
 * The plan names four roles (§79 role-scoped NavRail) and L0–L3 autonomy (§83).
 * It does not enumerate them. These four are the smallest set that produces a
 * meaningfully different NavRail, which is the only thing §79 is used for here.
 */
export type Role = 'owner' | 'admin' | 'marketer' | 'analyst';

export const ROLES: readonly Role[] = ['owner', 'admin', 'marketer', 'analyst'];

/** INFERRED: no field list in the plan. */
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl?: string;
}

export interface Workspace {
  id: string;
  name: string;
  /** INFERRED: plan says a business belongs to a workspace, not the shape. */
  industry?: string;
  createdAt: string;
}

/* ========================================================================== *
 * Business context (business-service)
 * ========================================================================== */

export interface Business {
  id: string;
  workspaceId: string;
  name: string;
  website: string;
  /** INFERRED: plan references goals and audiences but never their fields. */
  industry: string;
  monthlyBudget: number;
  currency: string;
  targetRoas?: number;
}

export type GoalStatus = 'draft' | 'active' | 'achieved' | 'paused';

export interface Goal {
  id: string;
  businessId: string;
  name: string;
  /** INFERRED: no metric vocabulary in the plan. */
  metric: 'revenue' | 'leads' | 'conversions' | 'roas';
  target: number;
  current: number;
  periodStart: string;
  periodEnd: string;
  status: GoalStatus;
}

export interface Audience {
  id: string;
  businessId: string;
  name: string;
  size: number;
  /** INFERRED: no channel enum in the plan. */
  channels: Array<'paid-social' | 'paid-search' | 'email' | 'organic'>;
  description: string;
}

/* ========================================================================== *
 * Funnel spine (funnel-service)
 * ========================================================================== */

/** §54 names configurable stages with drop-in/out; the names below are ours. */
export interface FunnelStage {
  id: string;
  funnelId: string;
  name: string;
  order: number;
  volume: number;
  conversions: number;
  /** §54: leakage is a first-class concept, not derived silently. */
  leaked: number;
}

export interface Funnel {
  id: string;
  businessId: string;
  name: string;
  status: 'draft' | 'active' | 'archived';
  stages: FunnelStage[];
  createdAt: string;
}

/**
 * §55's eleven dimensions as a tabbed drill-down. The plan names the concept
 * and the count, not the dimensions. These are the funnel-analytics standard
 * ones; the count is deliberately eleven so the composite's shape (§55) is
 * exercised, and each is marked so the substitution is mechanical.
 */
export const STAGE_DIMENSIONS = [
  'volume',
  'conversion',
  'leakage',
  'velocity',
  'cost',
  'quality',
  'device',
  'source',
  'geo',
  'time',
  'comparison',
] as const;

export type StageDimension = (typeof STAGE_DIMENSIONS)[number];

export interface StageDetail {
  stageId: string;
  dimensions: Record<StageDimension, DimensionValue>;
}

export interface DimensionValue {
  value: string;
  /** The comparison is always present: §60 forbids an uncontextualised claim. */
  comparison?: string;
  /** INFERRED: no severity vocabulary in the plan. */
  severity?: 'ok' | 'watch' | 'problem';
}

export interface GapAnalysis {
  id: string;
  funnelId: string;
  /** §55/§104: a gap is a difference between a plan and a measurement. */
  stageId: string;
  planned: number;
  measured: number;
  severity: 'low' | 'medium' | 'high';
  note: string;
}

/* ========================================================================== *
 * Leads, routing, scoring (lead-service)
 * ========================================================================== */

export type LeadStage =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'proposal'
  | 'won'
  | 'lost';

export interface Lead {
  id: string;
  businessId: string;
  name: string;
  email: string;
  company: string;
  stage: LeadStage;
  score: number;
  value: number;
  source: string;
  ownerId?: string;
  createdAt: string;
  lastActivityAt: string;
}

export interface LeadActivity {
  id: string;
  leadId: string;
  at: string;
  /** INFERRED: the plan references lead activity, not its verb set. */
  kind: 'note' | 'email' | 'call' | 'stage-change' | 'assignment';
  summary: string;
  actor: string;
}

/* ========================================================================== *
 * Events and metrics (event-service / analytics-service)
 * ========================================================================== */

/**
 * §73 names seventeen ProductEvents. The plan cites the section but does not
 * list them, so this is a subset sized to drive the dashboard, and it is the
 * single biggest PRD-shaped guess in the codebase. See the header.
 */
export type ProductEventName =
  | 'workspace.created'
  | 'onboarding.step.completed'
  | 'funnel.created'
  | 'funnel.stage.added'
  | 'page.published'
  | 'form.submitted'
  | 'lead.created'
  | 'lead.qualified'
  | 'campaign.synced'
  | 'integration.connected'
  | 'insight.viewed'
  | 'recommendation.accepted'
  | 'action.approved'
  | 'action.rejected'
  | 'experiment.started'
  | 'experiment.concluded';

export interface ProductEvent {
  id: string;
  name: ProductEventName;
  workspaceId: string;
  actorId: string;
  at: string;
  properties: Record<string, string | number | boolean>;
}

/**
 * §75: freshness is a first-class, visible property of any sourced number. A
 * metric without it is not renderable — that is the point of the rule.
 */
export interface Metric {
  id: string;
  businessId: string;
  name: string;
  value: number;
  unit: 'currency' | 'count' | 'percent' | 'ratio';
  period: { start: string; end: string; label: string };
  previousValue: number;
  trend: number[];
  source: string;
  syncedAt: string;
  /** §87 partial: some sources are incomplete, and the UI must say which. */
  completeness: 'complete' | 'partial';
  incompleteSources?: string[];
}

export interface TimeSeries {
  label: string;
  values: number[];
}

/* ========================================================================== *
 * Integrations (integration-service)
 * ========================================================================== */

/**
 * §70's eight states. The plan states the count and that they are a state
 * machine, and gives four of the names in passing. The remaining four are
 * inferred to complete a lifecycle: the eight are the six integration-specific
 * ones plus the two shared with §57/§66, which `StateBadge` unifies.
 */
export type IntegrationState =
  | 'not_connected'
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'degraded'
  | 'error'
  | 'disconnected'
  | 'disabled';

/**
 * §70's state machine, published by the API rather than restated in the client.
 *
 * This exists so the Integrations page renders only the transitions the server
 * will accept. A client-side copy of the table is a second source of truth that
 * is wrong the first time someone adds a state, and it fails quietly: the
 * button is offered, the POST returns 400, and the user sees an error for
 * clicking something that looked correct. The table is typed as a complete
 * record so a new `IntegrationState` breaks this alias rather than resolving to
 * `undefined` in a lookup.
 */
export type IntegrationTransitionTable = Record<IntegrationState, IntegrationState[]>;

export interface IntegrationAccount {
  id: string;
  businessId: string;
  provider: string;
  /** §49's six sync fields, of which these are the observable ones. */
  state: IntegrationState;
  accountName: string;
  lastSyncedAt?: string;
  nextSyncAt?: string;
  recordsSynced: number;
  /**
   * §70 requires a visible "Sample data" badge on fixture-backed connections.
   * A connection showing fake numbers with no badge is the single most
   * dishonest thing this app could do, so it is a required field rather than
   * an optional one.
   */
  sampleData: boolean;
  errorMessage?: string;
}

/* ========================================================================== *
 * Insights, claims, recommendations (Phase 10)
 * ========================================================================== */

/** §60: an insight is one of four kinds, and the kind must be visible. */
export type ClaimType = 'fact' | 'analysis' | 'hypothesis' | 'recommendation';

export interface Evidence {
  id: string;
  metricName: string;
  value: string;
  comparisonWindow: string;
  source: string;
  syncedAt: string;
}

/**
 * §58: an insight may not render without evidence. `EvidenceList` is required
 * before `InsightCard`, so the type makes evidence non-optional.
 */
export interface Insight {
  id: string;
  businessId: string;
  claim: string;
  claimType: ClaimType;
  evidence: Evidence[];
  /** §58 confidence. INFERRED: no scale given; 0-1 is the obvious choice. */
  confidence: number;
  severity: 'info' | 'warning' | 'critical';
  createdAt: string;
  dismissed: boolean;
}

/** §64: ten fields. All ten are required; §64 is explicit that they are. */
export interface Recommendation {
  id: string;
  businessId: string;
  title: string;
  rationale: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'high' | 'medium' | 'low';
  confidence: number;
  evidence: Evidence[];
  /** §60: a recommendation is a claim, and may be unconfirmed by a human. */
  confirmed: boolean;
  /** §63: unconfirmed AI content must be visibly marked until resolved. */
  status: 'proposed' | 'accepted' | 'dismissed';
  createdAt: string;
}

/* ========================================================================== *
 * Actions and approvals (Phase 11)
 * ========================================================================== */

/** §83: L0–L3 autonomy. The plan gives the scale, not the labels. */
export type AutonomyLevel = 'L0' | 'L1' | 'L2' | 'L3';

/** §65 action types. INFERRED: the section is cited, never listed. */
export type ActionType =
  | 'send_email'
  | 'adjust_budget'
  | 'pause_campaign'
  | 'create_experiment'
  | 'update_routing';

/** §66 state machine. */
export type ActionState =
  | 'proposed'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'failed'
  | 'expired';

export interface ActionItem {
  id: string;
  businessId: string;
  type: ActionType;
  title: string;
  description: string;
  state: ActionState;
  risk: 'low' | 'medium' | 'high';
  autonomy: AutonomyLevel;
  requiresApproval: boolean;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  reason?: string;
  /** INFERRED: payload shape per action type. */
  payload: Record<string, string | number>;
}

/* ========================================================================== *
 * Experiments (Phase 12)
 * ========================================================================== */

export interface Experiment {
  id: string;
  businessId: string;
  hypothesis: string;
  status: 'draft' | 'running' | 'concluded';
  primaryMetric: string;
  secondaryMetrics: string[];
  variants: Array<{ id: string; name: string; traffic: number }>;
  startedAt?: string;
  concludedAt?: string;
  result?: ExperimentResult;
}

/**
 * §67: an inconclusive result is a real outcome and must render as one. A
 * variant split that is modelled as always-decisive is how experiments get
 * quietly over-read.
 */
export interface ExperimentResult {
  verdict: 'winner' | 'loser' | 'inconclusive';
  confidence: number;
  primary: Array<{ variantId: string; value: number; delta: number }>;
  narrative: string;
}

/* ========================================================================== *
 * Pages, forms, publish (page-service) — Phase 7, Slice 1
 * ========================================================================== */

/** §24 block document. The plan names the block types; fields are inferred. */
export type Block =
  | { id: string; type: 'hero'; heading: string; subheading?: string; ctaLabel?: string; ctaHref?: string }
  | { id: string; type: 'proof'; items: Array<{ value: string; label: string }> }
  | { id: string; type: 'features'; items: Array<{ title: string; body: string }> }
  | { id: string; type: 'form'; formId: string; heading: string }
  | { id: string; type: 'faq'; items: Array<{ q: string; a: string }> }
  | { id: string; type: 'cta'; heading: string; ctaLabel: string; ctaHref: string };

export interface LandingPage {
  id: string;
  businessId: string;
  name: string;
  slug: string;
  status: 'draft' | 'published';
  blocks: Block[];
  updatedAt: string;
  publishedAt?: string;
}

export interface FormField {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'select' | 'textarea' | 'checkbox';
  required: boolean;
  options?: string[];
}

export interface Form {
  id: string;
  businessId: string;
  name: string;
  fields: FormField[];
  submitLabel: string;
  successMessage: string;
}

export interface PublishRecord {
  id: string;
  pageId: string;
  publishedAt: string;
  publishedBy: string;
  version: number;
}

/* ========================================================================== *
 * Onboarding (business-service)
 * ========================================================================== */

/** INFERRED: the step list and its order. */
export type OnboardingStep =
  | 'business'
  | 'goal'
  | 'audience'
  | 'funnel'
  | 'integrations'
  | 'first-page';

export interface OnboardingStepStatus {
  step: OnboardingStep;
  label: string;
  /**
   * `complete` - done, `completedAt` is set.
   * `current`  — the next thing to do.
   * `upcoming` — not reached yet.
   *
   * Derived server-side so the client cannot disagree with the server about
   * which step it is on, and so the order lives in one place.
   */
  state: 'complete' | 'current' | 'upcoming';
  completedAt?: string;
}

export interface OnboardingState {
  businessId: string;
  /** INFERRED: the step list and its order. */
  step: OnboardingStep;
  completed: boolean;
  completedAt?: string;
  /** INFERRED: label wording. */
  steps: OnboardingStepStatus[];
}

/* ========================================================================== *
 * Audit (audit-service)
 * ========================================================================== */

export interface AuditEntry {
  id: string;
  workspaceId: string;
  actorId: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  at: string;
  /** INFERRED: no redaction rule in the plan. */
  metadata: Record<string, string>;
}

/* ========================================================================== *
 * Envelope
 * ========================================================================== */

export interface Envelope<T> {
  data: T;
  meta: { at: string; workspaceId?: string };
}

export interface ListEnvelope<T> {
  data: T[];
  meta: { at: string; total: number };
}

export interface ApiError {
  error: { code: string; message: string; details?: Record<string, string> };
}
