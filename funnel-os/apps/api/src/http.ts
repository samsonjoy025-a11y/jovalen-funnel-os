/**
 * A very small HTTP router over `node:http`.
 *
 * The plan's Phase 2 has fifteen services behind an `api-gateway`. This is the
 * gateway, minus the service mesh: one process, one port, no framework. The
 * reasons are all "not yet" rather than "wrong" — a framework would add a
 * dependency and a build step to a repository whose whole premise is that the
 * design system comes first, and the routing surface is small enough that a
 * router is 60 lines.
 *
 * The important part is the *shape*: services register `GET /leads` style paths
 * and are mounted under `/api/v1/<service>`. When these split into separate
 * processes, each `routes` object becomes that service's router and the
 * `/api/v1` prefix becomes a gateway route table. No route moves.
 */

export interface Ctx {
  req: import('node:http').IncomingMessage;
  res: import('node:http').ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

export type Handler = (ctx: Ctx) => unknown | Promise<unknown>;

export interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  handler: Handler;
}

/** `/leads/:id/notes` -> a matcher over the literal segments around the params. */
function compile(path: string): { re: RegExp; keys: string[] } {
  const keys: string[] = [];
  const source = path
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { re: new RegExp(`^${source}/?$`), keys };
}

export class Router {
  private readonly routes: Array<Route & { re: RegExp; keys: string[] }> = [];

  /**
   * Every path is relative to this. Services declare `/funnels`; the table
   * holds `/api/v1/funnels`. The version segment lives in exactly one place,
   * so a v2 can be mounted beside v1 by constructing a second router rather
   * than by editing forty route declarations.
   */
  constructor(private readonly base = '/api/v1') {}

  add(method: Route['method'], path: string, handler: Handler): this {
    const full = `${this.base}${path === '/' ? '' : path}`;
    this.routes.push({ method, path: full, handler, ...compile(full) });
    return this;
  }

  get(path: string, handler: Handler) {
    return this.add('GET', path, handler);
  }
  post(path: string, handler: Handler) {
    return this.add('POST', path, handler);
  }
  patch(path: string, handler: Handler) {
    return this.add('PATCH', path, handler);
  }

  /** Every route this router holds, for mounting into a parent. */
  entries(): ReadonlyArray<Route & { re: RegExp; keys: string[] }> {
    return this.routes;
  }

  /**
   * Returns the matched handler, or `405` when the path exists under a
   * different method. A 404-vs-405 distinction matters here: the first tells
   * you the route is wrong, the second tells you the verb is, and during
   * development they send you to different files.
   */
  match(
    method: string,
    pathname: string,
  ): { handler: Handler; params: Record<string, string> } | { allowed: string[] } | null {
    const allowed: string[] = [];
    for (const route of this.routes) {
      const m = route.re.exec(pathname);
      if (!m) continue;
      if (route.method !== method) {
        allowed.push(route.method);
        continue;
      }
      const params: Record<string, string> = {};
      route.keys.forEach((key, i) => {
        params[key] = decodeURIComponent(m[i + 1] ?? '');
      });
      return { handler: route.handler, params };
    }
    return allowed.length > 0 ? { allowed: [...new Set(allowed)] } : null;
  }
}

/**
 * Mounts a service's routes into the shared table.
 *
 * Paths are declared by the service in full — `/funnels`, `/leads` — rather
 * than relative to a service-name prefix. That is what the `api-gateway` will
 * expose (resource-first, the way a gateway routes), and it avoids two failure
 * modes the prefixed shape invites: `/api/v1/business/business`, and a
 * `/:id` pattern that shadows a sibling literal like `/gaps` depending on
 * registration order.
 *
 * The service boundary is kept by `registerAll`, which records which service
 * owns which prefix so the split into separate processes stays mechanical and
 * so a 404 can name the service that should have answered.
 */
export function mount(root: Router, build: (r: Router) => void, _label?: string): void {
  build(root);
}
