/**
 * Service registry.
 *
 * The plan (Phases 3–13) specifies fifteen services. This process mounts all
 * of them under `/api/v1/<service>`, which keeps the URL space identical to
 * what the `api-gateway` will expose later. Nothing above this file knows that
 * the services share a process; nothing inside a service file knows it is
 * sharing one. That is what makes the split mechanical.
 */

import type { Db } from '../db.js';
import type { Router } from '../http.js';
import { mount } from '../http.js';
import { register as identity } from './identity.js';
import { register as business } from './business.js';
import { register as funnel } from './funnel.js';
import { register as lead } from './lead.js';
import { register as analytics } from './analytics.js';
import { register as integration } from './integration.js';
import { register as insight } from './insight.js';
import { register as recommendation } from './recommendation.js';
import { register as action } from './action.js';
import { register as experiment } from './experiment.js';
import { register as page } from './page.js';
import { register as audit } from './audit.js';

export const SERVICES = {
  identity,
  business,
  funnel,
  lead,
  analytics,
  integration,
  insight,
  recommendation,
  action,
  experiment,
  page,
  audit,
} as const;

export type ServiceName = keyof typeof SERVICES;

/**
 * Each service declares its own resource paths into the shared table. The
 * mapping below records which service owns which prefix, which is what the
 * split into separate processes follows and what a 404 quotes back.
 */
export const SERVICE_ROUTES: Record<ServiceName, readonly string[]> = {
  identity: ['/session'],
  business: ['/business', '/goals', '/audiences', '/onboarding'],
  funnel: ['/funnels', '/gaps'],
  lead: ['/leads'],
  analytics: ['/metrics', '/overview'],
  integration: ['/integrations'],
  insight: ['/insights'],
  recommendation: ['/recommendations'],
  action: ['/actions'],
  experiment: ['/experiments'],
  page: ['/pages', '/forms'],
  audit: ['/audit', '/events', '/activity'],
};

export function ownerOf(pathname: string): ServiceName | null {
  for (const [name, prefixes] of Object.entries(SERVICE_ROUTES) as Array<[ServiceName, readonly string[]]>) {
    if (prefixes.some((p) => pathname === `/api/v1${p}` || pathname.startsWith(`/api/v1${p}/`))) return name;
  }
  return null;
}

export function registerAll(db: Db, root: Router): void {
  for (const register of Object.values(SERVICES)) mount(root, (sub) => register(db, sub));
}
