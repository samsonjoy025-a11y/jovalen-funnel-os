/**
 * The typed client.
 *
 * One place knows how to reach the API. Screens call `api.leads.list({...})`
 * and get a typed `LeadPage`; they never construct a URL, never call `fetch`,
 * and never guess a query-parameter name. That is the point — a second screen
 * inventing its own path is how a 404 becomes a two-day mystery.
 */

import type {
  ActionItem,
  ActionState,
  Audience,
  Business,
  ClaimType,
  Envelope,
  Experiment,
  Form,
  Funnel,
  GapAnalysis,
  Goal,
  Insight,
  IntegrationAccount,
  IntegrationState,
  IntegrationTransitionTable,
  LandingPage,
  Lead,
  LeadActivity,
  LeadStage,
  Metric,
  OnboardingState,
  ProductEvent,
  Recommendation,
  Role,
  StageDetail,
} from '@funnelos/contracts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, string>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE = (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE ?? '/api/v1';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  const res = await fetch(`${BASE}${path}`, {
    method,
    signal,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text === '' ? undefined : JSON.parse(text);
  } catch {
    // A non-JSON body on an error path means something in front of the API
    // answered instead — a proxy, a dev server that 404'd to HTML. Saying so
    // is more use than "Unexpected token <".
    throw new ApiError(res.status, 'non_json_response', `Expected JSON from ${path} but got ${text.slice(0, 80)}`);
  }

  if (!res.ok) {
    const err = (parsed as { error?: { code: string; message: string; details?: Record<string, string>; requestId?: string } }).error;
    throw new ApiError(res.status, err?.code ?? 'unknown', err?.message ?? `Request failed: ${res.status}`, err?.details, err?.requestId);
  }

  return (parsed as Envelope<T>).data;
}

/* ------------------------------------------------------------------ *
 * Read models that live in one service but are joined for a screen.
 * Declared here rather than imported from apps/api so the client does not
 * depend on the server implementation.
 * ------------------------------------------------------------------ */

export interface Session {
  user: { id: string; email: string; name: string; role: Role };
  workspace: { id: string; name: string; industry?: string };
  role: Role;
  businessId: string;
  availableRoles: readonly Role[];
}

export interface GapRow extends GapAnalysis {
  shortfall: number;
  ratioOfPlan: number;
}

export interface LeadPage {
  rows: Lead[];
  total: number;
  page: number;
  pageSize: number;
  summary: { totalValue: number; avgScore: number; byStage: Record<LeadStage, number> };
}

export interface Overview {
  metrics: Metric[];
  insufficient: Metric[];
  series: Array<{ label: string; series: { label: string; values: number[] } }>;
  goalProgress: Array<{ id: string; name: string; metric: string; target: number; current: number; pct: number; status: string }>;
  counts: { funnels: number; leads: number; openActions: number; newInsights: number; publishedPages: number };
  sampleData: { isSample: true; providers: string[]; incomplete: string[] };
}

export interface RankedRecommendation extends Recommendation {
  priority: number;
  priorityBand: 'do-now' | 'plan' | 'skip';
}

export interface LeadQueryParams {
  page?: number;
  pageSize?: number;
  sort?: 'name' | 'company' | 'stage' | 'score' | 'value' | 'createdAt' | 'lastActivityAt';
  dir?: 'asc' | 'desc';
  stage?: LeadStage;
  q?: string;
}

/* ------------------------------------------------------------------ *
 * The surface.
 * ------------------------------------------------------------------ */

const qs = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') search.set(k, String(v));
  const s = search.toString();
  return s ? `?${s}` : '';
};

export const api = {
  session: {
    get: (signal?: AbortSignal) => request<Session>('/session', { signal }),
    setRole: (role: Role) => request<Session>('/session/role', { method: 'POST', body: { role } }),
  },

  business: {
    get: (signal?: AbortSignal) => request<Business>('/business', { signal }),
    update: (changes: Partial<Business>) => request<Business>('/business', { method: 'PATCH', body: changes }),
  },

  goals: {
    list: (signal?: AbortSignal) => request<Goal[]>('/goals', { signal }),
    update: (id: string, changes: Partial<Goal>) => request<Goal>(`/goals/${id}`, { method: 'PATCH', body: changes }),
  },

  audiences: {
    list: (signal?: AbortSignal) => request<Audience[]>('/audiences', { signal }),
  },

  onboarding: {
    get: (signal?: AbortSignal) => request<OnboardingState>('/onboarding', { signal }),
  },

  funnels: {
    list: (signal?: AbortSignal) => request<Funnel[]>('/funnels', { signal }),
    get: (id: string, signal?: AbortSignal) => request<Funnel>(`/funnels/${id}`, { signal }),
    stageDetail: (funnelId: string, stageId: string, signal?: AbortSignal) =>
      request<StageDetail>(`/funnels/${funnelId}/stages/${stageId}`, { signal }),
  },

  gaps: {
    list: (funnelId?: string, signal?: AbortSignal) => request<GapRow[]>(`/gaps${qs({ funnelId })}`, { signal }),
  },

  leads: {
    list: (params: LeadQueryParams = {}, signal?: AbortSignal) =>
      request<LeadPage>(`/leads${qs({ ...params })}`, { signal }),
    get: (id: string, signal?: AbortSignal) => request<Lead>(`/leads/${id}`, { signal }),
    activity: (id: string, signal?: AbortSignal) => request<LeadActivity[]>(`/leads/${id}/activity`, { signal }),
    update: (id: string, changes: Partial<Lead>) => request<Lead>(`/leads/${id}`, { method: 'PATCH', body: changes }),
  },

  metrics: {
    list: (signal?: AbortSignal) => request<Metric[]>('/metrics', { signal }),
  },

  overview: {
    get: (signal?: AbortSignal) => request<Overview>('/overview', { signal }),
  },

  integrations: {
    list: (signal?: AbortSignal) => request<IntegrationAccount[]>('/integrations', { signal }),
    /**
     * §70's state machine, straight from the service. The Integrations page
     * renders its buttons from this rather than from a local copy, so a
     * button can never offer a transition the API will reject.
     */
    transitions: (signal?: AbortSignal) =>
      request<IntegrationTransitionTable>('/integrations/transition-table', { signal }),
    transition: (id: string, to: IntegrationState) =>
      request<IntegrationAccount>(`/integrations/${id}/transition`, { method: 'POST', body: { to } }),
  },

  insights: {
    list: (includeDismissed = false, signal?: AbortSignal) =>
      request<Insight[]>(`/insights${qs({ includeDismissed: includeDismissed ? 'true' : undefined })}`, { signal }),
    dismiss: (id: string) => request<Insight>(`/insights/${id}/dismiss`, { method: 'POST', body: {} }),
    restore: (id: string) => request<Insight>(`/insights/${id}/restore`, { method: 'POST', body: {} }),
  },

  recommendations: {
    list: (includeDismissed = false, signal?: AbortSignal) =>
      request<RankedRecommendation[]>(`/recommendations${qs({ includeDismissed: includeDismissed ? 'true' : undefined })}`, { signal }),
    accept: (id: string) => request<RankedRecommendation>(`/recommendations/${id}/accept`, { method: 'POST', body: {} }),
    dismiss: (id: string) => request<RankedRecommendation>(`/recommendations/${id}/dismiss`, { method: 'POST', body: {} }),
    confirm: (id: string) => request<RankedRecommendation>(`/recommendations/${id}/confirm`, { method: 'POST', body: {} }),
  },

  actions: {
    list: (state?: ActionState, signal?: AbortSignal) => request<ActionItem[]>(`/actions${qs({ state })}`, { signal }),
    get: (id: string, signal?: AbortSignal) => request<ActionItem>(`/actions/${id}`, { signal }),
    approve: (id: string) => request<ActionItem>(`/actions/${id}/approve`, { method: 'POST', body: {} }),
    reject: (id: string, reason: string) => request<ActionItem>(`/actions/${id}/reject`, { method: 'POST', body: { reason } }),
    execute: (id: string) => request<ActionItem>(`/actions/${id}/execute`, { method: 'POST', body: {} }),
  },

  experiments: {
    list: (signal?: AbortSignal) => request<Experiment[]>('/experiments', { signal }),
    get: (id: string, signal?: AbortSignal) => request<Experiment>(`/experiments/${id}`, { signal }),
  },

  pages: {
    list: (signal?: AbortSignal) => request<LandingPage[]>('/pages', { signal }),
    get: (id: string, signal?: AbortSignal) => request<LandingPage>(`/pages/${id}`, { signal }),
    update: (id: string, changes: Partial<LandingPage>) => request<LandingPage>(`/pages/${id}`, { method: 'PATCH', body: changes }),
    publish: (id: string) => request<LandingPage>(`/pages/${id}/publish`, { method: 'POST', body: {} }),
  },

  forms: {
    list: (signal?: AbortSignal) => request<Form[]>('/forms', { signal }),
    get: (id: string, signal?: AbortSignal) => request<Form>(`/forms/${id}`, { signal }),
  },

  audit: {
    list: (signal?: AbortSignal) =>
      request<Array<{ id: string; workspaceId: string; actorId: string; actorName: string; action: string; entity: string; entityId: string; at: string; metadata: Record<string, string> }>>('/audit', { signal }),
  },

  events: {
    list: (signal?: AbortSignal) => request<ProductEvent[]>('/events', { signal }),
  },

  activity: {
    list: (signal?: AbortSignal) =>
      request<Array<{ id: string; at: string; who: string; what: string }>>('/activity', { signal }),
  },
} as const;

export type Api = typeof api;

/**
 * Re-exported so callers can branch on the claim type (§60) without adding a
 * direct dependency on `@funnelos/contracts` for one union.
 *
 * `export type`, not `export` — `verbatimModuleSyntax` is on, and a value
 * re-export of a type-only binding is an error rather than a silent no-op.
 */
export type { ClaimType };
