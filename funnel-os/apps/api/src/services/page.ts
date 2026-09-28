/**
 * page-service — owns LandingPage, PageVersion, Form, FormField, PublishRecord.
 *
 * `publish` is where §63 bites hardest: publishing is irreversible from the
 * customer's point of view, and Slice 1's gate is about publish being a real
 * event rather than a button that flickers. So publish requires the page to
 * have at least one block and any referenced form to exist, and it stamps a
 * version that increments. A publish that silently no-ops is the failure mode
 * this refuses.
 */

import type { Block, Envelope, Form, LandingPage } from '@funnelos/contracts';
import type { Db } from '../db.js';
import { BadRequest, NotFound } from '../store.js';
import type { Router } from '../http.js';

function assertPublishable(page: LandingPage, forms: Form[]): void {
  if (page.blocks.length === 0) throw new BadRequest('Cannot publish a page with no blocks.');
  for (const block of page.blocks) {
    if (block.type !== 'form') continue;
    if (!forms.some((f) => f.id === block.formId)) {
      throw new BadRequest(`Block ${block.id} references form ${block.formId}, which does not exist.`);
    }
  }
}

export function register(db: Db, r: Router): void {
  r.get('/pages', (): Envelope<LandingPage[]> => ({
    data: db.pages.all(),
    meta: { at: new Date().toISOString() },
  }));

  r.get('/pages/:id', ({ params }): Envelope<LandingPage> => ({
    data: db.pages.require(params.id!),
    meta: { at: new Date().toISOString() },
  }));

  r.get('/forms', (): Envelope<Form[]> => ({ data: db.forms.all(), meta: { at: new Date().toISOString() } }));

  r.get('/forms/:id', ({ params }): Envelope<Form> => ({
    data: db.forms.require(params.id!),
    meta: { at: new Date().toISOString() },
  }));

  r.patch('/pages/:id', ({ params, body }): Envelope<LandingPage> => {
    const page = db.pages.require(params.id!);
    const { blocks, name, ...rest } = (body ?? {}) as Partial<LandingPage>;
    if (blocks && !Array.isArray(blocks)) throw new BadRequest('blocks must be an array');
    // Editing a live page bumps `updatedAt` but does NOT republish. Status and
    // publishedAt move only in `publish`, so "the live page has unsaved edits"
    // is a state the OS can actually show.
    const next = db.pages.patch(page.id, {
      ...rest,
      name: name ?? page.name,
      blocks: (blocks as Block[] | undefined) ?? page.blocks,
      updatedAt: new Date().toISOString(),
    });

    /*
     * §84, and this was a genuine gap rather than an oversight of taste.
     *
     * `publish` was audited; the edit that precedes it was not. That is the
     * backwards way round: a published page's content can be rewritten with no
     * trace of who rewrote it or when, so the log shows "published version 3"
     * and cannot say what version 3 said. The block count is in `reason`
     * because a page's content IS its blocks, and "changed" without a summary
     * is not something anyone can act on six months later.
     */
    const changedBlocks =
      blocks !== undefined && JSON.stringify(blocks) !== JSON.stringify(page.blocks);
    db.world.record({
      action: 'page.edited',
      entity: 'page',
      entityId: page.id,
      from: page.status,
      to: next.status,
      reason: changedBlocks
        ? `draft edit, ${next.blocks.length} blocks, live page unchanged`
        : `draft edit: ${Object.keys({ ...rest, ...(name !== undefined ? { name } : {}) }).join(', ') || 'no fields'}`,
    });
    return { data: next, meta: { at: new Date().toISOString() } };
  });

  r.post('/pages/:id/publish', ({ params }): Envelope<LandingPage> => {
    const page = db.pages.require(params.id!);
    assertPublishable(page, db.forms.all());
    const version = db.audit.where((a) => a.entityId === page.id).length + 1;
    const next = db.pages.patch(page.id, {
      status: 'published',
      publishedAt: new Date().toISOString(),
    });
    /*
     * `world.record` rather than a hand-built `db.audit.put`.
     *
     * This was the only audit write in the whole API, and it built its own row
     * from five different places (`db.session.workspace.id`,
     * `db.session.user.id`, `Date.now()` as an id, a free-text `action`
     * sentence). Every one is a way for the log to disagree with the contract:
     * `Date.now()` collides within a millisecond, and `action` here was a
     * sentence while every other entry is a dot-namespaced verb. Now it is one
     * call and the shape cannot vary.
     */
    db.world.record({
      action: 'page.published',
      entity: 'page',
      entityId: page.id,
      from: page.status,
      to: 'published',
      reason: `version ${version}, ${page.blocks.length} blocks`,
    });
    return { data: next, meta: { at: new Date().toISOString() } };
  });
}

export { NotFound };
