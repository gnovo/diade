import { useCallback, useEffect, useRef, useState } from 'react';

export const UNDO_WINDOW_MS = 5000;

export interface PendingDelete {
  ids: string[];
  message: string;
}

/**
 * Deletes after a short window so the user can undo. The rows are only hidden at first;
 * nothing is written until the window ends, because the sync server cannot un-delete a
 * record. Starting another delete commits the previous one straight away, and leaving the
 * screen flushes it. If the app dies inside the window the items simply stay.
 */
export function useUndoableDelete(
  commit: (ids: string[]) => Promise<void> | void,
  delayMs = UNDO_WINDOW_MS,
) {
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const pendingRef = useRef<PendingDelete | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const flush = useCallback(() => {
    clearTimer();
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (current) void commitRef.current(current.ids);
  }, []);

  const schedule = useCallback(
    (ids: string[], message: string) => {
      if (ids.length === 0) return;
      flush();
      const next = { ids, message };
      pendingRef.current = next;
      setPending(next);
      timer.current = setTimeout(flush, delayMs);
    },
    [delayMs, flush],
  );

  const undo = useCallback(() => {
    clearTimer();
    pendingRef.current = null;
    setPending(null);
  }, []);

  useEffect(() => flush, [flush]);

  return { pending, schedule, undo, flush };
}
