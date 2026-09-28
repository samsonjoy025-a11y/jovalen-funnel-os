/**
 * Why the services share a process, and what changes when they do not.
 *
 * ------------------------------------------------------------------ *
 * THE SITUATION
 * ------------------------------------------------------------------ *
 *
 * The plan specifies fifteen services behind an `api-gateway` (Phases 3–13), each
 * with its own store, deployed to Kubernetes.
 *
 * The development machine cannot run that:
 *
 *   - `VirtualizationFirmwareEnabled: False` — VT-x is off in the BIOS/UEFI on
 *     this i5-8265U. WSL2, Hyper-V and therefore Docker Desktop cannot start.
 *     Changing it needs a firmware password and a reboot, i.e. the machine's
 *     owner sitting down with a restart.
 *   - The account is not a member of the local Administrators group
 *     (medium integrity), so the Windows feature and service installs the
 *     Docker installer wants are refused.
 *   - ~4.5 GB of free RAM. Fifteen containers plus Postgres, ClickHouse, Redis
 *     and an OTel collector is not a thing that runs in that budget.
 *
 * So: one process, one port, one in-memory store.
 *
 * ------------------------------------------------------------------ *
 * WHAT IS *NOT* DEFERRED
 * ------------------------------------------------------------------ *
 *
 * The boundaries. `src/services/*.ts` is one file per plan service, each
 * registering routes under `/api/v1/<service>`, and each owning a disjoint set of
 * collections (the `// owner:` comments in `db.ts` name them). A route handler
 * receives the workspace from `db.session`, never from a request body, because
 * that is the property that lets services be independent later.
 *
 * The domain rules. Almost everything in these files is not about persistence:
 * the §64 ten-field check, the §63 confirm-before-accept transition, the §66
 * approved-before-executed rule, the §67 inconclusive-cannot-be-confident check,
 * the §70 transition table, the §58 evidence requirement, the §55 dimension
 * derivation. None of that lives in Postgres. All of it is already tested and
 * will survive the split unchanged.
 *
 * Honesty about the data. Every connection carries `sampleData: true`, the API
 * refuses to produce a connection claiming otherwise (`db.assertRealBacking`),
 * and the OS badges it. This is not "stubbed out" — it is the product's
 * obligation under §49/§70 to never show a number without saying where it came
 * from.
 *
 * ------------------------------------------------------------------ *
 * WHAT CHANGES ON THE SPLIT
 * ------------------------------------------------------------------ *
 *
 * 1. `Collection<T>` in `store.ts` becomes a repository per service with a real
 *    connection. Every call site already reads `db.foo.find(...)`, so the
 *    substitution is one file per entity.
 * 2. `src/services/*.ts` each get `new Server()` and their own port. The routes
 *    do not move.
 * 3. `db.session` becomes a verified JWT claim resolved by the gateway and
 *    forwarded. The handlers do not change; only how the workspace arrives.
 * 4. `fixtures.ts` is replaced by migration seeds for development and by
 *    connectors for production. `sampleData` flips to `false` in the connector,
 *    at one place, and the badges disappear on their own.
 * 5. `events` moves to ClickHouse and `insights`/`recommendations` to their own
 *    Postgres databases. Cross-service reads that exist today — the Overview
 *    joining metrics to funnels to actions — become real HTTP or an event
 *    subscription. That is the one genuinely non-mechanical piece, and it is
 *    why the Overview lives in `analytics.ts` rather than in a place that
 *    pretends not to care.
 *
 * ------------------------------------------------------------------ *
 * WHAT WOULD MAKE THIS WORTH REVISITING EARLIER
 * ------------------------------------------------------------------ *
 *
 * If a second person starts on this and the two of them edit `db.ts` at the
 * same time, or if a test needs to start a second process, or if the single
 * in-memory store stops surviving a restart that matters. Any of those three,
 * and not before.
 */

export {};
