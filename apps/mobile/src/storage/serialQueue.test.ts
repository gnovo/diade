import { describe, it, expect } from 'vitest';
import { createSerialQueue } from './serialQueue';

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('createSerialQueue', () => {
  it('never runs two tasks at once and keeps submission order', async () => {
    const enqueue = createSerialQueue();
    const log: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const task = (name: string, ms: number) => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      log.push(`start ${name}`);
      await tick(ms);
      log.push(`end ${name}`);
      running--;
      return name;
    };
    const results = await Promise.all([enqueue(task('a', 15)), enqueue(task('b', 1)), enqueue(task('c', 5))]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(maxRunning).toBe(1);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('keeps going after a task fails, and still reports the failure to its caller', async () => {
    const enqueue = createSerialQueue();
    const failing = enqueue(async () => {
      throw new Error('boom');
    });
    const after = enqueue(async () => 'ok');
    await expect(failing).rejects.toThrow('boom');
    await expect(after).resolves.toBe('ok');
  });
});
