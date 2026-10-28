import { inject } from '@angular/core';
import { patchState, signalStoreFeature, withMethods, withState } from '@ngrx/signals';
import { CacheSession } from '@core/stores/cache-session.service';

export class DiscardedCacheResponse extends Error {
  constructor() {
    super('Discarded cache response');
  }
}

export interface CacheEntry<T> {
  data: T | undefined;
  hasLoaded: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string;
  stale: boolean;
}
export const emptyEntry = <T>(): CacheEntry<T> => ({
  data: undefined,
  hasLoaded: false,
  isLoading: false,
  isRefreshing: false,
  error: '',
  stale: false,
});

/** Each key has its own request identity. Reset/invalidation detaches pending responses. */
export function withKeyedCache<T>() {
  return signalStoreFeature(
    withState({ cache: {} as Record<string, CacheEntry<T>>, revision: 0 }),
    withMethods((store, session = inject(CacheSession)) => {
      const pending = new Map<string, Promise<T>>();
      const tickets = new Map<string, object>();
      const peek = (key: string): CacheEntry<T> => store.cache()[key] ?? emptyEntry<T>();
      const put = (key: string, entry: CacheEntry<T>) =>
        patchState(store, { cache: { ...store.cache(), [key]: entry } });
      const reset = () => {
        pending.clear();
        tickets.clear();
        patchState(store, { cache: {}, revision: store.revision() + 1 });
      };
      session.register(reset);
      return {
        peek,
        reset,
        write(key: string, data: T): void {
          tickets.delete(key);
          pending.delete(key);
          put(key, { ...emptyEntry<T>(), data, hasLoaded: true });
        },
        invalidate(predicate: (key: string) => boolean = () => true): void {
          for (const key of Object.keys(store.cache())) {
            if (!predicate(key)) {
              continue;
            }
            tickets.delete(key);
            pending.delete(key);
            put(key, { ...peek(key), stale: true, isLoading: false, isRefreshing: false });
          }
          patchState(store, { revision: store.revision() + 1 });
        },
        request(key: string, read: () => Promise<T>): Promise<T> {
          const existing = pending.get(key);
          if (existing) {
            return existing;
          }
          const ticket = {};
          tickets.set(key, ticket);
          const before = peek(key);
          put(key, {
            ...before,
            error: '',
            isLoading: !before.hasLoaded,
            isRefreshing: before.hasLoaded,
          });
          const result = read()
            .then((data) => {
              if (tickets.get(key) !== ticket) {
                throw new DiscardedCacheResponse();
              }
              put(key, { ...emptyEntry<T>(), data, hasLoaded: true });
              return data;
            })
            .catch((error: unknown) => {
              if (tickets.get(key) === ticket) {
                put(key, {
                  ...peek(key),
                  error: error instanceof Error ? error.message : 'Request failed',
                  isLoading: false,
                  isRefreshing: false,
                });
              }
              throw error;
            })
            .finally(() => {
              if (tickets.get(key) === ticket) {
                pending.delete(key);
                tickets.delete(key);
              }
            });
          pending.set(key, result);
          return result;
        },
      };
    }),
  );
}
