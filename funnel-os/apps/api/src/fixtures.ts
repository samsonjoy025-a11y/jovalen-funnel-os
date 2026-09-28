/**
 * Fixtures.
 *
 * ------------------------------------------------------------------ *
 * THIS IS SAMPLE DATA, AND THE APP SAYS SO
 * ------------------------------------------------------------------ *
 *
 * Every number the OS renders comes from this file. It is invented. No
 * business has these results. The plan (§49, §70) requires a visible "Sample
 * data" marker on anything not backed by a real connection, because a
 * dashboard full of invented numbers that look real is the most damaging thing
 * this product could ship — worse than an empty state, and much worse than a
 * slow one.
 *
 * So the marker is structural, not stylistic:
 *
 *   - `IntegrationAccount.sampleData` is a required boolean, not optional.
 *   - `db.ts` refuses to construct a connection with `sampleData: false` and no
 *     real backing. There is no code path that produces unmarked fixtures.
 *   - `SourceFreshnessBadge` (§75) renders the marker; it is not optional
 *     decoration on a metric card.
 *
 * When a real integration lands, `sampleData` flips to `false` at exactly one
 * place — the connector that wrote the rows — and the badge disappears on its
 * own.
 *
 * ------------------------------------------------------------------ *
 * WHY EVERYTHING HERE IS DETERMINISTIC
 * ------------------------------------------------------------------ *
 *
 * Seeded PRNG, no `Math.random()`, no `new Date()`. Two runs of the server
 * produce byte-identical responses, which is what lets a test assert on a
 * number and what lets a screenshot be compared against a previous one. The
 * timestamps are anchored to `NOW` below, and drift is what makes a freshness
 * badge lie ("synced 3 seconds ago" on data that never changed).
 */

import type {
  ActionItem,
  Audience,
  AuditEntry,
  Business,
  Evidence,
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
  OnboardingStep,
  OnboardingStepStatus,
  ProductEvent,
  Recommendation,
  User,
  Workspace,
} from '@funnelos/contracts';

/**
 * The anchor. Deliberately in the past and deliberately fixed: if `syncedAt`
 * were `Date.now()`, every restart would reset every freshness badge to
 * "just now", and a stale connection would look healthy.
 */
export const NOW = Date.parse('2026-09-28T09:00:00.000Z');

const DAY = 86_400_000;
const HOUR = 3_600_000;

const iso = (ms: number) => new Date(ms).toISOString();
const daysAgo = (n: number) => iso(NOW - n * DAY);
const hoursAgo = (n: number) => iso(NOW - n * HOUR);

/** mulberry32 — small, fast, and reproducible across Node versions. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/* ---------------------------------------------------------------- *
 * Identity
 * ---------------------------------------------------------------- */

export const workspace: Workspace = {
  id: 'ws_1',
  name: 'Northwind Outdoor Co.',
  industry: 'Outdoor equipment',
  createdAt: daysAgo(410),
};

export const user: User = {
  id: 'usr_1',
  email: 'sam@northwind.example',
  name: 'Sam Okonkwo',
  role: 'owner',
};

export const business: Business = {
  id: 'biz_1',
  workspaceId: workspace.id,
  name: 'Northwind Outdoor Co.',
  website: 'https://northwind.example',
  industry: 'Outdoor equipment',
  monthlyBudget: 18_000,
  currency: 'USD',
  targetRoas: 3.2,
};

/**
 * INFERRED: the onboarding step order and its labels. The PRD owns these.
 *
 * `currentStep` is the single fact. The per-step `state` is *derived* from it
 * rather than written out, because six hand-written `state` fields is six
 * chances to write "current" on the wrong row — and a stepper that puts the
 * marker two rows from the real next step is worse than no stepper.
 */
const ONBOARDING_ORDER: ReadonlyArray<{ step: OnboardingStep; label: string }> = [
  { step: 'business', label: 'Describe the business' },
  { step: 'goal', label: 'Set a goal' },
  { step: 'audience', label: 'Define an audience' },
  { step: 'funnel', label: 'Map the funnel' },
  { step: 'integrations', label: 'Connect a data source' },
  { step: 'first-page', label: 'Publish a first page' },
];

/** Steps already done in this workspace. Derived from what actually exists. */
const ONBOARDING_DONE: ReadonlyArray<OnboardingStep> = [
  'business',
  'goal',
  'audience',
  'funnel',
];

const currentStep: OnboardingStep = 'integrations';

export const onboarding: OnboardingState = ((): OnboardingState => {
  const steps: OnboardingStepStatus[] = ONBOARDING_ORDER.map(({ step, label }, i) => {
    const completedAt = ONBOARDING_DONE.includes(step)
      ? new Date(NOW - (ONBOARDING_DONE.length - i) * DAY * 2).toISOString()
      : undefined;
    return {
      step,
      label,
      state: completedAt ? 'complete' : step === currentStep ? 'current' : 'upcoming',
      ...(completedAt ? { completedAt } : {}),
    };
  });
  return {
    businessId: business.id,
    step: currentStep,
    completed: false,
    steps,
  };
})();

/* ---------------------------------------------------------------- *
 * Business context
 * ---------------------------------------------------------------- */

export const goals: Goal[] = [
  {
    id: 'goal_1',
    businessId: business.id,
    name: 'Grow revenue without growing spend',
    metric: 'roas',
    target: 3.2,
    current: 2.61,
    periodStart: daysAgo(30),
    periodEnd: daysAgo(1),
    status: 'active',
  },
  {
    id: 'goal_2',
    businessId: business.id,
    name: 'Reach 900 qualified leads a month',
    metric: 'leads',
    target: 900,
    current: 742,
    periodStart: daysAgo(30),
    periodEnd: daysAgo(1),
    status: 'active',
  },
  {
    id: 'goal_3',
    businessId: business.id,
    name: 'Hit $120k attributed revenue',
    metric: 'revenue',
    target: 120_000,
    current: 118_400,
    periodStart: daysAgo(30),
    periodEnd: daysAgo(1),
    status: 'active',
  },
  {
    id: 'goal_4',
    businessId: business.id,
    name: 'Raise landing page conversion to 4%',
    metric: 'conversions',
    target: 4,
    current: 4.6,
    periodStart: daysAgo(30),
    periodEnd: daysAgo(1),
    status: 'achieved',
  },
];

export const audiences: Audience[] = [
  {
    id: 'aud_1',
    businessId: business.id,
    name: 'Weekend trail hikers',
    size: 184_000,
    channels: ['paid-social', 'paid-search'],
    description:
      'Adults 25-44 within 50km of a trailhead. Buy seasonal gear, respond to free-shipping offers, low brand loyalty.',
  },
  {
    id: 'aud_2',
    businessId: business.id,
    name: 'Ultralight gear switchers',
    size: 41_500,
    channels: ['paid-search', 'email'],
    description:
      'Currently buying from a premium competitor. Price-comparison visitors, high AOV, long consideration window.',
  },
  {
    id: 'aud_3',
    businessId: business.id,
    name: 'Ex-customer winback',
    size: 12_800,
    channels: ['email'],
    description: 'Bought 18+ months ago, no repeat purchase. Reachable, discount-responsive.',
  },
];

/* ---------------------------------------------------------------- *
 * Funnel spine (§54, §55, §104)
 * ---------------------------------------------------------------- */

export const funnels: Funnel[] = [
  {
    id: 'fn_1',
    businessId: business.id,
    name: 'Trail Gear — Paid Social',
    status: 'active',
    createdAt: daysAgo(180),
    stages: [
      { id: 'st_1', funnelId: 'fn_1', name: 'Ad impression', order: 1, volume: 2_412_000, conversions: 0, leaked: 0 },
      { id: 'st_2', funnelId: 'fn_1', name: 'Landing page view', order: 2, volume: 41_380, conversions: 0, leaked: 0 },
      { id: 'st_3', funnelId: 'fn_1', name: 'Product view', order: 3, volume: 18_640, conversions: 0, leaked: 0 },
      { id: 'st_4', funnelId: 'fn_1', name: 'Add to cart', order: 4, volume: 4_920, conversions: 0, leaked: 0 },
      { id: 'st_5', funnelId: 'fn_1', name: 'Checkout started', order: 5, volume: 2_740, conversions: 0, leaked: 0 },
      { id: 'st_6', funnelId: 'fn_1', name: 'Purchase', order: 6, volume: 1_431, conversions: 0, leaked: 0 },
    ],
  },
  {
    id: 'fn_2',
    businessId: business.id,
    name: 'Brand Search — Capture',
    status: 'active',
    createdAt: daysAgo(240),
    stages: [
      { id: 'st_7', funnelId: 'fn_2', name: 'Ad impression', order: 1, volume: 186_400, conversions: 0, leaked: 0 },
      { id: 'st_8', funnelId: 'fn_2', name: 'Landing page view', order: 2, volume: 22_960, conversions: 0, leaked: 0 },
      { id: 'st_9', funnelId: 'fn_2', name: 'Add to cart', order: 3, volume: 5_310, conversions: 0, leaked: 0 },
      { id: 'st_10', funnelId: 'fn_2', name: 'Purchase', order: 4, volume: 3_190, conversions: 0, leaked: 0 },
    ],
  },
  {
    id: 'fn_3',
    businessId: business.id,
    name: 'Email — Winback',
    status: 'draft',
    createdAt: daysAgo(9),
    stages: [
      { id: 'st_11', funnelId: 'fn_3', name: 'Delivered', order: 1, volume: 12_800, conversions: 0, leaked: 0 },
      { id: 'st_12', funnelId: 'fn_3', name: 'Opened', order: 2, volume: 3_710, conversions: 0, leaked: 0 },
      { id: 'st_13', funnelId: 'fn_3', name: 'Clicked', order: 3, volume: 1_024, conversions: 0, leaked: 0 },
      { id: 'st_14', funnelId: 'fn_3', name: 'Purchase', order: 4, volume: 268, conversions: 0, leaked: 0 },
    ],
  },
];

/**
 * §54: leakage is a first-class field, not something a chart infers. Stage 4
 * (add to cart) is where this funnel actually breaks — 45% of carts abandon,
 * against a 28% plan. That gap is the reason `fn_1` leads the Overview.
 */
export const gapAnalyses: GapAnalysis[] = [
  {
    id: 'gap_1',
    funnelId: 'fn_1',
    stageId: 'st_4',
    planned: 6_930,
    measured: 4_920,
    severity: 'high',
    note: 'Cart abandonment running at 45% against a 28% plan. On mobile, shipping cost appears at the last step.',
  },
  {
    id: 'gap_2',
    funnelId: 'fn_1',
    stageId: 'st_2',
    planned: 46_000,
    measured: 41_380,
    severity: 'medium',
    note: 'Click-through on the paid social creative fell 14% week over week. Creative fatigue, not an auction problem.',
  },
  {
    id: 'gap_3',
    funnelId: 'fn_1',
    stageId: 'st_5',
    planned: 2_100,
    measured: 2_740,
    severity: 'low',
    note: 'Checkout starts ahead of plan. This one is fine.',
  },
];

/* ---------------------------------------------------------------- *
 * Leads (§64 lead stages, scoring, routing)
 * ---------------------------------------------------------------- */

const FIRST = ['Amara', 'Ben', 'Chidi', 'Dana', 'Eve', 'Femi', 'Gita', 'Hugo', 'Ivy', 'Jonas', 'Kira', 'Liam', 'Maya', 'Noor', 'Ola', 'Pia', 'Quinn', 'Rosa', 'Sam', 'Tobi'];
const LAST = ['Adeyemi', 'Brandt', 'Chen', 'Duarte', 'Ellis', 'Farouk', 'Gupta', 'Holt', 'Iversen', 'Jansen', 'Kowalski', 'Lindqvist', 'Moreau', 'Nakamura', 'Osei', 'Petrov', 'Quintero', 'Rossi', 'Silva', 'Tremblay'];
const COMPANIES = ['Ridgeline Outfitters', 'Trailhead Co-op', 'Summit Supply', 'Kestrel Outdoor', 'Basecamp Collective', 'Alpine Trading Co.', 'Wayfarer Gear', 'Granite Peak Ltd'];
const SOURCES = ['Paid social — Trail Gear', 'Brand search', 'Email — Winback', 'Referral', 'Paid search — Boots', 'Landing page — Spring Sale'];

export const leads: Lead[] = (() => {
  const rand = rng(20260928);
  const stages: Lead['stage'][] = ['new', 'new', 'contacted', 'contacted', 'qualified', 'qualified', 'qualified', 'proposal', 'proposal', 'won', 'won', 'lost'];
  const out: Lead[] = [];
  for (let i = 0; i < 64; i++) {
    const first = FIRST[Math.floor(rand() * FIRST.length)]!;
    const last = LAST[Math.floor(rand() * LAST.length)]!;
    const company = COMPANIES[Math.floor(rand() * COMPANIES.length)]!;
    const stage = stages[Math.floor(rand() * stages.length)]!;
    // Score correlates with stage, which is what makes the score column sort
    // the way a salesperson expects. Independent random scores look plausible
    // in a screenshot and are wrong the moment someone clicks "highest score".
    const base = { new: 12, contacted: 28, qualified: 54, proposal: 71, won: 88, lost: 34 }[stage];
    const score = Math.max(3, Math.min(99, Math.round(base + (rand() * 24 - 12))));
    const createdDaysAgo = Math.round(rand() * 44);
    out.push({
      id: `lead_${i + 1}`,
      businessId: business.id,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@${company.split(' ')[0]!.toLowerCase()}.example`,
      company,
      stage,
      score,
      value: round((1_400 + rand() * 22_000) / 100) * 100,
      source: SOURCES[Math.floor(rand() * SOURCES.length)]!,
      createdAt: daysAgo(createdDaysAgo),
      lastActivityAt: iso(NOW - Math.round(rand() * Math.max(1, createdDaysAgo) * DAY)),
    });
  }
  return out.sort((a, b) => b.score - a.score);
})();

const ACTIVITY_KINDS: LeadActivity['kind'][] = ['note', 'email', 'call', 'stage-change', 'assignment'];

export const leadActivities: LeadActivity[] = (() => {
  const rand = rng(77001);
  const out: LeadActivity[] = [];
  let n = 0;
  // Every lead gets at least one activity. An earlier version generated rows
  // for the top 18 leads only, which meant opening any other lead's drawer
  // showed an empty timeline — and an empty timeline reads as "this lead has
  // done nothing" rather than "the fixture never generated rows", which is
  // exactly the quiet fiction this project is trying not to ship.
  for (const lead of leads) {
    const count = lead.score > 70 ? 2 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 2);
    for (let i = 0; i < count; i++) {
      const kind = ACTIVITY_KINDS[Math.floor(rand() * ACTIVITY_KINDS.length)]!;
      const summaries: Record<LeadActivity['kind'], string[]> = {
        note: ['Asked about size exchange — sent the guide.', 'Wants a quote for 40 units.', 'Budget confirmed for Q4.'],
        email: ['Sent the line sheet.', 'Followed up on the sample order.', 'Shared the spring catalogue.'],
        call: ['15 min call — sizing and lead times discussed.', 'Intro call, no decision yet.', 'Discussed freight options.'],
        'stage-change': ['Moved to Qualified after the call.', 'Moved to Proposal — quote sent.', 'Marked Won.'],
        assignment: ['Assigned to Sam Okonkwo.', 'Reassigned to cover the West region.'],
      };
      // Spanned against the lead's own age, so a lead created yesterday has no
      // activity dated a fortnight ago.
      const ageDays = Math.max(1, Math.round((NOW - Date.parse(lead.createdAt)) / DAY));
      out.push({
        id: `la_${++n}`,
        leadId: lead.id,
        at: iso(NOW - Math.round(rand() * ageDays * DAY)),
        kind,
        summary: summaries[kind][Math.floor(rand() * summaries[kind].length)]!,
        actor: user.name,
      });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
})();

/* ---------------------------------------------------------------- *
 * Metrics (§75 freshness, §87 completeness)
 * ---------------------------------------------------------------- */

/** A 30-point series with a gentle trend and a believable wobble. */
function series(seed: number, start: number, drift: number, wobble: number): number[] {
  const rand = rng(seed);
  const out: number[] = [];
  for (let i = 0; i < 30; i++) {
    out.push(round(start + drift * i + (rand() * 2 - 1) * wobble, 2));
  }
  return out;
}

export const metrics: Metric[] = [
  {
    id: 'm_rev',
    businessId: business.id,
    name: 'Attributed revenue',
    value: 118_400,
    unit: 'currency',
    period: { start: daysAgo(30), end: daysAgo(1), label: 'Last 30 days' },
    previousValue: 104_900,
    trend: series(11, 3_200, 130, 480),
    source: 'Sample data — Shopify + GA4',
    syncedAt: hoursAgo(2),
    completeness: 'partial',
    incompleteSources: ['Meta Ads spend', 'Email attribution'],
  },
  {
    id: 'm_roas',
    businessId: business.id,
    name: 'Blended ROAS',
    value: 2.61,
    unit: 'ratio',
    period: { start: daysAgo(30), end: daysAgo(1), label: 'Last 30 days' },
    previousValue: 2.94,
    trend: series(22, 2.95, -0.012, 0.09),
    source: 'Sample data — Shopify + ad platforms',
    syncedAt: hoursAgo(2),
    completeness: 'partial',
    incompleteSources: ['Meta Ads spend'],
  },
  {
    id: 'm_leads',
    businessId: business.id,
    name: 'Qualified leads',
    value: 742,
    unit: 'count',
    period: { start: daysAgo(30), end: daysAgo(1), label: 'Last 30 days' },
    previousValue: 688,
    trend: series(33, 21, 0.9, 5),
    source: 'Sample data — Forms + HubSpot',
    syncedAt: hoursAgo(5),
    completeness: 'complete',
  },
  {
    id: 'm_cpa',
    businessId: business.id,
    name: 'Cost per acquisition',
    value: 74.2,
    unit: 'currency',
    period: { start: daysAgo(30), end: daysAgo(1), label: 'Last 30 days' },
    previousValue: 69.8,
    trend: series(44, 68, 0.22, 3.1),
    source: 'Sample data — ad platforms',
    syncedAt: hoursAgo(2),
    completeness: 'complete',
  },
];

/** No trend at all — this is what §87 "insufficient data" is for. */
export const insufficientMetric: Metric = {
  id: 'm_marketplace',
  businessId: business.id,
  name: 'Marketplace share of voice',
  value: 0,
  unit: 'percent',
  period: { start: daysAgo(6), end: daysAgo(1), label: 'Last 6 days' },
  previousValue: 0,
  trend: [],
  source: 'Not connected',
  syncedAt: daysAgo(9),
  completeness: 'partial',
  incompleteSources: ['Amazon Brand Analytics'],
};

/* ---------------------------------------------------------------- *
 * Integrations (§49, §70)
 * ---------------------------------------------------------------- */

export const integrations: IntegrationAccount[] = [
  {
    id: 'int_shopify',
    businessId: business.id,
    provider: 'Shopify',
    state: 'connected',
    accountName: 'northwind-outdoor.myshopify.com',
    lastSyncedAt: hoursAgo(2),
    nextSyncAt: iso(NOW + 22 * HOUR),
    recordsSynced: 184_902,
    sampleData: true,
  },
  {
    id: 'int_ga4',
    businessId: business.id,
    provider: 'Google Analytics 4',
    state: 'syncing',
    accountName: 'Northwind Outdoor — GA4 (382-114-02)',
    lastSyncedAt: hoursAgo(14),
    nextSyncAt: iso(NOW + 0.4 * HOUR),
    recordsSynced: 1_204_338,
    sampleData: true,
  },
  {
    id: 'int_meta',
    businessId: business.id,
    provider: 'Meta Ads',
    state: 'degraded',
    accountName: 'Northwind Outdoor Ad Account',
    lastSyncedAt: daysAgo(2),
    nextSyncAt: iso(NOW + 3 * HOUR),
    recordsSynced: 402_117,
    sampleData: true,
    errorMessage: 'Spend data incomplete since Friday. Reach and clicks synced; conversions missing.',
  },
  {
    id: 'int_hubspot',
    businessId: business.id,
    provider: 'HubSpot',
    state: 'connected',
    accountName: 'Northwind CRM',
    lastSyncedAt: hoursAgo(5),
    nextSyncAt: iso(NOW + 19 * HOUR),
    recordsSynced: 64_211,
    sampleData: true,
  },
  {
    id: 'int_googleads',
    businessId: business.id,
    provider: 'Google Ads',
    state: 'error',
    accountName: 'Northwind — MCC 918-220-4417',
    lastSyncedAt: daysAgo(6),
    recordsSynced: 88_004,
    sampleData: true,
    errorMessage: 'OAuth refresh failed. Reconnect to resume syncing.',
  },
  {
    id: 'int_klaviyo',
    businessId: business.id,
    provider: 'Klaviyo',
    state: 'connected',
    accountName: 'Northwind Outdoor',
    lastSyncedAt: hoursAgo(1),
    nextSyncAt: iso(NOW + 23 * HOUR),
    recordsSynced: 214_770,
    sampleData: true,
  },
  {
    id: 'int_amazon',
    businessId: business.id,
    provider: 'Amazon Ads',
    state: 'not_connected',
    accountName: '',
    recordsSynced: 0,
    sampleData: true,
  },
  {
    id: 'int_linkedin',
    businessId: business.id,
    provider: 'LinkedIn Ads',
    state: 'disabled',
    accountName: 'Northwind Outdoor (paused by owner)',
    lastSyncedAt: daysAgo(31),
    recordsSynced: 9_004,
    sampleData: true,
  },
];

/* ---------------------------------------------------------------- *
 * Insights (§58, §60) and evidence
 * ---------------------------------------------------------------- */

const ev = (
  id: string,
  metricName: string,
  value: string,
  comparisonWindow: string,
  source: string,
  syncedAt: string,
): Evidence => ({ id, metricName, value, comparisonWindow, source, syncedAt });

export const insights: Insight[] = [
  {
    id: 'in_1',
    businessId: business.id,
    claim: 'Cart abandonment on mobile nearly doubled after the shipping-cost change',
    claimType: 'analysis',
    evidence: [
      ev('ev_1', 'Mobile cart abandonment', '45.1%', 'vs 28.4% the previous 30 days', 'Sample data — Shopify', hoursAgo(2)),
      ev('ev_2', 'Mobile add-to-cart sessions', '3,182', 'Last 30 days', 'Sample data — GA4', hoursAgo(14)),
      ev('ev_3', 'Shipping shown at last step', 'Yes', 'Changed 11 days ago', 'Sample data — page version log', daysAgo(11)),
    ],
    confidence: 0.88,
    severity: 'critical',
    createdAt: hoursAgo(20),
    dismissed: false,
  },
  {
    id: 'in_2',
    businessId: business.id,
    claim: 'Brand search is carrying more revenue at a lower cost per acquisition than paid social',
    claimType: 'fact',
    evidence: [
      ev('ev_4', 'Brand search CPA', '$41.20', 'Last 30 days', 'Sample data — Google Ads + Shopify', daysAgo(2)),
      ev('ev_5', 'Paid social CPA', '$96.70', 'Last 30 days', 'Sample data — Meta + Shopify', daysAgo(2)),
      ev('ev_6', 'Brand search revenue share', '18.4%', 'vs 12.9% previous 30 days', 'Sample data — Shopify', hoursAgo(2)),
    ],
    confidence: 0.94,
    severity: 'info',
    createdAt: hoursAgo(30),
    dismissed: false,
  },
  {
    id: 'in_3',
    businessId: business.id,
    claim: 'The email winback list may be saturating — three sends in a fortnight with flat returns',
    claimType: 'hypothesis',
    evidence: [
      ev('ev_7', 'Winback revenue, last send', '$4,180', 'vs $4,240 previous send', 'Sample data — Klaviyo + Shopify', hoursAgo(1)),
      ev('ev_8', 'List size', '12,800', 'Grew 0.2% over 60 days', 'Sample data — Klaviyo', hoursAgo(1)),
    ],
    confidence: 0.41,
    severity: 'warning',
    createdAt: daysAgo(2),
    dismissed: false,
  },
  {
    id: 'in_4',
    businessId: business.id,
    claim: 'Blended ROAS fell below target for the second consecutive week',
    claimType: 'fact',
    evidence: [
      ev('ev_9', 'Blended ROAS', '2.61x', 'Target 3.20x', 'Sample data — Shopify + ad platforms', hoursAgo(2)),
      ev('ev_10', 'Blended ROAS, prior week', '2.78x', 'Last 30 days', 'Sample data — Shopify + ad platforms', hoursAgo(2)),
    ],
    confidence: 0.97,
    severity: 'warning',
    createdAt: hoursAgo(6),
    dismissed: false,
  },
  {
    id: 'in_5',
    businessId: business.id,
    claim: 'Moving free shipping to a $49 threshold could recover most of the abandoned carts',
    claimType: 'recommendation',
    evidence: [
      ev('ev_11', 'Abandoned carts, last 30 days', '1,489', 'Last 30 days', 'Sample data — Shopify', hoursAgo(2)),
      ev('ev_12', 'Carts that reached the shipping step', '2,740', 'Last 30 days', 'Sample data — GA4', hoursAgo(14)),
    ],
    confidence: 0.62,
    severity: 'warning',
    createdAt: daysAgo(1),
    dismissed: false,
  },
];

/* ---------------------------------------------------------------- *
 * Recommendations (§64: ten fields, all required)
 * ---------------------------------------------------------------- */

export const recommendations: Recommendation[] = [
  {
    id: 'rec_1',
    businessId: business.id,
    title: 'Show shipping cost before the last checkout step',
    rationale:
      'Shipping is only revealed after the customer has entered payment details on mobile. 45% of mobile carts now abandon at that step, against a 28% plan. Showing the cost at the cart, or setting a $49 free-shipping threshold, is the single highest-leverage change available.',
    impact: 'high',
    effort: 'low',
    confidence: 0.88,
    evidence: [
      ev('ev_21', 'Mobile cart abandonment', '45.1%', 'vs 28.4% previous 30 days', 'Sample data — Shopify', hoursAgo(2)),
      ev('ev_22', 'Abandoned carts, last 30 days', '1,489', 'Last 30 days', 'Sample data — Shopify', hoursAgo(2)),
    ],
    confirmed: true,
    status: 'proposed',
    createdAt: hoursAgo(18),
  },
  {
    id: 'rec_2',
    businessId: business.id,
    title: 'Move 15% of paid social budget into brand search defence',
    rationale:
      'Brand search CPA is $41 against $96 for paid social, and brand revenue share rose from 12.9% to 18.4% in a period when paid social efficiency fell. Competitors are bidding on your brand terms.',
    impact: 'high',
    effort: 'low',
    confidence: 0.81,
    evidence: [
      ev('ev_23', 'Brand search CPA', '$41.20', 'Last 30 days', 'Sample data — Google Ads + Shopify', daysAgo(2)),
      ev('ev_24', 'Paid social CPA', '$96.70', 'Last 30 days', 'Sample data — Meta + Shopify', daysAgo(2)),
    ],
    confirmed: true,
    status: 'proposed',
    createdAt: daysAgo(1),
  },
  {
    id: 'rec_3',
    businessId: business.id,
    title: 'Refresh the top paid social creative',
    rationale:
      'Click-through on the leading creative has fallen 14% week over week while cost per click rose. Frequency is 6.2 against a 3.0 fatigue threshold — the audience has seen the ad too often.',
    impact: 'medium',
    effort: 'medium',
    confidence: 0.86,
    evidence: [
      ev('ev_25', 'Creative CTR change', '-14.2%', 'Week over week', 'Sample data — Meta Ads', daysAgo(2)),
      ev('ev_26', 'Frequency', '6.2', 'vs 3.0 fatigue threshold', 'Sample data — Meta Ads', daysAgo(2)),
    ],
    confirmed: false,
    status: 'proposed',
    createdAt: hoursAgo(40),
  },
  {
    id: 'rec_4',
    businessId: business.id,
    title: 'Reconnect Google Ads before the next reporting window',
    rationale:
      'The Google Ads connection failed its OAuth refresh six days ago. Spend from that account is missing from ROAS, so the reported 2.61x is understated by an unknown amount.',
    impact: 'medium',
    effort: 'low',
    confidence: 1,
    evidence: [
      ev('ev_27', 'Google Ads last sync', '6 days ago', 'Expected: every 6 hours', 'Sample data — connector log', hoursAgo(1)),
    ],
    confirmed: true,
    status: 'proposed',
    createdAt: hoursAgo(3),
  },
  {
    id: 'rec_5',
    businessId: business.id,
    title: 'Test a $49 free-shipping threshold against the current flat-rate offer',
    rationale:
      'Directly tests the mechanism behind recommendation 1 rather than adopting it blind. A/B on the cart block, two arms, primary metric cart-to-purchase.',
    impact: 'medium',
    effort: 'medium',
    confidence: 0.55,
    evidence: [
      ev('ev_28', 'Current average order value', '$412', 'Last 30 days', 'Sample data — Shopify', hoursAgo(2)),
    ],
    confirmed: false,
    status: 'dismissed',
    createdAt: daysAgo(3),
  },
];

/* ---------------------------------------------------------------- *
 * Actions (§65 types, §66 states, §83 autonomy)
 * ---------------------------------------------------------------- */

export const actions: ActionItem[] = [
  {
    id: 'act_1',
    businessId: business.id,
    type: 'adjust_budget',
    title: 'Move $2,700/month from Trail Gear to Brand Search',
    description:
      'Increase Brand Search budget from $3,600 to $6,300 and reduce Trail Gear from $9,000 to $6,300, holding total monthly spend flat.',
    state: 'awaiting_approval',
    risk: 'medium',
    autonomy: 'L1',
    requiresApproval: true,
    createdAt: hoursAgo(16),
    payload: { from_campaign: 'Trail Gear — Paid Social', to_campaign: 'Brand Search — Capture', monthly_delta: 2700 },
  },
  {
    id: 'act_2',
    businessId: business.id,
    type: 'pause_campaign',
    title: 'Pause "Winter Sale 2025 — Retarget"',
    description: 'Campaign ended three weeks ago and is still spending. Zero purchases in the last 14 days.',
    state: 'awaiting_approval',
    risk: 'low',
    autonomy: 'L1',
    requiresApproval: true,
    createdAt: hoursAgo(9),
    payload: { campaign: 'Winter Sale 2025 — Retarget', monthly_waste: 1840 },
  },
  {
    id: 'act_3',
    businessId: business.id,
    type: 'create_experiment',
    title: 'Test $49 free-shipping threshold at the cart',
    description: 'Two-arm test on the cart block. Primary metric: cart-to-purchase rate. Minimum 500 sessions per arm.',
    state: 'approved',
    risk: 'low',
    autonomy: 'L2',
    requiresApproval: true,
    createdAt: daysAgo(1),
    decidedAt: hoursAgo(22),
    decidedBy: user.name,
    payload: { test: 'free_shipping_threshold', arms: 2, min_sessions: 500 },
  },
  {
    id: 'act_4',
    businessId: business.id,
    type: 'send_email',
    title: 'Send free-shipping announcement to winback list',
    description: '12,800 contacts. Suppress anyone who bought in the last 60 days.',
    state: 'rejected',
    risk: 'medium',
    autonomy: 'L1',
    requiresApproval: true,
    createdAt: daysAgo(2),
    decidedAt: daysAgo(1),
    decidedBy: user.name,
    reason: 'We already sent a shipping email this quarter. Do this after the landing page test instead.',
    payload: { list: 'Ex-customer winback', recipients: 12800 },
  },
  {
    id: 'act_5',
    businessId: business.id,
    type: 'update_routing',
    title: 'Route enterprise leads (>200 staff) to Sam directly',
    description: 'Current rule sends everything over $10k to the queue, which averaged 19 hours to first response.',
    state: 'proposed',
    risk: 'low',
    autonomy: 'L0',
    requiresApproval: true,
    createdAt: hoursAgo(4),
    payload: { condition: 'company_size > 200', assignee: 'Sam Okonkwo' },
  },
  {
    id: 'act_6',
    businessId: business.id,
    type: 'adjust_budget',
    title: 'Pause Trail Gear on mobile placements below $2 CPA',
    description: 'Generated automatically at L2 autonomy. No human decision required.',
    state: 'executed',
    risk: 'low',
    autonomy: 'L2',
    requiresApproval: false,
    createdAt: daysAgo(4),
    decidedAt: daysAgo(4),
    decidedBy: 'Automatic (L2)',
    payload: { placement: 'mobile_feed', threshold: 2.0, saved_monthly: 940 },
  },
];

/* ---------------------------------------------------------------- *
 * Experiments (§67: inconclusive is a real verdict)
 * ---------------------------------------------------------------- */

export const experiments: Experiment[] = [
  {
    id: 'ex_1',
    businessId: business.id,
    hypothesis: 'A $49 free-shipping threshold beats flat-rate shipping on cart-to-purchase rate',
    status: 'running',
    primaryMetric: 'Cart-to-purchase rate',
    secondaryMetrics: ['Average order value', 'Support contacts about shipping'],
    variants: [
      { id: 'v_a', name: 'Control — flat rate shown at checkout', traffic: 50 },
      { id: 'v_b', name: 'Variant — $49 free shipping threshold at cart', traffic: 50 },
    ],
    startedAt: daysAgo(6),
  },
  {
    id: 'ex_2',
    businessId: business.id,
    hypothesis: 'Lead with the size guide above the fold on the Boots landing page',
    status: 'concluded',
    primaryMetric: 'Page-to-cart rate',
    secondaryMetrics: ['Return rate'],
    variants: [
      { id: 'v_a', name: 'Control — product photography first', traffic: 50 },
      { id: 'v_b', name: 'Variant — size guide first', traffic: 50 },
    ],
    startedAt: daysAgo(34),
    concludedAt: daysAgo(12),
    result: {
      // Inconclusive on purpose. Three of the four experiments in a demo would
      // come back decisive and the fourth would be noise; showing a genuine
      // inconclusive result is what stops the app from teaching people that
      // experiments always answer the question.
      verdict: 'inconclusive',
      confidence: 0.38,
      primary: [
        { variantId: 'v_a', value: 0.112, delta: 0 },
        { variantId: 'v_b', value: 0.119, delta: 0.007 },
      ],
      narrative:
        'The variant was 0.7 points better, inside the range this traffic can distinguish. Not enough signal to call. Leave the control running and revisit after another 900 sessions.',
    },
  },
  {
    id: 'ex_3',
    businessId: business.id,
    hypothesis: 'Adding customer proof above the fold lifts brand-search landing page conversion',
    status: 'concluded',
    primaryMetric: 'Page-to-lead rate',
    secondaryMetrics: ['Page-to-cart rate'],
    variants: [
      { id: 'v_a', name: 'Control', traffic: 50 },
      { id: 'v_b', name: 'Variant — 3 review quotes added', traffic: 50 },
    ],
    startedAt: daysAgo(58),
    concludedAt: daysAgo(40),
    result: {
      verdict: 'winner',
      confidence: 0.94,
      primary: [
        { variantId: 'v_a', value: 0.068, delta: 0 },
        { variantId: 'v_b', value: 0.094, delta: 0.026 },
      ],
      narrative: 'The variant won by 2.6 points at 94% confidence and shipped. Page-to-cart also rose, with no measurable return-rate change.',
    },
  },
];

/* ---------------------------------------------------------------- *
 * Pages, forms, publish (Phase 7, Slice 1)
 * ---------------------------------------------------------------- */

export const pages: LandingPage[] = [
  {
    id: 'pg_1',
    businessId: business.id,
    name: 'Trail Boots — Spring Sale',
    slug: 'trail-boots-spring',
    status: 'published',
    publishedAt: daysAgo(19),
    updatedAt: daysAgo(19),
    blocks: [
      { id: 'b1', type: 'hero', heading: 'Trail boots that survive the season', subheading: 'Free returns, 60-day wear test, and a waterproof guarantee.', ctaLabel: 'Shop trail boots', ctaHref: '#' },
      { id: 'b2', type: 'proof', items: [{ value: '60-day', label: 'Wear test' }, { value: '4.8/5', label: '2,411 reviews' }, { value: 'Free', label: 'Returns' }] },
      { id: 'b3', type: 'features', items: [{ title: 'Waterproof to the seam', body: 'Taped seams and a gusseted tongue keep water out without slowing you down.' }, { title: 'Built for the descent', body: '4mm lugs and a rock plate that still feels like a shoe on the climb.' }] },
      { id: 'b4', type: 'form', formId: 'form_1', heading: 'Get the fit guide' },
      { id: 'b5', type: 'faq', items: [{ q: 'How does the wear test work?', a: 'Wear them for 60 days on trail. If they fail, we refund in full.' }] },
    ],
  },
  {
    id: 'pg_2',
    businessId: business.id,
    name: 'Free Shipping Threshold',
    slug: 'free-shipping',
    status: 'draft',
    updatedAt: hoursAgo(6),
    blocks: [
      { id: 'b6', type: 'hero', heading: 'Free shipping over $49', subheading: 'No code. No minimum spend games.', ctaLabel: 'Browse the range', ctaHref: '#' },
      { id: 'b7', type: 'form', formId: 'form_1', heading: 'Be first to hear about it' },
      { id: 'b8', type: 'cta', heading: 'Not ready yet?', ctaLabel: 'See the spring range', ctaHref: '#' },
    ],
  },
  {
    id: 'pg_3',
    businessId: business.id,
    name: 'Wholesale — Trailhead Co-op',
    slug: 'wholesale',
    status: 'published',
    publishedAt: daysAgo(74),
    updatedAt: daysAgo(40),
    blocks: [
      { id: 'b9', type: 'hero', heading: 'Wholesale for trail outfitters', subheading: '40-unit minimum, 60-day terms, flat-rate freight.', ctaLabel: 'Request the line sheet', ctaHref: '#' },
      { id: 'b10', type: 'form', formId: 'form_2', heading: 'Request a quote' },
    ],
  },
];

export const forms: Form[] = [
  {
    id: 'form_1',
    businessId: business.id,
    name: 'Fit guide request',
    submitLabel: 'Send me the fit guide',
    successMessage: 'On its way. Check your email in a few minutes.',
    fields: [
      { id: 'ff1', name: 'email', label: 'Email address', type: 'email', required: true },
      { id: 'ff2', name: 'size', label: 'Your usual size', type: 'select', required: false, options: ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'] },
      { id: 'ff3', name: 'notes', label: 'Anything we should know?', type: 'textarea', required: false },
    ],
  },
  {
    id: 'form_2',
    businessId: business.id,
    name: 'Wholesale quote',
    submitLabel: 'Request quote',
    successMessage: 'Quote request received. We reply within one business day.',
    fields: [
      { id: 'ff4', name: 'name', label: 'Your name', type: 'text', required: true },
      { id: 'ff5', name: 'email', label: 'Work email', type: 'email', required: true },
      { id: 'ff6', name: 'company', label: 'Company', type: 'text', required: true },
      { id: 'ff7', name: 'units', label: 'Estimated units per order', type: 'text', required: false },
      { id: 'ff8', name: 'terms', label: 'I am a registered business', type: 'checkbox', required: true },
    ],
  },
];

/* ---------------------------------------------------------------- *
 * Events and audit
 * ---------------------------------------------------------------- */

export const events: ProductEvent[] = [
  { id: 'e1', name: 'page.published', workspaceId: workspace.id, actorId: user.id, at: daysAgo(19), properties: { page: 'Trail Boots — Spring Sale', version: 3 } },
  { id: 'e2', name: 'form.submitted', workspaceId: workspace.id, actorId: 'anon', at: hoursAgo(7), properties: { form: 'Wholesale quote', page: 'Wholesale — Trailhead Co-op' } },
  { id: 'e3', name: 'recommendation.accepted', workspaceId: workspace.id, actorId: user.id, at: hoursAgo(22), properties: { recommendation: 'Test a $49 free-shipping threshold' } },
  { id: 'e4', name: 'action.approved', workspaceId: workspace.id, actorId: user.id, at: hoursAgo(22), properties: { action: 'Test $49 free-shipping threshold at the cart' } },
  { id: 'e5', name: 'experiment.started', workspaceId: workspace.id, actorId: user.id, at: daysAgo(6), properties: { experiment: 'Free shipping threshold' } },
  { id: 'e6', name: 'integration.connected', workspaceId: workspace.id, actorId: user.id, at: daysAgo(180), properties: { provider: 'Shopify' } },
  { id: 'e7', name: 'funnel.stage.added', workspaceId: workspace.id, actorId: user.id, at: daysAgo(9), properties: { funnel: 'Email — Winback', stage: 'Purchase' } },
  { id: 'e8', name: 'insight.viewed', workspaceId: workspace.id, actorId: user.id, at: hoursAgo(20), properties: { insight: 'Cart abandonment on mobile nearly doubled' } },
];

export const auditLog: AuditEntry[] = [
  { id: 'au1', workspaceId: workspace.id, actorId: user.id, actorName: user.name, action: 'published page version 3', entity: 'LandingPage', entityId: 'pg_1', at: daysAgo(19), metadata: { blocks: '5' } },
  { id: 'au2', workspaceId: workspace.id, actorId: user.id, actorName: user.name, action: 'approved action', entity: 'ActionItem', entityId: 'act_3', at: hoursAgo(22), metadata: { type: 'create_experiment' } },
  { id: 'au3', workspaceId: workspace.id, actorId: user.id, actorName: user.name, action: 'rejected action', entity: 'ActionItem', entityId: 'act_4', at: daysAgo(1), metadata: { reason: 'Already sent a shipping email this quarter' } },
  { id: 'au4', workspaceId: workspace.id, actorId: 'sys', actorName: 'Automatic (L2)', action: 'executed action', entity: 'ActionItem', entityId: 'act_6', at: daysAgo(4), metadata: { saved_monthly: '940' } },
  { id: 'au5', workspaceId: workspace.id, actorId: user.id, actorName: user.name, action: 'dismissed recommendation', entity: 'Recommendation', entityId: 'rec_5', at: daysAgo(3), metadata: {} },
  { id: 'au6', workspaceId: workspace.id, actorId: 'sys', actorName: 'Connector', action: 'sync failed', entity: 'Integration', entityId: 'int_googleads', at: daysAgo(6), metadata: { reason: 'OAuth refresh failed' } },
];
