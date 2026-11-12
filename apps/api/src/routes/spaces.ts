import {
  createInviteSchema,
  createSpaceSchema,
  joinSpaceSchema,
  updateNutritionSettingsSchema,
} from '@diade/validation';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { Hono } from 'hono';
import type { AuthInstance } from '../auth';
import type { DbClient } from '../db';
import { spaceMembers, spaces, users } from '../db/schema';

// Helper to generate a friendly 8-character uppercase alphanumeric code
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function createSpacesRouter(
  getDb: (c: Context) => DbClient,
  getAuth: (c: Context) => AuthInstance,
) {
  const router = new Hono<{
    Variables: {
      user: { id: string; email: string; name: string };
    };
  }>();

  // Auth Middleware
  router.use('*', async (c, next) => {
    const auth = getAuth(c);
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user) {
      return c.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        },
        401,
      );
    }

    c.set('user', session.user);
    await next();
  });

  // POST /api/spaces - Create Space
  router.post('/', zValidator('json', createSpaceSchema), async (c) => {
    const db = getDb(c);
    const user = c.get('user');
    const { name } = c.req.valid('json');

    // Check if user already belongs to a space
    const existingMembership = await db
      .select()
      .from(spaceMembers)
      .where(eq(spaceMembers.userId, user.id))
      .limit(1);

    if (existingMembership.length > 0) {
      return c.json(
        {
          success: false,
          error: { code: 'ALREADY_IN_SPACE', message: 'User is already a member of a space' },
        },
        400,
      );
    }

    const inviteCode = generateInviteCode();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [newSpace] = await db
      .insert(spaces)
      .values({
        name,
        inviteCode,
        inviteExpiresAt: expiresAt,
      })
      .returning();

    const [membership] = await db
      .insert(spaceMembers)
      .values({
        spaceId: newSpace.id,
        userId: user.id,
        role: 'owner',
      })
      .returning();

    return c.json({
      success: true,
      data: {
        space: newSpace,
        role: membership.role,
        members: [
          {
            ...membership,
            user,
          },
        ],
      },
    });
  });

  // GET /api/spaces/current - Get Current Space
  router.get('/current', async (c) => {
    const db = getDb(c);
    const user = c.get('user');

    const [membership] = await db
      .select()
      .from(spaceMembers)
      .where(eq(spaceMembers.userId, user.id))
      .limit(1);

    if (!membership) {
      return c.json(
        {
          success: false,
          error: { code: 'NO_SPACE', message: 'User does not belong to any space yet' },
        },
        404,
      );
    }

    const [space] = await db
      .select()
      .from(spaces)
      .where(eq(spaces.id, membership.spaceId))
      .limit(1);

    // Retrieve all space members with their user profiles
    const allMembers = await db
      .select({
        id: spaceMembers.id,
        spaceId: spaceMembers.spaceId,
        userId: spaceMembers.userId,
        role: spaceMembers.role,
        joinedAt: spaceMembers.joinedAt,
        user: {
          id: users.id,
          email: users.email,
          displayName: users.name,
          avatarUrl: users.image,
          createdAt: users.createdAt,
        },
      })
      .from(spaceMembers)
      .innerJoin(users, eq(spaceMembers.userId, users.id))
      .where(eq(spaceMembers.spaceId, membership.spaceId));

    return c.json({
      success: true,
      data: {
        space,
        role: membership.role,
        members: allMembers,
      },
    });
  });

  // POST /api/spaces/join - Join Space via Invite Code
  router.post('/join', zValidator('json', joinSpaceSchema), async (c) => {
    const db = getDb(c);
    const user = c.get('user');
    const { inviteCode } = c.req.valid('json');

    // Check if user already in a space
    const [existingMembership] = await db
      .select()
      .from(spaceMembers)
      .where(eq(spaceMembers.userId, user.id))
      .limit(1);

    if (existingMembership) {
      return c.json(
        {
          success: false,
          error: { code: 'ALREADY_IN_SPACE', message: 'User is already in a space' },
        },
        400,
      );
    }

    // Find space by invite code
    const [space] = await db
      .select()
      .from(spaces)
      .where(eq(spaces.inviteCode, inviteCode.toUpperCase().trim()))
      .limit(1);

    if (!space) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_INVITE', message: 'Invalid or expired invite code' },
        },
        404,
      );
    }

    if (space.inviteExpiresAt && space.inviteExpiresAt < new Date()) {
      return c.json(
        {
          success: false,
          error: { code: 'INVITE_EXPIRED', message: 'This invite code has expired' },
        },
        400,
      );
    }

    // STRICT CHECK: Díade is for exactly two people!
    const currentMembers = await db
      .select()
      .from(spaceMembers)
      .where(eq(spaceMembers.spaceId, space.id));

    if (currentMembers.length >= 2) {
      return c.json(
        {
          success: false,
          error: {
            code: 'SPACE_FULL',
            message: 'This shared space has reached its maximum capacity of two members',
          },
        },
        400,
      );
    }

    const [newMembership] = await db
      .insert(spaceMembers)
      .values({
        spaceId: space.id,
        userId: user.id,
        role: 'member',
      })
      .returning();

    // Invalidate invite code after successful 2nd member joins
    await db
      .update(spaces)
      .set({ inviteExpiresAt: new Date(0) })
      .where(eq(spaces.id, space.id));

    return c.json({
      success: true,
      data: {
        space,
        role: newMembership.role,
      },
    });
  });

  // GET /api/spaces/nutrition - The signed-in member's own nutrition settings (never the partner's)
  router.get('/nutrition', async (c) => {
    const db = getDb(c);
    const user = c.get('user');
    const [membership] = await db
      .select({ enabled: spaceMembers.nutritionEnabled, targets: spaceMembers.nutritionTargets })
      .from(spaceMembers)
      .where(eq(spaceMembers.userId, user.id))
      .limit(1);
    if (!membership) {
      return c.json(
        {
          success: false,
          error: { code: 'NO_SPACE', message: 'User does not belong to any space yet' },
        },
        404,
      );
    }
    return c.json({
      success: true,
      data: { enabled: membership.enabled, targets: membership.targets ?? null },
    });
  });

  // PATCH /api/spaces/nutrition - Change the signed-in member's own nutrition settings
  router.patch('/nutrition', zValidator('json', updateNutritionSettingsSchema), async (c) => {
    const db = getDb(c);
    const user = c.get('user');
    const body = c.req.valid('json');
    const changes: Partial<typeof spaceMembers.$inferInsert> = {};
    if (body.enabled !== undefined) changes.nutritionEnabled = body.enabled;
    if (body.targets !== undefined) changes.nutritionTargets = body.targets;
    const [updated] =
      Object.keys(changes).length > 0
        ? await db
            .update(spaceMembers)
            .set(changes)
            .where(eq(spaceMembers.userId, user.id))
            .returning({
              enabled: spaceMembers.nutritionEnabled,
              targets: spaceMembers.nutritionTargets,
            })
        : await db
            .select({
              enabled: spaceMembers.nutritionEnabled,
              targets: spaceMembers.nutritionTargets,
            })
            .from(spaceMembers)
            .where(eq(spaceMembers.userId, user.id))
            .limit(1);
    if (!updated) {
      return c.json(
        {
          success: false,
          error: { code: 'NO_SPACE', message: 'User does not belong to any space yet' },
        },
        404,
      );
    }
    return c.json({
      success: true,
      data: { enabled: updated.enabled, targets: updated.targets ?? null },
    });
  });

  // POST /api/spaces/invite - Generate New Invite Code
  router.post('/invite', zValidator('json', createInviteSchema), async (c) => {
    const db = getDb(c);
    const user = c.get('user');
    const { expiresInDays = 7 } = c.req.valid('json');

    const [membership] = await db
      .select()
      .from(spaceMembers)
      .where(eq(spaceMembers.userId, user.id))
      .limit(1);

    if (!membership) {
      return c.json(
        {
          success: false,
          error: { code: 'NO_SPACE', message: 'User does not belong to any space' },
        },
        404,
      );
    }

    // Check existing count
    const existingMembers = await db
      .select()
      .from(spaceMembers)
      .where(eq(spaceMembers.spaceId, membership.spaceId));

    if (existingMembers.length >= 2) {
      return c.json(
        {
          success: false,
          error: {
            code: 'SPACE_FULL',
            message: 'Space already has two members; cannot generate new invite',
          },
        },
        400,
      );
    }

    const newInviteCode = generateInviteCode();
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    await db
      .update(spaces)
      .set({
        inviteCode: newInviteCode,
        inviteExpiresAt: expiresAt,
      })
      .where(eq(spaces.id, membership.spaceId));

    return c.json({
      success: true,
      data: {
        inviteCode: newInviteCode,
        expiresAt: expiresAt.toISOString(),
      },
    });
  });

  return router;
}
