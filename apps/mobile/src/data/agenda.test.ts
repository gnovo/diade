import type { CalendarEvent } from '@diade/domain';
import { createI18n } from '@diade/i18n';
import { describe, expect, it } from 'vitest';
import { buildAgenda, formatAgendaTime } from './agenda';

const base = (overrides: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'e1',
  spaceId: 's1',
  creatorId: 'u1',
  title: 'Dinner',
  description: null,
  startAt: new Date(2026, 10, 14, 19, 30).toISOString(),
  endAt: new Date(2026, 10, 14, 21, 0).toISOString(),
  isAllDay: false,
  visibility: 'shared',
  recurrenceRule: null,
  category: 'general',
  highlighted: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  deletedAt: null,
  ...overrides,
});

describe('buildAgenda', () => {
  it('returns occurrences from every event, soonest first', () => {
    const from = new Date(2026, 10, 1);
    const to = new Date(2026, 11, 1);
    const items = buildAgenda(
      [
        base({
          id: 'later',
          startAt: new Date(2026, 10, 20, 9).toISOString(),
          endAt: new Date(2026, 10, 20, 10).toISOString(),
        }),
        base({ id: 'weekly', recurrenceRule: 'FREQ=WEEKLY;COUNT=2' }),
      ],
      from,
      to,
    );
    // Weekly series falls on the 14th and 21st; the one-off on the 20th sorts between them.
    expect(items.map((i) => i.eventId)).toEqual(['weekly', 'later', 'weekly']);
    expect(items[0].recurring).toBe(true);
    expect(new Set(items.map((i) => i.key)).size).toBe(3);
  });

  it('formats times as a range or All day', () => {
    const [item] = buildAgenda([base({})], new Date(2026, 10, 1), new Date(2026, 10, 30));
    expect(formatAgendaTime(createI18n('en').t, item)).toBe('19:30–21:00');
    const [allDay] = buildAgenda(
      [base({ isAllDay: true })],
      new Date(2026, 10, 1),
      new Date(2026, 10, 30),
    );
    expect(formatAgendaTime(createI18n('en').t, allDay)).toBe('All day');
    expect(formatAgendaTime(createI18n('pt-PT').t, allDay)).toBe('Dia inteiro');
  });
});
