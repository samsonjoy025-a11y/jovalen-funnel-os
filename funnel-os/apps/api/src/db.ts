/**
 * The database: one World, built from fixtures, assembled once at boot.
 *
 * `src/services/README.md` explains what a real repository replaces. The short
 * version: each `db.xxx` collection becomes a table owned by exactly one
 * service, and the `// owner:` comments are that ownership written down, so the
 * split is mechanical rather than a re-derivation.
 */

import type {
  ActionItem,
  AuditEntry,
  Audience,
  Business,
  Experiment,
  Form,
  Funnel,
  GapAnalysis,
  Goal,
  Insight,
  IntegrationAccount,
  LandingPage,
  Lead,
  LeadActivity,
  Metric,
  OnboardingState,
  ProductEvent,
  Recommendation,
  User,
  Workspace,
} from '@funnelos/contracts';
import { Collection, World } from './store.js';
import * as fx from './fixtures.js';

export interface Db {
  world: World;

  // identity-service
  users: Collection<User>;
  workspaces: Collection<Workspace>;
  /** The active role. Mutable so the OS's RoleGate can be demonstrated. */
  session: { user: User; workspace: Workspace; role: User['role'] };

  // business-service
  businesses: Collection<Business>;
  goals: Collection<Goal>;
  audiences: Collection<Audience>;
  onboarding: Collection<OnboardingState & { id: string }>;

  // funnel-service
  funnels: Collection<Funnel>;
  gaps: Collection<GapAnalysis>;

  // lead-service
  leads: Collection<Lead>;
  leadActivities: Collection<LeadActivity>;

  // event-service / analytics-service
  metrics: Collection<Metric>;
  events: Collection<ProductEvent>;

  // integration-service
  integrations: Collection<IntegrationAccount>;

  // insight-service / recommendation-service
  insights: Collection<Insight>;
  recommendations: Collection<Recommendation>;

  // action-service
  actions: Collection<ActionItem>;

  // experiment-service
  experiments: Collection<Experiment>;

  // page-service
  pages: Collection<LandingPage>;
  forms: Collection<Form>;

  // audit-service
  audit: Collection<AuditEntry>;
}

export function buildDb(): Db {
  const world = new World();

  /*
   * The audit log's default actor, set before anything can be written.
   *
   * `World.record` throws if this is missing rather than falling back to
   * "unknown", so this line is the only thing standing between the API and an
   * audit trail that cannot name the person who made any of its changes.
   * Setting it here - where the session is actually constructed - is the point:
   * `World` has no session of its own, and a comment somewhere claiming a test
   * covered the gap is not a substitute for the value.
   */
  world.setActor({ id: fx.user.id, name: fx.user.name });

  const db: Db = {
    world,
    users: world.collection('users', [fx.user]),
    workspaces: world.collection('workspaces', [fx.workspace]),
    session: { user: fx.user, workspace: fx.workspace, role: fx.user.role },

    businesses: world.collection('businesses', [fx.business]),
    goals: world.collection('goals', fx.goals),
    audiences: world.collection('audiences', fx.audiences),
    onboarding: world.collection('onboarding', [{ id: 'ob_1', ...fx.onboarding }]),

    funnels: world.collection('funnels', fx.funnels),
    gaps: world.collection('gaps', fx.gapAnalyses),

    leads: world.collection('leads', fx.leads),
    leadActivities: world.collection('leadActivities', fx.leadActivities),

    metrics: world.collection('metrics', [...fx.metrics, fx.insufficientMetric]),
    events: world.collection('events', fx.events),

    integrations: world.collection('integrations', fx.integrations),

    insights: world.collection('insights', fx.insights),
    recommendations: world.collection('recommendations', fx.recommendations),

    actions: world.collection('actions', fx.actions),

    experiments: world.collection('experiments', fx.experiments),

    pages: world.collection('pages', fx.pages),
    forms: world.collection('forms', fx.forms),

    audit: world.collection('audit', fx.auditLog),
  };

  return db;
}

/**
 * The refusal the whole honesty story rests on.
 *
 * A connection that reports `sampleData: false` must be backed by a connector
 * that recorded real rows. In this process there is no such connector, so the
 * check is a hard failure rather than a warning. It exists so that when a real
 * connector is added, flipping the flag is a deliberate act that has to also
 * provide the `connector` proof — not a one-word edit that quietly makes a
 * fixture look like production data.
 */
export function assertRealBacking(account: IntegrationAccount): void {
  if (account.sampleData) return;
  throw new Error(
    `Integration ${account.id} claims sampleData:false but no connector has written rows for it. ` +
      `A real connection must name the connector that produced this data.`,
  );
}

/** Every connection in the process is sample-backed; the OS must badge them. */
export function anySampleData(): boolean {
  return true;
}
