/**
 * Two separate channels so that they cannot feed each other:
 * - dataChanged: the local database changed, screens should re-read.
 * - localWrite: the user changed something, the sync engine should push soon.
 * Pulling server changes emits only dataChanged, so it never schedules a push.
 */
type Listener = () => void;

const dataListeners = new Set<Listener>();
const writeListeners = new Set<Listener>();

export function onDataChanged(listener: Listener): () => void {
  dataListeners.add(listener);
  return () => dataListeners.delete(listener);
}

export function onLocalWrite(listener: Listener): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

export function emitDataChanged(): void {
  dataListeners.forEach((listener) => listener());
}

export function emitLocalWrite(): void {
  writeListeners.forEach((listener) => listener());
}
