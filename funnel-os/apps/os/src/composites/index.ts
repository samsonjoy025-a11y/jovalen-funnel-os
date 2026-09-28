/**
 * Composites — the app's own vocabulary, built on `@funnelos/ui`.
 *
 * ------------------------------------------------------------------ *
 * WHY THESE ARE NOT IN `packages/ui`
 * ------------------------------------------------------------------ *
 *
 * Every composite here encodes a specific requirement from the plan. `MetricCard`
 * exists because §75 says a number without a freshness badge is not renderable;
 * `FunnelDiagram` exists because §55's eleven dimensions have to be readable at
 * a glance; `DataTable` exists because §57's list is server-driven and has to
 * say so.
 *
 * Those are not general-purpose components. Moving them into the design system
 * would mean the design system depends on a product requirement, and the next
 * reader would reasonably assume the requirement was general. They live in the
 * app, where the requirement is visible in the same directory.
 *
 * The line, then: `packages/ui` holds things whose reason for existing is
 * "this is how a control behaves". This directory holds things whose reason for
 * existing is "the plan says so".
 */

export {
  AsyncBoundary,
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  PartialDataBanner,
  type AsyncBoundaryProps,
} from './AsyncBoundary.js';

export { Bar, FunnelDiagram, GapTable, StageDetailPanel } from './Funnel.js';

export { ActionCard, InsightCard, RecommendationCard } from './Cards.js';

export { InsufficientDataCard, MetricCard, SourceFreshnessBadge } from './Metrics.js';

export { DataTable, type Column, type DataTableProps } from './DataTable.js';

export { ACTIVITY_TONE, STAGE_TONE, StageBadge } from './Stage.js';
