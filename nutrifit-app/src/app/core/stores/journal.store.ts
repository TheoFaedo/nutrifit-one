import { inject } from '@angular/core';
import { signalStore, withMethods } from '@ngrx/signals';
import {
  IntakeInput,
  IntakeJournalService,
  IntakeRecord,
} from '@core/services/intake-journal.service';
import { withKeyedCache } from '@core/stores/keyed-cache';
import { FoodCatalogueStore } from '@core/stores/food-catalogue.store';
import { CacheSession } from '@core/stores/cache-session.service';

export const JournalStore = signalStore(
  { providedIn: 'root' },
  withKeyedCache<IntakeRecord[]>(),
  withMethods(
    (
      store,
      service = inject(IntakeJournalService),
      catalogue = inject(FoodCatalogueStore),
      session = inject(CacheSession),
    ) => ({
      forDate: (date: string) => store.request(date, () => service.forDate(date)),
      async saveEntry(
        date: string,
        userId: string,
        input: IntakeInput,
        record: IntakeRecord,
        id: string | null,
      ): Promise<void> {
        const generation = session.generation();
        const savedId = id
          ? (await service.update(id, input), id)
          : await service.add(userId, input);
        if (generation !== session.generation()) {
          throw new Error('Session changed');
        }
        const entries = store.peek(date).data ?? [];
        const entry = { ...record, id: savedId };
        store.write(
          date,
          id ? entries.map((item) => (item.id === id ? entry : item)) : [...entries, entry],
        );
        catalogue.invalidateRecent();
      },
      async remove(date: string, id: string): Promise<void> {
        const generation = session.generation();
        await service.remove(id);
        if (generation !== session.generation()) {
          throw new Error('Session changed');
        }
        store.write(
          date,
          (store.peek(date).data ?? []).filter((item) => item.id !== id),
        );
        catalogue.invalidateRecent();
      },
    }),
  ),
);
