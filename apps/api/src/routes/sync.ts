import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and, gt, or, ne, isNull } from 'drizzle-orm';
import { syncPushSchema, syncPullQuerySchema, parseSyncPayload } from '@diade/validation';
import {
  canAccessRecord,
  type ClientMutation,
  type RejectedMutation,
  type Visibility,
} from '@diade/domain';
import type { DbClient } from '../db';
import { buildExternalPull } from '../calendar/pull';
import {
  events,
  tasks,
  lists,
  listItems,
  captureItems,
  importantDates,
  recipes,
  syncMutations,
  spaceMembers,
} from '../db/schema';

type Access = 'ok' | 'not_found' | 'forbidden';

interface ApplyContext {
  spaceId: string;
  userId: string;
  now: Date;
}

const toDate = (value: unknown): Date => new Date(value as string);

/**
 * Checks the caller may perform this mutation against the stored row.
 * Personal events/tasks are writable only by their creator; capture items are
 * always private to their creator; list items must belong to a list in this space.
 */
export async function authorizeMutation(
  db: DbClient,
  mutation: ClientMutation,
  data: Record<string, unknown>,
  spaceId: string,
  userId: string,
): Promise<Access> {
  const { entity, operation, recordId } = mutation;

  if (operation === 'INSERT') {
    if (entity === 'list_items') {
      const [list] = await db
        .select({ id: lists.id })
        .from(lists)
        .where(and(eq(lists.id, data.listId as string), eq(lists.spaceId, spaceId)))
        .limit(1);
      return list ? 'ok' : 'forbidden';
    }
    return 'ok';
  }

  switch (entity) {
    case 'events':
    case 'tasks': {
      const table = entity === 'events' ? events : tasks;
      const [row] = await db
        .select({ visibility: table.visibility, creatorId: table.creatorId })
        .from(table)
        .where(and(eq(table.id, recordId), eq(table.spaceId, spaceId)))
        .limit(1);
      if (!row) return 'not_found';
      return canAccessRecord(
        { visibility: row.visibility as Visibility, creatorId: row.creatorId },
        userId,
      )
        ? 'ok'
        : 'forbidden';
    }
    case 'capture_items': {
      const [row] = await db
        .select({ creatorId: captureItems.creatorId })
        .from(captureItems)
        .where(and(eq(captureItems.id, recordId), eq(captureItems.spaceId, spaceId)))
        .limit(1);
      if (!row) return 'not_found';
      return row.creatorId === userId ? 'ok' : 'forbidden';
    }
    case 'lists': {
      const [row] = await db
        .select({ id: lists.id })
        .from(lists)
        .where(and(eq(lists.id, recordId), eq(lists.spaceId, spaceId)))
        .limit(1);
      return row ? 'ok' : 'not_found';
    }
    case 'important_dates': {
      // Always shared: any member of the space may edit, but only within their own space.
      const [row] = await db
        .select({ id: importantDates.id })
        .from(importantDates)
        .where(and(eq(importantDates.id, recordId), eq(importantDates.spaceId, spaceId)))
        .limit(1);
      return row ? 'ok' : 'not_found';
    }
    case 'recipes': {
      // Always shared: any member may edit, but only within their own space.
      const [row] = await db
        .select({ id: recipes.id })
        .from(recipes)
        .where(and(eq(recipes.id, recordId), eq(recipes.spaceId, spaceId)))
        .limit(1);
      return row ? 'ok' : 'not_found';
    }
    case 'list_items': {
      const [item] = await db
        .select({ listId: listItems.listId })
        .from(listItems)
        .where(eq(listItems.id, recordId))
        .limit(1);
      if (!item) return 'not_found';
      const [list] = await db
        .select({ id: lists.id })
        .from(lists)
        .where(and(eq(lists.id, item.listId), eq(lists.spaceId, spaceId)))
        .limit(1);
      return list ? 'ok' : 'forbidden';
    }
  }
}

/** Applies a validated, authorised mutation. Records are soft-deleted via deletedAt tombstones. */
async function applyMutation(
  db: DbClient,
  mutation: ClientMutation,
  data: Record<string, unknown>,
  ctx: ApplyContext,
): Promise<void> {
  const { entity, operation, recordId } = mutation;
  const { spaceId, userId, now } = ctx;
  const d = data as Record<string, any>;

  switch (entity) {
    case 'events': {
      if (operation === 'INSERT') {
        await db.insert(events).values({
          id: recordId,
          spaceId,
          creatorId: userId,
          title: d.title,
          description: d.description ?? null,
          startAt: toDate(d.startAt),
          endAt: toDate(d.endAt),
          isAllDay: d.isAllDay ?? false,
          visibility: d.visibility ?? 'shared',
          recurrenceRule: d.recurrenceRule ?? null,
          category: d.category ?? 'general',
          highlighted: d.highlighted ?? false,
          createdAt: now,
          updatedAt: now,
        });
        return;
      }
      const where = and(eq(events.id, recordId), eq(events.spaceId, spaceId));
      if (operation === 'DELETE') {
        await db.update(events).set({ deletedAt: now, updatedAt: now }).where(where);
        return;
      }
      const changes: Partial<typeof events.$inferInsert> = { updatedAt: now };
      if (d.title !== undefined) changes.title = d.title;
      if (d.description !== undefined) changes.description = d.description;
      if (d.startAt !== undefined) changes.startAt = toDate(d.startAt);
      if (d.endAt !== undefined) changes.endAt = toDate(d.endAt);
      if (d.isAllDay !== undefined) changes.isAllDay = d.isAllDay;
      if (d.visibility !== undefined) changes.visibility = d.visibility;
      if (d.recurrenceRule !== undefined) changes.recurrenceRule = d.recurrenceRule;
      if (d.category !== undefined) changes.category = d.category;
      if (d.highlighted !== undefined) changes.highlighted = d.highlighted;
      await db.update(events).set(changes).where(where);
      return;
    }

    case 'tasks': {
      if (operation === 'INSERT') {
        await db.insert(tasks).values({
          id: recordId,
          spaceId,
          creatorId: userId,
          assigneeId: d.assigneeId ?? null,
          title: d.title,
          notes: d.notes ?? null,
          dueDate: d.dueDate ? toDate(d.dueDate) : null,
          status: d.status ?? 'todo',
          priority: d.priority ?? 'normal',
          visibility: d.visibility ?? 'shared',
          completedAt: d.completedAt ? toDate(d.completedAt) : null,
          createdAt: now,
          updatedAt: now,
        });
        return;
      }
      const where = and(eq(tasks.id, recordId), eq(tasks.spaceId, spaceId));
      if (operation === 'DELETE') {
        await db.update(tasks).set({ deletedAt: now, updatedAt: now }).where(where);
        return;
      }
      const changes: Partial<typeof tasks.$inferInsert> = { updatedAt: now };
      if (d.title !== undefined) changes.title = d.title;
      if (d.notes !== undefined) changes.notes = d.notes;
      if (d.dueDate !== undefined) changes.dueDate = d.dueDate ? toDate(d.dueDate) : null;
      if (d.status !== undefined) changes.status = d.status;
      if (d.priority !== undefined) changes.priority = d.priority;
      if (d.assigneeId !== undefined) changes.assigneeId = d.assigneeId;
      if (d.visibility !== undefined) changes.visibility = d.visibility;
      if (d.completedAt !== undefined) {
        changes.completedAt = d.completedAt ? toDate(d.completedAt) : null;
      }
      await db.update(tasks).set(changes).where(where);
      return;
    }

    case 'lists': {
      if (operation === 'INSERT') {
        await db.insert(lists).values({
          id: recordId,
          spaceId,
          creatorId: userId,
          name: d.name,
          icon: d.icon ?? null,
          category: d.category ?? 'groceries',
          createdAt: now,
          updatedAt: now,
        });
        return;
      }
      const where = and(eq(lists.id, recordId), eq(lists.spaceId, spaceId));
      if (operation === 'DELETE') {
        await db.update(lists).set({ deletedAt: now, updatedAt: now }).where(where);
        return;
      }
      const changes: Partial<typeof lists.$inferInsert> = { updatedAt: now };
      if (d.name !== undefined) changes.name = d.name;
      if (d.icon !== undefined) changes.icon = d.icon;
      if (d.category !== undefined) changes.category = d.category;
      await db.update(lists).set(changes).where(where);
      return;
    }

    case 'list_items': {
      if (operation === 'INSERT') {
        const isChecked = Boolean(d.isChecked);
        await db.insert(listItems).values({
          id: recordId,
          listId: d.listId,
          name: d.name,
          quantity: d.quantity ?? null,
          unit: d.unit ?? null,
          notes: d.notes ?? null,
          position: d.position ?? null,
          isChecked,
          checkedBy: isChecked ? userId : null,
          checkedAt: isChecked ? now : null,
          createdAt: now,
          updatedAt: now,
        });
        return;
      }
      const where = eq(listItems.id, recordId);
      if (operation === 'DELETE') {
        await db.update(listItems).set({ deletedAt: now, updatedAt: now }).where(where);
        return;
      }
      const changes: Partial<typeof listItems.$inferInsert> = { updatedAt: now };
      if (d.name !== undefined) changes.name = d.name;
      if (d.quantity !== undefined) changes.quantity = d.quantity;
      if (d.unit !== undefined) changes.unit = d.unit;
      if (d.notes !== undefined) changes.notes = d.notes;
      if (d.position !== undefined) changes.position = d.position;
      if (d.isChecked !== undefined) {
        changes.isChecked = Boolean(d.isChecked);
        changes.checkedBy = d.isChecked ? userId : null;
        changes.checkedAt = d.isChecked ? now : null;
      }
      await db.update(listItems).set(changes).where(where);
      return;
    }

    case 'important_dates': {
      const where = and(eq(importantDates.id, recordId), eq(importantDates.spaceId, spaceId));
      if (operation === 'DELETE') {
        await db.update(importantDates).set({ deletedAt: now, updatedAt: now }).where(where);
        return;
      }

      // Only one live date per space may be pinned. Un-pin the others (bumping updatedAt so
      // every device pulls the change) and write this record in the same transaction.
      const unpinOthers = (tx: Pick<DbClient, 'update'>) =>
        tx
          .update(importantDates)
          .set({ pinned: false, updatedAt: now })
          .where(
            and(
              eq(importantDates.spaceId, spaceId),
              eq(importantDates.pinned, true),
              isNull(importantDates.deletedAt),
              ne(importantDates.id, recordId),
            ),
          );

      if (operation === 'INSERT') {
        const pinned = d.pinned ?? false;
        await db.transaction(async (tx) => {
          if (pinned) await unpinOthers(tx);
          await tx.insert(importantDates).values({
            id: recordId,
            spaceId,
            creatorId: userId,
            title: d.title,
            type: d.type ?? 'other',
            notes: d.notes ?? null,
            personName: d.personName ?? null,
            date: d.date,
            countFirstDay: d.countFirstDay ?? false,
            repeat: d.repeat ?? 'yearly',
            pinned,
            alertOffsetDays: d.alertOffsetDays ?? null,
            createdAt: now,
            updatedAt: now,
          });
        });
        return;
      }

      const changes: Partial<typeof importantDates.$inferInsert> = { updatedAt: now };
      if (d.title !== undefined) changes.title = d.title;
      if (d.type !== undefined) changes.type = d.type;
      if (d.notes !== undefined) changes.notes = d.notes;
      if (d.personName !== undefined) changes.personName = d.personName;
      if (d.date !== undefined) changes.date = d.date;
      if (d.countFirstDay !== undefined) changes.countFirstDay = d.countFirstDay;
      if (d.repeat !== undefined) changes.repeat = d.repeat;
      if (d.pinned !== undefined) changes.pinned = d.pinned;
      if (d.alertOffsetDays !== undefined) changes.alertOffsetDays = d.alertOffsetDays;
      await db.transaction(async (tx) => {
        if (d.pinned === true) await unpinOthers(tx);
        await tx.update(importantDates).set(changes).where(where);
      });
      return;
    }

    case 'recipes': {
      if (operation === 'INSERT') {
        await db.insert(recipes).values({
          id: recordId,
          spaceId,
          creatorId: userId,
          name: d.name,
          servings: d.servings ?? 4,
          notes: d.notes ?? null,
          ingredients: d.ingredients ?? [],
          createdAt: now,
          updatedAt: now,
        });
        return;
      }
      const where = and(eq(recipes.id, recordId), eq(recipes.spaceId, spaceId));
      if (operation === 'DELETE') {
        await db.update(recipes).set({ deletedAt: now, updatedAt: now }).where(where);
        return;
      }
      const changes: Partial<typeof recipes.$inferInsert> = { updatedAt: now };
      if (d.name !== undefined) changes.name = d.name;
      if (d.servings !== undefined) changes.servings = d.servings;
      if (d.notes !== undefined) changes.notes = d.notes;
      if (d.ingredients !== undefined) changes.ingredients = d.ingredients;
      await db.update(recipes).set(changes).where(where);
      return;
    }

    case 'capture_items': {
      if (operation === 'INSERT') {
        await db.insert(captureItems).values({
          id: recordId,
          spaceId,
          creatorId: userId,
          content: d.content,
          captureType: d.captureType ?? 'text',
          status: d.status ?? 'inbox',
          createdAt: now,
          updatedAt: now,
        });
        return;
      }
      const where = and(eq(captureItems.id, recordId), eq(captureItems.spaceId, spaceId));
      if (operation === 'DELETE') {
        await db.update(captureItems).set({ deletedAt: now, updatedAt: now }).where(where);
        return;
      }
      const changes: Partial<typeof captureItems.$inferInsert> = { updatedAt: now };
      if (d.content !== undefined) changes.content = d.content;
      if (d.status !== undefined) changes.status = d.status;
      await db.update(captureItems).set(changes).where(where);
      return;
    }
  }
}


export function createSyncRouter(getDb: (c: any) => DbClient, getAuth: (c: any) => any) {
  const router = new Hono<{
    Variables: {
      user: { id: string; email: string; name: string };
      spaceId: string;
    };
  }>();

  // Middleware: Auth + Space Verification
  router.use('*', async (c, next) => {
    const auth = getAuth(c);
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session || !session.user) {
      return c.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        },
        401,
      );
    }

    const db = getDb(c);
    const [membership] = await db
      .select()
      .from(spaceMembers)
      .where(eq(spaceMembers.userId, session.user.id))
      .limit(1);

    if (!membership) {
      return c.json(
        {
          success: false,
          error: { code: 'NO_SPACE', message: 'User must belong to a space to sync' },
        },
        403,
      );
    }

    c.set('user', session.user);
    c.set('spaceId', membership.spaceId);
    await next();
  });

  // POST /api/sync/push - Process Outbox Mutations
  //
  // Each mutation is: (1) de-duplicated by its client id, (2) validated against its
  // entity schema, (3) authorised against the stored row, then (4) applied. A mutation
  // that can never succeed is reported in `rejectedMutations` so the client drops it;
  // transient database failures are reported the same way so one bad row cannot block
  // the whole outbox, and the client's own retry policy decides what to do next.
  router.post('/push', zValidator('json', syncPushSchema), async (c) => {
    const db = getDb(c);
    const user = c.get('user');
    const spaceId = c.get('spaceId');
    const { mutations } = c.req.valid('json');

    const appliedMutationIds: string[] = [];
    const rejectedMutations: RejectedMutation[] = [];
    const now = new Date();

    for (const mutation of mutations) {
      // 1. Idempotency: a mutation we already recorded is a successful no-op
      const [existing] = await db
        .select()
        .from(syncMutations)
        .where(eq(syncMutations.id, mutation.id))
        .limit(1);

      if (existing) {
        appliedMutationIds.push(mutation.id);
        continue;
      }

      // 2. Validate the payload for this entity and operation
      const parsed = parseSyncPayload(mutation.entity, mutation.operation, mutation.payload);
      if (!parsed.success) {
        rejectedMutations.push({ id: mutation.id, code: 'INVALID_PAYLOAD', message: parsed.message });
        continue;
      }

      try {
        // 3. Authorise against the stored row (never trust the client's view of ownership)
        const access = await authorizeMutation(db, mutation, parsed.data, spaceId, user.id);
        if (access === 'forbidden') {
          rejectedMutations.push({
            id: mutation.id,
            code: 'FORBIDDEN',
            message: 'You do not have access to this record',
          });
          continue;
        }

        // 4. Apply. A missing record means it was already deleted elsewhere: converge silently.
        if (access === 'ok') {
          await applyMutation(db, mutation, parsed.data, { spaceId, userId: user.id, now });
        }
      } catch (err) {
        console.error('[sync] mutation failed', mutation.id, mutation.entity, mutation.operation, err);
        rejectedMutations.push({
          id: mutation.id,
          code: 'APPLY_FAILED',
          message: 'The server could not apply this change',
        });
        continue;
      }

      // 5. Record for idempotency
      await db.insert(syncMutations).values({
        id: mutation.id,
        spaceId,
        userId: user.id,
        entity: mutation.entity,
        operation: mutation.operation,
        recordId: mutation.recordId,
        clientTimestamp: mutation.clientTimestamp,
        createdAt: now,
      });

      appliedMutationIds.push(mutation.id);
    }

    return c.json({
      success: true,
      data: {
        processedCount: appliedMutationIds.length,
        appliedMutationIds,
        rejectedMutations,
        serverTimestamp: now.toISOString(),
      },
    });
  });

  // GET /api/sync/pull - Pull Delta Updates
  router.get('/pull', zValidator('query', syncPullQuerySchema), async (c) => {
    const db = getDb(c);
    const user = c.get('user');
    const spaceId = c.get('spaceId');
    const { since } = c.req.valid('query');

    const sinceDate = since ? new Date(since) : new Date(0);
    const now = new Date();

    // Query events (shared or owned by user, updated/deleted after sinceDate)
    const eventRecords = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.spaceId, spaceId),
          or(eq(events.visibility, 'shared'), eq(events.creatorId, user.id)),
          or(gt(events.updatedAt, sinceDate), gt(events.deletedAt, sinceDate)),
        ),
      );

    // Query tasks (shared or owned by user, updated/deleted after sinceDate)
    const taskRecords = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.spaceId, spaceId),
          or(eq(tasks.visibility, 'shared'), eq(tasks.creatorId, user.id)),
          or(gt(tasks.updatedAt, sinceDate), gt(tasks.deletedAt, sinceDate)),
        ),
      );

    // Query lists
    const listRecords = await db
      .select()
      .from(lists)
      .where(
        and(
          eq(lists.spaceId, spaceId),
          or(gt(lists.updatedAt, sinceDate), gt(lists.deletedAt, sinceDate)),
        ),
      );

    // Query list items
    const listItemRecords = await db
      .select({
        id: listItems.id,
        listId: listItems.listId,
        name: listItems.name,
        quantity: listItems.quantity,
        unit: listItems.unit,
        notes: listItems.notes,
        position: listItems.position,
        isChecked: listItems.isChecked,
        checkedBy: listItems.checkedBy,
        checkedAt: listItems.checkedAt,
        createdAt: listItems.createdAt,
        updatedAt: listItems.updatedAt,
        deletedAt: listItems.deletedAt,
      })
      .from(listItems)
      .innerJoin(lists, eq(listItems.listId, lists.id))
      .where(
        and(
          eq(lists.spaceId, spaceId),
          or(gt(listItems.updatedAt, sinceDate), gt(listItems.deletedAt, sinceDate)),
        ),
      );

    // Query capture items
    const captureRecords = await db
      .select()
      .from(captureItems)
      .where(
        and(
          eq(captureItems.spaceId, spaceId),
          eq(captureItems.creatorId, user.id),
          or(gt(captureItems.updatedAt, sinceDate), gt(captureItems.deletedAt, sinceDate)),
        ),
      );

    // Query important dates (always shared within the space)
    const importantDateRecords = await db
      .select()
      .from(importantDates)
      .where(
        and(
          eq(importantDates.spaceId, spaceId),
          or(gt(importantDates.updatedAt, sinceDate), gt(importantDates.deletedAt, sinceDate)),
        ),
      );

    // Recipes (always shared within the space)
    const recipeRecords = await db
      .select()
      .from(recipes)
      .where(
        and(
          eq(recipes.spaceId, spaceId),
          or(gt(recipes.updatedAt, sinceDate), gt(recipes.deletedAt, sinceDate)),
        ),
      );

    // Google Calendar events and calendars: own in full, partner's redacted on the server.
    const external = await buildExternalPull(db, { since: sinceDate, spaceId, viewerId: user.id });

    return c.json({
      success: true,
      data: {
        cursor: now.toISOString(),
        externalCalendars: external.externalCalendars,
        externalEvents: external.externalEvents,
        events: eventRecords.map((e) => ({
          ...e,
          startAt: e.startAt.toISOString(),
          endAt: e.endAt.toISOString(),
          createdAt: e.createdAt.toISOString(),
          updatedAt: e.updatedAt.toISOString(),
          deletedAt: e.deletedAt?.toISOString() || null,
        })),
        tasks: taskRecords.map((t) => ({
          ...t,
          dueDate: t.dueDate?.toISOString() || null,
          completedAt: t.completedAt?.toISOString() || null,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
          deletedAt: t.deletedAt?.toISOString() || null,
        })),
        lists: listRecords.map((l) => ({
          ...l,
          createdAt: l.createdAt.toISOString(),
          updatedAt: l.updatedAt.toISOString(),
          deletedAt: l.deletedAt?.toISOString() || null,
        })),
        listItems: listItemRecords.map((li) => ({
          ...li,
          checkedAt: li.checkedAt?.toISOString() || null,
          createdAt: li.createdAt.toISOString(),
          updatedAt: li.updatedAt.toISOString(),
          deletedAt: li.deletedAt?.toISOString() || null,
        })),
        captureItems: captureRecords.map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          deletedAt: c.deletedAt?.toISOString() || null,
        })),
        importantDates: importantDateRecords.map((i) => ({
          ...i,
          createdAt: i.createdAt.toISOString(),
          updatedAt: i.updatedAt.toISOString(),
          deletedAt: i.deletedAt?.toISOString() || null,
        })),
        recipes: recipeRecords.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          deletedAt: r.deletedAt?.toISOString() || null,
        })),
      },
    });
  });

  return router;
}
