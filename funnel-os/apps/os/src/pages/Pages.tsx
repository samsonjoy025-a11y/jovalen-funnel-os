/**
 * Pages — §24's block document, §41's publish.
 *
 * The page editor here is read-only. The plan gives the block schema but not an
 * editing surface, and an editor that silently fails to save is worse than one
 * that is obviously not there. So the block document renders, the publish
 * control works because the API has a real endpoint for it, and every edit
 * affordance is absent rather than present-and-broken.
 */

import * as React from 'react';
import { Alert, Badge, Button, StatusPill } from '@funnelos/ui';
import { font, space } from '@funnelos/ui';
import { api, useMutation, useQuery } from '@funnelos/api-client';
import type { Block, LandingPage } from '@funnelos/contracts';
import { useKeyedQuery } from '../hooks/useKeyedQuery.js';
import { PageHeader } from '../shell/AppShell.js';
import { AsyncBoundary, Panel } from '../composites/AsyncBoundary.js';

export function PagesPage() {
  const pages = useQuery((signal) => api.pages.list(signal), []);
  const [selected, setSelected] = React.useState<string | null>(null);

  const activeId = selected ?? pages.data?.[0]?.id ?? null;
  // Nothing chosen yet is `idle`, not a fetched null — see `useKeyedQuery`.
  const page = useKeyedQuery(activeId === null ? null : [activeId], ([id], signal) =>
    api.pages.get(id!, signal),
  );

  return (
    <div className="os-page">
      <PageHeader
        title="Pages"
        subtitle="The pages that make up the funnel and the forms they submit into. This screen shows what exists and whether it is live; editing is not built, and says so rather than offering a control that quietly does nothing."
      />

      <div className="os-grid os-grid--wide-first">
        <Panel title="All pages" flush>
          <AsyncBoundary
            query={pages}
            loadingLabel="Loading pages"
            emptyTitle="No pages"
            emptyBody="Nothing has been built yet. A page is where a funnel stage becomes something a person can actually visit."
          >
            {(rows) => (
              <ul className="os-col" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {rows.map((p) => (
                  <li key={p.id}>
                    {/*
                      A button, not a row with an onClick. A clickable <tr> is
                      unreachable by keyboard; this is a real control that can
                      be tabbed to and activated, and `aria-current` says which
                      one is selected rather than relying on a highlight.
                    */}
                    <button
                      type="button"
                      onClick={() => setSelected(p.id)}
                      aria-current={p.id === activeId ? 'true' : undefined}
                      className="os-row os-row--between"
                      style={{
                        inlineSize: '100%',
                        gap: space['3'],
                        padding: `${space['3']} ${space['4']}`,
                        border: 'none',
                        borderBlockEnd: 'var(--ds-border-width-thin) solid var(--ds-border-subtle)',
                        background:
                          p.id === activeId ? 'var(--ds-surface-subtle)' : 'transparent',
                        textAlign: 'start',
                        font: 'inherit',
                        color: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      <span className="os-col" style={{ gap: 0, minInlineSize: 0 }}>
                        <span style={{ fontWeight: font.weight.medium }}>{p.name}</span>
                        <span className="os-tiny">/{p.slug}</span>
                      </span>
                      <StatusPill tone={p.status === 'published' ? 'success' : 'neutral'}>{p.status}</StatusPill>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </AsyncBoundary>
        </Panel>

        <Panel title="Page">
          <AsyncBoundary
            query={page}
            loadingLabel="Loading page"
            emptyTitle="No page selected"
            emptyBody="Choose a page from the list to see its blocks and publish state."
          >
            {(p) => <PageDetail page={p} />}
          </AsyncBoundary>
        </Panel>
      </div>
    </div>
  );
}

function PageDetail({ page }: { page: LandingPage }) {
  const publish = useMutation(() => api.pages.publish(page.id), [page.id]);

  return (
    <div className="os-col" style={{ gap: space['4'] }}>
      <div className="os-row os-row--between">
        <div className="os-col" style={{ gap: 0 }}>
          <span style={{ fontWeight: font.weight.semibold, fontSize: font.size.base }}>{page.name}</span>
          <span className="os-tiny">
            /{page.slug} · updated{' '}
            <time dateTime={page.updatedAt}>{page.updatedAt.slice(0, 10)}</time>
          </span>
        </div>
        <StatusPill tone={page.status === 'published' ? 'success' : 'neutral'}>{page.status}</StatusPill>
      </div>

      {page.publishedAt ? (
        <p className="os-tiny">
          Last published{' '}
          <time dateTime={page.publishedAt}>{page.publishedAt.slice(0, 10)}</time>
        </p>
      ) : null}

      {page.blocks.length === 0 ? (
        <Alert tone="warning" title="This page has no blocks">
          A published page with no blocks is a blank page that will still collect leads, because a form
          submission does not require content. Publishing is not blocked by the API, so this is stated here
          rather than prevented there.
        </Alert>
      ) : (
        <div className="os-col" style={{ gap: space['2'] }}>
          <span className="os-tiny">
            {page.blocks.length} block{page.blocks.length === 1 ? '' : 's'} (§24)
          </span>
          <ol className="os-col" style={{ gap: space['2'], listStyle: 'none', margin: 0, padding: 0 }}>
            {page.blocks.map((b, i) => (
              <li
                key={b.id}
                className="os-card os-card--flush"
                style={{ padding: space['3'], boxShadow: 'none' }}
              >
                <div className="os-row os-row--between">
                  <Badge tone="neutral">
                    {i + 1}. {b.type}
                  </Badge>
                </div>
                <BlockPreview block={b} />
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="os-row" style={{ flexWrap: 'wrap' }}>
        <Button
          variant="solid"
          size="sm"
          disabled={publish.pending || page.status === 'published'}
          onClick={() => publish.run()}
        >
          {page.status === 'published' ? 'Published' : 'Publish'}
        </Button>
        <Button variant="secondary" size="sm" disabled title="No editing surface is defined in the plan">
          Edit
        </Button>
      </div>

      {publish.error ? (
        <p className="os-tiny" role="alert">
          {publish.error.message}
        </p>
      ) : null}

      <p className="os-tiny">
        INFERRED — §24 names the block types but not their fields, and the plan describes no editor. The
        document renders read-only; publishing works because the API has a real endpoint for it.
      </p>
    </div>
  );
}

/**
 * Renders whatever fields the block happens to carry.
 *
 * Not a switch over every `Block` member: the union is marked INFERRED and is
 * expected to change when the PRD lands, and a switch would need rewriting then.
 * This walks the object, so a block with a field nobody anticipated still shows
 * its content instead of rendering as an empty box.
 */
function BlockPreview({ block }: { block: Block }) {
  const entries = Object.entries(block as Record<string, unknown>).filter(
    ([k]) => k !== 'id' && k !== 'type',
  );

  if (entries.length === 0) {
    return <p className="os-tiny os-muted">no content set</p>;
  }

  return (
    <dl className="os-defs" style={{ marginBlockStart: space['2'] }}>
      {entries.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt>{k}</dt>
          <dd>{typeof v === 'string' || typeof v === 'number' ? String(v) : <code>{JSON.stringify(v)}</code>}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
