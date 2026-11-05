import { useCallback, useEffect, useState } from 'react';
import { logger } from './logger.js';
import { useHandHistoryService, type HandEntry } from './hand-history-context.js';

export type Loadable<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly value: T };

/** Loads with `load` now and again whenever the history changes (new hand, new analysis, cleared). */
function useLiveHistory<T>(load: () => Promise<T>): Loadable<T> {
  const service = useHandHistoryService();
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const refresh = (): void => {
      load().then(
        (value) => {
          if (!cancelled) setState({ status: 'ready', value });
        },
        (error: unknown) => {
          logger.warn('Failed to load hand history', { error });
          if (!cancelled) setState({ status: 'error' });
        },
      );
    };
    refresh();
    const unsubscribe = service.subscribe(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [service, load]);

  return state;
}

/** Every stored hand, newest first, kept up to date. */
export function useHandEntries(): Loadable<readonly HandEntry[]> {
  const service = useHandHistoryService();
  const load = useCallback(() => service.list(), [service]);
  return useLiveHistory(load);
}

/** One stored hand (null when it does not exist), kept up to date as its analysis arrives. */
export function useHandEntry(handId: string): Loadable<HandEntry | null> {
  const service = useHandHistoryService();
  const load = useCallback(() => service.get(handId), [service, handId]);
  return useLiveHistory(load);
}
