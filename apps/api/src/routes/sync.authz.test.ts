import type { ClientMutation } from '@diade/domain';
import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { DbClient } from '../db';
import { authorizeMutation } from './sync';

// Minimal fake of the select().from(table).where(...).limit(1) chain used by authorizeMutation.
function fakeDb(fixtures: Record<string, Array<Record<string, unknown>>>): DbClient {
  return {
    select: () => ({
      from: (table: object) => ({
        where: () => ({
          limit: async () => fixtures[getTableName(table as never)] ?? [],
        }),
      }),
    }),
  } as unknown as DbClient;
}

const SPACE = '11111111-1111-4111-8111-111111111111';
const RECORD = '22222222-2222-4222-8222-222222222222';
const LIST = '33333333-3333-4333-8333-333333333333';
const ME = 'user_me';
const PARTNER = 'user_partner';

const mutation = (
  entity: ClientMutation['entity'],
  operation: ClientMutation['operation'],
): ClientMutation => ({
  id: '44444444-4444-4444-8444-444444444444',
  entity,
  operation,
  recordId: RECORD,
  payload: {},
  clientTimestamp: 1,
});

describe('sync mutation authorisation', () => {
  it('blocks a member from editing a personal task created by their partner', async () => {
    const db = fakeDb({ tasks: [{ visibility: 'personal', creatorId: PARTNER }] });
    expect(await authorizeMutation(db, mutation('tasks', 'UPDATE'), {}, SPACE, ME)).toBe(
      'forbidden',
    );
  });

  it('blocks a member from deleting a personal event created by their partner', async () => {
    const db = fakeDb({ events: [{ visibility: 'personal', creatorId: PARTNER }] });
    expect(await authorizeMutation(db, mutation('events', 'DELETE'), {}, SPACE, ME)).toBe(
      'forbidden',
    );
  });

  it('allows editing a shared event created by the partner', async () => {
    const db = fakeDb({ events: [{ visibility: 'shared', creatorId: PARTNER }] });
    expect(await authorizeMutation(db, mutation('events', 'UPDATE'), {}, SPACE, ME)).toBe('ok');
  });

  it('allows the creator to edit their own personal task', async () => {
    const db = fakeDb({ tasks: [{ visibility: 'personal', creatorId: ME }] });
    expect(await authorizeMutation(db, mutation('tasks', 'UPDATE'), {}, SPACE, ME)).toBe('ok');
  });

  it('keeps capture items private to their creator', async () => {
    const db = fakeDb({ capture_items: [{ creatorId: PARTNER }] });
    expect(await authorizeMutation(db, mutation('capture_items', 'UPDATE'), {}, SPACE, ME)).toBe(
      'forbidden',
    );
  });

  it('rejects list item inserts into a list outside the caller space', async () => {
    const db = fakeDb({ lists: [] });
    expect(
      await authorizeMutation(db, mutation('list_items', 'INSERT'), { listId: LIST }, SPACE, ME),
    ).toBe('forbidden');
  });

  it('rejects updates to a list item whose list belongs to another space', async () => {
    const db = fakeDb({ list_items: [{ listId: LIST }], lists: [] });
    expect(await authorizeMutation(db, mutation('list_items', 'UPDATE'), {}, SPACE, ME)).toBe(
      'forbidden',
    );
  });

  it('treats missing records as already converged rather than an error', async () => {
    const db = fakeDb({});
    expect(await authorizeMutation(db, mutation('tasks', 'DELETE'), {}, SPACE, ME)).toBe(
      'not_found',
    );
  });
});

describe('important dates authorisation', () => {
  it('lets either member edit or delete a date in their space (always shared)', async () => {
    const db = fakeDb({ important_dates: [{ id: RECORD }] });
    expect(await authorizeMutation(db, mutation('important_dates', 'UPDATE'), {}, SPACE, ME)).toBe(
      'ok',
    );
    expect(
      await authorizeMutation(db, mutation('important_dates', 'DELETE'), {}, SPACE, PARTNER),
    ).toBe('ok');
  });

  it("reports not_found when the date is not in the caller's space", async () => {
    // The lookup is scoped to the caller's space, so another space's row yields no result.
    const db = fakeDb({});
    expect(await authorizeMutation(db, mutation('important_dates', 'UPDATE'), {}, SPACE, ME)).toBe(
      'not_found',
    );
  });

  it('allows inserts', async () => {
    expect(
      await authorizeMutation(fakeDb({}), mutation('important_dates', 'INSERT'), {}, SPACE, ME),
    ).toBe('ok');
  });
});

describe('recipes authorisation', () => {
  it('lets either member edit or delete a recipe in their space (always shared)', async () => {
    const db = fakeDb({ recipes: [{ id: RECORD }] });
    expect(await authorizeMutation(db, mutation('recipes', 'UPDATE'), {}, SPACE, ME)).toBe('ok');
    expect(await authorizeMutation(db, mutation('recipes', 'DELETE'), {}, SPACE, PARTNER)).toBe(
      'ok',
    );
  });

  it("reports not_found when the recipe is not in the caller's space", async () => {
    expect(await authorizeMutation(fakeDb({}), mutation('recipes', 'UPDATE'), {}, SPACE, ME)).toBe(
      'not_found',
    );
  });

  it('allows inserts', async () => {
    expect(await authorizeMutation(fakeDb({}), mutation('recipes', 'INSERT'), {}, SPACE, ME)).toBe(
      'ok',
    );
  });
});

describe('meal plans authorisation', () => {
  it('lets either member edit or delete a plan in their space (always shared)', async () => {
    const db = fakeDb({ meal_plans: [{ id: RECORD }] });
    expect(await authorizeMutation(db, mutation('meal_plans', 'UPDATE'), {}, SPACE, ME)).toBe('ok');
    expect(await authorizeMutation(db, mutation('meal_plans', 'DELETE'), {}, SPACE, PARTNER)).toBe(
      'ok',
    );
  });

  it("reports not_found when the plan is not in the caller's space", async () => {
    expect(
      await authorizeMutation(fakeDb({}), mutation('meal_plans', 'UPDATE'), {}, SPACE, ME),
    ).toBe('not_found');
  });

  it('allows inserts', async () => {
    expect(
      await authorizeMutation(fakeDb({}), mutation('meal_plans', 'INSERT'), {}, SPACE, ME),
    ).toBe('ok');
  });
});

describe('a list generated from a plan', () => {
  const PLAN = '55555555-5555-4555-8555-555555555555';

  it('may point at a plan of its own space', async () => {
    const db = fakeDb({ meal_plans: [{ id: PLAN }] });
    expect(
      await authorizeMutation(db, mutation('lists', 'INSERT'), { planId: PLAN }, SPACE, ME),
    ).toBe('ok');
  });

  it("is refused when the plan is not in the caller's space", async () => {
    expect(
      await authorizeMutation(fakeDb({}), mutation('lists', 'INSERT'), { planId: PLAN }, SPACE, ME),
    ).toBe('forbidden');
    const db = fakeDb({ lists: [{ id: RECORD }] });
    expect(
      await authorizeMutation(db, mutation('lists', 'UPDATE'), { planId: PLAN }, SPACE, ME),
    ).toBe('forbidden');
  });

  it('needs no plan lookup when planId is absent or null', async () => {
    expect(await authorizeMutation(fakeDb({}), mutation('lists', 'INSERT'), {}, SPACE, ME)).toBe(
      'ok',
    );
    expect(
      await authorizeMutation(fakeDb({}), mutation('lists', 'INSERT'), { planId: null }, SPACE, ME),
    ).toBe('ok');
  });
});

describe('ingredient catalog authorisation', () => {
  const OTHER_SPACE = '99999999-9999-4999-8999-999999999999';
  const TARGET = '66666666-6666-4666-8666-666666666666';

  it('lets either member edit or delete an ingredient in their space (always shared)', async () => {
    const db = fakeDb({ ingredients: [{ id: RECORD }] });
    expect(await authorizeMutation(db, mutation('ingredients', 'UPDATE'), {}, SPACE, ME)).toBe(
      'ok',
    );
    expect(await authorizeMutation(db, mutation('ingredients', 'DELETE'), {}, SPACE, PARTNER)).toBe(
      'ok',
    );
  });

  it("reports not_found when the ingredient is not in the caller's space", async () => {
    expect(
      await authorizeMutation(fakeDb({}), mutation('ingredients', 'UPDATE'), {}, SPACE, ME),
    ).toBe('not_found');
  });

  it('allows inserts', async () => {
    expect(
      await authorizeMutation(fakeDb({}), mutation('ingredients', 'INSERT'), {}, SPACE, ME),
    ).toBe('ok');
  });

  it('may be merged into an ingredient of its own space, or one that has not arrived yet', async () => {
    const own = fakeDb({ ingredients: [{ spaceId: SPACE }] });
    expect(
      await authorizeMutation(
        own,
        mutation('ingredients', 'INSERT'),
        { mergedIntoId: TARGET },
        SPACE,
        ME,
      ),
    ).toBe('ok');
    expect(
      await authorizeMutation(
        fakeDb({}),
        mutation('ingredients', 'INSERT'),
        { mergedIntoId: TARGET },
        SPACE,
        ME,
      ),
    ).toBe('ok');
  });

  it('is refused a merge into an ingredient of another space', async () => {
    const db = fakeDb({ ingredients: [{ spaceId: OTHER_SPACE }] });
    expect(
      await authorizeMutation(
        db,
        mutation('ingredients', 'INSERT'),
        { mergedIntoId: TARGET },
        SPACE,
        ME,
      ),
    ).toBe('forbidden');
    expect(
      await authorizeMutation(
        db,
        mutation('ingredients', 'UPDATE'),
        { mergedIntoId: TARGET },
        SPACE,
        ME,
      ),
    ).toBe('forbidden');
  });
});
