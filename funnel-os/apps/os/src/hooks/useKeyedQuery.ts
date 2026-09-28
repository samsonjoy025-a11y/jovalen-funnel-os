/**
 * `useKeyedQuery` — a query whose parameters are not known until something is
 * selected.
 *
 * ------------------------------------------------------------------ *
 * WHY THIS EXISTS RATHER THAN `Promise.resolve(null)`
 * ------------------------------------------------------------------ *
 *
 * The first version of the Funnel page wrote:
 *
 *     const funnel = useQuery(
 *       (signal) => (activeId ? api.funnels.get(activeId, signal) : Promise.resolve(null)),
 *       [activeId],
 *     );
 *
 * which type-checks into something worse than it looks. `T` is inferred as
 * `Funnel | null`, so every consumer of the result has to handle a null that
 * the type system now believes is possible even when an id is present — and
 * the guard has to be repeated at the prop boundary:
 *
 *     <FunnelDiagram funnel={f} />   // error: Funnel | null not assignable
 *
 * The nullability is a lie in the other direction too: the fetcher really can
 * only produce a null when there is no id, and the page already knows that,
 * because it checked `activeId` one line above. Encoding "no id yet" as a
 * *value* rather than as a *state* means every caller has to rediscover which
 * of the two it is looking at.
 *
 * So: `enabled: false` produces the `idle` state, which carries `data: null`
 * honestly, and `T` stays `Funnel`. The fetcher's non-null key is then provably
 * safe — `enabled` is false whenever the key is null — and the throw below is a
 * tripwire for the day someone breaks that link.
 *
 * The key is an *array* of strings, not one joined string, because two callers
 * need two parameters (a funnel and a stage within it). Joining them with a
 * delimiter and splitting it again is the kind of cleverness that breaks the
 * first time an id legitimately contains the delimiter — and the failure is a
 * request for the wrong record rather than an error.
 */

import * as React from 'react';
import { useQuery, type QueryResult } from '@funnelos/api-client';

/**
 * @param key  The parameters, or `null` when nothing is selected yet. The
 *             array is the dependency list, so callers do not maintain two.
 * @param load Fetcher receiving the now-known key.
 */
export function useKeyedQuery<T>(
  key: readonly string[] | null,
  load: (key: readonly string[], signal: AbortSignal) => Promise<T>,
): QueryResult<T> {
  // `key` is a fresh array on every render when the caller writes `[a, b]`
  // inline, so the deps have to be the *contents*. `key.join()` is stable for
  // equal contents, which is what the deps comparison needs, and a collision
  // is harmless here: the fetcher reads the array, not the joined string.
  const signature = key === null ? null : key.join('\u0000');
  const keyRef = React.useRef(key);
  keyRef.current = key;

  return useQuery<T>(
    (signal) => {
      const current = keyRef.current;
      if (current === null) {
        /*
         * Unreachable. `enabled` below returns from the effect before calling
         * the fetcher, and the fetcher is only ever reached with a non-null key.
         *
         * The throw is here because "unreachable" is exactly the sort of
         * invariant that survives a refactor. If it were ever broken, the
         * alternative is a request for `/funnels/null`, whose 404 names the
         * wrong service and sends the next person hunting for a missing funnel
         * instead of for the missing guard.
         */
        throw new Error('useKeyedQuery: the fetcher ran with no key; check `enabled`');
      }
      return load(current, signal);
    },
    [signature],
    { enabled: key !== null },
  );
}
