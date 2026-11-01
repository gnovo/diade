import { useCallback, useEffect, useRef, useState } from 'react';
import { onDataChanged } from './changes';

/**
 * Runs an async loader now and again whenever local data changes.
 * The latest loader is read from a ref, so callers may pass inline closures.
 * Errors are logged and keep the previous value so a transient SQLite failure
 * does not blank the screen.
 */
export function useLiveQuery<T>(
  loader: () => Promise<T>,
  initial: T,
): { data: T; reload: () => void } {
  const [data, setData] = useState<T>(initial);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async () => {
    try {
      setData(await loaderRef.current());
    } catch (err) {
      console.error('Local query failed', err);
    }
  }, []);

  useEffect(() => {
    run();
    return onDataChanged(() => {
      run();
    });
  }, [run]);

  return { data, reload: run };
}
