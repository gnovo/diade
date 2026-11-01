import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and, gt, or } from 'drizzle-orm';
import { syncPushSchema, syncPullQuerySchema } from '@diade/validation';
import type { DbClient } from '../db';
import {
  events,
  tasks,
  lists,
  listItems,
  captureItems,
  syncMutations,
  spaceMembers,
} from '../db/schema';

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
  router.post('/push', zValidator('json', syncPushSchema), async (c) => {
    const db = getDb(c);
    const user = c.get('user');
    const spaceId = c.get('spaceId');
    const { mutations } = c.req.valid('json');

    const appliedMutationIds: string[] = [];
    const now = new Date();

    for (const mutation of mutations) {
      // 1. Idempotency Check: Skip already processed mutations
      const [existing] = await db
        .select()
        .from(syncMutations)
        .where(eq(syncMutations.id, mutation.id))
        .limit(1);

      if (existing) {
        appliedMutationIds.push(mutation.id);
        continue;
      }

      const { entity, operation, recordId, payload } = mutation;

      // 2. Execute Mutation per Entity
      switch (entity) {
        case 'events': {
          if (operation === 'INSERT') {
            await db.insert(events).values({
              id: recordId,
              spaceId,
              creatorId: user.id,
              title: payload.title as string,
              description: (payload.description as string) || null,
              startAt: new Date(payload.startAt as string),
              endAt: new Date(payload.endAt as string),
              isAllDay: Boolean(payload.isAllDay),
              visibility: (payload.visibility as string) || 'shared',
              recurrenceRule: (payload.recurrenceRule as string) || null,
              category: (payload.category as string) || 'general',
              createdAt: now,
              updatedAt: now,
            });
          } else if (operation === 'UPDATE') {
            await db
              .update(events)
              .set({
                ...(payload.title ? { title: payload.title as string } : {}),
                ...(payload.description !== undefined
                  ? { description: payload.description as string }
                  : {}),
                ...(payload.startAt ? { startAt: new Date(payload.startAt as string) } : {}),
                ...(payload.endAt ? { endAt: new Date(payload.endAt as string) } : {}),
                ...(payload.isAllDay !== undefined
                  ? { isAllDay: Boolean(payload.isAllDay) }
                  : {}),
                ...(payload.visibility
                  ? { visibility: payload.visibility as string }
                  : {}),
                updatedAt: now,
              })
              .where(and(eq(events.id, recordId), eq(events.spaceId, spaceId)));
          } else if (operation === 'DELETE') {
            await db
              .update(events)
              .set({ deletedAt: now, updatedAt: now })
              .where(and(eq(events.id, recordId), eq(events.spaceId, spaceId)));
          }
          break;
        }

        case 'tasks': {
          if (operation === 'INSERT') {
            await db.insert(tasks).values({
              id: recordId,
              spaceId,
              creatorId: user.id,
              assigneeId: (payload.assigneeId as string) || null,
              title: payload.title as string,
              notes: (payload.notes as string) || null,
              dueDate: payload.dueDate ? new Date(payload.dueDate as string) : null,
              status: (payload.status as string) || 'todo',
              visibility: (payload.visibility as string) || 'shared',
              completedAt: payload.completedAt ? new Date(payload.completedAt as string) : null,
              createdAt: now,
              updatedAt: now,
            });
          } else if (operation === 'UPDATE') {
            await db
              .update(tasks)
              .set({
                ...(payload.title ? { title: payload.title as string } : {}),
                ...(payload.notes !== undefined ? { notes: payload.notes as string } : {}),
                ...(payload.dueDate !== undefined
                  ? { dueDate: payload.dueDate ? new Date(payload.dueDate as string) : null }
                  : {}),
                ...(payload.status ? { status: payload.status as string } : {}),
                ...(payload.assigneeId !== undefined
                  ? { assigneeId: payload.assigneeId as string }
                  : {}),
                ...(payload.visibility ? { visibility: payload.visibility as string } : {}),
                ...(payload.completedAt !== undefined
                  ? {
                      completedAt: payload.completedAt
                        ? new Date(payload.completedAt as string)
                        : null,
                    }
                  : {}),
                updatedAt: now,
              })
              .where(and(eq(tasks.id, recordId), eq(tasks.spaceId, spaceId)));
          } else if (operation === 'DELETE') {
            await db
              .update(tasks)
              .set({ deletedAt: now, updatedAt: now })
              .where(and(eq(tasks.id, recordId), eq(tasks.spaceId, spaceId)));
          }
          break;
        }

        case 'lists': {
          if (operation === 'INSERT') {
            await db.insert(lists).values({
              id: recordId,
              spaceId,
              creatorId: user.id,
              name: payload.name as string,
              icon: (payload.icon as string) || null,
              category: (payload.category as string) || 'groceries',
              createdAt: now,
              updatedAt: now,
            });
          } else if (operation === 'UPDATE') {
            await db
              .update(lists)
              .set({
                ...(payload.name ? { name: payload.name as string } : {}),
                ...(payload.icon !== undefined ? { icon: payload.icon as string } : {}),
                ...(payload.category ? { category: payload.category as string } : {}),
                updatedAt: now,
              })
              .where(and(eq(lists.id, recordId), eq(lists.spaceId, spaceId)));
          } else if (operation === 'DELETE') {
            await db
              .update(lists)
              .set({ deletedAt: now, updatedAt: now })
              .where(and(eq(lists.id, recordId), eq(lists.spaceId, spaceId)));
          }
          break;
        }

        case 'list_items': {
          if (operation === 'INSERT') {
            await db.insert(listItems).values({
              id: recordId,
              listId: payload.listId as string,
              name: payload.name as string,
              quantity: (payload.quantity as string) || null,
              unit: (payload.unit as string) || null,
              notes: (payload.notes as string) || null,
              isChecked: Boolean(payload.isChecked),
              checkedBy: payload.isChecked ? user.id : null,
              checkedAt: payload.isChecked ? now : null,
              createdAt: now,
              updatedAt: now,
            });
          } else if (operation === 'UPDATE') {
            await db
              .update(listItems)
              .set({
                ...(payload.name ? { name: payload.name as string } : {}),
                ...(payload.quantity !== undefined
                  ? { quantity: payload.quantity as string }
                  : {}),
                ...(payload.unit !== undefined ? { unit: payload.unit as string } : {}),
                ...(payload.notes !== undefined ? { notes: payload.notes as string } : {}),
                ...(payload.isChecked !== undefined
                  ? {
                      isChecked: Boolean(payload.isChecked),
                      checkedBy: payload.isChecked ? user.id : null,
                      checkedAt: payload.isChecked ? now : null,
                    }
                  : {}),
                updatedAt: now,
              })
              .where(eq(listItems.id, recordId));
          } else if (operation === 'DELETE') {
            await db
              .update(listItems)
              .set({ deletedAt: now, updatedAt: now })
              .where(eq(listItems.id, recordId));
          }
          break;
        }

        case 'capture_items': {
          if (operation === 'INSERT') {
            await db.insert(captureItems).values({
              id: recordId,
              spaceId,
              creatorId: user.id,
              content: payload.content as string,
              captureType: (payload.captureType as string) || 'text',
              status: (payload.status as string) || 'inbox',
              createdAt: now,
              updatedAt: now,
            });
          } else if (operation === 'UPDATE') {
            await db
              .update(captureItems)
              .set({
                ...(payload.content ? { content: payload.content as string } : {}),
                ...(payload.status ? { status: payload.status as string } : {}),
                updatedAt: now,
              })
              .where(and(eq(captureItems.id, recordId), eq(captureItems.spaceId, spaceId)));
          } else if (operation === 'DELETE') {
            await db
              .update(captureItems)
              .set({ deletedAt: now, updatedAt: now })
              .where(and(eq(captureItems.id, recordId), eq(captureItems.spaceId, spaceId)));
          }
          break;
        }
      }

      // 3. Record applied mutation in sync_mutations for idempotency
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

    return c.json({
      success: true,
      data: {
        cursor: now.toISOString(),
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
      },
    });
  });

  return router;
}
