import { inject } from '@angular/core';
import { signalStore, withMethods } from '@ngrx/signals';
import {
  FoodCatalogueService,
  FoodCatalogueSort,
  FoodInput,
  FoodRecord,
  RecipeInput,
} from '@core/services/food-catalogue.service';
import { withKeyedCache } from '@core/stores/keyed-cache';
import { CacheSession } from '@core/stores/cache-session.service';

export const catalogueKey = (
  term: string,
  sort: FoodCatalogueSort,
  offset = 0,
  limit = 20,
  barcode: string | null = null,
): string => JSON.stringify([term, sort, barcode, offset, limit]);

export const FoodCatalogueStore = signalStore(
  { providedIn: 'root' },
  withKeyedCache<FoodRecord[] | FoodRecord | null>(),
  withMethods((store, service = inject(FoodCatalogueService), session = inject(CacheSession)) => {
    const remember = (food: FoodRecord) => {
      store.write(`current:${food.id}`, food);
      store.write(`version:${food.version_id}`, food);
    };
    const save = async (input: FoodInput | RecipeInput, recipe: boolean) => {
      const generation = session.generation();
      const id = recipe
        ? await service.saveRecipe(input as RecipeInput)
        : await service.save(input as FoodInput);
      if (generation !== session.generation()) {
        throw new Error('Session changed');
      }
      store.invalidate((key) => key.startsWith('[') || key === `current:${id}`);
      const food = (await store.request(`current:${id}`, () =>
        service.current(id),
      )) as FoodRecord | null;
      if (food) {
        remember(food);
      }
      return id;
    };
    return {
      remember,
      invalidateRecent: () =>
        store.invalidate((key) => key.startsWith('[') && JSON.parse(key)[1] === 'recent'),
      search: (term: string, sort: FoodCatalogueSort = 'asc') =>
        store.request(catalogueKey(term, sort, 0, 100), () =>
          service.search(term, sort),
        ) as Promise<FoodRecord[]>,
      journalPage: (
        term: string,
        sort: FoodCatalogueSort,
        offset: number,
        limit = 20,
        barcode: string | null = null,
      ) =>
        store.request(catalogueKey(term, sort, offset, limit, barcode), () =>
          service.journalPage(term, sort, offset, limit, barcode),
        ) as Promise<FoodRecord[]>,
      version: (id: string) => {
        const cached = store.peek(`version:${id}`);
        return cached.hasLoaded
          ? Promise.resolve(cached.data as FoodRecord | null)
          : (store.request(`version:${id}`, () =>
              service.version(id),
            ) as Promise<FoodRecord | null>);
      },
      current: (id: string) => {
        const cached = store.peek(`current:${id}`);
        return cached.hasLoaded && !cached.stale
          ? Promise.resolve(cached.data as FoodRecord | null)
          : (store.request(`current:${id}`, () =>
              service.current(id),
            ) as Promise<FoodRecord | null>);
      },
      save: (input: FoodInput) => save(input, false),
      saveRecipe: (input: RecipeInput) => save(input, true),
      lookupBarcode: (code: string) => service.lookupBarcode(code),
    };
  }),
);
