import { inject } from '@angular/core';
import { signalStore, withMethods } from '@ngrx/signals';
import { DailyGoal, DailyGoalsService } from '@core/services/daily-goals.service';
import { withKeyedCache } from '@core/stores/keyed-cache';
import { CacheSession } from '@core/stores/cache-session.service';

export const todayParis = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
export const DailyGoalsStore = signalStore(
  { providedIn: 'root' },
  withKeyedCache<DailyGoal | null>(),
  withMethods((store, service = inject(DailyGoalsService), session = inject(CacheSession)) => ({
    forDate: (date: string) => store.request(date, () => service.forDate(date)),
    async save(goal: DailyGoal): Promise<void> {
      const generation = session.generation();
      await service.save(goal);
      if (generation !== session.generation()) {
        throw new Error('Session changed');
      }
      const today = todayParis();
      const dates = new Set([today, ...Object.keys(store.cache()).filter((date) => date >= today)]);
      for (const date of dates) {
        store.write(date, goal);
        void store.request(date, () => service.forDate(date)).catch(() => undefined);
      }
    },
  })),
);
