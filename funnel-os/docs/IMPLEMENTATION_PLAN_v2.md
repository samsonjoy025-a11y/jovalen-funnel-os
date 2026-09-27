# Full-Stack Funnel Marketing OS — Implementation Plan v2.0 (Design-First)

**Source of truth:** `FULL-STACK FUNNEL MARKETING OS Complete Product Requirements, UX and Functional Specification Version 1.0.md`
**Supersedes:** `IMPLEMENTATION_PLAN.md` (v1.0) — kept for the record, not maintained
**Stack:** Next.js 15 / React 19 · NestJS (TypeScript) microservices · Python/FastAPI AI service · PostgreSQL · ClickHouse · Redis + BullMQ
**Repo location:** `funnel-os/` (existing `Jovalen Business OS` at repo root is untouched)
**Status:** Plan v2.0 — for approval before Phase 0 begins

---

## 0. What changed from v1.0, and why

v1.0 followed the PRD's own §118 build order literally: foundation → public site → onboarding → build mode → integrations → intelligence → action → measurement → hardening, with the design system arriving in Phase 2.

That order has one specific failure mode. It asks the team to build the *substance* of a data-dense marketing OS before deciding what a "metric card", a "funnel stage", an "insight", a "recommendation", an "action awaiting approval", or a "state badge with eight possible states" actually looks like, behaves, and announces to a screen reader. Every one of those is a repeating pattern, not a one-off screen. The result of getting it wrong is the normal failure of a first product: 40 bespoke tables, 12 hand-rolled chart wrappers, 6 incompatible button implementations, and a redesign that costs more than the original build.

**v2.0 therefore leads with decisions, then with the design system, and only then with infrastructure and features.**

| Concern | v1.0 position | v2.0 position |
|---|---|---|
| Architectural decisions (ADRs, contracts, NFRs) | Folded into Phase 0 as a by-product | **Phase 0, standalone, gated** |
| Design system + design tokens | Phase 2 (week 4) | **Phase 1 (weeks 2–5), gated** |
| Monorepo / service runtime | Phase 0 | Phase 2 (only a minimal shell is needed in Phase 1 to host `packages/ui`) |
| Identity & tenancy | Phase 1 | Phase 3 |
| Public website | Phase 2 | Phase 4 (now assembly, not design) |
| Everything else | Phases 3–11 | Phases 5–13, same relative order |

### What front-loading actually buys

1. **No bespoke UI in feature phases.** Phases 5–13 are assembly from an approved component set. "Can we build this screen with no new bespoke CSS?" becomes an exit-gate check with an answer.
2. **Contracts frozen before consumers exist.** The event envelope, the AI context contract, the landing-page block schema, the permission enum, and the design tokens are all versioned artefacts in Phase 0. Phases 5–13 implement against a fixed target, so no service is ever written twice because a shared shape moved.
3. **Accessibility is structural, not a Phase 13 audit.** Contrast, focus, target size, and reduced motion are token-level guarantees validated in CI from week 3, not a remediation project in week 25.
4. **AI safety is designed, not prompted.** The `sufficiency` refusal gate, the forbidden-claim classifier, and the tool-permission layer are architecture decisions in Phase 0 (§61, §63, §82), not Phase 10 features bolted onto a chat box.
5. **The riskiest unknowns are answered with timeboxed spikes before 27 weeks of schedule are committed to**, not discovered during integration work.

### The honest cost

27 weeks instead of 18, for 3–4 engineers. Phases 0 and 1 are real work, not ceremony. The plan does not pretend otherwise.

---

## 1. How to read this plan

Each phase has:

- a **goal** tied to named PRD sections
- **outputs** — exact paths, packages, services, endpoints, tables
- an **exit gate** that must be demonstrably true before the next phase starts
- **PRD traceability**

Two rules govern the whole document:

> **Rule 1 — Design-first.** No feature phase introduces a new visual pattern, a new interaction model, or a new chart type. If one is needed, the design system is amended first, in its own reviewed PR, and the feature phase waits.
>
> **Rule 2 — Contract-first.** No service is written against a shape that is not already a versioned contract in `packages/`. Changing a published contract requires an ADR amendment.

**Assumption:** 3–4 engineers, one of whom owns the AI service and the Python service end to end. At 2 engineers, expect ~38 weeks holding this phase order and cutting Phase 13 scope last. **Never cut Phase 0, Phase 1, or the Slice 1 gate.**

---

## 2. Non-negotiable architecture rules (CI-enforced, not conventions)

| # | Rule | CI enforcement |
|---|---|---|
| **A1** | A service may not import another service's source. Cross-service communication is HTTP or events only. | `dependency-cruiser` rule set + per-service ESLint `no-restricted-imports`. |
| **A2** | Each service owns its schema. No service reads or writes another service's tables. | Every `prisma/schema.prisma` model registered to exactly one service in `services.manifest.yaml`; cross-schema grants denied in Postgres. |
| **A3** | Every service builds, tests, and runs standalone with all other services stopped. | Per-service CI job with only its own deps up, plus mocked contract tests. |
| **A4** | Every service has its own Dockerfile, `/health`, OpenAPI doc, and deployable. | `pnpm gen:manifest` diffs the manifest against the filesystem. |
| **A5** | Tenant context is never client-supplied. The gateway mints it from a verified token; services reject requests without it. | `TenantScopeInterceptor` registered globally in the service template; a unit test fails if it is removed. Postgres RLS is layer 2. |
| **A6** | No service holds secrets. All config comes from a zod-validated env schema; integration tokens are envelope-encrypted. | `secretlint` + a grep gate failing on any committed `.env` with a non-empty value or any API-key pattern. |
| **A7** | **No feature component may define colours, spacing, type sizes, radii, or durations outside the token set.** | Styling lint rule + a Storybook visual-regression diff. This is the machine form of Rule 1. |
| **A8** | **No AI output reaches a user without passing the claim-typing and forbidden-claim gates.** | Chosen in Phase 0; verified by eval suite from Phase 10 onward. |
| **A9** | **No external system is mutated without a recorded, authorised approval.** | Action executors are structurally unable to reach an external write; asserted in tests. |
| **A10** | **No request path blocks on a long operation** (§90). | Static check on controller methods + a latency budget test per endpoint class. |

**Definition of "still microservices" at Phase 13 exit** — all must be true:

- [ ] 18 independently deployable images, each with its own resource limits
- [ ] Killing any single service degrades gracefully, verified by fault injection
- [ ] No service needs a schema migration owned by another team's boundary
- [ ] Event ingestion, analytics, and AI each scale on their own axis
- [ ] The deployment surface spans ≥ 3 container groups (control plane, data plane, workers)

---

## 3. The order, at a glance

| Phase | Weeks | Name | Gate — must be demonstrable |
|---|---|---|---|
| **0** | 1–2 | **Architecture & Design Decisions** | 22 ADRs accepted, 3 contracts frozen & versioned, 4 risk spikes resolved in writing, Definition of Done live as a PR template |
| **1** | 2–5 | **Design System & Frontend Platform** | Every Phase 5–13 screen can be assembled from the component set; published landing pages render from the same tokens; axe clean; visual regression green |
| **2** | 5–7 | Platform Foundation | `pnpm dev` brings up full infra; a generated service passes the whole CI pipeline |
| **3** | 7–9 | Identity, Tenancy & Gateway | Signup → workspace → RBAC → **cross-tenant access returns 404** → every mutation audited |
| **4** | 9–10 | Public Experience | All 12 §38 sections and 12 §36 routes live, a11y clean, Lighthouse ≥ 95, built with **zero** new CSS |
| **5** | 10–12 | Business Context & Onboarding | ONB-01→07 completed, routed to **Build / Optimize / Hybrid**, with an explainable persisted assessment |
| **6** | 12–13.5 | Funnel Spine, Blueprint & Gap Analysis | A business with nothing gets an editable blueprint, ranked gaps, and **visible planning assumptions** |
| **7** | 13.5–15.5 | ⭐ **Vertical Slice 1** — Pages, Forms, Publish | Build → publish → capture → measure, with real events in ClickHouse |
| **8** | 15.5–17 | Leads, Qualification, Routing, Nurture | Submission → lead → scored → qualified → routed → owned → 3-email sequence tracked |
| **9** | 17–19.5 | ⭐ **Vertical Slice 2a** — Integrations, Sync, Analytics | 6 sources connected or labelled fixtures; sync progress/errors visible; unified funnel shows Build + external data |
| **10** | 19.5–21.5 | Insights, AI Analyst & Recommendations | "Why did my leads decrease?" → cited, structured answer; every §64 field present |
| **11** | 21.5–23 | Action Center, Approvals & Notifications | Recommendation → Action → approved → executed → audited → notified → measurable (**Slice 2 closed**) |
| **12** | 23–24.5 | ⭐ **Vertical Slice 3** — Experiments & Learning | Experiment runs end to end with a significance verdict and a retrievable learning |
| **13** | 24.5–27 | Hardening & Production | All 3 slices pass in CI on a prod-like stack; §115 Definition of Done enforced per PR |

**The three slice gates are hard stop points.** If Slice 1 is not demonstrable at the end of Phase 7, Phases 8–13 do not start. Building integrations before the Build loop closes is the single most likely way this project produces a demo instead of a product.

---

# PHASE 0 — Architecture & Design Decisions

**Weeks 1–2 · PRD refs: §5, §10, §16, §35, §54, §61, §63, §71, §72, §73, §76, §79, §80, §81, §82, §83, §86, §87, §90, §91, §92, §93, §94, §104, §107, §115, §116, §117**

## Goal

Produce the *decisions* — not the code. At the end of Phase 0, every cross-cutting question that would otherwise be answered accidentally, twice, in three different services, is written down, argued, and versioned. No feature code is written. This phase exists because v1.0 discovered these answers implicitly while building features, which is how distributed monoliths happen.

## Outputs

### 4.1 The ADR set — 22 decisions

`funnel-os/docs/adr/`

**Platform & topology**
| ADR | Decision | Choice | Revisit when |
|---|---|---|---|
| 0001 | Monorepo & toolchain | pnpm workspaces + Turborepo, single repo; Python excluded from the pnpm glob | Never at this size |
| 0002 | Service decomposition & bounded contexts | 18 services, bounded by the §35 architecture and the data-ownership matrix below | Any service exceeding ~15k LOC |
| 0003 | Service-to-service transport | HTTP/REST/JSON | Inter-service p95 > 40 ms |
| 0004 | Event backbone & delivery semantics | Redis Streams + transactional outbox; **at-least-once**, no exactly-once claims anywhere | > 50k events/s or > 7-day replay needed → Kafka |
| 0005 | Canonical event taxonomy & versioning | The 17 §73 events, namespaced, additive-only, with a CI compatibility checker | A published `version` needs a breaking change |
| 0006 | Data ownership & store split | PG for control plane, ClickHouse for the event/analytics plane | — |
| 0007 | Multi-tenancy | Tenant minted by the gateway, mandatory in every service, plus Postgres RLS as a second layer | Never |
| 0008 | Identity & authorisation | External OIDC (Keycloak dev / Auth0 prod), authorization code + PKCE; RBAC as a permission enum so custom roles are additive (§79) | A customer requires on-prem SSO |
| 0009 | API conventions | REST, RFC 9457 problem details, cursor pagination, `Idempotency-Key` on every mutation, versioned paths | — |
| 0010 | Async jobs & scheduling | BullMQ for everything in §91; job taxonomy and retry policy per job class | — |
| 0011 | Observability & SLOs | OpenTelemetry end to end including Python; SLOs defined before dashboards | — |
| 0012 | Environments & deploy target | Docker Compose dev → Kubernetes + Helm prod; three environments, migration as a pre-deploy job with expand/contract only | — |
| 0013 | Secrets & encryption | Envelope encryption with a KMS interface; key rotation; no plaintext token ever in DB or log | — |
| 0014 | Compliance baseline | GDPR / POPIA / NDPR: consent versioning, PII-free event payloads, DSAR tooling specified here | — |

**Design system** — this is the design-decision half of Phase 0 and the direct input to Phase 1
| ADR | Decision | Choice | Why |
|---|---|---|---|
| **0015** | **Token architecture** | W3C DTCG JSON as the single source → build step emits CSS custom properties, a Tailwind v4 theme, and a typed TS object. Three layers: **primitive → semantic → component** | One source for the app, the published landing pages, Storybook, and Figma (via Tokens Studio). No component ever writes a raw hex value. This is the machine-enforced form of A7. |
| 0016 | Component library strategy | Radix UI primitives (unstyled, accessible) styled with Tailwind v4; components **owned in-repo** in `packages/ui`, not consumed as an npm dependency | We will change these components; owning them is cheaper than forking. Radix handles focus management, portals, and ARIA so we do not re-implement them badly. |
| 0017 | Two themes, two densities, one token set | Light + dark via semantic aliases. Two density scales: **editorial** (marketing site, published pages) and **compact** (the data-dense OS) | The marketing site and the OS have opposite density needs. One token set with a density axis avoids maintaining two design systems. |
| 0018 | Charting & data-visualisation accessibility | A single chart layer (visx/Recharts behind one `ChartFrame`) that **always** renders a textual/tabular equivalent, uses a colour-blind-safe palette, and never encodes meaning in colour alone (§86) | §86 requires textual chart summaries. Retrofitting this into 20 hand-rolled charts is impossible; building it once, first, is trivial. |
| 0019 | Landing-page document & block schema | The typed, versioned page document (§24 blocks) is **frozen in Phase 0** and rendered by a locked-down runtime token subset | The builder (Phase 7) and the design system (Phase 1) must agree before either exists. Freezing the schema here prevents the classic rebuild of every page model. |
| 0020 | Content states as primitives | A single `AsyncBoundary` primitive implementing the five §87 states, plus a content-design guide governing the voice of §88/§89 empty states | "Every major feature must support five states" (§87) is a design-system guarantee or it is 200 ad-hoc spinners. |
| 0021 | AI content & evidence patterns | First-class primitives: `Claim` (fact / analysis / hypothesis / recommendation), `EvidenceList` (with source + freshness), `ConfirmRequired` placeholder for §63, `AutonomyBadge` (L0–L3), `RiskBadge` | §60/§61/§63/§83 are UI requirements as much as model requirements. Designing the patterns now means the AI service has a target to emit into. |
| 0022 | Design system lifecycle | Semantic versioning on `@funnelos/ui`; a change that alters an existing component's rendered output requires visual-regression review; a `DEPRECATED` path with a codemod rather than a silent break | Without this the design system decays within two months. |

### 4.2 The three contracts everything else depends on

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

Delivery is **at-least-once**. Every consumer owns a `processed_events` table keyed on `id`; every handler is written to be idempotent. No exactly-once claim appears in any code path, comment, or doc.

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

`sufficiency.sufficient === false` makes the AI service **obligated** to return *"I don't have enough data to answer that reliably"* (§61). A unit test asserts this so it cannot be bypassed by a prompt change. The AI service has **no database access** — this endpoint is the only channel, which makes §61 and §82 structurally true rather than aspirational.

**Design token contract** — `packages/tokens/dist/index.json`

The published artefact every renderer consumes: the OS app, the published landing-page runtime, chart palettes, and the Storybook baseline. If a token is not in this file, it does not exist (rule A7). The `landing-runtime` consumes a **declared subset** (`tokens/landing-subset.json`) so a tenant-authored page can never escape the brand, contrast, or typographic safety envelope.

### 4.3 Architecture documents

`funnel-os/docs/architecture/`

- `context.md` / `container.md` — C4 diagrams, the 18 services, and the three container groups
- `domain-map.md` — bounded contexts, their language, and the ubiquitous-entity map
- `data-model.md` — the full ERD for the §71 entities, ownership, and the PG/ClickHouse split
- `event-catalog.md` — every event, its producer, its consumers, and its schema version
- `flows/` — sequence diagrams for the **three §119 vertical slices**, written now and used as the Phase 13 e2e test specification
- `threat-model.md` — STRIDE, per trust boundary
- `nfr.md` — performance budgets, SLOs, retention, RPO/RTO, cost ceilings
- `contract-test-spec.md` — what "the contract holds" means for every HTTP and event boundary

### 4.4 Risk spikes — timeboxed, written up, decision recorded

| Spike | Question | Timebox | What a bad answer forces |
|---|---|---|---|
| **S1 — ClickHouse for the §55 dimension matrix** | Can stage volume + conversion + trend + source + campaign + landing page + device + geography + audience + quality + revenue be queried at interactive speed at realistic volume? | 3 days | Re-architect the analytics plane before 6 services depend on it |
| **S2 — Tenant isolation** | Does `SET LOCAL app.tenant_id` + RLS actually hold under connection pooling, prepared statements, and a background-worker path that has no request context? | 3 days | A fundamental rewrite of the tenancy model. This is the one spike that can kill the architecture. |
| **S3 — Tracking SDK** | Can a consent-aware, cookieless, offline-buffered, identity-stitching tracker ship under 4 KB gzipped and survive ad blockers? | 2 days | Build Mode's measurement loop (§76) is blocked |
| **S4 — AI sufficiency gate** | Can a refusal be enforced such that no prompt change, no model change, and no tool call can route around it? | 2 days | §61 becomes a prompt instruction rather than a guarantee |

### 4.5 Definition of Done, from day 0

The §115 checklist becomes a repository PR template in Phase 0, not a Phase 13 audit:

```
UX flow · UI · backend · data model · validation · permissions ·
loading · empty · error · success state · analytics · security · tests ·
responsive · accessibility · integration
```

A PR cannot be merged without all sixteen. This is the single highest-leverage artefact in the plan: it converts a document nobody reads into a merge gate.

## Exit gate

- [ ] 22 ADRs accepted and merged; any deviation from one requires an amendment
- [ ] Event envelope, AI context contract, and token contract are **versioned, published, and consumed by at least one compiling test each**
- [ ] The §24 landing-page block schema is frozen and a renderer skeleton renders it
- [ ] All 4 spikes have written outcomes, and S1–S4 conclusions are reflected in the ADRs
- [ ] Three §119 vertical-slice sequence diagrams exist and are marked as the Phase 13 e2e specification
- [ ] The §115 PR template is live and has already blocked one incomplete PR
- [ ] CI already fails on a deliberate A5, A6, and A7 violation

---

# PHASE 1 — Design System & Frontend Platform

**Weeks 2–5 · PRD refs: §24, §26, §36, §37, §38, §51, §52, §53, §55, §57, §58, §60, §63, §64, §65, §66, §67, §70, §76, §79, §83, §85, §86, §87, §88, §89, §115**

## Goal

Make the rest of the product **assembly**. A screen built in Phase 12 must be composed entirely from this component set, and the definition of "done" for this phase is that the Phase 5–13 screen inventory can be assembled without inventing anything.

This phase is where the visual language of the product is decided: what a metric card is, what an insight looks like, what an approval feels like, what "this data is stale" looks like, and what an AI claim is. None of that is styling. It is product design, and it is why it comes before the services.

## Outputs

### 1.1 `packages/tokens` — the single source of truth

```
tokens/
├─ primitive/   colour ramps · spacing (4px base) · type scale · radii · elevation · motion
├─ semantic/    surface · text · border · status · focus · data-density
├─ component/   button.* · card.* · field.* · table.* · chart.* · badge.*
├─ chart/       categorical (colour-blind safe) · sequential · diverging · status
└─ landing-subset.json     the locked-down set the published-page runtime may use
```

- Light and dark are two **alias sets** over the same primitives. No component branches on theme.
- Contrast is validated **at build time**: every foreground/background semantic pair is checked against WCAG 2.2 AA and CI fails on a new failing pair.
- Density is a token axis, not a component variant — `<DataTable density="compact">` changes padding tokens, nothing else.
- Output: CSS custom properties, Tailwind v4 `@theme`, a typed TS object, and a Figma variables sync via Tokens Studio.

### 1.2 `packages/ui` — primitives

~35 primitives. Radix under the hood, owned in-repo:

`Button · IconButton · Link · Input · Textarea · Select · Combobox · Checkbox · RadioGroup · Switch · Slider · DateRangePicker · Field (label + help + error, with correct `aria-describedby`) · Form · Badge · StatusPill · Card · Tooltip · Popover · DropdownMenu · Dialog · Drawer · Tabs · Accordion · Toast · Alert · Progress · Spinner · Skeleton · Avatar · TagInput · Breadcrumbs · Pagination · TablePrimitives · Stepper · SegmentedControl · Kbd · VisuallyHidden · SkipLink`

Accessibility is in the primitive, not added later: focus-visible token on every interactive element, ≥ 24px targets, correct roles, `aria-*` wiring for field errors, and dialog focus trapping that is tested.

### 1.3 `packages/ui` — composites

~25 composites, each of which encodes a PRD requirement:

| Composite | Encodes |
|---|---|
| `DataTable` | Server-driven sort/filter/pagination, column visibility, selection + bulk action bar, virtualisation, **full keyboard navigation**, CSV export, per-field permission masking |
| `MetricCard` | Value, period selector, delta with direction, trend sparkline, **freshness badge** (§75), "insufficient data" state |
| `ChartFrame` | Title, legend, loading/empty/error, download, and a **toggle to a textual/tabular equivalent that is always available** (§86) |
| `AsyncBoundary` | The five §87 states in one primitive: loading / empty / error / success / partial |
| `EmptyState` | §88 and §89 voice: what is missing, why it matters, one primary CTA |
| `PartialDataBanner` | §87 partial — says exactly which source is incomplete and what it affects |
| `SourceFreshnessBadge` | §75 last-sync, status, freshness; drives AI confidence display |
| `DataQualityBadge` | §74 issue type + severity |
| `FunnelDiagram` | §23/§54 configurable stages, drop-in/out, volume + conversion per stage, leakage highlight |
| `StageDetailPanel` | §55's eleven dimensions as a tabbed drill-down |
| `InsightCard` | §58 type icon, headline, evidence line, confidence, "why am I seeing this?" |
| `RecommendationCard` | All ten §64 fields, with impact/confidence/effort as a sortable, visible priority |
| `EvidenceList` | Metric, value, comparison window, source, freshness — required before an insight may render |
| `Claim` | §60 fact / analysis / hypothesis / recommendation, visually distinct and labelled in text |
| `ConfirmRequired` | §63 placeholder for unconfirmed AI content; blocks publish until resolved |
| `ActionCard` / `ApprovalCard` | §65 action types, §66 state machine, risk badge, one-click approve/reject with reason |
| `AutonomyBadge` | §83 L0–L3 |
| `PlanVsMeasuredBadge` | §104 — *calculated planning assumption* vs *measured actual*, visually unmistakable |
| `IntegrationCard` + `SyncProgress` | §70's eight states, §49's six sync fields, and a **"Sample data" badge on fixture-backed connections** |
| `ExperimentResultsCard` | §67 hypothesis, primary/secondary metrics, verdict, and an honest "inconclusive" rendering |
| `StateBadge` | One component for the §57, §66, and §70 state machines |
| `CommandPalette` | Cross-product navigation and actions; the power-user path for a dense OS |
| `RuleBuilder` | Visual condition tree for §30 routing and §29 scoring |
| `WorkflowStepEditor` | Visual §31 sequence: trigger → wait → send → check → branch |
| `DevicePreviewFrame` | §26 desktop / tablet / mobile preview |
| `LandingBlockRenderer` | Renders the frozen §24 block document with the landing token subset |
| `AiChatTranscript` | §60 five-section rendering with claim typing and inline evidence |

### 1.4 `packages/patterns` — application patterns

`AppShell · NavRail (the twelve §52 items, responsive) · WorkspaceSwitcher · PageHeader · CommandPalette wiring · OnboardingStepper · FormWizard · EntityDrawer · RoleGate · FeatureFlagGate · ModeBanner (Build / Optimize / Hybrid, contextualised per §52) · NotificationCenter · SettingsLayout · AuditLogTable · Timeline · ImportWizard (dry-run preview)`

`NavRail` is where the §52 rule is enforced: **Build** is visible only where build capabilities are relevant, and it is labelled *"Build / Improve Funnel"* rather than exposing product terminology to a business owner.

### 1.5 `packages/landing-runtime`

The runtime that serves a published customer landing page: the block renderer, the landing token subset, the embedded form, and the consent-aware tracker slot. It is a **separate bundle from the OS app** with a hard size budget, because a customer page must load fast on a mobile connection in a target market where that matters (§85).

### 1.6 Content design

A written guide, not a component: the voice for empty states (§88, §89), error messages that explain recovery, confirmation copy, and the AI claim vocabulary. §87 says every feature must have five states; the copy for those states is product design and belongs in the design system.

### 1.7 Quality gates

- **Storybook** as the review surface, with a required interaction test per composite
- **Visual regression** on every component in both themes and both densities
- **`axe` in CI, zero serious violations**, on Storybook, the OS shell, and the landing runtime
- **Bundle budgets**: OS shell JS ≤ 180 KB gzipped initial; landing runtime ≤ 90 KB; tracker ≤ 4 KB
- **Lighthouse budget file** committed at Phase 1, asserted from Phase 4 onward
- **Keyboard-only walkthrough** of every composite, recorded

## Exit gate

- [ ] **Screen inventory check:** every screen in Phases 4–13 is listed and mapped to an existing composite; the list contains zero screens requiring a new pattern
- [ ] All §87 states are achievable with `AsyncBoundary` alone
- [ ] All §24 landing blocks render from the frozen schema using the landing token subset
- [ ] Contrast validation fails CI when a failing pair is introduced (demonstrated)
- [ ] A new screen can be built by someone who did not write the design system, using no bespoke CSS
- [ ] axe clean in both themes, both densities; keyboard walkthrough passes
- [ ] Bundle budgets met and enforced
- [ ] ADR 0022 (lifecycle) is being followed: two weeks of real use with no token drift

---

# PHASE 2 — Platform Foundation

**Weeks 5–7 · PRD refs: §71, §72, §73, §80, §81, §90, §91, §92, §93, §94, §116**

## Goal

Turn the Phase 0 monorepo skeleton into a platform where adding a service is a five-minute, fully-wired operation, and where the guarantees from Phase 0 — event contract, tenant context, error envelope, async jobs, observability, token discipline — are enforced by the framework rather than by each team's discipline.

## Outputs

```
funnel-os/
├─ apps/web/                        # Next.js 15 App Router shell, consumes packages/ui
├─ packages/
│  ├─ tokens/ ui/ patterns/ charts/ landing-runtime/   # from Phase 1
│  ├─ shared/                       # @funnelos/shared — the Nest core every service extends
│  ├─ event-contracts/              # the 17 §73 events: zod + JSON Schema + registry
│  ├─ connector-sdk/                # built in Phase 9, interface frozen in Phase 0
│  └─ tracking/                     # Phase 7, interface frozen in Phase 0
├─ services/                        # 17 Node microservices + ai-service (Python)
├─ infra/                           # docker-compose, prometheus, grafana, otel, mailpit, minio
├─ tools/                           # service-template · gen-manifest · gen-openapi · gen-event-schema
└─ services.manifest.yaml
```

**`packages/shared`** — `tenant/ · auth/ · errors/ · http/ · events/ · jobs/ · obs/ · config/`
Including `TenantScopeInterceptor` (throws without a tenant), `RbacGuard` + `RequirePermissions`, RFC 9457 error filter, cursor pagination, `Idempotency-Key` interceptor, outbox + `processed_events`, BullMQ base with per-class retry policy, pino + OTel bootstrap, and a zod env schema.

**`packages/event-contracts`** — a `SCHEMA_REGISTRY` and a compatibility checker that fails CI on a breaking change to a published `version`. `pnpm gen:event-schema` regenerates JSON Schema and TypeScript types.

**`tools/service-template`** — the generator. A generated service arrives with: module wiring, tenant interceptor, RBAC guard, error filter, outbox relay, health + OpenAPI endpoints, Dockerfile, CI job, Vitest + Testcontainers harness, and **a test that fails if you delete the tenant interceptor**.

**Infrastructure** — Postgres 16, Redis 7, ClickHouse, Keycloak, Mailpit, MinIO, OTel Collector, Prometheus, Grafana, Jaeger, Loki. Health-gated startup. `.env.example` with **empty values only** (A6).

**CI (GitHub Actions)** — `install → lint → typecheck → boundary-check (A1) → token-lint (A7) → manifest-check (A2/A4) → per-service-test (A3) → contract-tests → build → image scan → secret scan (A6)`, with the §115 Definition of Done enforced on the PR.

## Exit gate

- [ ] `pnpm install && pnpm dev` starts all infra; `pnpm gen:service` produces a service passing every CI stage
- [ ] A canonical event round-trips: publish → consumer persists → `processed_events` blocks the duplicate
- [ ] CI fails on a deliberate A1, A5, A6, and A7 violation
- [ ] `pnpm gen:openapi` produces a valid aggregated spec
- [ ] `pnpm --filter @funnelos/ui test` (visual + axe) is wired into the same pipeline

---

# PHASE 3 — Identity, Tenancy & Gateway

**Weeks 7–9 · PRD refs: §39, §71, §78, §79, §80, §81, §84, §94**

## Goal

One entry point, one identity, and a tenant boundary that is *provably* unbroken. Every later phase assumes it holds.

## Services: `api-gateway`, `identity-service`, `audit-service`

**`api-gateway`** (port 3000) — the only public entry point.
`auth/ (JWKS + rotation, PKCE) · routing/ (declarative prefix → service → auth-required table) · middleware/ (Redis rate limiting, security headers, tenant minting, trace propagation) · bff/ (one round trip for shell + counts + health) · webhooks/ (signature verification, §81) · health/ (topology from the manifest)`

- The route registry is **declarative**, so adding a service endpoint is a change reviewed in one file.
- Rate limits: 300 req/min per tenant, 10 req/min per IP on auth routes, 1000 events/min per tenant on ingestion.

**`identity-service`** — `User · Session · Workspace · Membership · Role · Invitation`
`auth/ · rbac/ (permission enum mirroring shared, role matrix) · team/ · internal/verify · security/rls-migration`
- The §79 role matrix (Owner / Admin / Member / Viewer) is encoded as a permission enum, so custom roles are additive later without a migration.
- `permission-matrix.test.ts` asserts every (role, permission) pair.
- `tenant-isolation.test.ts` is the **negative** test: tenant A's token against tenant B's resource IDs returns **404 — never 403, never data** — across 40 generated scenarios.

**`audit-service`** (§84) — consumes the event bus, appends `AuditLog` rows (actor, action, timestamp, object, result, tenant) for the full §84 list. Append-only: no update or delete endpoint exists, enforced by Postgres permissions. `GET /v1/audit` with filters and CSV export.

**`business-service` (skeleton)** — creates the Business row on workspace creation, so every later service can assume a business exists.

## Exit gate

- [ ] Signup → OIDC session → workspace → invite → role change, all audited
- [ ] Cross-tenant negative test passes across all 40 scenarios
- [ ] Gateway returns 502, not a hang, when any upstream is killed
- [ ] The OS shell renders with the correct role-scoped `NavRail` (§52 + §79)

---

# PHASE 4 — Public Experience

**Weeks 9–10 · PRD refs: §36, §37, §38, §85, §86, §87**

## Goal

Ship the marketing site. Because the design system already exists, this phase is assembly. It is also the first real test of whether Phase 1 succeeded.

## Outputs

- `apps/web/src/app/(marketing)/` — `/ · /product · /how-it-works · /solutions · /pricing · /resources · /about · /contact · /privacy · /terms` (§36)
- `(auth)/` — `/login · /signup` (§39; OAuth button wired, §39's "do not require another login" enforced by redirecting straight to onboarding)
- `(os)/` — the Marketing OS shell: `AppShell`, `NavRail`, `WorkspaceSwitcher`, `CommandPalette`, `NotificationCenter` (all from `packages/patterns`)
- **Homepage** — all 12 §38 sections in order, with the §37 hero and the exact primary message: *"Build your funnel. Connect your marketing. Find what's limiting growth. Keep improving."* Both modes explained on the page, because the product has two front doors.
- A **funnel visualisation** section built with `FunnelDiagram` — the marketing site demonstrates the product's own core object.

## Exit gate

- [ ] All 12 §36 routes deploy and pass Lighthouse ≥ 95 performance / ≥ 95 accessibility
- [ ] **Zero new CSS outside the token set** (A7) — the exit gate for Phase 1, restated
- [ ] Responsive at 360 / 768 / 1440 with no layout breaks
- [ ] axe clean; skip link, landmarks, and focus order correct

---

# PHASE 5 — Business Context & Onboarding

**Weeks 10–12 · PRD refs: §15, §16, §20, §33, §40–§48, §50, §74, §94, §101, §103**

## Goal

Convert an anonymous signup into a **classified, explained** marketing state with a recommended path. This is the fork in the road for the entire product.

## Service: `business-service`

**Schema** — `Business · BusinessProfile (§42) · Audience (§43) · GrowthGoal (§44) · CurrentSetup (§45) · FunnelAssessment (§46) · OnboardingState · ProductEvent sink`

**Onboarding state machine** — `src/onboarding/onboarding.fsm.ts`
`WELCOME → BUSINESS_SETUP → AUDIENCE → GOAL → CURRENT_SETUP → ASSESSMENT → RECOMMENDED_PATH`
- Resumable: state is persisted server-side, so a user can leave and return.
- The client never owns the sequence; every step is server-validated.
- Emits §94 events: `signup_completed`, `business_created`, `goal_defined`, `funnel_assessment_completed`, and `build_mode_selected` / `optimize_mode_selected` / `hybrid_mode_selected`.

**Maturity engine** — `src/maturity/`
- 14 assessment areas (§16): Strategy, Website, Traffic, Lead Capture, Lead Qualification, CRM, Nurture, Sales, Customer Conversion, Retention, Analytics, Attribution, Automation, Experimentation.
- 5 states each: Not configured / Partially configured / Configured / Needs attention / Healthy.
- **Deterministic and explainable** — every state records its `reason[]` and the evidence behind it. No black box. This is what makes ONB-06 trustworthy and what the UI renders through `EvidenceList`.

**Website analyser** — async BullMQ job (§90). Fetches the URL, detects GA/GTM tags, pixels, ad pixels, existing forms, CMS, schema markup, and page-speed signals; returns an asset inventory merged into the assessment. Timeout, retry, and a clear failure path (§87) — a failed analysis must not block onboarding.

**Classifier** — `src/classifier/`
- State A–D (§15) from the maturity vector and the detected stack.
- Path recommendation (§47) with a required plain-language narrative: *"You already have traffic and a website, but you don't have a reliable lead qualification and follow-up system."*
- **Hybrid is a first-class outcome** (§48). ONB-07 offers Build, Optimize, or Hybrid, and the user can switch paths at any time.

**Front end** — ONB-01…ONB-07 using `FormWizard`, `Stepper`, and `AsyncBoundary`; each step has all five §87 states, and a review step the user must confirm before the assessment is committed.

## Exit gate

- [ ] A new user completes onboarding end to end and lands in Build, Optimize, or Hybrid
- [ ] Every maturity state shows its evidence; a reviewer can audit the reasoning
- [ ] A user with a website and no CRM is classified correctly and told the right next step (§21's exact example reproduces)
- [ ] Onboarding is resumable across a browser restart
- [ ] `business_created` → `goal_defined` → `funnel_assessment_completed` → `*_mode_selected` all appear in the product-analytics sink

---

# PHASE 6 — Funnel Spine, Blueprint & Gap Analysis

**Weeks 12–13.5 · PRD refs: §17, §21, §22, §23, §54, §56, §57, §101, §103, §104, §105, §107, §108**

## Goal

Make the funnel a first-class, **configurable** model — not hardcoded stages — and generate a blueprint that works backwards from the user's goal.

## Service: `funnel-service`

**Schema** — `Funnel · FunnelStage (ordered, typed, per-business configurable) · FunnelBlueprint · FunnelComponent (typed registry + the seven §57 states) · GapAnalysis · BlueprintAssumption`

**Stage templates** — `src/templates/`: SaaS, Ecommerce, Services/B2B, plus custom. Each declares stage semantics, the canonical event that populates it, and the expected conversion range. §54's three examples ship as templates.

**Blueprint generator** — `src/blueprint/generator.ts`
- Inputs: business type, model, audience, offer, growth goal, market, current infrastructure, available channels.
- Works **backwards from the goal** (§103/§104): GOAL → required customer action → required funnel → required traffic → required conversion → required lead volume → required nurture → required sales.
- **Every derived number is stored as a `BlueprintAssumption`** with its input, method, and confidence. §104 requires planned and measured to be visually distinct — that is a schema-level guarantee rendered by `PlanVsMeasuredBadge`, not a UI convention.
- Output: recommended stages, required assets, tracking plan, qualification approach, nurture strategy, experiment backlog, channel recommendations.

**Gap analysis** — `src/gap/`
- Scores every §16 area against the blueprint's requirements.
- Produces the §21 rendering, including *"your biggest current gap is what happens after a visitor becomes a lead"*, ranked by downstream impact rather than checklist order.
- Honours §101: returns **one** highest-priority missing piece first, not a giant checklist.

**Build vs Connect decision** — `src/strategy/build-or-connect.ts` encodes §107 explicitly: central-and-simple → build in-platform; specialist → recommend connect. Every recommendation is tagged `build_in_platform` or `requires_integration` with §22's full explanation set: what is missing, why it matters, what we propose, what you provide, what we build, what needs an integration.

**AI refinement (contract-first)** — the `ai-service` contract is defined and mocked here; the real service lands in Phase 10. A feature flag keeps the deterministic generator as the permanent fallback: **the blueprint can never be blocked on an LLM.**

**Front end** — the blueprint screen, the `FunnelDiagram` with the §23 visual flow, the component state board (§56/§57), and the progressive-build view (§102) showing what can launch now versus what is still a recommendation.

## Exit gate

- [ ] A business with nothing gets a generated blueprint from a stated goal
- [ ] The SaaS, Ecommerce, and Services templates produce visibly different funnels
- [ ] Every calculated number displays its assumption; planned vs measured is visually unambiguous
- [ ] Gap analysis returns exactly one highest-priority gap (§101)
- [ ] The §21 worked example reproduces from real input

---

# PHASE 7 — Vertical Slice 1: Build Mode — Pages, Forms, Publish

**Weeks 13.5–15.5 · PRD refs: §18, §19, §24, §25, §26, §27, §76, §87, §88, §90 · ⭐ GATE**

## Goal

Prove the Build Mode loop: **build → publish → capture → measure.** Nothing in Phase 8+ is worth building if this does not work end to end.

## Services: `page-service`, `event-service`

**`page-service`** — `LandingPage · PageVersion · Form · FormField · Asset · PublishRecord`
`schema/ (the Phase 0 frozen block document) · builder/ · render/ · publish/ · hosting/`
- The block schema covers every §24 element: page title, headline, subheadline, CTA, benefits, features, social proof, FAQ, lead form, footer, SEO metadata. Mobile-responsive by construction.
- **Versioning** — every save creates a `PageVersion`; publish pins one; rollback is a pointer change, not a migration.
- **Render route** — `GET /p/:businessSlug/:pageSlug`, server-rendered, drafts `noindex` and token-gated, published pages cacheable with `stale-while-revalidate`.
- **Forms** (§27) — field types: name, email, phone, company, custom, consent, hidden. Server-side validation is authoritative. Consent text is versioned with the submission. Honeypot, per-IP rate limit, optional double opt-in.
- **Auto-instrumentation** (§76) — publishing a page emits a tracking-plan manifest: `page_view`, `cta_click`, `form_viewed`, `form_submitted`, `form_error`. No manual tracking setup, ever.
- **AI page generation** (§25) — the AI proposes content from business context; it **must not invent** testimonials, statistics, certifications, awards, or guarantees. Unavailable content becomes a `ConfirmRequired` placeholder that blocks publish until the user confirms or removes it.

**`packages/tracking`** — ≤ 4 KB gzipped, queue-and-flush, offline-tolerant, **no PII in the payload**, consent-aware and cookieless-first. Anonymous identity stitching via first-party `anonymous_id`, promoted to `customer_id` on first known contact. First-party `/collect` proxy option for strict-consent regimes.

**`event-service`**
```
POST /v1/events          one event
POST /v1/events/batch    up to 500
GET  /v1/events/:id      readback for verification
```
- Validates against `event-contracts`; rejects unknown types with a 400 naming the offending field.
- `event_id` idempotency — replays are dropped, counted, reported.
- p95 < 50 ms acknowledged; the write path is a Redis Stream append, never a synchronous ClickHouse insert.
- Fan-out via BullMQ into ClickHouse, plus rolling raw retention in Redis.

**Front end** — the page builder using `LandingBlockRenderer` and `DevicePreviewFrame`; form builder; the four primary actions Edit / Save / Preview / Publish (§26); the §88 empty state; a publish dialog that surfaces every unconfirmed AI placeholder.

## Exit gate — ⭐ SLICE 1 (§119)

- [ ] `Business → goal → assessment → blueprint → build landing page → create form → capture lead → show lead → show funnel → measure conversion`
- [ ] A real browser visit produces a `page_view`; a real submission produces `form_submitted` + `lead_created`, visible in the funnel view within 60 seconds
- [ ] Drafts are unreachable by the public; published pages render correctly at 360 / 768 / 1440
- [ ] Consent is recorded with the exact text version shown to the user
- [ ] Generated content contains zero fabricated testimonials, statistics, awards, certifications, or guarantees — verified by scanning output for forbidden claim types
- [ ] The published page passes axe and the landing bundle budget

**If this gate fails, stop. Do not begin Phase 8.**

---

# PHASE 8 — Leads, Qualification, Routing & Nurture

**Weeks 15.5–17 · PRD refs: §28, §29, §30, §31, §57, §68, §69, §76, §102**

## Goal

Make captured leads become **owned, qualified, followed-up** records, and make the funnel advance on real customer actions.

## Services: `lead-service`, `workflow-service`

**`lead-service`** — `Lead · Customer · Opportunity · LeadActivity · ScoreRule · RoutingRule`
`lifecycle/ (FSM: new → contacted → qualified → opportunity → customer → lost) · scoring/ · qualify/ · routing/ · customers/ · activity/`
- **Scoring is transparent rules with an auditable ledger** — "+20 Requested demo", "+15 Company size matches" — and every score change records which rule fired. §29 asks for honesty about intelligence; the UI shows the rules, not a score out of nowhere.
- **Qualification** builds §28 questions whose answers can set score, lifecycle stage, owner, route, and workflow.
- **Routing** supports nested conditions and the four §30 actions. Idempotent: a re-delivered `lead.created` never double-routes.
- **Customer** (distinct from Lead per §71) with lifecycle stage, funnel position, revenue, and full interaction history. Deliberately not an enterprise CRM (§109).

**`workflow-service`** — `Workflow · WorkflowStep · WorkflowRun · WorkflowRunLog`
`engine/ (wait · email · check-engagement · branch · webhook · update-field) · triggers/ · schedule/ · email/ (interface · dev-mailpit · smtp · resend)`
- The §31 step set: Lead Created → Wait 1 day → Send Email → Wait 2 days → Check Engagement → Branch. Multi-channel automation is explicitly deferred.
- Runs are resumable, inspectable, pausable, idempotent. A failed step retries per policy then parks with a visible reason (§92).
- Emits `funnel.email_sent`, `funnel.email_opened`, `funnel.email_clicked`, closing the attribution loop.

**Front end** — lead list and detail (§69) with all ten facets; Customers screen (§68); workflow builder using `WorkflowStepEditor`; routing rule editor using `RuleBuilder`; the progressive-build panel showing funnel coverage as components are added (§102).

## Exit gate

- [ ] A submission produces a lead with full source / campaign / landing-page / UTM / device attribution
- [ ] Qualification rules assign score, stage, and owner; the score ledger shows why
- [ ] A routing rule assigns the right owner and fires a workflow, exactly once
- [ ] A 3-email nurture sequence executes on schedule; opens and clicks appear on the lead timeline
- [ ] The funnel view shows the lead advancing stages from real events

---

# PHASE 9 — Vertical Slice 2a: Integrations, Sync & Analytics

**Weeks 17–19.5 · PRD refs: §32, §33, §34, §49, §50, §51, §53, §55, §70, §74, §75, §76, §107 · ⭐ GATE (data half)**

## Goal

Connect the outside world into one canonical model. This is the heaviest phase and the one that most often turns into a monolith, because *"just add an API call"* is tempting. The Connector SDK is the structural defence, and it was specified in Phase 0.

## Services: `integration-service` (+ `connector-worker`), `analytics-service`

**`packages/connector-sdk`**
```ts
export interface Connector {
  definition: ConnectorDefinition;   // auth type, scopes, rate limits, cursor strategy,
                                    // freshness SLA, required fields
  authorize(oauth): Promise<TokenSet>;
  refresh(token): Promise<TokenSet>;
  pull(ctx: { account; cursor; window }): Promise<RawPage>;   // paged, resumable
  normalize(raw: RawPage): EventEnvelope[];                    // → canonical model
  health(account): Promise<SourceHealth>;
}

export interface FixtureRunner {   // §117: fixtures are LABELLED, never disguised
  readonly isFixture: true;         // surfaced in the UI as "Sample data"
  replay(connector, fixturePath): Promise<EventEnvelope[]>;
}
```
- A contract-test harness: a connector that passes it can be wired to the UI with no bespoke integration story.
- Rate limiting, backoff, quota accounting, and pagination are implemented **once** in the SDK.

**Six connectors** (§34)

| Connector | API | The normalisation trap |
|---|---|---|
| Google Analytics 4 | Data API | Sessions vs users vs sessions-with-conversion must not be silently conflated |
| Google Search Console | Search Analytics | The 2-day reporting lag is surfaced in freshness, never hidden |
| Google Ads | Google Ads API | Currency and timezone normalisation; **cost is a revenue-*adjacent* metric, never revenue** |
| Meta Ads | Marketing API | Attribution-window differences versus Google — a comparison trap worth naming in the UI |
| CRM (HubSpot) | CRM API | Contact / deal / company identity stitching into `Customer` + `Opportunity` |
| Website | Own tracker + page audit | First-party is the highest-trust source; it anchors the model |

- Every connector ships with **recorded fixtures** in `infra/fixtures/connectors/`, replayed in sandbox mode, and the Integration UI labels sandbox data explicitly so a fixture is never mistaken for a real connection.
- Future connectors (LinkedIn, TikTok, Klaviyo, ActiveCampaign, WhatsApp, Salesforce) require only a new `Connector` and a manifest entry — no change to `integration-service`.

**`integration-service`** — `Integration · IntegrationAccount · SyncJob · SyncError · RawRecord`
`oauth/ (FSM: authorize → callback → connected → needs-reauthorization → error) · crypto/ (token vault, envelope encryption, KMS interface) · sync/ (orchestrator · scheduler · cursor store · backfill) · status/ (the eight §70 states as a typed machine) · webhook/`
- Sync status exposes every §49 field: source, status, progress, last sync, records processed, errors.
- Resumable cursors, backfill windows, dedupe on external key, dead-letter queue, and a recovery path that replays failures without a full re-sync.
- Tokens are envelope-encrypted; plaintext never touches the database or a log.

**`analytics-service`** — ClickHouse for the event plane, PG for control data
```
ClickHouse: events · sessions · funnel_daily · metric_daily · campaign_daily · source_freshness
PG:         MetricDefinition · FunnelSnapshot · DataQualityIssue · ReportSchedule
src/: rollup/ · query/ · health/ · quality/ · internal/ai-context.controller.ts
```
- All §50 initial-analysis metrics, all §55 funnel-detail dimensions, and the §51 health score.
- **Freshness is a first-class column** (§75) that lowers insight confidence and caps AI confidence — not a display detail.
- Rollups are idempotent and re-runnable: a late event corrects its day rather than corrupting history.
- The eight §74 data-quality checks fire on demand and on a schedule.

**Front end** — Integration Center with all eight §70 states, `SyncProgress`, source freshness badges, the unified funnel combining Build-mode and external data, and the `MarketingHealth` card (§51).

## Exit gate — ⭐ SLICE 2 (data half)

- [ ] All 6 connectors pass the SDK contract suite
- [ ] A sandbox sync completes and shows status, progress, records processed, and errors
- [ ] A **real credentialed** sync for at least GA4 and Search Console completes against live accounts
- [ ] Build-mode leads and external ad/search metrics appear in one funnel view
- [ ] Data-quality checks fire on deliberately corrupted data, and a stale source visibly reduces confidence
- [ ] The §119 Slice 2 sequence diagram executes end to end as far as the data layer allows; **insight, AI, recommendation, and action complete in Phases 10–11**

---

# PHASE 10 — Insights, AI Analyst & Recommendations

**Weeks 19.5–21.5 · PRD refs: §10, §51, §58, §59, §60, §61, §62, §63, §64, §75, §82, §83, §106**

## Goal

Turn a functioning pipeline into an **explaining** system. This is where the product stops being a dashboard and becomes an operating system.

## Services: `insight-service`, `recommendation-service`, `ai-service` (Python/FastAPI)

**`insight-service`**
`detectors/ (anomaly — robust z-score, seasonal-aware · leakage · conversion-change · campaign-change · data-quality · tracking-issue) · health/ (§51) · insight.fsm.ts (new → acknowledged → actioned → dismissed → expired)`
- All eight §58 insight types.
- Every insight carries **evidence**: metric, value, comparison window, source freshness. An insight without evidence **cannot be created** — enforced in the schema, not the UI.
- Confidence is penalised by data freshness (§75) and by low sample size.

**`ai-service`** — Python 3.12, FastAPI, port 3132
```
app/
├─ main.py · config.py · security.py
├─ api/          chat.py · generate/{page,form,qualification,nurture,seo}.py · plan.py
├─ grounding/    context_client.py (READ-ONLY, no DB) · sufficiency.py · retrieval.py
├─ response/     contract.py (§60 five sections) · claims.py (fact|analysis|hypothesis|recommendation)
├─ safety/       forbidden_claims.py (classifier + [[CONFIRM_REQUIRED]] injection)
├─ tools/        registry.py · permission_layer.py (risk, requiredRole, autonomy L0–L3)
├─ prompts/      registry.py (versioned, hash-pinned, reviewable in PRs)
├─ providers/    llm.py (Anthropic / OpenAI / local)
└─ evals/        harness.py · datasets/
```

| Requirement | How it is enforced | How it is proven |
|---|---|---|
| §61 no fabricated metrics | The AI has **no database access**; it reads only the context endpoint's `sufficiency` block | A unit test asserts refusal when `sufficient: false` |
| §60 response structure | Pydantic-validated contract; the UI renders the five sections via `AiChatTranscript` | Contract tests over 200 seeded questions |
| §60 claim typing | Every sentence tagged fact / analysis / hypothesis / recommendation | Eval asserts ≥ 95% correct tagging |
| §63 content safety | Pre-generation allowlist + post-generation forbidden-claim classifier injecting `[[CONFIRM_REQUIRED: …]]` | Eval: 0% fabricated claims across 500 generated pages |
| §82 AI action security | Typed tool registry; each tool declares `risk`, `requiredRole`, `autonomyLevel`. L3 prepares an Action for approval and **never** executes | Test asserts no L0–L3 tool can mutate external state (A9) |
| §83 autonomy levels | Enforced per tool at the permission layer | One test per level |
| §75 freshness | `confidenceCap` applied to every claim | Test with a stale source asserts reduced confidence |

- **Grounded analyst questions** (§59): what is missing from my funnel · why did my leads decrease · what should I build first · which campaign generated customers · what should I optimize.
- **AI Marketing Planner** (§105): strategy, channels, stages, assets, tracking plan, qualification approach, nurture strategy, experiment ideas — each with its stated assumptions, per §104's honesty requirement.
- **Build Mode generation** (§62): page structure, copy, CTAs, forms, qualification questions, workflow design, SEO metadata, nurture sequences.
- Full prompt provenance: prompt version, model, token count, latency, and cost recorded per generation.

**`recommendation-service`** — `Recommendation · RecommendationFeedback · Learning`
`generators/ (missing-infrastructure · performance-problem · data-problem · optimization-opportunity · growth-opportunity) · priority/ (impact × confidence ÷ effort) · feedback/`
- All five §106 types.
- Every recommendation carries the complete §64 field set. **A database check constraint rejects a recommendation missing any of them** — the field list is a schema guarantee, not a UI checklist.
- Priority is computed, not authored, with the formula exposed in the UI.
- Deduplication by similarity, so the user never sees the same recommendation twice.
- `Learning` records link action → outcome → measured delta and adjust future confidence. This is the §113 moat, started early.

**Front end** — the Insights feed filtered by the eight types; the AI Analyst rendering evidence and claim-type labels distinctly; Recommendations with problem / evidence / impact / confidence / effort; and a *"why am I seeing this?"* affordance on every insight.

## Exit gate — ⭐ SLICE 2 COMPLETE

- [ ] `CONNECT DATA → SYNC → FUNNEL → INSIGHT → AI ANALYST → RECOMMENDATION`
- [ ] "Why did my leads decrease?" returns a structured, cited answer with claim typing
- [ ] "What is missing from my funnel?" answers from the assessment and blueprint, citing them
- [ ] With insufficient data, the AI **refuses** rather than guessing — proven by test
- [ ] 500 generated pages contain zero fabricated testimonials, statistics, awards, certifications, guarantees, or claims
- [ ] No recommendation renders without all ten §64 fields (DB-enforced)

---

# PHASE 11 — Action Center, Approvals & Notifications

**Weeks 21.5–23 · PRD refs: §65, §66, §77, §82, §84, §92, §94 · ⭐ SLICE 2 CLOSES**

## Goal

Complete the Insight → Action → Outcome chain. A product that only *recommends* is a report generator.

## Services: `action-service`, `notification-service`

**`action-service`** — `Action · Approval · ActionExecution · ActionArtifact`
`action.fsm.ts (Draft → PendingApproval → Approved → Executing → Completed | Failed | Cancelled, guarded transitions) · risk.ts · executors/ (create-page · modify-page · create-form · create-workflow · create-experiment · connect-crm · create-follow-up · fix-tracking · update-campaign) · execution/ (dispatcher · retry · compensation)`
- All nine §65 action types.
- **Risk-based approval** — any action with external or customer-visible impact requires approval. Non-trivial by default; auto-approval is opt-in per role and never applies to external writes.
- `update-campaign` deliberately **does not** push changes into an ad platform. It produces a reviewable change plan for the user to apply in the ad manager. This respects §82 and §109 and avoids a class of irreversible damage.
- Every transition is audited with actor, result, and reason (§84); every execution is idempotent and traceable.
- Failures surface a recovery path, not a dead end (§92).

**`notification-service`** — `Notification · Preference · DeliveryAttempt`
`dispatcher · channels/{in-app,email,webhook} · digests · dedupe`
- All eight §77 notification types.
- Per-user, per-type, per-channel preferences (§78), quiet hours, digest batching, and dedupe — so one failing sync does not produce 4,000 notifications.
- Delivery attempts are recorded; failures retry without blocking the originating action.

**Front end** — the Action Center board, the approval queue showing the evidence that motivated each action, the execution log, and the notification centre.

## Exit gate — ⭐ SLICE 2 FULLY CLOSED

- [ ] `CONNECT DATA → SYNC → FUNNEL → INSIGHT → AI ANALYST → RECOMMENDATION → ACTION → MEASUREMENT`
- [ ] A recommendation is accepted → becomes a draft Action → requires approval → approved → executed → audited → user notified
- [ ] A failed action surfaces a reason and a recovery path; it never silently disappears
- [ ] The executed action's outcome is linked back as a `Learning` record
- [ ] No action mutated an external system without a recorded approval (A9)

---

# PHASE 12 — Vertical Slice 3: Experiments & the Learning Loop

**Weeks 23–24.5 · PRD refs: §67, §71, §96, §97, §98, §110, §113**

## Goal

Close the loop: the system must find out whether its own advice worked, and remember.

## Service: `experiment-service` — `Experiment · Variant · ExperimentResult · Exposure`

`fsm.ts (draft → running → paused → completed | stopped | invalidated) · assignment.ts · exposure.ts · stats.ts · learning.ts`
- The full §67 model: hypothesis, control, variant, audience, primary metric, secondary metrics, baseline, dates, result, learning.
- **Stable, unbiased assignment** — the same visitor always sees the same variant, computed identically on server and client, with a **sample-ratio-mismatch guard** that halts a test if allocation is broken.
- Landing-page A/B integrated with `page-service` (a variant is a page version).
- Business-outcome metrics take priority over vanity metrics: the UI will not present a CTR win as a success when revenue is flat.
- **Inconclusive is a first-class result** with an honest explanation, not a failure.
- `experiment_completed` and `outcome_recorded` product events (§94).

**Front end** — experiment list, builder with hypothesis and metric selection, variant editor, live results with guardrails, and a completed view that leads with the learning.

## Exit gate — ⭐ SLICE 3 (§119)

- [ ] `EXISTING ASSETS + MISSING COMPONENTS → HYBRID FUNNEL → MEASURE → OPTIMIZE`
- [ ] An experiment runs, reaches sample size, and returns a statistically honest verdict on a business-outcome metric
- [ ] Assignment is stable across sessions and devices
- [ ] The learning is retrievable and demonstrably influences a later recommendation's confidence
- [ ] An inconclusive test is reported as inconclusive

---

# PHASE 13 — Hardening, Security, Observability & Production

**Weeks 24.5–27 · PRD refs: §81, §84, §85, §86, §87, §90, §92, §93, §115, §116, §117**

## Goal

Turn a working system into a trustworthy one. Scheduled last, but nothing here is a retrofit: the instrumentation landed in Phase 0, the security model in Phase 3, the accessibility guarantees in Phase 1.

## Outputs

**Security** (§81) — full checklist, one test per item
- TLS everywhere; HSTS; secure session cookies; refresh-token rotation with reuse detection
- OAuth hardening: PKCE, state, nonce, exact redirect-URI matching, minimal scopes
- Envelope encryption for all integration tokens; KMS interface; key rotation
- RBAC audit: every endpoint declares its required permission; CI fails on any endpoint that does not
- Rate limiting per tenant and per IP; zod validation on every request at the pipe
- Webhook signature verification on every inbound webhook
- CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`
- Secret, dependency, and image scanning in CI
- **Tenant-isolation penetration suite** — cross-tenant access attempted on every entity type; all must return 404
- DSAR tooling per §81 and the Phase 0 compliance baseline (a release blocker for EU and African customers)

**Observability** (§93) — OpenTelemetry across all 18 services including Python; traces propagate from the browser through the gateway, services, queue, and AI service
- Prometheus + Grafana for API latency, DB performance, integration failures, queue depth, job failures, AI latency, AI errors, action failures, workflow failures, data freshness
- Sentry with tenant-tagged errors; alerting rules with an on-call runbook link each
- SLOs: ingestion availability 99.9%, dashboard p95 < 400 ms, AI response p95 < 8 s, with burn-rate alerts

**Performance** (§90) — load-test the ingestion path against a documented target; API p95 budgets per endpoint class; ClickHouse partition, TTL, and materialised-view policy; queue backpressure behaviour; and a full audit that **no request path blocks on a sync job** (A10).

**Reliability** (§92) — retry, idempotency, failure states, job tracking, integration recovery, and graceful-degradation tests. Fault injection: kill any one service and verify no cascade.

**Accessibility** (§86) — WCAG 2.2 AA audit of the app **and of published customer landing pages**; screen-reader pass on the funnel, insights, AI Analyst, and approvals; `axe` in CI with zero serious violations; textual chart summaries everywhere.

**Testing**
```
unit          service business logic, scoring, routing, assignment
integration   Testcontainers (PG, Redis, ClickHouse) per service
contract      consumer-driven tests per HTTP and event boundary
design        Storybook interaction tests + visual regression
e2e           the three §119 slices, executed against the Phase 0 sequence diagrams
resilience    retry, idempotency, DLQ, partial failure
security      RBAC matrix, tenant isolation, input validation
ai            groundedness, citation accuracy, forbidden-claim rate, refusal correctness
```

**Deployment** — per-service multi-stage non-root Dockerfiles; Kubernetes + Helm with per-service HPA, resource limits, and PDB; migrations as pre-deploy jobs, expand/contract only; CI/CD `build → test → scan → migrate → canary → verify → promote` with automatic rollback; **a feature flag behind every new capability**, so risk is decoupled from deploy.

**Documentation** — C4 diagrams, service catalogue, data dictionary, published aggregated OpenAPI 3.1, per-service runbooks, on-call handbook, incident templates, and a connector guide: *how to add an 8th integration in one day.*

## Exit gate

- [ ] All three vertical slices pass in CI against a prod-like stack
- [ ] §115 Definition of Done enforced on every PR
- [ ] §81 security checklist complete with a passing test per item
- [ ] Fault injection: no single service failure causes a cascade
- [ ] WCAG 2.2 AA audit passed on the app and on published pages
- [ ] Load-test results documented against targets
- [ ] **The §2 "still microservices" checklist is fully satisfied**

---

## 14. Reference: service topology and data ownership

### Tier 0 — Platform (no business domain)

| Service | Port | Owns | Purpose |
|---|---|---|---|
| `api-gateway` | 3000 | — | Only public entry point. JWT verification, rate limiting, routing, BFF aggregation, webhook ingress, trace propagation |
| `packages/shared` | — | — | Tenant interceptor, RBAC guard, RFC 9457 errors, pagination, logger, zod env config |
| `packages/event-contracts` | — | — | Canonical events (§72, §73) as zod + JSON Schema, versioned |
| `packages/connector-sdk` | — | — | Connector interface, OAuth helpers, fixture runner, contract-test harness |
| `packages/tokens` | — | — | The design-token single source (§4.2) |
| `packages/ui` / `patterns` / `charts` | — | — | The design system |
| `packages/landing-runtime` | — | — | Renderer for published customer pages |
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
| `connector-worker` | 3121 | Connector processes (6 providers), same codebase as `integration-service` |

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

### Data ownership map (enforces A2)

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

> **Where Campaign lives:** raw ad-platform campaign objects are normalised by `connector-worker` and written to ClickHouse as `campaign_*` events. The app never persists a mutable campaign row — ad platforms remain the system of record, per §107/§109.

---

## 15. Requirement traceability

Every PRD section maps to a phase. If a section is unlisted, it was not silently dropped.

| PRD | Section | Phase |
|---|---|---|
| §1–§14 | Product, vision, personas, JTBD | Framing — informs all |
| §15 | Starting-state model (A–D) | 5 |
| §16 | Maturity assessment (14 areas) | 5, refined 6 |
| §17 | Funnel blueprint | 6 |
| §18–§23 | Build Mode MVP, journey, gap analysis, builder | 6, 7, 8 |
| §24–§26 | Page builder, AI page generation, preview | Schema frozen 0 · system 1 · builder 7 |
| §27–§31 | Lead capture, qualification, scoring, routing, nurture | 7, 8 |
| §32–§34 | Optimize Mode, stack assessment, integrations | 9 |
| §35 | Product architecture | §14 topology, decisions 0 |
| §36–§38 | Public website and homepage | 4 |
| §39 | Authentication | 3, 4 |
| §40–§48 | Onboarding and hybrid mode | 5 |
| §49–§51 | Data sync, initial analysis, marketing health | 9 |
| §52 | Marketing OS navigation | Shell 4 · `NavRail` 1 · filled 5–12 |
| §53–§55 | Overview, funnel, funnel detail | 1 (components) · 9 · 10 |
| §56–§57 | Build screen, component states | 6, 7 |
| §58 | Insight types | 10 |
| §59–§63 | AI Analyst, response structure, grounding, Build AI, content safety | Decisions 0 · patterns 1 · service 10 |
| §64 | Recommendation fields | 10 (DB constraint) |
| §65–§66 | Action Center, action states | 11 |
| §67 | Experiments | 12 |
| §68–§69 | Customers, lead management | 8, 9 |
| §70 | Integration Center states | 9 |
| §71 | Canonical data model | 0 (drafted) · ownership §14 · built 3–12 |
| §72–§73 | Event model and canonical events | 0 (contract) · 7–9 (emission) |
| §74–§75 | Data quality, freshness | 9, consumed 10 |
| §76 | Build data requirements | 7 |
| §77–§78 | Notifications, settings | 11, 4 |
| §79 | User roles | 3 |
| §80 | Multi-tenancy | 0 (design + spike S2) · 3 · 13 |
| §81 | Security | 0–3 · hardened 13 |
| §82 | AI action security | 0 (architecture) · 10 (permission layer) · 11 (execution) |
| §83 | AI autonomy L0–L3 | 0 · 10 |
| §84 | Audit log | 3, extended each phase |
| §85–§86 | Responsive, accessibility | 1 (token + CI gates) · 4 · 13 |
| §87 | Global UI states | 1 (`AsyncBoundary` primitive) · enforced 13 |
| §88–§89 | Empty states | 1 (content design) · per feature |
| §90–§92 | Performance, background jobs, reliability | 0 · 2 · 13 (verified) |
| §93 | Observability | 0 (instrumented) · 2 · 13 (dashboards) |
| §94 | Product analytics | 0 (pipeline) · emitted from 5 onward |
| §95–§99 | Activation and success metrics | 9, 11, 12 |
| §100 | Core user journey | End-to-end at 13 |
| §101–§105 | Progressive building, goal-first, goal-to-funnel, planner | 6 (engine) · 7–8 (progressive) · 10 (planner) |
| §106 | Recommendation types | 10 |
| §107 | Build vs Connect | 6 (decision engine) · 9 (connectors) |
| §108–§109 | MVP boundary, not building | Enforced by scope; reviewed at 13 |
| §110–§114 | Long-term, roadmap, moat | Post-MVP; `Learning` groundwork 10, 12 |
| §115 | Definition of Done | 0 (PR template) |
| §116–§117 | Builder instructions / prohibitions | CI-enforced; §2 rules |
| §118 | Build order | This plan, reordered per your instruction |
| §119 | Critical vertical slices | Gates at 7, 9–11, 12 |
| §120–§122 | MVP success, loop | Phase 13 demo |

---

## 16. Risks and mitigations

| # | Risk | Signal | Mitigation |
|---|---|---|---|
| R1 | **The design system becomes a museum** — built, then bypassed by feature teams under deadline | Any new hardcoded value or bespoke component after Phase 4 | A7 makes it a CI failure, not a review comment. `DEPRECATED` + codemod rather than silent break (ADR 0022). Phase gates restate "zero new CSS" |
| R2 | **Design decisions deferred into feature work anyway** | An ADR proposed during Phase 6 | Rule 2: no service is written against a shape that is not already a versioned contract. The Phase 0 spike outcomes are the forcing function |
| R3 | **Phase 0 produces documents nobody reads** | ADRs written but not referenced in PRs | The §115 PR template references the applicable ADR by number; contract tests are generated from the contracts |
| R4 | **Integrations expand until they dominate the schedule** (Phase 9 is 2.5 weeks for 6 connectors + analytics) | Phase 9 slipping past week 20 | Connector SDK built and contract-tested *before* the first connector. If behind at week 19, ship GA4 + Search Console live and the rest as labelled sandbox. **The pipeline is the product; the connector count is not** |
| R5 | **Phase 7 Slice 1 fails late** | No `form_submitted` in ClickHouse by week 15.5 | Phase 7 is the first slice gate and the plan hard-stops there. `event-service` is built in Phase 7, not deferred, because everything downstream depends on it |
| R6 | **AI fabricates or over-claims** (§61, §63) | Any eval showing invented metrics or claims | Structural, not prompt-level: no DB access, an enforced `sufficiency` refusal, a forbidden-claim classifier, claim typing, a 500-page eval in CI. §63 is a release blocker |
| R7 | **The event backbone outgrows Redis Streams** | > 50k events/s or > 7-day replay needed | Outbox + envelope are transport-agnostic; migrating to Kafka changes the relay, not the producers or consumers. ADR 0004 records the exact trigger |
| R8 | **"Microservices" collapses into a distributed monolith** | Any service reading another's tables; any request fanning out > 3 sync hops | Rules A1–A4, a service-calls audit in OTel traces, and the §2 checklist as a Phase 13 gate |
| R9 | **ClickHouse modelling mistakes discovered late** | Rollup queries slow at realistic volume | Spike S1 in Phase 0 designs against the §55 dimension matrix; load-tested in Phase 9 before Phase 10 builds on it |
| R10 | **Tenant isolation has a hole in a background worker** | Spike S2 finds a pooling or worker-context failure | The spike runs first. A worker with no request context must set the tenant explicitly; a test asserts it cannot run unscoped |
| R11 | **Onboarding becomes a 12-field form nobody finishes** | Completion < 60% in the first cohort | §101's progressive principle applied to onboarding itself: assess with what we know, ask only for what changes the recommendation, let the user skip and refine later |
| R12 | **Config sprawl** — stages, scoring, routing, workflows all configurable | Configuration exceeds the code that reads it | Every configurable object ships with a validated schema, sane defaults, a UI editor, and a "reset to recommended" escape hatch |
| R13 | **Compliance (GDPR/POPIA/NDPR) discovered late** | A data-subject deletion request arrives | Consent versioning and PII-free event payloads are designed in at Phase 0 and implemented in Phase 7, not retrofitted. DSAR tooling is a Phase 13 release blocker |
| R14 | **Two people, not four** | — | Same phase order, ~38 weeks, cutting Phase 13 scope last. **Never cut Phase 0, Phase 1, or the Slice 1 gate** |

---

## 17. What this plan deliberately does not build

Per §109 and §117. Stated explicitly so scope creep has to be argued for, not assumed.

- Full replacements for Salesforce, HubSpot, Mailchimp, Klaviyo, Meta Ads Manager, Google Ads, WordPress, Webflow
- Multi-channel / omni-channel automation beyond email (deferred past MVP)
- Predictive lead scoring (§29 asks for rules-based in MVP)
- Autonomy above L3 (§83: L4 and L5 are post-MVP)
- A full enterprise CDP or enterprise CRM
- Cross-channel campaign **execution** — the platform produces change plans; humans apply them in the ad platforms
- Custom roles (the RBAC model supports them; the UI ships the four §79 roles)
- Advanced agency management (§13 explicitly excludes it)
- A developer platform (§111 Phase 8, post-MVP)

---

## 18. Immediate next steps

1. **Approve or amend this plan** — especially §3 (the order and the three slice gates) and §4.1 (the 22 ADRs, particularly ADR 0015–0022, which define the design system).
2. **Phase 0, week 1** — write ADRs 0001–0022, run spikes S1–S4, land the §115 PR template, and freeze the three contracts. Nothing else starts until the contracts are versioned and the spikes have written outcomes.
3. **Confirm credentials in week 1.** A Google Cloud project (GA4 + Search Console + Google Ads), a Meta app, and a HubSpot developer account are the longest-lead items in the plan and they gate Phase 9. Requesting them in week 1 costs nothing; discovering them in week 17 costs a phase.
4. **Phase 1, week 2** — stand up `packages/tokens` and the Storybook shell so the design system has a visible surface from day one, and the screen-inventory exit gate can actually be run against something.
