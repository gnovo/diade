/**
 * Runs async tasks strictly one after another. A task that rejects rejects only its own
 * promise: the ones queued behind it still run.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task, task);
    tail = result.catch(() => undefined);
    return result;
  };
}
