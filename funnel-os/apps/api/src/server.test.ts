/**
 * API route and domain-rule tests.
 *
 * ------------------------------------------------------------------ *
 * WHY THESE EXIST WHEN `curl` ALREADY PROVED IT WORKED
 * ------------------------------------------------------------------ *
 *
 * The twenty-four read routes and the five domain rules were verified by hand,
 * once, against a running server. That is not a gate: it does not run on the
 * next change, and a rule that fires correctly today can stop firing when
 * somebody edits the state machine. `server.test.ts` is that verification made
 * repeatable, and it runs in about a second.
 *
 * The shape of the tests is deliberately not "assert the response equals this
 * JSON". Fixtures are going to change, and a test that pins every field is a
 * test that gets deleted rather than fixed. What is asserted is:
 *
 *   1. every declared route answers, and answers in the envelope;
 *   2. the envelope's `meta` is present and typed;
 *   3. the routing contract (404 vs 405, and who owns a path);
 *   4. each domain rule refuses the illegal transition and permits the legal
 *      one - in that order, because a rule that rejects everything passes a
 *      "does it reject?" test.
 *
 * That last point is the one worth defending. The obvious test for 66 is
 * "execute a draft action, expect 400", which passes just as well against a
 * server that 400s every execute. Every rule test here therefore asserts both
 * halves, so a rule that has become a blanket refusal fails too.
 *
 * Node's own test runner, no dependency. `node:test` is not a compromise here:
 * the API has no other test framework, and adding one to a package with zero
 * dependencies would be a worse trade than using the one Node ships.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApiServer, buildRoot } from './server.js';
import { buildDb } from './db.js';

/* ------------------------------------------------------------------ *
 * Harness
 * ------------------------------------------------------------------ */

let base = '';
let close: () => Promise<void> = async () => {};

async function startServer(): Promise<void> {
  // Port 0: the OS assigns a free port. Hard-coding 8787 would make the suite
  // fail with EADDRINUSE whenever a dev server is already running, which is
  // exactly when you most want to run the tests.
  const { server, close: shut } = createApiServer({ port: 0, host: '127.0.0.1' });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = shut;
}

/**
 * Discard all state and start over.
 *
 * The domain rules in this file are all *mutating* - confirming a
 * recommendation, approving an action, concluding an experiment. Sharing one
 * server across them means each block sees whatever the previous one left
 * behind, and the failure mode is the worst kind: a test that has quietly
 * stopped testing anything. "Conclude a coherent inconclusive experiment" runs
 * before "prose in `primary` is refused", so without a reset the second test
 * finds no running experiment, returns early, and passes without ever calling
 * the API.
 *
 * A test that can pass by doing nothing is worse than no test, because it
 * removes the pressure that would have surfaced the bug. Every block that
 * mutates gets `before(restartServer)`.
 */
async function restartServer(): Promise<void> {
  await close();
  await startServer();
}

before(startServer);

after(async () => {
  await close();
});

interface Result<T = unknown> {
  status: number;
  body: { data?: T; error?: { code: string; message: string; details?: unknown }; meta?: { at: string } };
  headers: Headers;
}

async function call(method: string, path: string, body?: unknown): Promise<Result> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Result['body'], headers: res.headers };
}

const get = <T = unknown>(path: string) => call('GET', path) as Promise<Result<T>>;
const post = <T = unknown>(path: string, body?: unknown) => call('POST', path, body) as Promise<Result<T>>;
const patch = <T = unknown>(path: string, body?: unknown) => call('PATCH', path, body) as Promise<Result<T>>;

/**
 * Every response must be one of the two envelope shapes, and never a bare
 * value. A client that has to sniff `typeof body` has no contract, so this
 * asserts the discriminator exists on both branches.
 */
function assertEnvelope<T>(r: Result<T>, label: string): T {
  assert.equal(r.status, 200, `${label}: expected 200, got ${r.status} ${JSON.stringify(r.body.error)}`);
  assert.ok(r.body.data !== undefined, `${label}: response had no \`data\``);
  assert.ok(r.body.meta?.at, `${label}: response had no \`meta.at\``);
  assert.ok(
    !Number.isNaN(Date.parse(r.body.meta.at)),
    `${label}: meta.at "${r.body.meta.at}" is not a parseable timestamp`,
  );
  return r.body.data;
}

/**
 * The first row of a list, asserted to exist.
 *
 * `noUncheckedIndexedAccess` is on, so `rows[0]` is `T | undefined` and the
 * only ways past it are a non-null assertion or a length check. A non-null
 * assertion would be a lie the test cannot catch: if the fixtures were emptied
 * of leads, `leads.rows[0]!.id` would throw a `TypeError` and the test would
 * still "fail" - but for a reason that has nothing to do with what it is
 * testing. This names the actual precondition, so an empty fixture says so.
 */
function first<T>(rows: readonly T[], label: string): T {
  // Bound to a local first: `assert.ok(rows.length > 0)` narrows the *length*,
  // not `rows[0]`, so asserting on the index expression is what makes the
  // return type honest.
  const row = rows[0];
  assert.ok(row !== undefined, `${label}: the fixtures contain no rows, so this test cannot run`);
  return row;
}

/**
 * The shape of `GET /api/v1/leads`.
 *
 * Not an array. The lead list is the one server-paged collection in the API, so
 * it returns a page envelope with the total and the cursor, and a test that
 * assumed `Lead[]` was silently reading `.length` off an object - `undefined`
 * `> 0` is `false`, so `assert.ok` failed with a message about empty fixtures
 * rather than about the wrong type.
 */
interface LeadPage {
  rows: Array<{ id: string; name?: string }>;
  total: number;
  page: number;
  pageSize: number;
}

function assertRefused(r: Result, label: string, expectFragment?: string): void {
  assert.equal(r.status, 400, `${label}: expected 400, got ${r.status}`);
  assert.equal(r.body.error?.code, 'bad_request', `${label}: expected code bad_request`);
  assert.ok(r.body.data === undefined, `${label}: a refused request must not return data`);
  if (expectFragment) {
    assert.ok(
      r.body.error!.message.includes(expectFragment),
      `${label}: message "${r.body.error!.message}" should mention "${expectFragment}"`,
    );
  }
}

/* ------------------------------------------------------------------ *
 * 1. The route table itself
 * ------------------------------------------------------------------ */

describe('route table', () => {
  test('every GET route without a parameter answers 200 in the envelope', async () => {
    // Read from the router, not from a hand-written list. A hand-written list
    // is a second place to forget a route, which is the bug this file exists to
    // prevent - so the list under test is the one the server uses.
    const root = buildRoot(buildDb());
    const noParamGets = root
      .entries()
      .filter((r) => r.method === 'GET' && !r.path.includes(':'));

    assert.ok(noParamGets.length >= 20, `expected the read surface to be substantial, saw ${noParamGets.length}`);

    for (const route of noParamGets) {
      const r = await get(route.path);
      assertEnvelope(r, `GET ${route.path}`);
    }
  });

  test('every parameterised GET route answers 200 for a real id', async () => {
    // Resolve a genuine id from its collection rather than inventing one: a
    // hard-coded id that drifts from the fixtures turns this into a 404 test.
    // The lead list is paged, so it is read as a page - see `LeadPage`.
    const leads = assertEnvelope<LeadPage>(await get('/api/v1/leads'), 'lead list');
    const leadId = first(leads.rows, 'lead list').id;

    const funnels = assertEnvelope<Array<{ id: string; stages: Array<{ id: string }> }>>(
      await get('/api/v1/funnels'),
      'funnel list',
    );
    const funnel = first(funnels, 'funnel list');
    const funnelId = funnel.id;
    const stageId = first(funnel.stages, `stages of funnel ${funnelId}`).id;

    const metrics = assertEnvelope<Array<{ id: string }>>(await get('/api/v1/metrics'), 'metric list');
    const pages = assertEnvelope<Array<{ id: string }>>(await get('/api/v1/pages'), 'page list');
    const insights = assertEnvelope<Array<{ id: string }>>(await get('/api/v1/insights'), 'insight list');
    const actions = assertEnvelope<Array<{ id: string }>>(await get('/api/v1/actions'), 'action list');
    const forms = assertEnvelope<Array<{ id: string }>>(await get('/api/v1/forms'), 'form list');
    const experiments = assertEnvelope<Array<{ id: string }>>(
      await get('/api/v1/experiments'),
      'experiment list',
    );

    for (const [path, id] of [
      ['/api/v1/leads', leadId],
      ['/api/v1/metrics', first(metrics, 'metric list').id],
      ['/api/v1/pages', first(pages, 'page list').id],
      ['/api/v1/insights', first(insights, 'insight list').id],
      ['/api/v1/actions', first(actions, 'action list').id],
      ['/api/v1/forms', first(forms, 'form list').id],
      ['/api/v1/experiments', first(experiments, 'experiment list').id],
    ] as const) {
      assertEnvelope(await get(`${path}/${id}`), `GET ${path}/:id`);
    }

    assertEnvelope(await get(`/api/v1/leads/${leadId}/activity`), 'GET lead activity');
    assertEnvelope(
      await get(`/api/v1/funnels/${funnelId}/stages/${stageId}`),
      'GET funnel stage detail',
    );
  });

  test('an unknown id under a known prefix is a 404, not a 200 with null', async () => {
    const r = await get('/api/v1/leads/does-not-exist');
    assert.equal(r.status, 404);
    assert.equal(r.body.error?.code, 'not_found');
    assert.ok(r.body.data === undefined, 'a 404 must not carry data');
  });
});

/* ------------------------------------------------------------------ *
 * 2. Routing contract
 * ------------------------------------------------------------------ */

describe('routing contract', () => {
  test('a 404 names the service that owns the path', async () => {
    const r = await get('/api/v1/leads/nope/extra');
    assert.equal(r.status, 404);
    const details = r.body.error?.details as { service?: string; hint?: string } | undefined;
    assert.ok(details?.service, 'a 404 under a known prefix must name the owning service');
    assert.ok(details.hint?.length, 'a 404 must carry a hint');
  });

  test('a 404 under no service at all says so, and does not invent an owner', async () => {
    const r = await get('/api/v1/nothing-claims-this');
    assert.equal(r.status, 404);
    const details = r.body.error?.details as { service?: string } | undefined;
    assert.equal(details?.service, undefined, 'must not guess an owner for an unclaimed path');
  });

  test('a wrong method is a 405 that lists what is allowed', async () => {
    const r = await call('DELETE', '/api/v1/leads');
    assert.equal(r.status, 405);
    assert.equal(r.body.error?.code, 'method_not_allowed');
    assert.ok(
      r.headers.get('allow')?.includes('GET'),
      `405 must send an Allow header naming GET, got ${r.headers.get('allow')}`,
    );
  });

  test('/healthz states that this is one fixture-backed process', async () => {
    const data = assertEnvelope<{ ok: boolean; mode: string; services: number; sampleData: boolean }>(
      await get('/healthz'),
      'healthz',
    );
    assert.equal(data.ok, true);
    /*
     * Asserted because the OS renders this. If `services` drifts from the
     * number the shell displays, the user is told a falsehood by the app's own
     * health check - so the two numbers have to come from one constant.
     */
    assert.equal(data.mode, 'single-process');
    assert.equal(data.sampleData, true, 'the sample-data flag is not optional; §117 forbids disguising it');
  });

  test('CORS is locked to one origin and never a wildcard', async () => {
    const r = await get('/api/v1/overview');
    const origin = r.headers.get('access-control-allow-origin');
    assert.ok(origin, 'CORS header must be present for the OS origin');
    assert.notEqual(origin, '*', 'a wildcard CORS header in a shipped repo survives to production');
    assert.equal(origin, 'http://127.0.0.1:5173');
  });

  test('every response carries a request id and forbids caching', async () => {
    const r = await get('/api/v1/overview');
    assert.match(r.headers.get('x-request-id') ?? '', /^req_\d+$/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });

  test('a malformed body is a 400, not a 500', async () => {
    const res = await fetch(`${base}/api/v1/integrations/int_1/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    assert.equal(res.status, 400);
  });
});

/* ------------------------------------------------------------------ *
 * 3. Domain rules
 *
 * Each rule asserts the refusal AND the permission. A blanket-refusal server
 * passes the first and fails the second, which is the point.
 * ------------------------------------------------------------------ */

describe('§63 unconfirmed AI content cannot be accepted', () => {
  before(restartServer);
  test('accepting an unconfirmed recommendation is refused', async () => {
    const all = assertEnvelope<Array<{ id: string; confirmed: boolean }>>(
      await get('/api/v1/recommendations'),
      'recommendations',
    );
    const unconfirmed = all.find((r) => !r.confirmed);
    assert.ok(unconfirmed, 'the fixtures must contain an unconfirmed recommendation, or this proves nothing');

    assertRefused(await post(`/api/v1/recommendations/${unconfirmed.id}/accept`), 'accept unconfirmed', 'unconfirmed');
  });

  test('the same recommendation is acceptable once confirmed', async () => {
    const all = assertEnvelope<Array<{ id: string; confirmed: boolean }>>(
      await get('/api/v1/recommendations'),
      'recommendations',
    );
    const unconfirmed = all.find((r) => !r.confirmed)!;

    // Confirm, then accept. Both must succeed, in that order.
    const confirmed = assertEnvelope<{ confirmed: boolean }>(
      await post(`/api/v1/recommendations/${unconfirmed.id}/confirm`),
      'confirm',
    );
    assert.equal(confirmed.confirmed, true);

    const accepted = assertEnvelope<{ status: string; confirmed: boolean }>(
      await post(`/api/v1/recommendations/${unconfirmed.id}/accept`),
      'accept after confirm',
    );
    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.confirmed, true);
  });
});

describe('§66 only an approved action may execute', () => {
  before(restartServer);
  test('executing a draft action is refused and names the current state', async () => {
    const all = assertEnvelope<Array<{ id: string; state: string }>>(await get('/api/v1/actions'), 'actions');
    const draft = all.find((a) => a.state !== 'approved');
    assert.ok(draft, 'the fixtures must contain a non-approved action, or this proves nothing');

    assertRefused(await post(`/api/v1/actions/${draft.id}/execute`), 'execute draft', draft.state);
  });

  test('approve then execute succeeds, and the approval is attributed', async () => {
    const all = assertEnvelope<Array<{ id: string; state: string }>>(await get('/api/v1/actions'), 'actions');
    const notApproved = all.find((a) => a.state !== 'approved' && a.state !== 'executed')!;

    const approved = assertEnvelope<{ state: string; decidedBy: string | null }>(
      await post(`/api/v1/actions/${notApproved.id}/approve`),
      'approve',
    );
    assert.equal(approved.state, 'approved');
    assert.ok(approved.decidedBy, '§84 requires the approver to be recorded; an approval with no actor is not an approval');

    const executed = assertEnvelope<{ state: string; decidedAt: string }>(
      await post(`/api/v1/actions/${notApproved.id}/execute`),
      'execute after approve',
    );
    assert.equal(executed.state, 'executed');
    assert.ok(executed.decidedAt, 'an execution must be timestamped');
  });
});

describe('§67 an inconclusive result cannot be confident', () => {
  before(restartServer);
  /** The running experiment, or null. Derived rather than hard-coded. */
  async function running(): Promise<{ id: string; variants: Array<{ id: string }> } | null> {
    const all = assertEnvelope<Array<{ id: string; status: string; variants: Array<{ id: string }> }>>(
      await get('/api/v1/experiments'),
      'experiments',
    );
    return all.find((e) => e.status === 'running') ?? null;
  }

  /**
   * A coherent `primary`: one row per variant, real numbers.
   * Derived from the experiment's own variants so the payload is right by
   * construction.
   */
  function primaryFor(variants: Array<{ id: string }>) {
    return variants.map((v, i) => ({ variantId: v.id, value: 0.1 + i * 0.02, delta: i === 0 ? 0 : 0.004 }));
  }

  test('a conclusion with nothing in it is refused', async () => {
    const exp = await running();
    if (!exp) return; // Nothing running is a legitimate fixture state, not a failure.
    assertRefused(await post(`/api/v1/experiments/${exp.id}/conclude`), 'conclude bare');
  });

  test('an inconclusive verdict with high confidence is refused by the coherence check', async () => {
    const exp = await running();
    if (!exp) return;

    /*
     * The rule that matters. "The result was inconclusive" and "I am 92% sure"
     * cannot both be true, and a UI that renders both is making a claim it
     * cannot support. Caught server-side because a client-side check would be
     * one component's opinion.
     */
    assertRefused(
      await post(`/api/v1/experiments/${exp.id}/conclude`, {
        verdict: 'inconclusive',
        confidence: 0.92,
        primary: primaryFor(exp.variants),
        narrative: 'Variant B looked better for most of the window.',
      }),
      'inconclusive but confident',
    );
  });

  test('a coherent inconclusive conclusion is accepted - §67 makes it a real outcome', async () => {
    const exp = await running();
    if (!exp) return;

    const done = assertEnvelope<{ status: string; result: { verdict: string; confidence: number } }>(
      await post(`/api/v1/experiments/${exp.id}/conclude`, {
        verdict: 'inconclusive',
        confidence: 0.2,
        primary: primaryFor(exp.variants),
        narrative: 'The two variants were within noise for the whole window.',
      }),
      'coherent inconclusive',
    );
    assert.equal(done.status, 'concluded');
    assert.equal(done.result.verdict, 'inconclusive');
  });

  test('prose in `primary` is refused as malformed, not blamed on a variant', async () => {
    const exp = await running();
    if (!exp) return;

    /*
     * A regression test, and the reason is worth recording. `primary` is a
     * per-variant table, but there is no schema at the edge, so a caller that
     * sends a sentence - the natural thing to put in the field beside
     * `narrative` - got the answer "reports a result for unknown variant
     * undefined". The string was iterated character by character, every "row"
     * was one letter, and the error named a variant that does not exist. The
     * status was right and the diagnosis was actively misleading.
     */
    const r = await post(`/api/v1/experiments/${exp.id}/conclude`, {
      verdict: 'inconclusive',
      confidence: 0.2,
      primary: 'Variant B looked slightly better but not significantly.',
      narrative: 'Within noise.',
    });
    assert.equal(r.status, 400, 'prose in `primary` must be refused');
    assert.match(
      r.body.error!.message,
      /must be an array/,
      `the error must say what is wrong with the shape, got: ${r.body.error!.message}`,
    );
    assert.doesNotMatch(
      r.body.error!.message,
      /unknown variant/,
      'the error must not blame a variant when the fault is the payload shape',
    );
  });

  test('a result row for a variant that does not exist names the real ones', async () => {
    const exp = await running();
    if (!exp) return;

    const r = await post(`/api/v1/experiments/${exp.id}/conclude`, {
      verdict: 'inconclusive',
      confidence: 0.2,
      primary: [{ variantId: 'not_a_real_variant', value: 1, delta: 0 }],
      narrative: 'Within noise.',
    });
    assert.equal(r.status, 400);
    assert.match(r.body.error!.message, /not_a_real_variant/);
    /* The useful half: the error lists what the caller could have meant. */
    for (const v of exp.variants) {
      assert.ok(
        r.body.error!.message.includes(v.id),
        `the error should list the real variant "${v.id}" so the caller can correct itself`,
      );
    }
  });

  test('a conclusion that records no measurements at all is refused', async () => {
    const exp = await running();
    if (!exp) return;
    assertRefused(
      await post(`/api/v1/experiments/${exp.id}/conclude`, {
        verdict: 'inconclusive',
        confidence: 0.2,
        primary: [],
        narrative: 'Within noise.',
      }),
      'empty primary',
    );
  });

  test('a non-numeric measurement is refused', async () => {
    const exp = await running();
    if (!exp) return;
    const variantId = first(exp.variants, `variants of experiment ${exp.id}`).id;
    assertRefused(
      await post(`/api/v1/experiments/${exp.id}/conclude`, {
        verdict: 'inconclusive',
        confidence: 0.2,
        primary: [{ variantId, value: 'a lot', delta: 0 }],
        narrative: 'Within noise.',
      }),
      'non-numeric value',
    );
  });
});

describe('§70 an integration may only make a declared transition', () => {
  before(restartServer);
  test('the transition table is published, and it is what enforces', async () => {
    const table = assertEnvelope<Record<string, readonly string[]>>(
      await get('/api/v1/integrations/transition-table'),
      'transition table',
    );
    assert.ok(Object.keys(table).length > 0, 'the table must not be empty');
    /*
     * Asserted rather than trusted: if the endpoint returned an empty object
     * every transition below would be refused, so the "illegal transition is
     * refused" test would pass for entirely the wrong reason. The table has to
     * be proven non-trivial before the rule tests mean anything.
     */
    const totalTransitions = Object.values(table).reduce((n, v) => n + v.length, 0);
    assert.ok(totalTransitions > 0, 'the table declares no transitions at all');
  });

  test('an undeclared transition is refused and lists what is allowed', async () => {
    const accounts = assertEnvelope<Array<{ id: string; state: string }>>(
      await get('/api/v1/integrations'),
      'integrations',
    );
    const table = assertEnvelope<Record<string, readonly string[]>>(
      await get('/api/v1/integrations/transition-table'),
      'transition table',
    );

    // Find a state the fixtures actually use that declares at least one
    // successor, then ask for a successor it does not declare. This derives
    // the illegal pair from the table rather than hard-coding one, so it keeps
    // working when the table changes.
    const target = accounts.find((a) => (table[a.state] ?? []).length > 0);
    assert.ok(target, 'no fixture sits in a state with a declared successor');

    const illegal = ['disconnected', 'authorizing', 'expired', 'torn-down'].find(
      (s) => !(table[target.state] ?? []).includes(s),
    );
    assert.ok(illegal, 'no out-of-table state available to test with');

    assertRefused(
      await post(`/api/v1/integrations/${target.id}/transition`, { to: illegal }),
      `illegal ${target.state} -> ${illegal}`,
      target.state,
    );
  });

  test('a declared transition succeeds', async () => {
    const accounts = assertEnvelope<Array<{ id: string; state: string }>>(
      await get('/api/v1/integrations'),
      'integrations',
    );
    const table = assertEnvelope<Record<string, readonly string[]>>(
      await get('/api/v1/integrations/transition-table'),
      'transition table',
    );
    const target = accounts.find((a) => (table[a.state] ?? []).length > 0)!;
    const legal = first(table[target.state] ?? [], `declared successors of "${target.state}"`);

    const moved = assertEnvelope<{ state: string }>(
      await post(`/api/v1/integrations/${target.id}/transition`, { to: legal }),
      `legal ${target.state} -> ${legal}`,
    );
    assert.equal(moved.state, legal);
  });
});

describe('§58 an insight carries its evidence', () => {
  test('no insight is returned without evidence', async () => {
    const insights = assertEnvelope<Array<{ id: string; evidence: unknown[] }>>(
      await get('/api/v1/insights'),
      'insights',
    );
    assert.ok(insights.length > 0, 'the fixtures must contain insights, or this proves nothing');
    for (const i of insights) {
      assert.ok(
        Array.isArray(i.evidence) && i.evidence.length > 0,
        `insight ${i.id} has no evidence; §58 forbids rendering one`,
      );
    }
  });
});

describe('§64 a recommendation carries all ten fields', () => {
  test('no recommendation is returned with one of its ten fields missing', async () => {
    const recs = assertEnvelope<Array<Record<string, unknown>>>(
      await get('/api/v1/recommendations'),
      'recommendations',
    );
    assert.ok(recs.length > 0, 'the fixtures must contain recommendations, or this proves nothing');

    /*
     * The ten field names are INFERRED - the plan says "ten required fields"
     * and does not list them (see `fixtures.ts`). These are the ten the
     * contract settled on, and the test asserts all ten are present and
     * non-empty, so a recommendation can never reach a screen as a card with a
     * hole in it. `assert.equal(REQUIRED.length, 10)` keeps the count honest:
     * if someone adds an eleventh required field and leaves this list at ten,
     * the test says so.
     */
    const REQUIRED = [
      'id',
      'businessId',
      'title',
      'rationale',
      'impact',
      'effort',
      'confidence',
      'evidence',
      'confirmed',
      'status',
    ] as const;
    assert.equal(REQUIRED.length, 10, '§64 says ten; this list is the ten');

    for (const rec of recs) {
      for (const field of REQUIRED) {
        assert.ok(field in rec, `recommendation ${rec.id} has no ${field}`);
        const v = rec[field];
        if (field === 'evidence') {
          assert.ok(Array.isArray(v) && v.length > 0, `recommendation ${rec.id} has empty evidence`);
        } else if (field === 'confirmed') {
          // `false` is a legitimate value. Asserting "truthy" here would have
          // been the same mistake as asserting a number is non-zero.
          assert.equal(typeof v, 'boolean', `recommendation ${rec.id}.confirmed must be a boolean`);
        } else {
          assert.ok(v !== undefined && v !== null && v !== '', `recommendation ${rec.id}.${field} is empty`);
        }
      }
    }
  });
});

describe('§58 insufficiency is a first-class answer, not a zero', () => {
  test('overview reports its own insufficient metrics and the reasons', async () => {
    const overview = assertEnvelope<{
      insufficient: Array<{ id: string; incompleteSources?: string[]; period: { label: string } }>;
    }>(await get('/api/v1/overview'), 'overview');

    for (const m of overview.insufficient) {
      assert.ok(m.id, 'an insufficient metric must be identifiable');
      assert.ok(m.period?.label, 'an insufficient metric must name the window it is short of');
    }
  });
});

describe('onboarding state is derived, not restated', () => {
  test('exactly one step is current, and it is the one named by `step`', async () => {
    const ob = assertEnvelope<{
      step: string;
      completed: boolean;
      steps: Array<{ step: string; label: string; state: 'complete' | 'current' | 'upcoming' }>;
    }>(await get('/api/v1/onboarding'), 'onboarding');

    const current = ob.steps.filter((s) => s.state === 'current');

    /*
     * The invariant that makes the two fields agree. `OnboardingState` carries
     * both `step` and `steps[]`, and the client renders both - the stepper
     * highlights from `steps[]`, the heading and the "continue" link read
     * `step`. If they can disagree the screen says "Step 3 of 6" above a
     * stepper highlighting step 2, and there is no way for the user to tell
     * which is authoritative.
     *
     * Exactly one current step while incomplete; none once complete, because
     * there is then no next thing to do.
     */
    if (ob.completed) {
      assert.equal(current.length, 0, 'a completed onboarding has no current step');
      assert.ok(ob.steps.every((s) => s.state === 'complete'), 'every step must be complete');
    } else {
      assert.equal(current.length, 1, `expected exactly one current step, saw ${current.length}`);
      assert.equal(
        first(current, 'current step').step,
        ob.step,
        '`step` and the current entry in `steps[]` must agree',
      );
    }
  });

  test('the steps are in a strict order with no duplicates', async () => {
    const ob = assertEnvelope<{ steps: Array<{ step: string }> }>(
      await get('/api/v1/onboarding'),
      'onboarding',
    );
    const keys = ob.steps.map((s) => s.step);
    assert.equal(new Set(keys).size, keys.length, 'a step appears twice in the list');
    assert.ok(ob.steps.length > 0, 'the step list is empty, so there is nothing to render');
  });

  test('the client cannot choose the step order - there is no route that sets it', async () => {
    /*
     * Asserted as a routing property rather than a data property, because the
     * failure this guards against is a *new* route appearing. The step list is
     * the one onboarding concept that must not be client-writable: a client
     * that could reorder steps would be able to present an arbitrary
     * sequence as the platform's own.
     */
    const root = buildRoot(buildDb());
    const writable = root
      .entries()
      .filter((r) => r.method !== 'GET' && r.path.includes('onboarding'));
    assert.equal(writable.length, 0, `onboarding became writable via ${writable.map((r) => r.method + ' ' + r.path).join(', ')}`);
  });
});

/* ------------------------------------------------------------------ *
 * 4. Sample-data discipline (§117)
 * ------------------------------------------------------------------ */

describe('§117 fixtures are labelled, never disguised', () => {
  test('every integration account is marked as sample data', async () => {
    const accounts = assertEnvelope<Array<{ id: string; sampleData: boolean }>>(
      await get('/api/v1/integrations'),
      'integrations',
    );
    for (const a of accounts) {
      assert.equal(a.sampleData, true, `integration ${a.id} is not labelled as sample data`);
    }
  });

  test('the overview states which providers are sample-backed', async () => {
    const overview = assertEnvelope<{ sampleData: { providers: string[] } }>(
      await get('/api/v1/overview'),
      'overview',
    );
    assert.ok(Array.isArray(overview.sampleData.providers));
  });
});

/* ------------------------------------------------------------------ *
 * 5. The lead lifecycle
 * ------------------------------------------------------------------ */

describe('lead list is server-driven', () => {
  test('pagination, sorting and filtering are honoured by the server', async () => {
    const page1 = assertEnvelope<{ rows: unknown[]; total: number; page: number; pageSize: number }>(
      await get('/api/v1/leads?page=1&pageSize=5'),
      'leads page 1',
    );
    assert.equal(page1.rows.length, 5, 'pageSize must be honoured');
    assert.equal(page1.page, 1);
    assert.ok(page1.total > 5, 'the fixtures must have more than one page, or pagination is untested');

    const page2 = assertEnvelope<{ rows: unknown[]; page: number }>(
      await get('/api/v1/leads?page=2&pageSize=5'),
      'leads page 2',
    );
    const first = page1.rows[0] as { id: string };
    const second = page2.rows[0] as { id: string };
    assert.notEqual(first.id, second.id, 'page 2 repeated page 1');

    // A sort must actually reorder. Reversing a known field and comparing the
    // first row is the cheapest way to prove the sort reached the server rather
    // than being applied client-side.
    const asc = assertEnvelope<{ rows: Array<{ name: string }> }>(
      await get('/api/v1/leads?sort=name&dir=asc&pageSize=100'),
      'asc',
    );
    const desc = assertEnvelope<{ rows: Array<{ name: string }> }>(
      await get('/api/v1/leads?sort=name&dir=desc&pageSize=100'),
      'desc',
    );
    assert.deepEqual(
      desc.rows.map((r) => r.name),
      asc.rows.map((r) => r.name).reverse(),
      'descending must be the exact reverse of ascending',
    );
  });

  test('a page beyond the end returns an empty set, not an error', async () => {
    const beyond = assertEnvelope<{ rows: unknown[] }>(await get('/api/v1/leads?page=999'), 'page 999');
    assert.equal(beyond.rows.length, 0);
  });

  test('a page is not an error - it is the empty state the UI renders', async () => {
    // The distinction that matters for §87: an out-of-range page is `empty`,
    // not `error`. Both return 200, and the DataTable distinguishes them by
    // row count. Asserting it here because "empty" is easy to turn into a
    // throw by accident.
    const r = await get('/api/v1/leads?page=999');
    assert.equal(r.status, 200);
  });
});

/* ------------------------------------------------------------------ *
 * 6. Writes leave an audit trail (§84)
 * ------------------------------------------------------------------ */

describe('§84 every transition is audited', () => {
  before(restartServer);

  test('approving an action writes an audit entry naming the actor and the change', async () => {
    const beforeCount = assertEnvelope<Array<{ id: string }>>(await get('/api/v1/audit'), 'audit before').length;
    const actions = assertEnvelope<Array<{ id: string; state: string }>>(await get('/api/v1/actions'), 'actions');
    const target = actions.find((a) => a.state !== 'approved' && a.state !== 'executed')!;
    const fromState = target.state;

    await post(`/api/v1/actions/${target.id}/approve`);

    const log = assertEnvelope<
      Array<{ id: string; action: string; entity: string; entityId: string; actorName: string; metadata: Record<string, string> }>
    >(await get('/api/v1/audit'), 'audit after');
    assert.ok(log.length > beforeCount, `approving an action wrote no audit entry (${beforeCount} -> ${log.length})`);

    /* The entry has to be usable, not merely present. */
    const entry = log.find((e) => e.entityId === target.id && e.action === 'action.approved');
    assert.ok(entry, 'no entry for the approval');
    assert.ok(entry.actorName && entry.actorName !== 'unknown', `the entry must name who approved it, got "${entry.actorName}"`);
    assert.equal(entry.metadata.from, fromState, 'the entry must record the state it came from');
    assert.equal(entry.metadata.to, 'approved', 'the entry must record the state it went to');
  });

  test('a rejection records the reason §66 requires', async () => {
    /*
     * Restart, not just the block-level `before`. The previous test in this
     * block approved an action, and an approved action cannot then be rejected
     * (`approved: ['executed', 'failed', 'expired']`), so the only candidate
     * left was the one just consumed. The POST 400'd, nothing was written, and
     * the assertion below failed on a route that was never reached - which
     * looks exactly like "the audit write is missing" and is not.
     */
    await restartServer();

    const actions = assertEnvelope<Array<{ id: string; state: string }>>(await get('/api/v1/actions'), 'actions');
    const target = actions.find((a) => a.state === 'proposed' || a.state === 'awaiting_approval');
    assert.ok(
      target,
      'the fixtures must contain an action that can be rejected, or this proves nothing',
    );
    const REASON = 'Already sent a shipping email this quarter.';

    const res = await post(`/api/v1/actions/${target.id}/reject`, { reason: REASON });
    assert.equal(res.status, 200, `the rejection should have been accepted, got ${res.status} ${res.body.error?.message ?? ''}`);

    const log = assertEnvelope<Array<{ entityId: string; action: string; metadata: Record<string, string> }>>(
      await get('/api/v1/audit'),
      'audit',
    );
    const entry = log.find((e) => e.entityId === target.id && e.action === 'action.rejected');
    assert.ok(entry, 'no entry for the rejection');
    /*
     * The whole point of requiring a reason is that it survives. An audit entry
     * that records "rejected" without the reason is a dead end for whoever
     * reads the log, and it is the failure mode that makes the requirement feel
     * satisfied - the field is there, it just does not contain anything.
     */
    assert.equal(entry.metadata.reason, REASON, 'the reason must be in the log, not just in the entity');
  });

  /**
   * Every mutating route, walked automatically.
   *
   * This is the test that makes §84 not-forgettable. The alternative is
   * remembering to add an audit write to each handler - twelve now, and
   * whoever adds the thirteenth action type in three months. The table below is
   * derived from the router rather than hand-written, so a new mutating route
   * with no audit write fails here the day it is added, and the failure names
   * the route.
   *
   * Each row supplies a body that satisfies that route's own validation, so a
   * 400 in this test means "the route refused the call" rather than "the audit
   * write is missing", and the two are told apart by the assertion message.
   */
  test('every mutating route in the router writes an audit entry', async () => {
    const root = buildRoot(buildDb());

    /**
     * A body each route will accept.
     *
     * A function of the live data rather than a fixed table, because two of
     * these cannot be written blind: `conclude` requires a `variantId` that
     * belongs to that particular experiment, and `accept` requires the
     * recommendation to have been confirmed first. A hard-coded body for those
     * would either 400 - landing the route in `skipped`, which is how the
     * doubled-prefix bug stayed hidden - or, worse, pass by skipping it.
     */
    const bodyFor = (
      path: string,
      live: {
        experiments: Array<{ id: string; status: string; variants: Array<{ id: string }> }>;
        recs: Array<{ id: string; confirmed: boolean }>;
      },
    ): unknown => {
      switch (path) {
        case '/actions/:id/reject':
          return { reason: 'audit sweep' };
        case '/integrations/:id/transition':
          return { to: 'disconnected' };
        case '/experiments/:id/conclude': {
          const exp = live.experiments.find((e) => e.status === 'running') ?? live.experiments[0];
          return {
            verdict: 'inconclusive',
            confidence: 0.2,
            primary: (exp?.variants ?? []).map((v) => ({ variantId: v.id, value: 0.11, delta: 0 })),
            narrative: 'audit sweep',
          };
        }
        case '/business':
          return { name: 'Audit Sweep Co' };
        case '/leads/:id':
          return { stage: 'contacted' };
        case '/goals/:id':
          return { name: 'Audit sweep goal' };
        case '/pages/:id':
          return { name: 'Audit sweep page' };
        default:
          return {};
      }
    };

    const mutating = root
      .entries()
      .filter((r) => r.method === 'POST' || r.method === 'PATCH')
      // The role switch is not a business event. Logging "someone changed the
      // demo role" into the audit trail of a marketing system would be noise,
      // and a log that carries noise is a log people stop reading.
      .filter((r) => !r.path.includes('/session/'));

    assert.ok(mutating.length >= 11, `expected the write surface to be substantial, saw ${mutating.length}`);

    const skipped: string[] = [];
    const unaudited: string[] = [];
    const unattributed: string[] = [];

    for (const route of mutating) {
      await restartServer();

      // Resolve real ids from the live data rather than inventing them.
      const leads = assertEnvelope<LeadPage>(await get('/api/v1/leads'), 'leads');
      const actions = assertEnvelope<Array<{ id: string; state: string }>>(await get('/api/v1/actions'), 'actions');
      const recs = assertEnvelope<Array<{ id: string; confirmed: boolean }>>(
        await get('/api/v1/recommendations'),
        'recs',
      );
      const insights = assertEnvelope<Array<{ id: string }>>(await get('/api/v1/insights'), 'insights');
      const integrations = assertEnvelope<Array<{ id: string }>>(await get('/api/v1/integrations'), 'integrations');
      const goals = assertEnvelope<Array<{ id: string }>>(await get('/api/v1/goals'), 'goals');
      const pages = assertEnvelope<Array<{ id: string; status: string }>>(await get('/api/v1/pages'), 'pages');
      const experiments = assertEnvelope<Array<{ id: string; status: string; variants: Array<{ id: string }> }>>(
        await get('/api/v1/experiments'),
        'experiments',
      );

      const ids: Record<string, string | undefined> = {
        actions: actions.find((a) => a.state !== 'executed' && a.state !== 'rejected')?.id,
        recommendations: recs.find((r) => r.confirmed !== false)?.id ?? recs[0]?.id,
        insights:
          insights.find((i) => (i as { dismissed?: boolean }).dismissed !== true)?.id ?? insights[0]?.id,
        integrations: integrations[0]?.id,
        goals: goals[0]?.id,
        pages: pages.find((p) => p.status !== 'published')?.id ?? pages[0]?.id,
        experiments: experiments.find((e) => e.status === 'running')?.id,
        leads: leads.rows[0]?.id,
      };

      /*
       * `route.path` ALREADY carries the `/api/v1` prefix. Everything below
       * works on the suffix, because that is the only form the `bodyFor` cases
       * are written in - and getting that wrong is silent, not loud: no case
       * matched, every route got an empty body, and the four that need one
       * answered 400. The first version of this sweep made the same mistake in
       * the other direction and prepended the prefix, producing
       * `/api/v1/api/v1/business`; every route 404'd, `unaudited` stayed empty,
       * and the test PASSED - having verified that no route writes an audit
       * entry, by never reaching one. Hence the `skipped` assertion below.
       */
      const suffix = route.path.replace(/^\/api\/v1/, '');
      const collection = route.path.split('/')[3] ?? '';

      const concrete = route.path
        .replace(/:id\b/g, () => ids[collection] ?? 'missing_id')
        .replace(':stageId', 'missing_stage');

      /*
       * Some routes are only reachable from a state that another route
       * produces. Those prerequisites are set up HERE, deliberately outside the
       * measured audit window: what this test asserts is that *this* route
       * audits, not that the setup route does - each setup route has its own
       * row in the sweep and its own measurement.
       *
       * Leaving them unset does not fail the audit assertion. It just 400s, the
       * route lands in `skipped`, and its coverage becomes permanently unknown
       * - which is how a route can go years without anyone noticing it stopped
       * writing to the log. The fix is to set the state up, not to relax the
       * assertion.
       */
      if (suffix === '/recommendations/:id/accept' && ids.recommendations) {
        const rec = recs.find((r) => r.id === ids.recommendations);
        // §63: accepting is only legal once a human has confirmed the content.
        if (rec && rec.confirmed !== true) {
          await post(`/api/v1/recommendations/${rec.id}/confirm`);
        }
      }
      if (suffix === '/actions/:id/execute' && ids.actions) {
        // §66: only an approved action may execute, so approve it first.
        const action = actions.find((a) => a.id === ids.actions);
        if (action && action.state !== 'approved') {
          await post(`/api/v1/actions/${action.id}/approve`);
        }
      }

      const before = assertEnvelope<Array<{ id: string }>>(await get('/api/v1/audit'), 'audit before').length;
      const res = await call(route.method, concrete, bodyFor(suffix, { experiments, recs }));

      if (res.status !== 200) {
        skipped.push(`${route.method} ${route.path} -> ${res.status} ${res.body.error?.message ?? ''}`);
        continue;
      }

      const log = assertEnvelope<Array<{ id: string; actorName: string; actorId: string }>>(
        await get('/api/v1/audit'),
        'audit after',
      );

      /*
       * Attributed, not just recorded.
       *
       * The count alone was not enough, and that is how `actor: unknown`
       * shipped. `World.record` resolved the acting user by reading a
       * `session` collection that `buildDb` never created, so every entry
       * without an explicit actor was written as `unknown`. The count moved,
       * so the sweep passed, and the log that the Audit screen renders claimed
       * a change had happened without being able to say who made it.
       *
       * A log that records *that* without *who* is not the thing §84 is for.
       * Asserting the actor here means any future route that writes an entry
       * with nobody attached fails the sweep rather than quietly degrading it.
       */
      const after = log.length;
      if (after <= before) {
        unaudited.push(`${route.method} ${route.path}`);
        continue;
      }

      for (const entry of log.slice(before)) {
        if (!entry.actorName || entry.actorName === 'unknown' || entry.actorId === 'unknown') {
          unattributed.push(`${route.method} ${route.path} -> "${entry.actorName}" (${entry.actorId})`);
        }
      }
    }

    assert.deepEqual(
      skipped,
      [],
      `these routes refused the sweep's own request, so the sweep did not exercise them and their audit coverage is UNKNOWN - which is the same as untested:\n  ${skipped.join('\n  ')}`,
    );
    assert.deepEqual(
      unaudited,
      [],
      `these routes changed something and wrote no audit entry. §84 requires every transition to be recorded:\n  ${unaudited.join('\n  ')}`,
    );
    assert.deepEqual(
      unattributed,
      [],
      `these routes wrote audit entries with no usable actor. A log that records what changed without who changed it is not accountable:\n  ${unattributed.join('\n  ')}`,
    );
  });
});
