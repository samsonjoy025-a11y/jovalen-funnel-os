/**
 * The in-memory store.
 *
 * ------------------------------------------------------------------ *
 * WHY THIS IS NOT A DATABASE
 * ------------------------------------------------------------------ *
 *
 * The plan (Phase 2) puts Postgres, ClickHouse and Redis behind these services.
 * Docker cannot run on the development machine: the CPU's VT-x is disabled in
 * firmware (`VirtualizationFirmwareEnabled: False` on an i5-8265U), the user
 * account is not an administrator, and the machine has ~4.5 GB of free RAM.
 * That is a machine limitation, not a design one.
 *
 * So the stores are here, and the service boundaries are real module
 * boundaries, but the process is one. `src/services/README.md` records exactly
 * what has to change to split this into the fifteen processes the plan asks for
 * — it is a matter of replacing `Collection` with a repository per service and
 * moving the routes, not a rewrite.
 *
 * The one thing that is *not* deferred is honesty about the data. Every fixture
 * in this process is marked `sampleData`, and the API refuses to serve a
 * connection without that flag set. See `IntegrationAccount.sampleData` in
 * @funnelos/contracts and the note in `fixtures.ts`.
 */

import type { AuditEntry } from '@funnelos/contracts';

/** A typed collection with the few operations the services actually need. */
export class Collection<T extends { id: string }> {
  private readonly rows = new Map<string, T>();

  constructor(
    readonly name: string,
    seed: readonly T[] = [],
  ) {
    for (const row of seed) this.rows.set(row.id, row);
  }

  all(): T[] {
    return [...this.rows.values()];
  }

  get(id: string): T | undefined {
    return this.rows.get(id);
  }

  /** Throws `NotFound` if absent, so a missing row is one error shape. */
  require(id: string): T {
    const row = this.rows.get(id);
    if (!row) throw new NotFound(`${this.name} ${id}`);
    return row;
  }

  put(row: T): T {
    this.rows.set(row.id, row);
    return row;
  }

  patch(id: string, changes: Partial<T>): T {
    const current = this.require(id);
    const next = { ...current, ...changes, id: current.id };
    this.rows.set(next.id, next);
    return next;
  }

  where(predicate: (row: T) => boolean): T[] {
    return this.all().filter(predicate);
  }

  find(predicate: (row: T) => boolean): T | undefined {
    return this.all().find(predicate);
  }

  get size(): number {
    return this.rows.size;
  }
}

export class NotFound extends Error {
  readonly status = 404;
  constructor(what: string) {
    super(`${what} not found`);
    this.name = 'NotFound';
  }
}

export class BadRequest extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'BadRequest';
  }
}

/** What a mutation is allowed to say about itself in the audit log. */
export interface AuditRecord {
  /** The verb, e.g. `action.approved`. Dot-namespaced so it groups in a log. */
  action: string;
  /** The collection the change landed in, e.g. `actions`. */
  entity: string;
  entityId: string;
  /** Why. §84 requires the reason on a rejection; other transitions pass ''. */
  reason?: string;
  /**
   * Who. Defaults to the acting session user. Passed explicitly where the
   * actor differs from the session - an approval on someone else's behalf.
   */
  actorName?: string;
  actorId?: string;
  /** The state before and after, so the log is readable without the entity. */
  from?: string;
  to?: string;
}

let auditCounter = 0;

/** The identity the audit log attributes a write to when none is given. */
export interface Actor {
  id: string;
  name: string;
}

/** Every store in the process, so a test can reset the world in one call. */
export class World {
  collections = new Map<string, Collection<{ id: string }>>();

  /**
   * The acting user, set once by `buildDb`.
   *
   * A field rather than a `session` collection because the session is one
   * mutable row, not a set of them, and pretending otherwise bought this
   * method a bug: the first version read
   * `this.collections.get('session')?.get('session_1')`, on the strength of a
   * comment claiming a `db.test` asserted that id was the one `buildDb` seeds.
   * There is no `db.test`, there never was a `session` collection, and
   * `db.session` is a plain property on `Db` - so the lookup returned
   * `undefined` on every call and every audit entry that did not pass an
   * explicit actor was written as `actor: unknown`. The comment described a
   * test that did not exist, which is why the gap survived a 38-test suite:
   * §84 asks who did a thing, and the honest answer was coming back blank.
   *
   * `assertSession` below is the test that should have existed. It is called at
   * startup rather than in a test on purpose - an unowned `World` is a
   * programming error, and the process should say so before serving a single
   * request rather than quietly logging `unknown` for the rest of its life.
   */
  private _actor: Actor | null = null;

  setActor(actor: Actor): void {
    this._actor = actor;
  }

  /** Throws if the acting user was never set. Fails loudly, never falls back. */
  assertActor(): Actor {
    if (!this._actor) {
      throw new Error(
        'World.record was called before the acting user was set. buildDb() must call ' +
          'world.setActor(fx.user) - without it every audit entry is attributed to "unknown", ' +
          'which is the one thing §84 exists to prevent.',
      );
    }
    return this._actor;
  }

  collection<T extends { id: string }>(name: string, seed: readonly T[] = []): Collection<T> {
    const existing = this.collections.get(name);
    if (existing) return existing as unknown as Collection<T>;
    const created = new Collection<T>(name, seed);
    this.collections.set(name, created as unknown as Collection<{ id: string }>);
    return created;
  }

  get workspaceId(): string {
    return 'ws_1';
  }

  /**
   * Append one audit entry.
   *
   * ------------------------------------------------------------------ *
   * WHY THIS IS HERE AND NOT IN TWELVE HANDLERS
   * ------------------------------------------------------------------ *
   *
   * The first version of this API had no audit writes at all. `GET /audit`
   * returned six seeded rows and never changed, so the Audit screen rendered a
   * plausible, authoritative-looking, permanently-frozen log of an
   * organisation's decisions while approving an action wrote nothing. §84 is
   * the requirement that makes an AI system's actions accountable, and a
   * frozen log is worse than no log: it looks like evidence.
   *
   * The wrong fix is to remember to add a call to each of the twelve mutating
   * handlers. That is twelve opportunities to forget, and the twelfth is added
   * by whoever adds a new action type in three months.
   *
   * So the log is a method on `World` rather than something a service reaches
   * for, and the guarantee is enforced by `server.test.ts`, which walks every
   * mutating route in the router and asserts the count moved. The test is the
   * thing that makes it not-forgettable; this method is just where the write
   * lands.
   *
   * Append-only by construction: there is no update or remove on this
   * collection, and the id is a monotonic counter rather than a uuid so the
   * ordering is the insertion order without sorting.
   */
  record(rec: AuditRecord): void {
    /*
     * The actor, and no silent fallback.
     *
     * `assertActor` throws if nobody was ever set, so a missing actor fails
     * loudly at the first write instead of producing a log full of
     * `actor: unknown` - which reads as "the system has no idea who did this",
     * and which is exactly what an accountable trail must never look like.
     *
     * `rec.actorName` still wins when given: an approval is sometimes recorded
     * against the approver rather than whoever happened to be holding the
     * session, and that difference is the whole point of §66.
     */
    const actor = rec.actorName
      ? { id: rec.actorId ?? this.assertActor().id, name: rec.actorName }
      : this.assertActor();

    /*
     * The row is an `AuditEntry` verbatim. An earlier draft added `from`, `to`
     * and `reason` as columns of its own, which meant two shapes for one
     * concept: the contract's ten fields and the store's thirteen. They would
     * have drifted, and `GET /audit` would have returned rows that no longer
     * matched the type it claims to return. The before/after states go in
     * `metadata`, which is the field the contract already reserves for exactly
     * this.
     */
    const metadata: Record<string, string> = {};
    if (rec.from !== undefined) metadata.from = rec.from;
    if (rec.to !== undefined) metadata.to = rec.to;
    if (rec.reason) metadata.reason = rec.reason;

    this.collection<AuditEntry>('audit').put({
      id: `aud_${++auditCounter}`,
      workspaceId: this.workspaceId,
      actorId: actor.id,
      actorName: actor.name,
      action: rec.action,
      entity: rec.entity,
      entityId: rec.entityId,
      at: new Date().toISOString(),
      metadata,
    });
  }
}
