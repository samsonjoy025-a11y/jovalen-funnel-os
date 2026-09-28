/**
 * Leads — the server-driven list, and the detail drawer.
 *
 * §57: leads are the funnel's other half, and the list is where a permission
 * leak would be most visible. Every field shown here is fetched, filtered,
 * sorted and paged by the API; the page holds no copy of the collection and
 * cannot render a row the server did not send. That is the point: if a role is
 * not permitted to see `email`, the fix is one filter in the lead service, not
 * an audit of every component that happens to display a lead.
 */

import * as React from 'react';
import { Badge, Button, Drawer, Field, StatusPill, Textarea } from '@funnelos/ui';
import { font, space } from '@funnelos/ui';
import { api, formatCurrency, formatNumber, useQuery, type LeadQueryParams } from '@funnelos/api-client';
import type { Lead, LeadStage } from '@funnelos/contracts';
import { useKeyedQuery } from '../hooks/useKeyedQuery.js';
import { PageHeader } from '../shell/AppShell.js';
import { AsyncBoundary, Panel } from '../composites/AsyncBoundary.js';
import { DataTable, type Column } from '../composites/DataTable.js';
import { ACTIVITY_TONE, StageBadge } from '../composites/Stage.js';

const STAGES: readonly LeadStage[] = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

const PAGE_SIZE = 25;

export function LeadsPage() {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(PAGE_SIZE);
  const [sort, setSort] = React.useState<NonNullable<LeadQueryParams['sort']>>('lastActivityAt');
  const [dir, setDir] = React.useState<'asc' | 'desc'>('desc');
  const [stage, setStage] = React.useState<LeadStage | undefined>(undefined);
  const [q, setQ] = React.useState('');
  const [openId, setOpenId] = React.useState<string | null>(null);

  /**
   * The search term is debounced into state that actually drives the request.
   *
   * The input is a controlled field over `search` so typing does not re-run the
   * query on every keystroke, and the reset to page 1 matters: filtering
   * 25-row pages while sitting on page 6 produces an empty table with no
   * explanation, which reads as "no results" rather than "page out of range".
   */
  const [search, setSearch] = React.useState('');
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(id);
  }, [search]);

  const params: LeadQueryParams = { page, pageSize, sort, dir, stage, q: q || undefined };
  const leads = useQuery((signal) => api.leads.list(params, signal), [page, pageSize, sort, dir, stage, q]);
  const data = leads.data;

  const cols = React.useMemo<ReadonlyArray<Column<Lead>>>(
    () => [
      {
        key: 'name',
        header: 'Lead',
        sortKey: 'name',
        render: (l) => (
          <span className="os-col" style={{ gap: 0 }}>
            <span style={{ fontWeight: font.weight.medium }}>{l.name}</span>
            <span className="os-tiny">{l.email}</span>
          </span>
        ),
      },
      {
        key: 'company',
        header: 'Company',
        sortKey: 'company',
        render: (l) => l.company,
      },
      {
        key: 'stage',
        header: 'Stage',
        sortKey: 'stage',
        render: (l) => <StageBadge stage={l.stage} />,
      },
      {
        key: 'score',
        header: 'Score',
        sortKey: 'score',
        align: 'end',
        render: (l) => (
          <span className="os-num" aria-label={`Score ${l.score} out of 100`}>
            {l.score}
          </span>
        ),
      },
      {
        key: 'value',
        header: 'Value',
        sortKey: 'value',
        align: 'end',
        render: (l) => <span className="os-num">{formatCurrency(l.value, 'USD')}</span>,
      },
      {
        key: 'source',
        header: 'Source',
        render: (l) => <Badge tone="neutral">{l.source}</Badge>,
      },
      {
        key: 'lastActivityAt',
        header: 'Last activity',
        sortKey: 'lastActivityAt',
        align: 'end',
        render: (l) => (
          // `dateTime` on a <time> is the machine-readable value. The visible
          // text is localised, which is right for a reader and useless to a
          // screen reader announcing two rows in a row.
          <time dateTime={l.lastActivityAt} className="os-num">
            {formatDate(l.lastActivityAt)}
          </time>
        ),
      },
    ],
    [],
  );

  return (
    <div className="os-page">
      <PageHeader
        title="Leads"
        subtitle="Everyone who entered the funnel, and what has happened to them since. Filtering, sorting and paging all happen on the server, so what you see is what the API is willing to show this role."
      />

      <Panel title="Filter">
        <div className="os-col" style={{ gap: space['3'] }}>
          <div className="os-row" style={{ gap: space['3'], flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 16rem' }}>
              <label htmlFor="leads-q" className="os-tiny" style={{ display: 'block', marginBottom: space['1'] }}>
                Search name, company or email
              </label>
              <input
                id="leads-q"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. Ridgewell"
                style={{
                  inlineSize: '100%',
                  minHeight: 'var(--ds-size-target-min)',
                  padding: `${space['2']} ${space['3']}`,
                  border: '1px solid var(--ds-color-neutral-300)',
                  borderRadius: 'var(--ds-field-radius)',
                  background: 'var(--ds-surface-raised)',
                  color: 'var(--ds-content-primary)',
                  font: `inherit`,
                }}
              />
            </div>

            <div>
              <label htmlFor="leads-stage" className="os-tiny" style={{ display: 'block', marginBottom: space['1'] }}>
                Stage
              </label>
              <select
                id="leads-stage"
                value={stage ?? ''}
                onChange={(e) => {
                  setStage((e.target.value || undefined) as LeadStage | undefined);
                  setPage(1);
                }}
                style={{
                  minHeight: 'var(--ds-size-target-min)',
                  padding: `${space['2']} ${space['3']}`,
                  border: '1px solid var(--ds-color-neutral-300)',
                  borderRadius: 'var(--ds-field-radius)',
                  background: 'var(--ds-surface-raised)',
                  color: 'var(--ds-content-primary)',
                  font: 'inherit',
                }}
              >
                <option value="">All stages</option>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {stage || q ? (
              <div style={{ alignSelf: 'flex-end' }}>
                {/*
                  A native <button> with a real handler rather than a link to
                  "#". A reset that cannot be activated by keyboard, or that
                  navigates, is a bug that only appears for some users.
                */}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setStage(undefined);
                    setSearch('');
                    setPage(1);
                  }}
                >
                  Clear filters
                </Button>
              </div>
            ) : null}
          </div>

          {data ? (
            <p className="os-tiny">
              {formatNumber(data.summary.byStage[stage ?? 'new'] ?? 0, true)}{' '}
              {stage ? `lead${stage ? 's' : ''} at stage "${stage}"` : 'leads'} of{' '}
              {formatNumber(data.total, true)} matching · {formatCurrency(data.summary.totalValue, 'USD')} total value
              · average score {Math.round(data.summary.avgScore)}
            </p>
          ) : null}
        </div>
      </Panel>

      <Panel title="Leads" flush>
        <AsyncBoundary
          query={leads}
          loadingLabel="Loading leads"
          emptyTitle={q || stage ? 'No leads match those filters' : 'No leads yet'}
          emptyBody={
            q || stage
              ? 'The filter is applied on the server, so this is a real empty result rather than an empty page of a larger set. Clear the filters to see everyone.'
              : 'Nothing has entered the funnel yet. Once a form is submitted or a campaign syncs, leads appear here.'
          }
        >
          {() =>
            data ? (
              <DataTable<Lead>
                caption="Leads, most recently active first by default. Column headers with a sort control change the order; paging is server-side so the count reflects every matching lead, not the rows on this page."
                columns={cols}
                rows={data.rows}
                rowId={(l) => l.id}
                total={data.total}
                page={data.page}
                pageSize={data.pageSize}
                sort={sort}
                dir={dir}
                loading={leads.isStale}
                emptyTitle="No leads on this page"
                emptyBody="The server returned a page beyond the end of the result set."
                onSort={(key) => {
                  const key2 = key as NonNullable<LeadQueryParams['sort']>;
                  // Clicking a new column sorts ascending; clicking the column
                  // already sorted flips it. Sorting a new column *descending*
                  // would be defensible but surprising for names and companies.
                  if (key2 === sort) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                  else {
                    setSort(key2);
                    setDir('asc');
                  }
                  setPage(1);
                }}
                onPage={setPage}
                onPageSize={(size) => {
                  // Reset to page 1: page 4 of 25 rows is page 1 of 100, and
                  // leaving the number alone produces an out-of-range page
                  // with no rows in it and no explanation.
                  setPageSize(size);
                  setPage(1);
                }}
                onRowActivate={(l) => setOpenId(l.id)}
              />
            ) : null
          }
        </AsyncBoundary>
      </Panel>

      <LeadDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Lead drawer
 *
 * Fetched by id on open rather than sliced out of the list. The list holds one
 * page; the drawer must not assume the lead it is asked for is on that page,
 * which is exactly the assumption that breaks when a filter changed between
 * the click and the render.
 * ------------------------------------------------------------------ */

function LeadDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  // `id === null` is "no drawer open", so both queries are `idle` and neither
  // fires. The previous `Promise.resolve(null)` / `Promise.resolve([])` version
  // made the activity list an *empty array* on every closed drawer, which is a
  // claim about the lead's history that happens to be false.
  const lead = useKeyedQuery(id === null ? null : [id], ([leadId], signal) =>
    api.leads.get(leadId!, signal),
  );
  const activity = useKeyedQuery(id === null ? null : [id], ([leadId], signal) =>
    api.leads.activity(leadId!, signal),
  );

  return (
    <Drawer
      open={id !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={lead.data ? lead.data.name : 'Lead'}
      description={lead.data ? `${lead.data.company} - ${lead.data.email}` : undefined}
      closeLabel="Close lead detail"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="solid" disabled title="No write path is defined for leads in the plan">
            Update stage
          </Button>
        </>
      }
    >
      <div className="os-col" style={{ gap: space['5'] }}>
        <dl className="os-defs">
          <dt>Stage</dt>
          <dd>
            <StageBadge stage={lead.data?.stage ?? 'new'} />
          </dd>
          <dt>Score</dt>
          <dd className="os-num">{lead.data?.score ?? '-'}</dd>
          <dt>Value</dt>
          <dd className="os-num">{lead.data ? formatCurrency(lead.data.value, 'USD') : '-'}</dd>
          <dt>Source</dt>
          <dd>{lead.data?.source ?? '-'}</dd>
          <dt>Created</dt>
          <dd>{lead.data ? formatDate(lead.data.createdAt) : '-'}</dd>
          <dt>Last activity</dt>
          <dd>{lead.data ? formatDate(lead.data.lastActivityAt) : '-'}</dd>
        </dl>

        <section>
          <h3 className="os-section-title">Activity</h3>
          <AsyncBoundary
            query={activity}
            loadingLabel="Loading activity"
            emptyTitle="No recorded activity"
            emptyBody="This lead has no notes, calls or stage changes on record. Every lead in the sample workspace has activity generated for it, so an empty timeline means the record is genuinely empty rather than the sample being unpopulated."
          >
            {(rows) => (
              <ol className="os-timeline">
                {rows.map((a) => (
                  <li key={a.id} className="os-timeline__item">
                    <div className="os-row os-row--between">
                      <StatusPill tone={ACTIVITY_TONE[a.kind]}>{a.kind}</StatusPill>
                      <time dateTime={a.at} className="os-timeline__when os-num">
                        {formatDate(a.at)}
                      </time>
                    </div>
                    <p style={{ margin: `${space['1']} 0 0`, fontSize: font.size.sm }}>{a.summary}</p>
                    <p className="os-tiny" style={{ margin: 0 }}>
                      {a.actor}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </AsyncBoundary>
        </section>

        <section className="os-col" style={{ gap: space['2'] }}>
          <h3 className="os-section-title">Add a note</h3>
          {/*
            Rendered, and visibly inert, rather than omitted. A user who has
            scrolled to a note box and typed into it, only to find it does
            nothing, has been actively lied to. Showing the control disabled
            with the reason attached is the honest version of the same affordance.

            `Field` rather than a hand-rolled `<p id=…>` plus a matching
            `aria-describedby`. The manual pairing is exactly the fragility the
            primitive removes: the two strings have to agree, and nothing checks
            that they do.
          */}
          <Field
            label="Note"
            help="Disabled. INFERRED: the plan does not define a lead-note endpoint, so there is nothing to post to. This becomes a real field when the PRD lands."
          >
            {(field) => (
              <Textarea
                {...field}
                placeholder="Not implemented - the plan defines no write path for lead notes"
                disabled
                rows={3}
              />
            )}
          </Field>
        </section>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ *
 * Local date formatting
 *
 * Deliberately not `new Date(x).toLocaleString()` scattered across the page:
 * one function means the table, the drawer and the timeline cannot disagree
 * about what "12 Mar" means. It also takes an explicit time zone, because the
 * server anchors its data at a fixed UTC instant and rendering that in the
 * viewer's local zone would make the sample data appear to be from different
 * days on different machines - which looks like a data bug and is not one.
 * ------------------------------------------------------------------ */

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  timeZone: 'UTC',
});

function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}
