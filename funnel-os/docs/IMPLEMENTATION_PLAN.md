# Full-Stack Funnel Marketing OS — Microservices Implementation Plan

> **SUPERSEDED — do not implement from this document.**
> Replaced by **`IMPLEMENTATION_PLAN_v2.md`**, which leads with architectural decisions and the design system before any feature or infrastructure work. This file is retained only as a record of the earlier ordering. Where the two differ, v2.0 wins.

**Source of truth:** `FULL-STACK FUNNEL MARKETING OS Complete Product Requirements, UX and Functional Specification Version 1.0.md`
**Stack:** NestJS (TypeScript) + PostgreSQL + Redis/BullMQ microservices · Python/FastAPI AI services · Next.js 15 frontend
**Repo location:** `funnel-os/` (new top-level folder; existing Jovalen Business OS untouched)
**Status:** Plan v1.0 — for approval before Phase 0 starts

---

## 1. How to read this plan

This plan decomposes the PRD's 10 build phases (§118) into **12 delivery phases** with:

- a **goal** tied to specific PRD sections
- the **services created or modified**
- **concrete outputs** — exact repo paths, endpoints, tables, packages
- an **exit gate** that must pass before the next phase starts
- **PRD traceability** so no requirement is silently dropped

Three PRD constraints shaped everything below:

| PRD constraint | Plan consequence |
|---|---|
| §108/§109 — build what's central, connect what's specialist | Build Mode is data/event-native from Phase 5, so Optimize Mode has a real pipeline to read from |
| §90/§91 — all long work is async | Redis + BullMQ are Phase 0 infrastructure, not retrofitted in Phase 9 |
| §117 — no fabricated data, metrics, or connections | `sufficiency` gate in the AI contract, forbidden-claim scanner, connector fixtures that are *labelled* as fixtures |

---

## 2. Non-negotiable architecture rules (enforced by CI)

You asked for microservices, not a monolith with folders. These six rules are machine-enforced, not conventions.

| # | Rule | CI enforcement |
|---|---|---|
| **A1** | A service may not import another service's source code. Cross-service communication is **HTTP or events only**. | `dependency-cruiser` rule set + ESLint `no-restricted-imports` per service. CI fails on violation. |
| **A2** | Each service owns its schema. No service reads/writes another service's tables. | CI check: every `prisma/schema.prisma` model is registered to exactly one service in `services.manifest.yaml`. Cross-schema grants denied in Postgres. |
| **A3** | Every service builds, tests, and runs standalone with all other services stopped. | Each service has its own CI job running `docker compose up <its-deps>` only, plus mocked contract tests. |
| **A4** | Every service has its own Dockerfile, health check, OpenAPI doc, and deployable. | `pnpm gen:manifest` diffs the manifest against the filesystem; CI fails if a service is missing a Dockerfile, `/health`, or `/docs`. |
| **A5** | Tenant context is never client-supplied. The gateway mints it from a verified JWT; services reject requests without it. | A `TenantScopeInterceptor` is registered globally in the service template and throws if `x-tenant-id` is absent. Postgres RLS is layer 2. |
| **A6** | No service holds secrets. All config comes from a zod-validated env schema; integration tokens are envelope-encrypted. | `secretlint` + a CI grep gate that fails on any committed `.env` with a non-empty value, and on any hardcoded API key pattern. |

**Definition of "still microservices" at Phase 11 exit** — all must be true:

- [ ] 18 independently deployable images, each with its own resource limits
- [ ] Killing any single service degrades gracefully (does not cascade) — verified by a fault-injection test
- [ ] No service needs a schema migration owned by another team boundary
- [ ] Horizontal scale: event ingestion, analytics, and AI each scale on their own axis
- [ ] The aggregate deployment surface spans ≥ 3 container groups (control plane, data plane, workers)

---

## 3. Service topology

18 deployables. Each is a separate codebase boundary, schema, and process; several will be thin early, which is intentional — the boundary is established once and never crossed.

### Tier 0 — Platform (no business domain)

| Service | Port | Owns | Purpose |
|---|---|---|---|
| `api-gateway` | 3000 | — | Only public entry point. JWT verification, rate limiting, routing, BFF aggregation, webhook ingress, trace propagation |
| `packages/shared` | — | — | Nest core: tenant interceptor, RBAC guard, RFC-9457 errors, pagination, logger, zod env config |
| `packages/event-contracts` | — | — | Canonical event types (§72, §73) as zod + JSON Schema, versioned |
| `packages/connector-sdk` | — | — | Connector interface, OAuth helpers, fixture runner, contract-test harness |
| `packages/ui` | — | — | shadcn/ui design system + tokens (§116.3) |
| `packages/tracking` | — | — | Browser tracking SDK, offline-buffered, cookieless-first |

### Tier 1 — Foundation

| Service | Port | Owns |
|---|---|---|
| `identity-service` | 3101 | User, Session, Workspace, Membership, Role (§71) |
| `business-service` | 3102 | Business, BusinessProfile, Audience, GrowthGoal, CurrentSetup, FunnelAssessment, OnboardingState |
| `audit-service` | 3103 | AuditLog (§84) — append-only, event-consumed |

### Tier 2 — Build Mode spine

| Service | Port | Owns |
|---|---|---|
| `funnel-service` | 3110 | Funnel, FunnelStage, FunnelBlueprint, FunnelComponent, GapAnalysis |
| `page-service` | 3111 | LandingPage, PageVersion, Form, FormField, Asset, PublishRecord |
| `event-service` | 3112 | Event, AnonymousIdentity, Conversion — high-throughput ingestion |
| `analytics-service` | 3113 | ClickHouse event store, Metric, FunnelMetric, Rollup, DataQualityIssue, SourceFreshness |
| `lead-service` | 3114 | Lead, Customer, Opportunity, LeadActivity, ScoreRule, RoutingRule |
| `workflow-service` | 3115 | Workflow, WorkflowStep, WorkflowRun |

### Tier 3 — Connect

| Service | Port | Owns |
|---|---|---|
| `integration-service` | 3120 | Integration, IntegrationAccount, SyncJob, SyncError, RawRecord |
| `connector-worker` | 3121 | Connector processes (6 providers), one process per provider family, same codebase as `integration-service` |

### Tier 4 — Intelligence

| Service | Port | Owns |
|---|---|---|
| `insight-service` | 3130 | Insight, MarketingHealth |
| `recommendation-service` | 3131 | Recommendation, Learning |
| `ai-service` | 3132 | **Python/FastAPI.** Analyst chat, content generation, planner, tool permission layer |

### Tier 5 — Act & Measure

| Service | Port | Owns |
|---|---|---|
| `action-service` | 3140 | Action, Approval, ActionExecution |
| `notification-service` | 3141 | Notification, Preference |
| `experiment-service` | 3142 | Experiment, Variant, Exposure, ExperimentResult |

### Data ownership map (enforces rule A2)

| PRD §71 entity | Owning service | Store |
|---|---|---|
| User, Session, Workspace, Membership, Role | identity-service | PG `identity` |
| Business, Audience, Goal, FunnelAssessment, OnboardingState | business-service | PG `business` |
| Funnel, FunnelStage, FunnelBlueprint, FunnelComponent, GapAnalysis | funnel-service | PG `funnel` |
| LandingPage, PageVersion, Form, FormField, PublishRecord | page-service | PG `page` |
| Lead, LeadScoreRule, RoutingRule, LeadActivity | lead-service | PG `lead` |
| Customer, Opportunity | lead-service | PG `lead` |
| Campaign, Event, Conversion, Revenue, Metric | event-service → analytics-service | ClickHouse `events` |
| Insight | insight-service | PG `insight` |
| Recommendation, Learning | recommendation-service | PG `recommendation` |
| Action | action-service | PG `action` |
| Experiment, ExperimentResult | experiment-service | PG `experiment` |
| Workflow, WorkflowStep | workflow-service | PG `workflow` |
| Notification | notification-service | PG `notification` |
| Integration, IntegrationAccount | integration-service | PG `integration` |
| AuditLog | audit-service | PG `audit` |
| ProductEvent (§94) | business-service → ClickHouse `product` | ClickHouse |

> **Note on "where does Campaign live":** raw ad-platform campaign objects are normalised by `connector-worker` and written to ClickHouse as `campaign_*` events. The app never persists a mutable campaign row — ad platforms remain the system of record, per §107/§109.

---

## 4. Platform decisions (ADRs to be written in Phase 0)

| Decision | Choice | Rationale | Revisit when |
|---|---|---|---|
| D1 Monorepo | pnpm workspaces + Turborepo, single repo | NestJS + Python + Next.js must version-lock together and deploy atomically. Python excluded from the pnpm glob via `!services/ai-service` | Never (for this size) |
| D2 Service transport | **HTTP** (REST/JSON) | Synchronous request/response dominates the product; gRPC adds a debugging tax with no MVP benefit | Inter-service p95 > 40ms |
| D3 Event backbone | **Redis Streams** + transactional outbox | Already needed for BullMQ. Outbox gives at-least-once delivery with no distributed-transaction risk. Per-domain streams, consumer groups, dead-letter | Throughput > 50k events/s or > 7-day retention needed → Kafka |
| D4 Event store | **ClickHouse** (control plane stays in PG) | Columnar OLAP is the right tool for event aggregation, funnels, and breakdowns. Postgres JSONB aggregation will not survive §55's dimension matrix | Never for MVP |
| D5 Auth | **External OIDC** (Keycloak dev / Auth0 prod) via authorization code + PKCE | §81 requires secure OAuth; do not hand-roll password auth in an MVP that will be public | If a customer requires on-prem SSO |
| D6 Cross-cutting writes | Event-based fan-out, not sync HTTP | Audit and notification must never block or fail a domain write | — |
| D7 AI grounding | AI service has **no database access**; it calls a read-only `/internal/ai/context` endpoint | Makes §61 ("never fabricate metrics") and §82 (no unrestricted AI access) structurally true rather than a prompt instruction | — |
| D8 Local orchestration | Docker Compose (dev) → Kubernetes + Helm (prod, Phase 11) | — | — |

### The three contracts everything else depends on

**Event envelope** — `packages/event-contracts/src/envelope.ts`

```ts
export type EventEnvelope<TType extends string, TData = unknown> = {
  id: string;              // uuid v7 — the idempotency key
  type: TType;             // 'funnel.lead_qualified' — PRD §73 name, namespaced
  version: number;         // additive-only; breaking → v2 alongside v1
  tenantId: string;
  businessId: string;
  occurredAt: string;      // ISO-8601 UTC
  actor: { type: 'user' | 'system' | 'integration'; id: string };
  traceId: string;
  schemaRef: string;       // 'funnel.lead_qualified@1'
  data: TData;             // validated by the zod schema registered for schemaRef
};
```

**Delivery guarantees** — at-least-once. Every consumer owns a `processed_events` table keyed on `id`; every handler is written to be idempotent. No exactly-once claims anywhere in the code or docs.

**AI context contract** — `analytics-service` `GET /internal/ai/context`

```jsonc
{
  "funnel":    [{ "stage": "lead", "volume": 412, "conversionFromPrev": 0.031, "trend": -0.08 }],
  "metrics":   { "visitors": 13200, "leads": 412, "qualifiedLeads": 96, "customers": 14, "revenue": 48200 },
  "deltas":    [{ "metric": "leads", "deltaPct": -0.12, "window": "7d" }],
  "sources":   [{ "id": "ga4", "status": "synced", "freshness": "2h" }],
  "dataQuality": [{ "type": "missing_campaign_attribution", "severity": "medium" }],
  "sufficiency": {
    "sufficient": true,
    "reasons": [],
    "confidenceCap": 0.8,          // freshness penalty per §75
    "rowCount": 1840
  },
  "generatedAt": "2026-09-27T12:00:00Z"
}
```

`sufficiency.sufficient === false` makes the AI service **obligated** to return "I don't have enough data to answer that reliably" (§61). A unit test asserts this, so it cannot be bypassed by a prompt change.

---

## 5. Phase summary and gates

| Phase | Weeks | Name | Gate — must be demonstrable |
|---|---|---|---|
| **0** | 1–2 | Monorepo & Platform Foundation | `pnpm install && pnpm dev` brings up the full infra stack; service template passes the full CI pipeline |
| **1** | 2–4 | Identity, Tenancy & Gateway | Signup → workspace → RBAC enforced → **cross-tenant access returns 404** → every mutation audited |
| **2** | 4–5 | Public Experience & Design System | All 12 PRD §38 homepage sections + 12 §36 routes live, passing a11y and Lighthouse budgets |
| **3** | 5–6 | Business Context & Onboarding | New user completes ONB-01→07 and is routed to **Build / Optimize / Hybrid** with an explainable, persisted assessment |
| **4** | 6–7 | Funnel Spine, Blueprint, Gap Analysis | A business with nothing gets a generated, editable blueprint + ranked gaps + **visible planning assumptions** (§104) |
| **5** | 7–9 | **Vertical Slice 1** — Pages, Forms, Publish | Publish a page → real `page_view` + `form_submitted` land in ClickHouse with correct attribution |
| **6** | 9–10 | Leads, Qualification, Routing, Nurture | Submission → lead → scored → qualified → routed → owned → 3-email sequence executed and tracked |
| **7** | 10–12 | **Vertical Slice 2** — Integrations & Sync | 6 sources connected (or labelled fixtures), sync visible with progress/errors, unified funnel shows Build + external data |
| **8** | 12–14 | Insights, AI Analyst, Recommendations | "Why did my leads decrease?" returns a cited, structured answer; recommendations carry all 9 §64 fields |
| **9** | 14–15 | Action Center & Approvals | Recommendation → Action → approved → executed → audited → notified → result measurable |
| **10** | 15–16 | **Vertical Slice 3** — Experiments & Learning | Experiment runs end-to-end with a significance verdict and a retrievable learning record |
| **11** | 16–18 | Hardening & Production | All 3 slices pass in CI on a prod-like stack; §115 Definition of Done enforced per PR |

**Vertical slice gates are non-negotiable stop points.** If Slice 1 (§119) is not demonstrable at the end of Phase 5, phases 6–11 do not start. Building integrations before the Build loop closes is the single most likely way this project produces a demo instead of a product.

> **Assumption:** 3–4 engineers, one of whom owns the AI service. At 2 engineers, expect ~26 weeks by holding the same phase order and cutting the phase-11 hardening scope last.

---

# PHASE 0 — Monorepo & Platform Foundation
**Weeks 1–2 · PRD refs: §71, §72, §73, §80, §81, §90, §91, §92, §93, §116**

## Goal
A repo where adding a service is a 5-minute, fully-wired operation, and where the platform guarantees (event contract, tenant context, error envelope, async jobs, observability) exist before a single business feature is written.

## Outputs

**Repo skeleton**
```
funnel-os/
├─ apps/web/                        # Next.js 15 placeholder, built in Phase 2
├─ packages/
│  ├─ shared/                       # @funnelos/shared
│  ├─ event-contracts/
│  ├─ connector-sdk/
│  ├─ ui/
│  ├─ tracking/
│  └─ config/                       # eslint, tsconfig, prettier, tailwind presets
├─ services/                        # 17 Node microservices
│  └─ ai-service/                   # Python/FastAPI (excluded from pnpm glob)
├─ infra/
│  ├─ docker-compose.yml
│  ├─ docker-compose.dev.yml
│  ├─ prometheus/ grafana/ otel/ mailpit/
│  └─ fixtures/connectors/          # recorded provider payloads (Phase 7)
├─ tools/
│  ├─ service-template/             # the generator all services come from
│  ├─ gen-manifest/
│  └─ gen-openapi/
├─ docs/adr/ · docs/architecture/ · docs/runbooks/
└─ services.manifest.yaml
```

**`packages/shared`** — the Nest core every service extends:
```
src/
├─ tenant/  tenant-context.decorator.ts · tenant-scope.interceptor.ts · rls.sql
├─ auth/    permission.enum.ts · require-permissions.decorator.ts · rbac.guard.ts
├─ errors/  problem-details.ts (RFC 9457) · domain-error.ts · error-codes.ts
├─ http/    zod-validation.pipe.ts · cursor-pagination.ts · idempotency.interceptor.ts
├─ events/  outbox.ts · event-relay.consumer.ts · processed-events.ts · bus.ts
├─ jobs/    bullmq.module.ts · job.base.ts · retry-policy.ts
├─ obs/     pino-logger.ts · otel-bootstrap.ts · health.controller.ts
└─ config/  env.schema.ts (zod) · config.module.ts
```

**`packages/event-contracts`** — all 17 canonical events from PRD §73, each as zod schema + generated JSON Schema + `.d.ts`, plus the envelope, plus a `SCHEMA_REGISTRY` and a compatibility checker that fails CI on a breaking change to a published `version`.

**Infrastructure** — `docker-compose.yml`: Postgres 16, Redis 7, ClickHouse, Keycloak, Mailpit, MinIO, OTel Collector, Prometheus, Grafana, Jaeger, Loki. Health-gated startup, named volumes, `.env.example` with **empty values only** (rule A6).

**`services.manifest.yaml`** — one entry per service: name, port, language, owns (schema list), depends_on (service names + infra), Dockerfile path, OpenAPI path, health path, phase introduced. Powers `/api/health` topology, the service catalogue doc, and CI rule A4.

**`tools/service-template`** — the generator. Produces a service with: Nest module wiring, tenant interceptor, RBAC guard, error filter, outbox relay, health + OpenAPI endpoints, Dockerfile, CI job, Vitest + Testcontainers harness, and a test that fails if you delete the tenant interceptor.

**CI (GitHub Actions)** — `install → lint → typecheck → boundary-check (A1) → manifest-check (A2/A4) → per-service-test (A3) → contract-tests → build → image scan → secret scan`.

**ADRs** — `docs/adr/0001-service-decomposition.md` … `0008-ai-grounding.md`, one per decision in §4.

## Exit gate
- [ ] `pnpm install && pnpm dev` starts all infra; `pnpm gen:service scaffold-service` produces a service that passes every CI stage
- [ ] A canonical event round-trips: publish to a Redis stream → consumer group persists → `processed_events` blocks the duplicate
- [ ] CI fails on a deliberate A1 violation (cross-service import) and on a deliberate A6 violation (committed secret)
- [ ] All 8 ADRs accepted and merged

---

# PHASE 1 — Identity, Tenancy & Gateway
**Weeks 2–4 · PRD refs: §39, §71, §78, §79, §80, §81, §84, §94**

## Goal
One entry point, one identity, and a tenant boundary that is *provably* unbroken. Everything after this phase assumes it holds.

## Services: `api-gateway`, `identity-service`, `audit-service`

## Outputs

**`api-gateway`** (NestJS, port 3000)
```
src/
├─ auth/        jwt-verifier.service.ts (JWKS + rotation) · pkce.guard.ts
├─ routing/     route.registry.ts (path prefix → upstream) · service-discovery.ts
├─ middleware/  rate-limit (Redis-backed, per tenant) · trace-id · security-headers
│               tenant-context.middleware.ts (mints x-tenant-id/x-user-id/x-roles)
│               correlation.ts (propagates traceparent + x-trace-id)
├─ bff/         app-shell.bff.ts (one round trip for sidebar, counts, health)
├─ webhooks/    webhook-ingress.controller.ts (signature verification, §81)
└─ health/      topology endpoint from services.manifest.yaml
```
- Route registry is **declarative** (a YAML/TS table of prefix → service → auth required), so adding a service endpoint is a config change reviewed in one file.
- OIDC authorization code + PKCE, state + nonce validation, refresh-token rotation with reuse detection.
- Rate limits: 300 req/min per tenant, 10 req/min per IP on auth routes, 1000 events/min per tenant on ingestion.

**`identity-service`**
```
prisma/schema.prisma     User · Session · Workspace · Membership · Role · Invitation
src/
├─ auth/       signup.service.ts · oidc.service.ts · session.service.ts · passwordless.ts
├─ rbac/       permission.enum.ts (mirrors shared) · policy.ts · role-matrix.ts
├─ team/       invitations · membership CRUD · role changes
├─ internal/   verify.controller.ts (token introspection for the gateway)
└─ security/   rls-migration.ts (applies tenant policies to every tenant table)
```
- Role matrix per §79: Owner / Admin / Member / Viewer, encoded as a permission enum so custom roles are additive later.
- `permission-matrix.test.ts` — a full cross-product test asserting every (role, permission) pair.
- `tenant-isolation.test.ts` — the negative test: tenant A's token against tenant B's resource IDs must return **404, never 403 and never data**.

**`audit-service`** (§84)
- Consumes the event bus; appends `AuditLog` rows (actor, action, timestamp, object, result, tenant) for the §84 event list.
- `GET /v1/audit` with filters + CSV export.
- Append-only: no update or delete endpoint exists, enforced by Postgres permissions.

**`business-service` (skeleton only)** — Business row created on workspace creation so every later service can assume a business exists.

## Exit gate
- [ ] Signup → OIDC session → workspace → invite member → role change, all audited
- [ ] Cross-tenant negative test passes across 40 generated scenarios
- [ ] Gateway returns 502 (not a hang) when any upstream service is killed; the request never reaches the wrong service
- [ ] `pnpm gen:openapi` produces a valid aggregated spec

---

# PHASE 2 — Public Experience & Design System
**Weeks 4–5 · PRD refs: §36, §37, §38, §85, §86, §87**

## Goal
A design system and a public site built on it, so that Phase 3+ screens are assembly rather than invention — and so §115's "design system exists" is satisfied by the second week of real product work.

## Outputs

**`apps/web`** — Next.js 15 App Router, React 19, TypeScript strict, Tailwind v4, shadcn/ui
```
src/app/
├─ (marketing)/   page.tsx (§37–38) · product/ · how-it-works/ · solutions/
│                 pricing/ · resources/ · about/ · contact/ · privacy/ · terms/
├─ (auth)/        login/ · signup/
├─ (os)/          # Marketing OS shell — §52 nav, built per-phase from Phase 3 on
└─ api/           # BFF route handlers → gateway, one thin handler per domain
```

**`packages/ui`** — tokens (colour, type scale, spacing, radius, motion, dark mode), 25 composite components, form primitives with accessible error association, data-table with keyboard navigation, chart wrapper that **always** renders a textual summary (§86), empty/loading/error state primitives (§87).

**Homepage** — all 12 §38 sections in order, with the §37 hero and the exact primary message: *"Build your funnel. Connect your marketing. Find what's limiting growth. Keep improving."* Both modes explained.

**Accessibility baseline** — focus-visible tokens, semantic landmarks, skip link, ≥ 4.5:1 contrast in both themes, reduced-motion support, `axe` in CI with zero serious violations.

**Performance budget** — Lighthouse ≥ 95 performance / ≥ 95 accessibility on the marketing routes; documented in `apps/web/lighthouserc.json`.

## Exit gate
- [ ] All 12 §36 routes deploy and pass Lighthouse + axe
- [ ] Design system documented; a new screen can be built with no new bespoke CSS
- [ ] Responsive at 360 / 768 / 1440 with no layout breaks

---

# PHASE 3 — Business Context & Onboarding
**Weeks 5–6 · PRD refs: §15, §16, §20, §40–§48, §50, §74, §94, §101, §103**

## Goal
Convert an anonymous signup into a **classified, explained** marketing state with a recommended path. This is the fork in the road for the whole product.

## Service: `business-service`

## Outputs

**Schema** — `Business`, `BusinessProfile` (§42), `Audience` (§43), `GrowthGoal` (§44), `CurrentSetup` (§45 checklist inventory), `FunnelAssessment` (§46), `OnboardingState`, `ProductEvent` sink.

**Onboarding state machine** — `src/onboarding/onboarding.fsm.ts`
```
WELCOME → BUSINESS_SETUP → AUDIENCE → GOAL → CURRENT_SETUP → ASSESSMENT → RECOMMENDED_PATH
```
- Resumable: state persisted server-side, so a user can leave and return.
- Per-step server-side validation; the client never owns the sequence.
- Emits §94 events: `signup_completed`, `business_created`, `goal_defined`, `funnel_assessment_completed`, and `build_mode_selected` / `optimize_mode_selected` / `hybrid_mode_selected`.

**Maturity engine** — `src/maturity/`
- 14 assessment areas (§16): Strategy, Website, Traffic, Lead Capture, Lead Qualification, CRM, Nurture, Sales, Customer Conversion, Retention, Analytics, Attribution, Automation, Experimentation.
- 5 states each: Not configured / Partially configured / Configured / Needs attention / Healthy.
- **Deterministic and explainable** — every state has a recorded `reason[]` and the evidence that produced it. No black box. This is what makes ONB-06 trustworthy.
- Combines the §45 self-report with detected facts (website analysis, connected sources).

**Website analyser** — async BullMQ job (§90). Fetches the URL, detects GA/GTM tags, pixels, ad pixels, existing forms, CMS, schema markup, page speed signals. Returns an asset inventory merged into the assessment. Timeout, retry, and a clear failure path (§87).

**Classifier** — `src/classifier/`
- State A–D per §15, derived from the maturity vector and the detected stack.
- Path recommendation per §47 with a required plain-language narrative: *"You already have traffic and a website, but you don't have a reliable lead qualification and follow-up system."*
- **Hybrid is a first-class outcome** (§48), not an afterthought. ONB-07 offers Build, Optimize, or Hybrid and the user can switch at any time.

**Front end** — ONB-01…ONB-07 screens, each with loading / empty / error / partial states, and a review step the user must confirm before the assessment is committed.

## Exit gate
- [ ] A new user completes onboarding end-to-end and lands in Build, Optimize, or Hybrid
- [ ] Every maturity state shows its evidence; a reviewer can audit the reasoning
- [ ] A user with a website and no CRM is classified correctly and told the right next step (§21's exact example reproduces)
- [ ] Onboarding is resumable across a browser restart

---

# PHASE 4 — Funnel Spine, Blueprint & Gap Analysis
**Weeks 6–7 · PRD refs: §17, §21, §22, §23, §54, §56, §57, §101, §103, §104, §105, §107, §108**

## Goal
Make the funnel a first-class, **configurable** model — not hardcoded stages — and generate a blueprint that works backwards from the user's goal.

## Service: `funnel-service`

## Outputs

**Schema** — `Funnel`, `FunnelStage` (ordered, typed, per-business configurable), `FunnelBlueprint`, `FunnelComponent` (typed registry + the 7 §57 states), `GapAnalysis`, `BlueprintAssumption`.

**Stage templates** — `src/templates/`: SaaS, Ecommerce, Services/B2B, plus custom. Each template declares stage semantics, the canonical event that populates it, and the expected conversion range. §54's three examples ship as templates.

**Blueprint generator** — `src/blueprint/generator.ts`
- Inputs: business type, model, audience, offer, growth goal, market, current infrastructure, available channels.
- Works **backwards from the goal** (§103/§104): GOAL → required customer action → required funnel → required traffic → required conversion → required lead volume → required nurture → required sales.
- **Every derived number is stored as a `BlueprintAssumption`** with its input, method, and confidence. §104 requires planned and measured to be visually distinct — this is a schema-level guarantee, not a UI convention.
- Output: recommended stage list, required assets, tracking plan, qualification approach, nurture strategy, experiment backlog, channel recommendations.

**Gap analysis** — `src/gap/`
- Scores every §16 area against the blueprint's requirements.
- Produces the §21 rendering, including "your biggest current gap is X" ranked by downstream impact, not by checklist order.
- Honours §101: returns **one** highest-priority missing piece first, not a giant checklist.

**Build vs Connect decision** — `src/strategy/build-or-connect.ts` encodes §107 explicitly: central-and-simple → build in-platform; specialist → recommend connect. Every recommendation is tagged `build_in_platform` or `requires_integration` with a reason (§22's required explanation fields: what's missing, why it matters, what we propose, what you provide, what we build, what needs an integration).

**AI refinement (contract-first)** — the `ai-service` contract is defined and mocked here; the real service lands in Phase 8. A feature flag means the deterministic generator is always the fallback — the blueprint can never be blocked on an LLM.

**Front end** — Blueprint screen, the visual funnel diagram (§23), component state board (§56/§57), and the progressive-build view (§102) showing what you can launch now versus what's still a recommendation.

## Exit gate
- [ ] A business with nothing gets a generated blueprint from a stated goal
- [ ] Blueprint adapts to business model (the SaaS, Ecommerce and Services templates produce visibly different funnels)
- [ ] Every calculated number displays its assumption; planned vs measured is visually unambiguous
- [ ] Gap analysis returns one highest-priority gap, matching §101

---

# PHASE 5 — Build Mode: Pages, Forms, Publishing
**Weeks 7–9 · PRD refs: §24, §25, §26, §27, §76, §87, §88, §90 · ⭐ VERTICAL SLICE 1**

## Goal
Prove the Build Mode loop: **build → publish → capture → measure.** Nothing in Phase 6+ is worth building if this doesn't work end to end.

## Services: `page-service`, `event-service`

## Outputs

**`page-service`**
```
prisma/schema.prisma   LandingPage · PageVersion · Form · FormField · Asset · PublishRecord
src/
├─ schema/     block-schema.ts (typed, versioned, zod-validated page document)
├─ builder/    page.service.ts · form.service.ts · validation.service.ts
├─ render/     renderer.ts · seo.ts (metadata, OG, JSON-LD) · theme.ts
├─ publish/    publish.fsm.ts (Draft → Configured → NeedsReview → Published → Paused/Error)
└─ hosting/    slug.service.ts · custom-domain.service.ts (host-header resolution)
```

- **Block schema** covers every §24 element: page title, headline, subheadline, CTA, benefits, features, social proof, FAQ, lead form, footer, SEO metadata. Mobile-responsive by construction.
- **Versioning** — every save creates a `PageVersion`; publish pins one; rollback is a pointer change, not a migration.
- **Render route** — `GET /p/:businessSlug/:pageSlug`, server-rendered, draft pages `noindex` + token-gated, published pages cacheable with `stale-while-revalidate`.
- **Forms** (§27) — field types: name, email, phone, company, custom, consent, hidden. Server-side validation is authoritative. Consent text is versioned with the submission. Honeypot + per-IP rate limit + optional double opt-in.
- **Auto-instrumentation** (§76) — publishing a page automatically emits a `tracking plan manifest`: `page_view`, `cta_click`, `form_viewed`, `form_submitted`, `form_error`. No manual tracking setup, ever.
- **Form submission path** — `page-service` validates and persists, then emits `funnel.form_submitted`; `lead-service` (Phase 6) consumes it. Until Phase 6, submissions land in a staging consumer and the Slice 1 gate accounts for it explicitly.

**`packages/tracking`**
- `script.js` under ~4 KB gzipped, queue-and-flush, offline-tolerant, no PII in the payload, consent-aware and cookieless-first.
- Anonymous identity stitching: `anonymous_id` in first-party storage, promoted to `customer_id` on first known contact.
- First-party `/collect` proxy option for strict consent regimes.

**`event-service`**
```
POST /v1/events          single event
POST /v1/events/batch    up to 500 events
GET  /v1/events/:id      readback for verification
```
- Validates against `event-contracts` zod schemas; rejects unknown types with a 400 naming the field.
- `event_id` idempotency — replays are dropped, counted, and reported.
- P95 target < 50 ms acknowledged; the write path is a Redis Stream append, never a synchronous ClickHouse insert.
- Fan-out via BullMQ consumers into ClickHouse, plus a rolling raw retention in Redis.

**Front end** — page builder with block editing, form builder, preview toolbar with desktop/tablet/mobile (§26), the four primary actions (Edit / Save / Preview / Publish), the §88 empty state, and a publish dialog that surfaces any unconfirmed AI content.

## Exit gate — ⭐ SLICE 1 (§119)
- [ ] Business → goal → assessment → blueprint → **build landing page** → **create form** → **capture lead** → **show lead** → **show funnel** → **measure conversion**
- [ ] A real browser visit produces a `page_view`; a real form submission produces `form_submitted` + `lead_created`, visible in the funnel view within 60 seconds
- [ ] Drafts are unreachable by the public; published pages render at 360/768/1440
- [ ] Consent is recorded with the text version shown to the user
- [ ] AI-generated content contains zero fabricated testimonials, statistics, awards, certifications, or guarantees — verified by scanning generated output for forbidden claim types

**If this gate fails, stop.** Do not begin Phase 6.

---

# PHASE 6 — Leads, Qualification, Routing & Nurture
**Weeks 9–10 · PRD refs: §28, §29, §30, §31, §57, §68, §69, §76, §102**

## Goal
Make captured leads become **owned, qualified, followed-up** records — and make the funnel advance on real customer actions.

## Services: `lead-service`, `workflow-service`

## Outputs

**`lead-service`**
```
prisma/schema.prisma   Lead · Customer · Opportunity · LeadActivity · ScoreRule · RoutingRule
src/
├─ lifecycle/   lead.fsm.ts (new → contacted → qualified → opportunity → customer → lost)
├─ scoring/     score-engine.ts (rules-based, §29 — deliberately not predictive)
├─ qualify/     qualification.service.ts (§28)
├─ routing/     routing-engine.ts (AND/OR condition tree, §30)
├─ customers/   customer.service.ts · opportunity.service.ts
└─ activity/    timeline.ts (every touch, §69)
```
- **Scoring** is transparent rules with an auditable ledger — "+20 Requested demo", "+15 Company size matches" — and every score change records which rule fired. §29 asks for honesty about intelligence; the UI shows the rules, not a score out of nowhere.
- **Qualification** builds questions (company size, budget range, service required, purchase timeline, business type) whose answers can set score, lifecycle stage, owner, route, and workflow.
- **Routing** supports nested conditions and four action types (assign owner, update stage, notify user, trigger workflow). Idempotent: a re-delivered `lead.created` never double-routes.
- **Customer** (distinct from Lead, per §71) with lifecycle stage, funnel position, revenue, and a full interaction history. Deliberately not an enterprise CRM (§109).

**`workflow-service`**
```
prisma/schema.prisma   Workflow · WorkflowStep · WorkflowRun · WorkflowRunLog
src/
├─ engine/      runner.ts · steps/{wait,email,check-engagement,branch,webhook,update-field}.ts
├─ triggers/    trigger.registry.ts (lead.created, score.changed, stage.changed, schedule)
├─ schedule/    bullmq-delayed.ts (recompute-schedule on activation)
└─ email/       provider.interface.ts · dev-mailpit.ts · smtp.ts · resend.ts
```
- Step types per §31: Lead Created → Wait 1 day → Send Email → Wait 2 days → Check Engagement → Branch. Delay, engagement-check, and branch are the MVP set; multi-channel automation is explicitly deferred.
- Runs are resumable, inspectable, pausable, and idempotent. A failed step retries per policy and then parks with a visible reason (§92).
- Emits `funnel.email_sent`, `funnel.email_opened`, `funnel.email_clicked`, closing the attribution loop.

**Front end** — Lead list and detail (§69) with all 10 required facets; Customers screen (§68); workflow builder; lead-routing rule editor; the progressive-build panel showing funnel coverage as components are added (§102).

## Exit gate
- [ ] A form submission produces a lead with full source/campaign/landing-page/UTM/device attribution
- [ ] Qualification rules assign score, stage, and owner; the score ledger shows why
- [ ] A routing rule assigns to the right owner and fires a workflow, exactly once
- [ ] A 3-email nurture sequence executes on schedule; opens and clicks appear on the lead timeline
- [ ] The funnel view shows the lead advancing stages from real events

---

# PHASE 7 — Integrations & Data Sync
**Weeks 10–12 · PRD refs: §33, §34, §49, §50, §51, §55, §70, §74, §75, §76, §107 · ⭐ VERTICAL SLICE 2**

## Goal
Connect the outside world into one canonical model. This is the heaviest phase and the one that most often turns into a monolith, because "just add an API call" is tempting. The Connector SDK is the structural defence.

## Services: `integration-service` (+ `connector-worker`), `analytics-service`

## Outputs

**`packages/connector-sdk`**
```ts
export interface Connector {
  definition: ConnectorDefinition;   // auth type, scopes, rate limits, cursor
                                   // strategy, freshness SLA, required fields
  authorize(oauth): Promise<TokenSet>;
  refresh(token): Promise<TokenSet>;
  pull(ctx: { account; cursor; window }): Promise<RawPage>;   // paged, resumable
  normalize(raw: RawPage): EventEnvelope[];                    // → canonical model
  health(account): Promise<SourceHealth>;
}

export interface FixtureRunner {  // §117: fixtures are LABELLED, never disguised
  readonly isFixture: true;         // surfaced in the UI as "Sample data"
  replay(connector, fixturePath): Promise<EventEnvelope[]>;
}
```
- Contract-test harness: a connector that passes it can be wired to the UI without a bespoke integration story.
- Rate limiting, backoff, quota accounting, and pagination are implemented **once** in the SDK, not per connector.

**Six connectors** (§34)

| Connector | API | Key normalisation concern |
|---|---|---|
| Google Analytics 4 | Data API (GA4) | Sessions vs users vs sessions-with-conversion must not be silently conflated |
| Google Search Console | Search Analytics API | 2-day reporting lag must be surfaced in freshness, not hidden |
| Google Ads | Google Ads API | Currency and timezone normalisation; cost as a revenue-*adjacent* metric, never revenue |
| Meta Ads | Marketing API | Attribution-window differences vs Google — a comparison trap worth naming in the UI |
| CRM (HubSpot) | CRM API | Contact/deal/company identity stitching into `Customer` + `Opportunity` |
| Website | Own tracker + page audit | First-party is the highest-trust source; it anchors the model |

- Every connector ships with **recorded fixtures** in `infra/fixtures/connectors/`, replayed in sandbox mode. The Integration UI labels sandbox data explicitly, so a fixture is never mistaken for a real connection.
- Future connectors (LinkedIn, TikTok, Klaviyo, ActiveCampaign, WhatsApp, Salesforce) require only a new `Connector` implementation and a manifest entry — no changes to `integration-service`.

**`integration-service`**
```
prisma/schema.prisma   Integration · IntegrationAccount · SyncJob · SyncError · RawRecord
src/
├─ oauth/       oauth.fsm.ts (authorize → callback → connected → needs-reauthorization → error)
├─ crypto/      token-vault.ts (envelope encryption, KMS interface)
├─ sync/        orchestrator.ts · scheduler.ts · cursor-store.ts · backfill.ts
├─ status/      the 8 §70 states as a typed machine
└─ webhook/     inbound webhook handling with signature verification
```
- Sync status exposes everything §49 requires: source, status, progress, last sync, records processed, errors.
- Resumable cursors, backfill windows, dedupe on external key, dead-letter queue, and a recovery path that replays failures without a full re-sync.
- Tokens are envelope-encrypted with a KMS-backed interface; plaintext tokens never touch the database or a log.

**`analytics-service`** (Python or Node — chosen at ADR time; default Node for schema-sharing, with the heavy aggregation in ClickHouse)
```
ClickHouse: events (raw), sessions, funnel_daily, metric_daily, campaign_daily, source_freshness
PG:         MetricDefinition · FunnelSnapshot · DataQualityIssue · ReportSchedule
src/
├─ rollup/     hourly.ts · daily.ts · attribution.ts
├─ query/      funnel.service.ts · breakdown.service.ts · cohort.service.ts
├─ health/     marketing-health.ts (§51 score + components + trend)
├─ quality/    checks.ts (§74 — missing tracking, duplicate events, inconsistent
│              timestamps, missing customer ids, missing attribution, broken
│              integrations, insufficient history, incomplete funnel paths)
└─ internal/   ai-context.controller.ts (the §4 contract)
```
- All §50 initial analysis metrics, all §55 funnel-detail dimensions, and the §51 health score.
- **Freshness is a first-class column** (§75) that lowers insight confidence and caps AI confidence — not a display detail.
- Rollups are idempotent and re-runnable; a late event corrects its day rather than corrupting history.

**Front end** — Integration Center with all 8 §70 states, sync progress with live record counts, source freshness badges, the unified funnel combining Build-mode and external data, and the Marketing Health card.

## Exit gate — ⭐ SLICE 2 (§119)
- [ ] **CONNECT DATA → SYNC → FUNNEL →** (insight, AI Analyst, recommendation and action land in Phases 8–9, so the Slice 2 *demo* completes in Phase 9)
- [ ] All 6 connectors pass the SDK contract suite
- [ ] A real sandbox sync completes and shows status, progress, records processed, and errors
- [ ] A real credentialed sync for **at least GA4 and Search Console** completes against live accounts
- [ ] Build-mode leads and external ad/search metrics appear in one funnel view
- [ ] Data-quality checks fire on deliberately corrupted data, and a stale source visibly reduces confidence

**Note:** Slice 2's full chain closes at the Phase 9 gate. The *data* half must be complete here.

---

# PHASE 8 — Insights, AI Analyst & Recommendations
**Weeks 12–14 · PRD refs: §10, §51, §58, §59, §60, §61, §62, §63, §64, §75, §82, §83, §106 · ⭐ SLICE 2 completes**

## Goal
Turn a functioning pipeline into an **explaining** system. This is where the product stops being a dashboard and becomes the operating system.

## Services: `insight-service`, `recommendation-service`, `ai-service` (Python/FastAPI)

## Outputs

**`insight-service`**
```
src/detectors/  anomaly.ts (robust z-score, seasonal-aware)
               leakage.ts · conversion-change.ts · campaign-change.ts
               data-quality.ts · tracking-issue.ts
src/health/     marketing-health.ts (0–100 + components + trend, §51)
src/insight.fsm.ts  new → acknowledged → actioned → dismissed → expired
```
- All 8 §58 insight types.
- Every insight carries **evidence**: the metric, the value, the comparison window, and the freshness of the underlying source. An insight without evidence cannot be created — enforced in the schema, not the UI.
- Confidence is penalised by data freshness (§75) and by low sample size.

**`ai-service`** — Python 3.12, FastAPI, port 3132
```
app/
├─ main.py · config.py (pydantic-settings) · security.py (service-to-service auth)
├─ api/      chat.py · generate/{page,form,qualification,nurture,seo}.py · plan.py
├─ grounding/
│  ├─ context_client.py     → analytics /internal/ai/context (READ-ONLY, no DB)
│  ├─ sufficiency.py        → enforces §61 refusal, hard-fails on insufficient
│  └─ retrieval.py          → insight + recommendation reads
├─ response/  contract.py (ANSWER→EVIDENCE→INTERPRETATION→RECOMMENDATION→ACTION, §60)
│             claims.py (fact | analysis | hypothesis | recommendation labelling)
├─ safety/    forbidden_claims.py (classifier + [[CONFIRM_REQUIRED]] injection)
├─ tools/     registry.py · permission_layer.py (risk, requiredRole, autonomy L0–L3)
├─ prompts/   registry.py (versioned, hash-pinned, reviewable in PRs)
├─ providers/ llm.py (pluggable: Anthropic / OpenAI / local)
└─ evals/     harness.py · datasets/ (groundedness, citation accuracy,
              forbidden-claim rate, refusal correctness, latency, cost)
```

| Requirement | How it is enforced | How it is proven |
|---|---|---|
| §61 no fabricated metrics | AI has **no database access**; it can only read the context endpoint's `sufficiency` block | A unit test asserts refusal when `sufficient: false` |
| §60 response structure | Pydantic-validated response contract; the UI renders the 5 sections | Contract tests on 200 seeded questions |
| §60 claim typing | Every sentence tagged fact/analysis/hypothesis/recommendation | Eval asserts ≥ 95% correct tagging |
| §63 content safety | Pre-generation allowlist + post-generation forbidden-claim classifier injecting `[[CONFIRM_REQUIRED: …]]` | Eval: 0% fabricated claims across 500 generated pages; the builder surfaces unconfirmed placeholders for user confirmation |
| §82 AI action security | Typed tool registry; each tool declares `risk`, `requiredRole`, `autonomyLevel`. L3 prepares an Action for approval and **never** executes | Test asserts no L0–L3 tool can mutate external state |
| §83 autonomy levels | Enforced per-tool at the permission layer | Each level has a test |
| §75 freshness | `confidenceCap` from the context endpoint is applied to every claim | Test with a stale source asserts reduced confidence |

- **Grounded analyst questions** (§59): what is missing from my funnel · why did my leads decrease · what should I build first · which campaign generated customers · what should I optimize.
- **AI Marketing Planner** (§105): strategy, channels, stages, assets, tracking plan, qualification approach, nurture strategy, experiment ideas — each with its stated assumptions, per §104's honesty requirement.
- **Build Mode generation** (§62): page structure, copy, CTAs, forms, qualification questions, workflow design, SEO metadata, nurture sequences — all using business context.
- Full prompt provenance: every generation records the prompt version, model, token count, latency, and cost.

**`recommendation-service`**
```
prisma/schema.prisma   Recommendation · RecommendationFeedback · Learning
src/generators/  missing-infrastructure.ts · performance-problem.ts
                 data-problem.ts · optimization-opportunity.ts · growth-opportunity.ts
src/priority/    impact.ts · effort.ts · confidence.ts · dedupe.ts
src/feedback/    outcome-linker.ts
```
- All 5 §106 types.
- Every recommendation carries the complete §64 field set: problem, evidence, impact, confidence, effort, objective, recommended action, affected funnel stage, related metrics, source. A DB check constraint rejects a recommendation missing any of them.
- Priority is computed, not authored: impact × confidence ÷ effort, with the formula exposed in the UI.
- Deduplication by similarity so the user never sees the same recommendation twice.
- `Learning` records link action → outcome → measured delta, and adjust future confidence. This is the §113 moat, started early.

**Front end** — Insights feed filtered by the 8 types; AI Analyst chat rendering evidence and claim-type labels distinctly; Recommendations with problem/evidence/impact/confidence/effort; a "why am I seeing this?" affordance on every insight.

## Exit gate — ⭐ SLICE 2 COMPLETE
- [ ] **CONNECT DATA → SYNC → FUNNEL → INSIGHT → AI ANALYST → RECOMMENDATION**
- [ ] "Why did my leads decrease?" returns a structured, cited answer with claim typing
- [ ] "What is missing from my funnel?" answers from the assessment and blueprint, citing them
- [ ] With insufficient data, the AI **refuses** rather than guessing — proven by test
- [ ] 500 generated pages contain zero fabricated testimonials, statistics, awards, certifications, guarantees, or claims
- [ ] Every insight and recommendation shows evidence; no recommendation renders without all §64 fields

---

# PHASE 9 — Action Center, Approvals & Execution
**Weeks 14–15 · PRD refs: §65, §66, §77, §82, §84, §92, §94 · ⭐ SLICE 2 closes**

## Goal
Complete the Insight → Action → Outcome chain. A product that only *recommends* is a report generator.

## Services: `action-service`, `notification-service`

## Outputs

**`action-service`**
```
prisma/schema.prisma   Action · Approval · ActionExecution · ActionArtifact
src/
├─ action.fsm.ts   Draft → PendingApproval → Approved → Executing
│                  → Completed | Failed | Cancelled   (§66, guarded transitions)
├─ risk.ts         risk classification → approval requirement
├─ executors/      create-page.ts · modify-page.ts · create-form.ts
│                  create-workflow.ts · create-experiment.ts · connect-crm.ts
│                  create-follow-up.ts · fix-tracking.ts · update-campaign.ts
└─ execution/      dispatcher.ts (BullMQ) · retry.ts · compensation.ts
```
- All 9 §65 action types.
- **Risk-based approval** — any action with external or customer-visible impact requires approval. Non-trivial by default; auto-approval is opt-in per role and never applies to external writes.
- `update-campaign` deliberately **does not** push changes into an ad platform. It produces a reviewable change plan for the user to apply in the ad manager. This respects §82 and §109 and avoids a class of irreversible damage.
- Every transition is audited with actor, result, and reason (§84); every execution is idempotent and traceable end to end.
- Failures surface a recovery path, not a dead end (§92).

**`notification-service`**
```
prisma/schema.prisma   Notification · Preference · DeliveryAttempt
src/  dispatcher.ts · channels/{in-app,email,webhook}.ts · digests.ts · dedupe.ts
```
- All 8 §77 notification types.
- Per-user per-type per-channel preferences (§78), quiet hours, digest batching, and dedupe so one failing sync does not produce 4,000 notifications.
- Delivery attempts are recorded, and failures are retried without blocking the originating action.

**Front end** — Action Center board, approval queue with the evidence that motivated each action, execution log, notification centre with unread state, and preference management.

## Exit gate — ⭐ SLICE 2 FULLY CLOSED
- [ ] **CONNECT DATA → SYNC → FUNNEL → INSIGHT → AI ANALYST → RECOMMENDATION → ACTION → MEASUREMENT**
- [ ] A recommendation is accepted → becomes a draft Action → requires approval → approved → executed → audited → user notified
- [ ] An action that fails surfaces a reason and a recovery path; it never silently disappears
- [ ] The executed action's outcome is linked back as a `Learning` record
- [ ] No action mutated an external system without a recorded approval

---

# PHASE 10 — Experiments & the Learning Loop
**Weeks 15–16 · PRD refs: §67, §71, §96, §97, §98, §110, §113**

## Goal
Close the loop: the system must be able to find out whether its own advice worked, and remember.

## Service: `experiment-service`

## Outputs

**`experiment-service`**
```
prisma/schema.prisma   Experiment · Variant · ExperimentResult · Exposure
src/
├─ fsm.ts             draft → running → paused → completed | stopped | invalidated
├─ assignment.ts      deterministic hash(experiment, subject) → stable variant
├─ exposure.ts        exposure event emission + sample-ratio-mismatch guard
├─ stats.ts           two-proportion z-test · MDE · power · confidence interval
└─ learning.ts        result → narrative → recommendation-confidence adjustment
```
- Full §67 model: hypothesis, control, variant, audience, primary metric, secondary metrics, baseline, dates, result, learning.
- **Stable, unbiased assignment** — the same visitor always sees the same variant, computed identically on server and client, with an SRM check that halts a test if allocation is broken.
- Landing-page A/B integrated with `page-service` (variant = a page version).
- Business-outcome metrics take priority over vanity metrics — the UI will not present a CTR win as a success when revenue is flat.
- Inconclusive is a first-class result with an honest explanation, not a failure.
- `experiment_completed` and `outcome_recorded` product events (§94).

**Front end** — Experiment list, builder with hypothesis and metric selection, variant editor, live results with guardrails, and a completed view leading with the learning.

## Exit gate — ⭐ SLICE 3 (§119)
- [ ] **EXISTING ASSETS + MISSING COMPONENTS → HYBRID FUNNEL → MEASURE → OPTIMIZE**
- [ ] An experiment runs, reaches a sample size, and returns a statistically-honest verdict with a business-outcome metric
- [ ] Assignment is stable across sessions and devices
- [ ] The learning is retrievable and demonstrably influences a later recommendation's confidence
- [ ] An inconclusive test is reported as inconclusive

---

# PHASE 11 — Hardening, Security, Observability & Production
**Weeks 16–18 · PRD refs: §81, §84, §85, §86, §87, §90, §92, §93, §115, §116, §117**

## Goal
Turn a working system into a trustworthy one. This phase is scheduled last but its instrumentation lands in Phase 0 — nothing here is a retrofit.

## Outputs

**Security** (§81) — full checklist with a test per item
- TLS everywhere; HSTS; secure session cookies; refresh-token rotation with reuse detection
- OAuth hardening: PKCE, state, nonce, exact redirect-URI matching, minimal scopes
- Envelope encryption for all integration tokens, KMS interface, key rotation
- RBAC audit: every endpoint declares its required permission; a CI test fails on any endpoint that doesn't
- Rate limiting per tenant and per IP; input validation on every request via zod at the pipe
- Webhook signature verification on every inbound webhook
- CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`
- Secret scanning, dependency scanning, image scanning in CI
- **Tenant-isolation penetration test suite** — cross-tenant access attempted on every entity type; all must return 404

**Observability** (§93) — OpenTelemetry across all 18 services including Python; traces propagate from the browser through the gateway, services, queue, and AI service
- Prometheus metrics + Grafana dashboards for API latency, DB performance, integration failures, queue depth, job failures, AI latency, AI errors, action failures, workflow failures, data freshness
- Sentry with tenant-tagged errors; alerting rules with an on-call runbook link for each
- Defined SLOs (ingestion availability 99.9%, dashboard p95 < 400 ms, AI response p95 < 8 s) and burn-rate alerts

**Performance** (§90)
- Load test the ingestion path; the target and its result are documented
- API p95 budgets per endpoint class
- ClickHouse partition, TTL, and materialised-view policy; queue backpressure behaviour
- Every long operation verified async — a full audit that no request path blocks on a sync job

**Reliability** (§92) — retry, idempotency, failure-state, job-tracking, integration-recovery, and graceful-degradation tests. Fault injection: kill any one service and verify no cascading failure.

**Accessibility** (§86) — WCAG 2.2 AA audit of the app **and** of published customer landing pages; screen-reader pass on the funnel, insights, AI Analyst, and approvals; `axe` in CI with zero serious violations; textual chart summaries everywhere.

**Testing**
```
unit              service business logic, scoring, routing, assignment
integration       Testcontainers (PG, Redis, ClickHouse) per service
contract          consumer-driven tests per HTTP and event boundary
e2e               the three §119 vertical slices against a prod-like stack
resilience        retry, idempotency, DLQ, partial-failure scenarios
security          RBAC matrix, tenant isolation, input validation
```
- Coverage gates and a PR template that enforces the §115 Definition of Done as a checklist.

**Deployment**
- Per-service Dockerfiles (multi-stage, non-root, distroless where possible)
- Kubernetes manifests + Helm chart; per-service HPA, resource limits, PDB
- Migrations run as a pre-deploy job, backward-compatible only (expand/contract)
- CI/CD: build → test → scan → migrate → canary → verify → promote, with automatic rollback
- Feature flags for every new capability, so risk is decoupled from deploy

**Documentation**
- Architecture diagrams (C4 context/container), service catalogue, data dictionary
- API reference (aggregated OpenAPI 3.1, published)
- Runbooks per service; on-call handbook; incident templates
- Connector guide: how to add an 8th integration in one day

## Exit gate
- [ ] All three vertical slices pass in CI against a prod-like stack
- [ ] §115 Definition of Done enforced on every PR
- [ ] §81 security checklist complete with a passing test per item
- [ ] Fault injection: no single service failure causes a cascade
- [ ] WCAG 2.2 AA audit passed on app and published pages
- [ ] Load test results documented against targets
- [ ] **The §2 "still microservices" checklist is fully satisfied**

---

## 6. Requirement traceability matrix

Every PRD section maps to a phase. If a section is unlisted, it was not silently dropped.

| PRD | Section | Phase |
|---|---|---|
| §1–§14 | Product, vision, personas, JTBD | Framing — informs all |
| §15 | User starting-state model (A–D) | 3 |
| §16 | Funnel maturity assessment (14 areas) | 3, refined 4 |
| §17 | Funnel blueprint | 4 |
| §18–§23 | Build Mode MVP, journey, gap analysis, builder | 4, 5, 6 |
| §24–§26 | Page builder, AI page generation, preview | 5, generation 8 |
| §27–§31 | Lead capture, qualification, scoring, routing, nurture | 5, 6 |
| §32–§34 | Optimize Mode, stack assessment, integrations | 7 |
| §35 | Product architecture | §3 topology |
| §36–§38 | Public website and homepage | 2 |
| §39 | Authentication | 1, 2 |
| §40–§48 | Onboarding and hybrid mode | 3 |
| §49–§51 | Data sync, initial analysis, marketing health | 7 |
| §52 | Marketing OS navigation | 2 shell, filled per phase |
| §53–§55 | Overview, funnel, funnel detail | 7, then 8 |
| §56–§57 | Build screen, component states | 4, 5 |
| §58 | Insight types | 8 |
| §59–§63 | AI Analyst, response structure, grounding, Build AI, content safety | 8 |
| §64 | Recommendation fields | 8 (DB constraint) |
| §65–§66 | Action Center, action states | 9 |
| §67 | Experiments | 10 |
| §68–§69 | Customers, lead management | 6, 7 |
| §70 | Integration Center states | 7 |
| §71 | Canonical data model | §3 ownership map, built across 1–10 |
| §72–§73 | Event model and canonical events | 0 (contracts), 5–7 (emission) |
| §74–§75 | Data quality, freshness | 7, consumed 8 |
| §76 | Build data requirements | 5 |
| §77–§78 | Notifications, settings | 9, 2 |
| §79 | User roles | 1 |
| §80 | Multi-tenancy | 1 (hardened 11) |
| §81 | Security | 1 → 11 |
| §82 | AI action security | 8 (tool permission layer), 9 (execution) |
| §83 | AI autonomy L0–L3 | 8 |
| §84 | Audit log | 1, extended each phase |
| §85–§86 | Responsive, accessibility | 2 → 11 |
| §87 | Global UI states | 2 (primitives), enforced 11 |
| §88–§89 | Empty states | 2 (primitives), per feature |
| §90–§92 | Performance, background jobs, reliability | 0 (infra), 11 (verified) |
| §93 | Observability | 0 (instrumented), 11 (dashboards) |
| §94 | Product analytics | 0 (pipeline), events emitted from 3 onward |
| §95–§99 | Activation and success metrics | 7, 9, 10 |
| §100 | Core user journey | End-to-end at Phase 11 |
| §101–§105 | Progressive building, goal-first, goal-to-funnel, planner | 4 (engine), 5–6 (progressive), 8 (planner) |
| §106 | Recommendation types | 8 |
| §107 | Build vs Connect | 4 (decision engine), 7 (connectors) |
| §108–§109 | MVP boundary, not building | Enforced by scope; Phase 11 review |
| §110–§114 | Long-term, roadmap, moat | Post-MVP; `Learning` groundwork in 8, 10 |
| §115 | Definition of Done | PR template from Phase 0 |
| §116–§117 | Builder instructions / prohibitions | CI-enforced; §2 rules |
| §118 | Build order | This plan |
| §119 | Critical vertical slices | Gates at 5, 9, 10 |
| §120–§122 | MVP success, loop | Phase 11 demo |

---

## 7. Risks and mitigations

| # | Risk | Signal | Mitigation |
|---|---|---|---|
| R1 | **Integrations expand until they dominate the schedule** (Phase 7 is 3 weeks for 6 connectors + analytics) | Phase 7 slipping past week 12 | Connector SDK built and contract-tested *before* the first connector. If behind at week 11, ship GA4 + Search Console live and the rest in labelled sandbox — the pipeline is the product, the connector count is not |
| R2 | **Phase 5 Slice 1 fails late** | No `form_submitted` in ClickHouse by end of week 9 | Phase 5 is the first slice gate and the plan hard-stops there. Also: `event-service` is built in Phase 5, not deferred, because everything downstream depends on it |
| R3 | **AI fabricates or over-claims** (§61, §63) | Any eval showing invented metrics or claims | Structural, not prompt-level: no DB access, enforced `sufficiency` refusal, forbidden-claim classifier, claim typing, 500-page eval set in CI. §63 is a release blocker |
| R4 | **The event backbone outgrows Redis Streams** | > 50k events/s or > 7-day replay needed | Outbox + envelope are transport-agnostic by design; migrating to Kafka changes the relay, not the producers or consumers. ADR-0003 records the exact trigger |
| R5 | **"Microservices" collapses into a distributed monolith** (chatty sync calls, shared tables) | Any service reading another's tables; any request fanning out > 3 sync hops | CI rules A1–A4, a service-calls audit in OpenTelemetry traces, and the §2 checklist as a Phase 11 gate |
| R6 | **ClickHouse modelling mistakes discovered late** | Rollup queries slow at realistic volume | Schema designed with the §55 dimension matrix in mind in Phase 7, and load-tested before Phase 8 builds on it |
| R7 | **Onboarding becomes a 12-field form nobody finishes** | Onboarding completion < 60% in the first cohort | §101's progressive principle applied to onboarding itself: assess with what we know, ask only for what changes the recommendation, let the user skip and refine later |
| R8 | **Config sprawl** (funnel stages, scoring, routing, workflows all configurable) | Configuration exceeds the code that reads it | Every configurable object ships with a validated schema, sane defaults, a UI editor, and a "reset to recommended" escape hatch |
| R9 | **Compliance (GDPR/POPIA/NDPR) late discovery** | Data-subject deletion requested | Consent versioning and a PII-free event payload are designed in at Phase 5, not retrofitted; DSAR tooling is a Phase 11 item and treated as a release blocker for EU/African customers |
| R10 | **Two people, not four** | — | Same phase order, ~26 weeks, cutting Phase 11 scope last. Never cut Slice 1 |

---

## 8. What this plan deliberately does not build

Per §109 and §117. Stated explicitly so scope creep has to be argued for, not assumed.

- Full replacements for Salesforce, HubSpot, Mailchimp, Klaviyo, Meta Ads Manager, Google Ads, WordPress, Webflow
- Multi-channel / omni-channel automation beyond email (deferred past MVP)
- Predictive lead scoring (§29 asks for rules-based in MVP)
- Autonomy above L3 (§83: L4/L5 are post-MVP)
- Full enterprise CDP, full enterprise CRM
- Cross-channel campaign **execution** — the platform produces change plans; humans apply them in the ad platforms
- Custom roles (the RBAC model supports them; the UI ships the 4 §79 roles)
- Advanced agency management (§13 explicitly excludes it)
- A developer platform (§111 Phase 8, post-MVP)

---

## 9. Immediate next steps

1. **Approve or amend this plan** — particularly §5 (phase order and the three slice gates) and §4 (the eight platform decisions).
2. **Phase 0, Week 1** — scaffold the monorepo, stand up infra, and write ADRs 0001–0008. Nothing else starts until the service template passes CI.
3. **Confirm credentials early** — Google Cloud project (GA4 + Search Console + Google Ads), Meta app, HubSpot developer account. This is the longest-lead item in the plan and it gates Phase 7; requesting it in week 1 costs nothing and discovering it in week 10 costs a phase.
