import { describe, expect, it, vi } from 'vitest';
import { createGoogleClient } from './google';
import { eventBody, type MirrorSource, planMirror, writeEach } from './trainingMirror';

const block = (
  id: string,
  title = 'Força',
  rule: string | null = 'FREQ=WEEKLY;INTERVAL=2',
): MirrorSource => ({
  id,
  title,
  startAt: new Date('2026-11-13T15:00:00Z'),
  endAt: new Date('2026-11-13T16:30:00Z'),
  recurrenceRule: rule,
});

describe('eventBody', () => {
  it('writes a private, free, reminder-less recurring event in the member time zone', () => {
    expect(eventBody(block('e1'), 'Europe/Lisbon')).toEqual({
      summary: 'Força',
      description: 'Díade',
      start: { dateTime: '2026-11-13T15:00:00.000Z', timeZone: 'Europe/Lisbon' },
      end: { dateTime: '2026-11-13T16:30:00.000Z', timeZone: 'Europe/Lisbon' },
      recurrence: ['RRULE:FREQ=WEEKLY;INTERVAL=2'],
      transparency: 'transparent',
      visibility: 'private',
      reminders: { useDefault: false },
      extendedProperties: { private: { diadeEventId: 'e1' } },
    });
  });

  it('leaves out the recurrence of a one-off block', () => {
    expect(eventBody(block('e1', 'Força', null), 'Europe/Lisbon')).not.toHaveProperty('recurrence');
  });
});

describe('planMirror', () => {
  const tz = 'Europe/Lisbon';
  const written = (source: MirrorSource, googleId: string) => ({
    [source.id]: { googleId, body: JSON.stringify(eventBody(source, tz)) },
  });

  it('inserts new blocks, skips unchanged ones and updates changed ones', () => {
    const same = block('same');
    const renamed = block('renamed', 'Força');
    const plan = planMirror(
      [same, { ...renamed, title: 'Força leve' }, block('new')],
      { ...written(same, 'g1'), ...written(renamed, 'g2') },
      tz,
    );
    expect(plan.insert.map((i) => i.source.id)).toEqual(['new']);
    expect(plan.update.map((u) => [u.source.id, u.googleId])).toEqual([['renamed', 'g2']]);
    expect(plan.remove).toEqual([]);
  });

  it('removes what is no longer a block', () => {
    const gone = block('gone');
    expect(planMirror([], written(gone, 'g9'), tz).remove).toEqual([
      { eventId: 'gone', googleId: 'g9' },
    ]);
  });

  it('rewrites every block when the time zone changes', () => {
    const one = block('one');
    expect(planMirror([one], written(one, 'g1'), 'Europe/London').update).toHaveLength(1);
  });
});

describe('the Google client writes', () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('creates a calendar and an event with JSON bodies', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 'cal1' }))
      .mockResolvedValueOnce(json({ id: 'ev1' }));
    const client = createGoogleClient(async () => 'tok', fetchFn);
    expect(await client.insertCalendar('Díade · Treino', 'Europe/Lisbon')).toEqual({ id: 'cal1' });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toBe('https://www.googleapis.com/calendar/v3/calendars');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ summary: 'Díade · Treino', timeZone: 'Europe/Lisbon' });

    await client.insertEvent('cal1@group', eventBody(block('e1'), 'Europe/Lisbon'));
    expect(String(fetchFn.mock.calls[1]![0])).toContain('/calendars/cal1%40group/events');
  });

  it('treats deleting something already gone as done, and fails on other errors', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json({ error: { message: 'Not Found' } }, 404))
      .mockResolvedValueOnce(json({ error: { message: 'Gone' } }, 410))
      .mockResolvedValueOnce(json({ error: { message: 'Boom' } }, 500));
    const client = createGoogleClient(async () => 'tok', fetchFn);
    await expect(client.deleteEvent('c', 'a')).resolves.toBeUndefined();
    await expect(client.deleteEvent('c', 'b')).resolves.toBeUndefined();
    await expect(client.deleteCalendar('c')).resolves.toBeUndefined();
    await expect(client.deleteEvent('c', 'd')).rejects.toThrow('Boom');
    expect(fetchFn.mock.calls[0]![1].method).toBe('DELETE');
  });
});

describe('writeEach', () => {
  const later = () => new Promise<void>((resolve) => setTimeout(resolve, 1));

  it('writes everything, no more than the limit at once', async () => {
    let running = 0;
    let most = 0;
    const done: number[] = [];
    await writeEach(
      [1, 2, 3, 4, 5, 6, 7],
      async (n) => {
        running++;
        most = Math.max(most, running);
        await later();
        done.push(n);
        running--;
      },
      3,
    );
    expect(most).toBe(3);
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('starts nothing after a failure, lets the running ones finish, then throws', async () => {
    const done: number[] = [];
    const run = writeEach(
      [1, 2, 3, 4, 5, 6],
      async (n) => {
        await later();
        if (n === 1) throw new Error('quota');
        done.push(n);
      },
      2,
    );
    await expect(run).rejects.toThrow('quota');
    expect(done).toEqual([2]);
  });
});
