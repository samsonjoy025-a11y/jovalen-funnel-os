/**
 * The API server.
 *
 * `node:http`, one port, no framework - see `src/http.ts` for why. The things
 * that are not negotiable:
 *
 *   - Every response is the envelope from @funnelos/contracts, so a client can
 *     tell "here is data" from "here is an error" without sniffing status codes.
 *   - CORS is locked to the OS dev origin rather than `*`, even in a dev server.
 *     A permissive CORS header in a repo that ships to production is one that
 *     survives to production.
 *   - Errors are logged with a request id and returned without a stack trace.
 *     A stack trace in a response body is a map of the source tree.
 *
 * ------------------------------------------------------------------ *
 * WHY THIS FILE IS A FACTORY AND NOT A SCRIPT
 * ------------------------------------------------------------------ *
 *
 * The first version called `server.listen()` at module scope. That is the shape
 * a `start` script wants and the shape a test suite cannot use: importing the
 * module binds port 8787, so a test that starts a second instance either fails
 * with EADDRINUSE or silently shares the first one's state, and there is no way
 * to point the whole server at a scratch database. A test that cannot run is a
 * test that does not run, and the twenty-four read routes and five domain rules
 * were being re-verified by hand with `curl` on every change.
 *
 * So the server is built by a function and only the `import.meta.url` guard
 * below binds a port. `createApiServer()` is what `server.test.ts` and the OS
 * dev script both call, so there is exactly one request handler in the repo and
 * the thing under test is the thing that runs.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { Router } from './http.js';
import { buildDb, type Db } from './db.js';
import { registerAll, ownerOf } from './services/index.js';
import { NotFound, BadRequest } from './store.js';

const MAX_BODY = 1_000_000;

/** INFERRED: the plan's topology says 12 services; this is the count it must
 *  report so the OS can state the discrepancy rather than hide it. */
const SERVICE_COUNT = 12;

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 8787;
/** INFERRED: the OS dev server's origin. Not a `*`, ever - see the header. */
export const DEFAULT_OS_ORIGIN = 'http://127.0.0.1:5173';

export interface ApiOptions {
  /** Defaults to a fresh fixture database. Injected so tests get isolation. */
  db?: Db;
  host?: string;
  port?: number;
  /** The one origin allowed by CORS. */
  osOrigin?: string;
}

/** The composed route table. Exported so a test can assert on the route set. */
export function buildRoot(db: Db): Router {
  const root = new Router();
  registerAll(db, root);
  return root;
}

export function createApiServer(options: ApiOptions = {}): {
  server: Server;
  db: Db;
  close: () => Promise<void>;
} {
  const db = options.db ?? buildDb();
  const root = buildRoot(db);
  const allowedOrigin = options.osOrigin ?? DEFAULT_OS_ORIGIN;

  let requestCounter = 0;

  function readBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) {
          reject(new BadRequest('Request body too large.'));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        if (chunks.length === 0) return resolve(undefined);
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          resolve(JSON.parse(text));
        } catch {
          reject(new BadRequest('Request body is not valid JSON.'));
        }
      });
      req.on('error', reject);
    });
  }

  function send(res: ServerResponse, status: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
    });
    res.end(body);
  }

  const server = createServer(async (req, res) => {
    const id = `req_${++requestCounter}`;
    const started = process.hrtime.bigint();

    // Not a `*`. See the header note.
    res.setHeader('access-control-allow-origin', allowedOrigin);
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE');
    res.setHeader('x-request-id', id);
    res.setHeader('x-powered-by', 'funnel-os/api');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    // A liveness route that reports what this process actually is. The
    // `mode: 'single-process'` field exists so the OS can display the same fact
    // that is written down in `src/services/README.md`, rather than the two
    // drifting apart.
    if (url.pathname === '/healthz') {
      send(res, 200, {
        data: {
          ok: true,
          mode: 'single-process',
          services: SERVICE_COUNT,
          requestId: id,
          sampleData: true,
          note: 'All data is fixture-backed. The OS badges this.',
        },
        meta: { at: new Date().toISOString() },
      });
      return;
    }

    const match = root.match(req.method ?? 'GET', url.pathname);

    /*
     * 404 vs 405, and both are more useful than a bare status.
     *
     * A 404 that only says "not found" sends the next person to read the
     * router to work out whose path it was. `ownerOf` answers "which service
     * claims this prefix", so a typo in the client is diagnosed in the response
     * rather than in a debugger. And a 405 that names the allowed methods is the
     * difference between a client bug and a server bug being obvious.
     */
    if (match === null) {
      const owner = ownerOf(url.pathname);
      send(res, 404, {
        error: {
          code: 'not_found',
          message: `No route for ${req.method} ${url.pathname}`,
          details: owner
            ? {
                service: owner,
                hint: `${owner} owns this path but declares no such route. Check the service's routes against the client's path.`,
              }
            : { hint: 'No service claims this path. Check the path against SERVICE_ROUTES.' },
        },
      });
      return;
    }
    if ('allowed' in match) {
      res.setHeader('allow', match.allowed.join(', '));
      send(res, 405, {
        error: {
          code: 'method_not_allowed',
          message: `${req.method} is not allowed on ${url.pathname}. Try ${match.allowed.join(', ')}.`,
        },
      });
      return;
    }

    try {
      const body = req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req);
      const result = await match.handler({ req, res, params: match.params, query: url.searchParams, body });
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      if (ms > 200) console.warn(`[${id}] slow ${req.method} ${url.pathname} ${ms.toFixed(0)}ms`);
      send(res, 200, result);
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500;
      const message = err instanceof Error ? err.message : String(err);
      if (status >= 500) console.error(`[${id}] ${req.method} ${url.pathname} -> ${status}: ${message}`);
      const code =
        err instanceof NotFound
          ? 'not_found'
          : err instanceof BadRequest
            ? 'bad_request'
            : status >= 500
              ? 'internal'
              : 'error';
      send(res, status, { error: { code, message, requestId: id } });
    }
  });

  return {
    server,
    db,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

/* ------------------------------------------------------------------ *
 * Run only when this file is the entry point.
 *
 * `import.meta.url` is compared against the resolved argv[1] rather than
 * `process.argv[1]` alone, because a bare relative path ('src/server.ts') and a
 * file:// URL never match, and the result is a server that does not start when
 * you run it and does start when you import it - the exact inversion of what
 * this guard is for.
 * ------------------------------------------------------------------ */

const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  const host = process.env.HOST ?? DEFAULT_HOST;
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const { server } = createApiServer({ host, port, osOrigin: process.env.OS_ORIGIN ?? DEFAULT_OS_ORIGIN });

  server.listen(port, host, () => {
    console.log(`funnel-os api  http://${host}:${port}`);
    console.log(`  health   http://${host}:${port}/healthz`);
    console.log(`  services ${SERVICE_COUNT}, single process, fixture-backed data`);
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      console.log(`\n${signal} - closing`);
      server.close(() => process.exit(0));
    });
  }
}
