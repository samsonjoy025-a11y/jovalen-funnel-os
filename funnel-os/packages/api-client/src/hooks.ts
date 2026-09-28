/**
 * Query hooks.
 *
 * ------------------------------------------------------------------ *
 * WHY THE STATE UNION HAS FIVE MEMBERS AND NOT THREE
 * ------------------------------------------------------------------ *
 *
 * §87 names five states for async content: loading, empty, error, success and
 * *partial*. "partial" is the one that changes the code. It is not a flavour of
 * success — it means some of the requested data is missing and the UI has to
 * say which part and what it affects. A hook that returns `data | null | error`
 * makes partial impossible to express, so every screen invents its own way of
 * signalling it, and half of them signal it by rendering a slightly smaller
 * number with no explanation.
 *
 * The caller supplies `isPartial`. A screen that doesn't think about
 * completeness gets `isPartial` omitted, which means "this resource is either
 * wholly present or absent" — the honest default, not a hopeful one.
 */

import * as React from 'react';
import { ApiError } from './client.js';

/**
 * The state of one query.
 *
 * §87 names five states for async content: loading, empty, error, success and
 * *partial*. "partial" is the one that changes the code. It is not a flavour of
 * success — it means some of the requested data is missing and the UI has to
 * say which part and what it affects. A hook that returns `data | null | error`
 * makes partial impossible to express, so every screen invents its own way of
 * signalling it, and half of them signal it by rendering a slightly smaller
 * number with no explanation.
 *
 * There is a sixth member, `idle`, which §87 does not have because §87 is
 * describing content that was requested. A query that was never made has no
 * content and cannot be "empty" — an empty list is a statement about the
 * world, and reporting it for a request that never left is a small lie that
 * every screen then has to paper over with a special case.
 *
 * `data` is genuinely `null` in the first three members, and that is the point:
 * the first draft wrote `data: (null as unknown) as T` to satisfy itself, which
 * silenced four real type errors and replaced them with four unchecked reads.
 */
export type QueryState<T> =
  | { status: 'idle'; data: null; error: null; partial: null }
  | { status: 'loading'; data: null; error: null; partial: null }
  | { status: 'error'; data: null; error: ApiError; partial: null }
  | { status: 'empty'; data: T; error: null; partial: null }
  | { status: 'partial'; data: T; error: null; partial: string }
  | { status: 'success'; data: T; error: null; partial: null };

export interface QueryOptions<T> {
  /**
   * The caller decides what "empty" means. A list of 64 leads is not empty
   * because the array is empty only when there is genuinely nothing; a funnel
   * with zero stages is a different kind of nothing from a list with zero rows,
   * and the empty state text differs.
   */
  isEmpty?: (data: T) => boolean;
  /** §87 partial: a sentence naming what is missing, not a boolean. */
  partial?: (data: T) => string | null;
  /**
   * Skip the request entirely.
   *
   * For "not needed yet" — no id selected yet. The result is `idle`, which
   * `AsyncBoundary` renders as nothing at all rather than as an empty state,
   * because "there is nothing here" and "we have not asked" are different
   * things to say to someone.
   *
   * Do NOT use this for permissions. A screen a role may not see needs a
   * message saying so; `idle` is silence, and silence reads as a bug. Gate on
   * `can()` from the session and render the refusal yourself.
   */
  enabled?: boolean;
}

/**
 * A union, not an interface extending one.
 *
 * The first draft was `interface QueryResult<T> extends QueryState<T>`, which
 * does not compile: an interface can only extend an object type with statically
 * known members, and `QueryState<T>` is a union. `type` with an intersection is
 * the correct spelling and preserves the discriminated union, so
 * `result.status === 'error'` still narrows `error` to non-null.
 */
export type QueryResult<T> = QueryState<T> & {
  refetch: () => void;
  /**
   * True while a refetch is in flight over data that is already on screen.
   *
   * Held as its own piece of state rather than being spread into `QueryState`.
   * Smuggling it in as `{...prev, isStale: true}` produced an object that was
   * not a member of the union, which is only survivable with a cast — and the
   * cast is exactly where the `isStale` read in the return value came from.
   * Two independent facts, two independent fields.
   */
  isStale: boolean;
};

export function useQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList,
  options: QueryOptions<T> = {},
): QueryResult<T> {
  const { isEmpty, partial, enabled = true } = options;
  const [state, setState] = React.useState<QueryState<T>>({
    status: enabled ? 'loading' : 'idle',
    data: null,
    error: null,
    partial: null,
  });
  const [isStale, setIsStale] = React.useState(false);
  const [nonce, setNonce] = React.useState(0);

  // Held in refs so changing a callback identity on every render does not
  // retrigger the effect. Without this, a caller that inlines
  // `(signal) => api.leads.list({ page }, signal)` re-fetches on every render,
  // and the request never settles.
  const fetcherRef = React.useRef(fetcher);
  fetcherRef.current = fetcher;
  const isEmptyRef = React.useRef(isEmpty);
  isEmptyRef.current = isEmpty;
  const partialRef = React.useRef(partial);
  partialRef.current = partial;

  React.useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle', data: null, error: null, partial: null });
      return;
    }
    const controller = new AbortController();
    let live = true;

    setState((prev) =>
      // Keep showing what is already on screen while refetching rather than
      // flashing a skeleton over a table the user was reading. `error` is the
      // one state that must NOT be preserved: keeping a failed state on screen
      // while retrying means the retry is invisible.
      prev.status === 'success' || prev.status === 'partial' || prev.status === 'empty'
        ? prev
        : { status: 'loading', data: null, error: null, partial: null },
    );
    // Only "stale" if there was something to be stale about. On a first load
    // this must stay false, or the very first paint reports "updating" over an
    // empty screen.
    setIsStale((was) =>
      state.status === 'success' || state.status === 'partial' || state.status === 'empty' ? true : was,
    );

    fetcherRef
      .current(controller.signal)
      .then((data) => {
        if (!live) return;
        setIsStale(false);
        const partialText = partialRef.current?.(data) ?? null;
        const empty = isEmptyRef.current ? isEmptyRef.current(data) : isStructurallyEmpty(data);
        if (empty && !partialText) {
          setState({ status: 'empty', data, error: null, partial: null });
        } else if (partialText) {
          setState({ status: 'partial', data, error: null, partial: partialText });
        } else {
          setState({ status: 'success', data, error: null, partial: null });
        }
      })
      .catch((err: unknown) => {
        if (!live || controller.signal.aborted) return;
        setIsStale(false);
        setState({
          status: 'error',
          data: null,
          error:
            err instanceof ApiError
              ? err
              : new ApiError(0, 'network', err instanceof Error ? err.message : String(err)),
          partial: null,
        });
      });

    return () => {
      live = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled]);

  return React.useMemo(
    () => ({ ...state, refetch: () => setNonce((n) => n + 1), isStale }),
    [state, isStale],
  );
}

function isStructurallyEmpty(data: unknown): boolean {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === 'object') {
    const rows = (data as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows.length === 0;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Mutations
 * ------------------------------------------------------------------ */

export interface MutationState {
  pending: boolean;
  error: ApiError | null;
}

export interface Mutation<TArgs extends unknown[], TResult> extends MutationState {
  run: (...args: TArgs) => Promise<TResult | null>;
  reset: () => void;
}

/**
 * `deps` is not optional-by-accident.
 *
 * The first version took only `action` and the call sites passed a second
 * argument anyway, which JavaScript accepts silently — so every call site in the
 * app was passing something the hook ignored. `actionRef.current = action` does
 * keep the latest closure, so the *call* was never wrong; what was wrong was
 * the visible error and `pending` from the previous target surviving a change of
 * target. A rejected action on integration A would leave its error sitting on
 * integration B until B happened to be clicked. `deps` clears the state when the
 * target changes, which is what every caller was already assuming.
 */
export function useMutation<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  deps: React.DependencyList = [],
): Mutation<TArgs, TResult> {
  const [state, setState] = React.useState<MutationState>({ pending: false, error: null });
  const actionRef = React.useRef(action);
  actionRef.current = action;
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  React.useEffect(() => {
    setState({ pending: false, error: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const run = React.useCallback(async (...args: TArgs) => {
    setState({ pending: true, error: null });
    try {
      const result = await actionRef.current(...args);
      if (mounted.current) setState({ pending: false, error: null });
      return result;
    } catch (err) {
      const apiErr =
        err instanceof ApiError ? err : new ApiError(0, 'network', err instanceof Error ? err.message : String(err));
      if (mounted.current) setState({ pending: false, error: apiErr });
      return null;
    }
  }, []);

  const reset = React.useCallback(() => setState({ pending: false, error: null }), []);

  return { ...state, run, reset };
}

/* ------------------------------------------------------------------ *
 * Formatting
 *
 * Formatting lives here rather than in a component because the same number has
 * to read the same way in a metric card, a table cell, an export and a
 * sentence. `toFixed` in five places is how "$1.2M" and "$1,204,300" end up on
 * the same dashboard.
 * ------------------------------------------------------------------ */

export function formatCurrency(value: number, currency = 'USD', compact = false): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 0,
  }).format(value);
}

export function formatNumber(value: number, compact = false): string {
  return new Intl.NumberFormat('en-GB', {
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 0,
  }).format(value);
}

export function formatMetric(value: number, unit: 'currency' | 'count' | 'percent' | 'ratio', currency = 'USD'): string {
  switch (unit) {
    case 'currency':
      return formatCurrency(value, currency, value >= 10_000);
    case 'count':
      return formatNumber(value, value >= 10_000);
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'ratio':
      return `${value.toFixed(2)}x`;
  }
}

/**
 * §75 freshness. Relative time only — never a bare timestamp, because a
 * timestamp does not tell anyone whether they should trust the number.
 *
 * The thresholds are deliberately blunt, and the "Stale" boundary is early: a
 * number that is nine hours old on a feed that syncs every six hours is already
 * a problem, and calling it "8 hours ago" in grey hides that.
 */
export function formatFreshness(syncedAt: string, now: number = Date.now()): { text: string; level: 'fresh' | 'recent' | 'stale' | 'unknown' } {
  const ts = Date.parse(syncedAt);
  if (Number.isNaN(ts)) return { text: 'Never synced', level: 'unknown' };
  const mins = Math.max(0, Math.round((now - ts) / 60_000));
  if (mins < 2) return { text: 'Just now', level: 'fresh' };
  if (mins < 60) return { text: `${mins} min ago`, level: 'fresh' };
  const hours = Math.round(mins / 60);
  if (hours < 6) return { text: `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`, level: 'recent' };
  if (hours < 24) return { text: `${hours} hours ago`, level: 'stale' };
  const days = Math.round(hours / 24);
  return { text: `${days} ${days === 1 ? 'day' : 'days'} ago`, level: 'stale' };
}

export function formatDate(iso: string, now: number = Date.now()): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return 'Unknown';
  const days = Math.round((now - ts) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(ts);
}

export function formatDateTime(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return 'Unknown';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ts);
}

/**
 * Whether a rise in this metric is progress. Stated per call site rather than
 * inferred from the unit, because the unit is not enough: revenue (currency)
 * going up is good, cost per acquisition (also currency) going up is not, and
 * "cost" is not a unit. Getting this wrong is not a cosmetic bug — it renders
 * a red problem as a green win.
 */
export type DeltaIntent = 'up-is-good' | 'down-is-good' | 'neutral';

export function formatDelta(
  current: number,
  previous: number,
  intent: DeltaIntent = 'up-is-good',
  options: { format?: (n: number) => string } = {},
): { text: string; direction: 'up' | 'down' | 'flat'; good: boolean; absolute: string } {
  const format = options.format ?? ((n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 1 }));
  if (previous === 0) {
    return { text: 'No prior period', direction: 'flat', good: true, absolute: '—' };
  }
  const change = current - previous;
  const pctChange = (change / Math.abs(previous)) * 100;
  // Under 0.5% is noise, not a flat line. Showing "+0.3%" with an arrow
  // invites someone to act on rounding.
  const direction = Math.abs(pctChange) < 0.5 ? 'flat' : change > 0 ? 'up' : 'down';
  const good =
    intent === 'neutral' || direction === 'flat'
      ? true
      : intent === 'up-is-good'
        ? direction === 'up'
        : direction === 'down';

  const sign = change > 0 ? '+' : change < 0 ? '−' : '';
  return {
    text: `${sign}${Math.abs(pctChange).toFixed(1)}%`,
    direction,
    good,
    absolute: `${sign}${format(Math.abs(change))}`,
  };
}
