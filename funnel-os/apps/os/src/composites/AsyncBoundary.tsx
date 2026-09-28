/**
 * The §87/§88/§89 primitives: AsyncBoundary, EmptyState, PartialDataBanner.
 *
 * ------------------------------------------------------------------ *
 * WHY THESE EXIST AS ONE COMPONENT
 * ------------------------------------------------------------------ *
 *
 * §87 names five states for async content. The tempting implementation is a
 * `<Loading>` and an `<Error>` and a `{data && ...}`, which is three states and
 * silently drops two. Dropped are:
 *
 *   - **partial** — some sources are incomplete. Rendering the subset without
 *     saying so is the failure §87 exists to prevent, and it is the one that
 *     looks most like success.
 *   - **empty** — distinct from error. A screen that shows "could not load" for
 *     a legitimately empty list has told the user something false.
 *
 * So the boundary takes a query and renders the right thing for each state,
 * which makes it impossible for a screen to forget one: the states are not
 * optional, they are the only branches there are.
 *
 * That is five from §87 plus `idle`, for a query that was never made. The
 * branch is here rather than in each screen because the alternative is each
 * screen deciding what "no request" looks like, and the version where that
 * decision leaked into the screens rendered a spinner for content that was
 * never going to arrive.
 */

import * as React from 'react';
import { Button, Card } from '@funnelos/ui';
import { color, space, font } from '@funnelos/ui';
import type { QueryResult } from '@funnelos/api-client';

/* ------------------------------------------------------------------ *
 * AsyncBoundary
 * ------------------------------------------------------------------ */

export interface AsyncBoundaryProps<T> {
  query: QueryResult<T>;
  children: (data: T) => React.ReactNode;
  /** §88: what is missing, in the user's terms. */
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: React.ReactNode;
  loadingLabel?: string;
  /** Rendered above the content when the query is partial. */
  renderPartial?: (sentence: string, data: T) => React.ReactNode;
  /**
   * What to show when the query was never made (`enabled: false`).
   *
   * Defaults to `null` — render nothing. A spinner would be a lie, since
   * nothing is loading; an empty state would be a bigger one, since "there is
   * nothing here" is a claim about the world and nothing was asked. Silence is
   * the only honest option, which is the entire reason `idle` is its own state
   * rather than being folded into `empty`.
   */
  idleFallback?: React.ReactNode;
}

export function AsyncBoundary<T>({
  query,
  children,
  emptyTitle = 'Nothing here yet',
  emptyBody,
  emptyAction,
  loadingLabel = 'Loading',
  renderPartial,
  idleFallback = null,
}: AsyncBoundaryProps<T>) {
  if (query.status === 'error') {
    return (
      <ErrorState
        title="Could not load this"
        body={query.error.message}
        hint={
          query.error.code === 'network'
            ? 'The API is not responding. Start it with `pnpm --filter @funnelos/api dev`.'
            : undefined
        }
        onRetry={query.refetch}
      />
    );
  }

  if (query.status === 'idle') {
    return <>{idleFallback}</>;
  }

  if (query.status === 'loading') {
    return <LoadingState label={loadingLabel} />;
  }

  if (query.status === 'empty') {
    return <EmptyState title={emptyTitle} body={emptyBody} action={emptyAction} />;
  }

  const data = query.data;

  return (
    <>
      {query.status === 'partial' && query.partial ? (
        renderPartial ? (
          renderPartial(query.partial, data)
        ) : (
          <PartialDataBanner sentence={query.partial} />
        )
      ) : null}
      {children(data)}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * The five states, individually exported because a screen sometimes needs
 * exactly one of them (a drawer body that is loading but whose header is not).
 * ------------------------------------------------------------------ */

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="os-state" role="status" aria-live="polite">
      <div
        aria-hidden="true"
        style={{
          width: space['6'],
          height: space['6'],
          borderRadius: 'var(--ds-radius-full)',
          border: `var(--ds-border-width-thick) solid ${color.border.default}`,
          borderTopColor: color.brand.solid,
          animation: 'os-spin 700ms linear infinite',
        }}
      />
      <span className="os-muted">{label}…</span>
    </div>
  );
}

export function ErrorState({
  title,
  body,
  hint,
  onRetry,
}: {
  title: string;
  body: string;
  hint?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="os-state" role="alert">
      <div
        aria-hidden="true"
        style={{
          display: 'grid',
          placeItems: 'center',
          width: space['10'],
          height: space['10'],
          borderRadius: 'var(--ds-radius-full)',
          background: color.status.danger.bg,
          color: color.status.danger.fg,
          fontSize: font.size.xl,
          fontWeight: font.weight.bold,
        }}
      >
        !
      </div>
      <p className="os-state__title">{title}</p>
      <p className="os-state__body">{body}</p>
      {hint ? <p className="os-tiny">{hint}</p> : null}
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/**
 * §88/§89 voice: what is missing, why it matters, one primary action. Not
 * "No data". A user who reads "No data" and then "Add your first funnel" has
 * been told a fact and given an instruction, but has not been told why either
 * matters.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  /**
   * Optional. A title plus a next action is a complete empty state; forcing a
   * paragraph to fill the space is how empty states end up explaining that
   * there is nothing here, which is the one thing the user already knows.
   */
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="os-state">
      <p className="os-state__title">{title}</p>
      <p className="os-state__body">{body}</p>
      {action ? <div className="os-row">{action}</div> : null}
    </div>
  );
}

/**
 * §87 partial. Says *which* source is incomplete and *what it affects*.
 *
 * "Some data is delayed" satisfies nothing. The caller passes a sentence it has
 * already composed from the specific sources, and this component's only job is
 * to make it impossible to miss.
 */
export function PartialDataBanner({ sentence, affects }: { sentence: string; affects?: string }) {
  return (
    <div
      className="os-sample-banner"
      role="status"
      // `color.status.warning.solid` for the border, not `color.brand.border`.
      // This is a *warning* about missing data, and giving it the brand's blue
      // edge makes it read as an ordinary section header. The semantic status
      // trio is fg/bg/solid; there is no `border` member, and reaching for one
      // is how a warning ends up wearing the primary colour.
      style={{
        borderColor: color.status.warning.solid,
        background: color.status.warning.bg,
        color: color.status.warning.fg,
      }}
    >
      <span aria-hidden="true" style={{ fontWeight: font.weight.bold }}>
        !
      </span>
      <div className="os-sample-banner__body">
        <strong className="os-sample-banner__title">Some of this is incomplete</strong>
        {sentence}
        {affects ? <div className="os-tiny" style={{ marginTop: space['1'], color: 'inherit' }}>{affects}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Small shared pieces
 * ------------------------------------------------------------------ */

export function Panel({
  title,
  actions,
  children,
  flush,
  className,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={['os-card', flush ? 'os-card--flush' : '', className ?? ''].filter(Boolean).join(' ')}>
      {title || actions ? (
        <header className="os-card__header" style={flush ? { padding: space['4'], paddingBottom: space['3'] } : undefined}>
          {typeof title === 'string' ? <h2 className="os-card__title">{title}</h2> : title}
          {actions ? <div className="os-row">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/**
 * A right-hand drawer used to live here, hand-rolled, and it was wrong in a way
 * that is worth recording because it looked fine.
 *
 * It set `role="dialog"` and `aria-modal="true"`, moved focus to the first
 * focusable element, and closed on Escape. But it never trapped focus, so Tab
 * walked straight out of the open panel and into the page behind it — and
 * `aria-modal="true"` is a promise to assistive tech that the rest of the
 * document is inert. The promise was being kept in the accessibility tree and
 * broken in the keyboard, which is the worst combination: the user who most
 * depends on the promise is the one who loses.
 *
 * It also captured the element to restore focus to in a `useEffect` keyed on
 * `open`, with a comment explaining why the click handler was not used. The
 * effect is the *worse* of the two, and `Overlay.tsx` documents the
 * measurement: React runs child effects before parent effects, so by the time
 * this ran the panel had already taken focus and `restoreTo` recorded the
 * panel's own first control. Escape dropped the user inside a closed drawer.
 *
 * `@funnelos/ui`'s `Drawer` is built on Radix and does this properly. One
 * drawer, in the package that owns semantics.
 */

/** Re-exported so screens can reach the panel without a second import path. */
export { Drawer } from '@funnelos/ui';

export { Card };
