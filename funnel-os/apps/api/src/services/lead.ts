/**
 * lead-service — owns Lead, LeadScoreRule, RoutingRule, LeadActivity, Customer, Opportunity.
 *
 * The list endpoint is server-driven, because §1.3's `DataTable` is specified as
 * server-driven sort/filter/pagination. If the API did the work client-side the
 * composite would have to be rewritten at the point real data arrives, and the
 * pagination would silently be wrong at 10,000 rows. So sort/filter/page all
 * happen here, and the response reports the total before paging.
 */

import type { Envelope, Lead, LeadActivity, LeadStage } from '@funnelos/contracts';
import type { Db } from '../db.js';
import { BadRequest, NotFound } from '../store.js';
import type { Router } from '../http.js';

const STAGES: readonly LeadStage[] = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

export interface LeadQuery {
  page: number;
  pageSize: number;
  sort: keyof Pick<Lead, 'name' | 'company' | 'stage' | 'score' | 'value' | 'createdAt' | 'lastActivityAt'>;
  dir: 'asc' | 'desc';
  stage?: LeadStage;
  q?: string;
}

export interface LeadPage {
  rows: Lead[];
  total: number;
  page: number;
  pageSize: number;
  /** The aggregate the table shows, e.g. "742 leads · $1.2M pipeline". */
  summary: { totalValue: number; avgScore: number; byStage: Record<LeadStage, number> };
}

export function query(db: Db, q: LeadQuery): LeadPage {
  let rows = db.leads.all();

  if (q.stage) rows = rows.filter((l) => l.stage === q.stage);
  if (q.q) {
    const needle = q.q.toLowerCase();
    rows = rows.filter(
      (l) =>
        l.name.toLowerCase().includes(needle) ||
        l.email.toLowerCase().includes(needle) ||
        l.company.toLowerCase().includes(needle),
    );
  }

  const dir = q.dir === 'asc' ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    const av = a[q.sort];
    const bv = b[q.sort];
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });

  // Aggregates are computed over the *filtered* set, not the page. A footer
  // that sums the current page is the classic way a data table starts lying
  // once the user changes the page size.
  const byStage = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<LeadStage, number>;
  for (const l of rows) byStage[l.stage]! += 1;
  const totalValue = rows.reduce((sum, l) => sum + l.value, 0);
  const avgScore = rows.length === 0 ? 0 : Math.round(rows.reduce((s, l) => s + l.score, 0) / rows.length);

  const start = (q.page - 1) * q.pageSize;
  return {
    rows: rows.slice(start, start + q.pageSize),
    total: rows.length,
    page: q.page,
    pageSize: q.pageSize,
    summary: { totalValue, avgScore, byStage },
  };
}

export function register(db: Db, r: Router): void {
  r.get('/leads', ({ query: u }): Envelope<LeadPage> => {
    const page = Number(u.get('page') ?? '1');
    const pageSize = Number(u.get('pageSize') ?? '25');
    const sort = (u.get('sort') ?? 'score') as LeadQuery['sort'];
    const dir = (u.get('dir') ?? 'desc') === 'asc' ? 'asc' : 'desc';
    const stageParam = u.get('stage');

    if (!Number.isInteger(page) || page < 1) throw new BadRequest('page must be a positive integer');
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
      throw new BadRequest('pageSize must be between 1 and 200');
    }
    if (!['name', 'company', 'stage', 'score', 'value', 'createdAt', 'lastActivityAt'].includes(sort)) {
      throw new BadRequest(`sort must be one of name, company, stage, score, value, createdAt, lastActivityAt`);
    }
    if (stageParam && !STAGES.includes(stageParam as LeadStage)) {
      throw new BadRequest(`stage must be one of ${STAGES.join(', ')}`);
    }

    return {
      data: query(db, {
        page,
        pageSize,
        sort,
        dir,
        stage: stageParam ? (stageParam as LeadStage) : undefined,
        q: u.get('q') ?? undefined,
      }),
      meta: { at: new Date().toISOString() },
    };
  });

  r.get('/leads/:id', ({ params }): Envelope<Lead> => ({
    data: db.leads.require(params.id!),
    meta: { at: new Date().toISOString() },
  }));

  r.get('/leads/:id/activity', ({ params }): Envelope<LeadActivity[]> => {
    db.leads.require(params.id!);
    return {
      data: db.leadActivities.where((a) => a.leadId === params.id),
      meta: { at: new Date().toISOString() },
    };
  });

  r.patch('/leads/:id', ({ params, body }): Envelope<Lead> => {
    const lead = db.leads.require(params.id!);
    const { stage } = (body ?? {}) as { stage?: LeadStage };
    if (stage && !STAGES.includes(stage)) throw new BadRequest(`stage must be one of ${STAGES.join(', ')}`);
    const { id: _id, businessId: _b, ...changes } = (body ?? {}) as Partial<Lead>;
    const next = db.leads.patch(params.id!, changes);
    // §84. A stage change is a judgement about a real person, made by a user
    // with a name; it is exactly the kind of write the log is for. The changed
    // keys are recorded so a log full of `lead.updated` still says what
    // actually moved.
    db.world.record({
      action: 'lead.updated',
      entity: 'lead',
      entityId: lead.id,
      from: lead.stage,
      to: next.stage,
      reason: stage ? `stage set to ${stage}` : `changed: ${Object.keys(changes).join(', ')}`,
    });
    return { data: next, meta: { at: new Date().toISOString() } };
  });
}
