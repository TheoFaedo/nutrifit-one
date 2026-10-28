import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { JournalStore } from '@core/stores/journal.store';
import { DailyGoalsStore } from '@core/stores/daily-goals.store';
import { FoodCatalogueStore, catalogueKey } from '@core/stores/food-catalogue.store';
import { CacheSession } from '@core/stores/cache-session.service';
import { IntakeJournalService, IntakeRecord } from '@core/services/intake-journal.service';
import { DailyGoalsService } from '@core/services/daily-goals.service';
import { FoodCatalogueService, FoodRecord } from '@core/services/food-catalogue.service';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const goal = { energy_kcal: 2000, carbs_g: 200, fats_g: 70, proteins_g: 100 };
const food: FoodRecord = {
  id: 'f',
  version_id: 'v1',
  version_number: 1,
  author_id: 'u',
  is_public: false,
  name: 'Apple',
  kind: 'FOOD',
  barcode: null,
  source: null,
  portions: [],
  parts: [],
};
const record = { id: 'i', ratio: 1 } as IntakeRecord;

describe('session scoped stores', () => {
  let journal: InstanceType<typeof JournalStore>;
  let goals: InstanceType<typeof DailyGoalsStore>;
  let catalogue: InstanceType<typeof FoodCatalogueStore>;
  const journalApi = { forDate: vi.fn(), add: vi.fn(), update: vi.fn(), remove: vi.fn() };
  const goalsApi = { forDate: vi.fn(), save: vi.fn() };
  const foodApi = {
    search: vi.fn(),
    journalPage: vi.fn(),
    current: vi.fn(),
    version: vi.fn(),
    save: vi.fn(),
    saveRecipe: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    journalApi.forDate.mockResolvedValue([]);
    goalsApi.forDate.mockResolvedValue(goal);
    goalsApi.save.mockResolvedValue(undefined);
    foodApi.search.mockResolvedValue([food]);
    foodApi.journalPage.mockResolvedValue([food]);
    TestBed.configureTestingModule({
      providers: [
        { provide: IntakeJournalService, useValue: journalApi },
        { provide: DailyGoalsService, useValue: goalsApi },
        { provide: FoodCatalogueService, useValue: foodApi },
      ],
    });
    TestBed.inject(CacheSession).setAccount('u');
    journal = TestBed.inject(JournalStore);
    goals = TestBed.inject(DailyGoalsStore);
    catalogue = TestBed.inject(FoodCatalogueStore);
  });

  it('caches empty days and shares concurrent requests, then refreshes without blocking', async () => {
    const pending = deferred<IntakeRecord[]>();
    journalApi.forDate.mockReturnValueOnce(pending.promise);
    const first = journal.forDate('2026-10-23');
    expect(journal.forDate('2026-10-23')).toBe(first);
    expect(journalApi.forDate).toHaveBeenCalledTimes(1);
    expect(journal.peek('2026-10-23').isLoading).toBe(true);
    pending.resolve([]);
    await first;
    const refresh = journal.forDate('2026-10-23');
    expect(journal.peek('2026-10-23')).toMatchObject({
      data: [],
      hasLoaded: true,
      isLoading: false,
      isRefreshing: true,
    });
    await refresh;
  });

  it('isolates dates and preserves valid cached values after refresh failure', async () => {
    journalApi.forDate.mockResolvedValueOnce([record]);
    await journal.forDate('a');
    journalApi.forDate.mockRejectedValueOnce(new Error('offline'));
    await expect(journal.forDate('a')).rejects.toThrow('offline');
    expect(journal.peek('a')).toMatchObject({
      data: [record],
      hasLoaded: true,
      error: 'offline',
      isRefreshing: false,
    });
    await journal.forDate('b');
    expect(journal.peek('b').data).toEqual([]);
    journalApi.forDate.mockRejectedValueOnce(new Error('initial error'));
    await expect(journal.forDate('c')).rejects.toThrow();
    expect(journal.peek('c')).toMatchObject({
      hasLoaded: false,
      isLoading: false,
      error: 'initial error',
    });
  });

  it('caches missing goals independently from a failed journal read', async () => {
    goalsApi.forDate.mockResolvedValue(null);
    journalApi.forDate.mockRejectedValue(new Error('journal failed'));
    await Promise.allSettled([journal.forDate('a'), goals.forDate('a')]);
    expect(goals.peek('a')).toMatchObject({ data: null, hasLoaded: true });
    expect(journal.peek('a').hasLoaded).toBe(false);
  });

  it('protects confirmed journal additions, edits and removals against older refreshes', async () => {
    journal.write('a', [record]);
    const old = deferred<IntakeRecord[]>();
    journalApi.forDate.mockReturnValueOnce(old.promise);
    const refresh = journal.forDate('a');
    const discarded = expect(refresh).rejects.toThrow('Discarded');
    journalApi.update.mockResolvedValue(undefined);
    await journal.saveEntry(
      'a',
      'u',
      {} as Parameters<typeof journal.saveEntry>[2],
      { ...record, ratio: 2 },
      'i',
    );
    old.resolve([record]);
    await discarded;
    expect(journal.peek('a').data?.[0].ratio).toBe(2);
    journalApi.add.mockResolvedValue('new');
    await journal.saveEntry('a', 'u', {} as Parameters<typeof journal.saveEntry>[2], record, null);
    expect(journal.peek('a').data?.map((item) => item.id)).toEqual(['i', 'new']);
    journalApi.remove.mockResolvedValue(undefined);
    await journal.remove('a', 'i');
    expect(journal.peek('a').data?.map((item) => item.id)).toEqual(['new']);
  });

  it('updates current and future goals while preserving history, then reads the server', async () => {
    goals.write('2000-01-01', goal);
    goals.write('2099-01-01', goal);
    const pending = deferred<typeof goal>();
    goalsApi.forDate.mockReturnValue(pending.promise);
    const updated = { ...goal, energy_kcal: 2300 };
    await goals.save(updated);
    expect(goals.peek('2000-01-01').data).toEqual(goal);
    expect(goals.peek('2099-01-01')).toMatchObject({ data: updated, isRefreshing: true });
    pending.resolve(updated);
    await goals.forDate('2099-01-01');
    expect(goals.peek('2099-01-01').data).toEqual(updated);
  });

  it('keys lists by every parameter and deduplicates shared catalogue searches', async () => {
    const pending = deferred<FoodRecord[]>();
    foodApi.search.mockReturnValueOnce(pending.promise);
    const first = catalogue.search('', 'asc');
    expect(catalogue.search('', 'asc')).toBe(first);
    await catalogue.journalPage('', 'asc', 0);
    await catalogue.journalPage('', 'asc', 20);
    await catalogue.journalPage('', 'asc', 0, 100, '123');
    expect(Object.keys(catalogue.cache())).toHaveLength(4);
    pending.resolve([]);
    await first;
    expect(catalogue.peek(catalogueKey('', 'asc', 0, 100)).hasLoaded).toBe(true);
  });

  it('preserves historical versions and invalidates all search pages on food save', async () => {
    foodApi.version.mockResolvedValue(food);
    await catalogue.version('v1');
    await catalogue.journalPage('', 'recent', 0);
    await catalogue.journalPage('', 'recent', 20);
    const updated = { ...food, version_id: 'v2', version_number: 2 };
    foodApi.save.mockResolvedValue('f');
    foodApi.current.mockResolvedValue(updated);
    await catalogue.save({ name: 'Apple', isPublic: false, barcode: null, portions: [] });
    expect(await catalogue.version('v1')).toEqual(food);
    expect(await catalogue.current('f')).toEqual(updated);
    expect(catalogue.peek(catalogueKey('', 'recent', 20)).stale).toBe(true);
    expect(foodApi.version).toHaveBeenCalledTimes(1);
  });

  it('ignores an invalidated list even when its replacement finishes first', async () => {
    const old = deferred<FoodRecord[]>();
    foodApi.search.mockReturnValueOnce(old.promise);
    const response = catalogue.search('', 'asc');
    const discarded = expect(response).rejects.toThrow('Discarded');
    catalogue.invalidate();
    foodApi.search.mockResolvedValueOnce([]);
    await catalogue.search('', 'asc');
    old.resolve([food]);
    await discarded;
    expect(catalogue.peek(catalogueKey('', 'asc', 0, 100)).data).toEqual([]);
  });

  it.each([null, 'other-user'])(
    'purges every store on session change to %s and rejects late reads and writes',
    async (account) => {
      journal.write('a', [record]);
      goals.write('a', goal);
      catalogue.remember(food);
      const lateGoal = deferred<typeof goal>();
      const lateFood = deferred<FoodRecord[]>();
      goalsApi.forDate.mockReturnValueOnce(lateGoal.promise);
      foodApi.search.mockReturnValueOnce(lateFood.promise);
      const discardedGoal = expect(goals.forDate('a')).rejects.toThrow();
      const discardedFood = expect(catalogue.search('', 'asc')).rejects.toThrow();
      const read = deferred<IntakeRecord[]>();
      const write = deferred<void>();
      journalApi.forDate.mockReturnValueOnce(read.promise);
      journalApi.remove.mockReturnValueOnce(write.promise);
      const response = journal.forDate('a');
      const mutation = journal.remove('a', 'i');
      const discardedRead = expect(response).rejects.toThrow();
      const discardedWrite = expect(mutation).rejects.toThrow();
      TestBed.inject(CacheSession).setAccount(account);
      expect(journal.cache()).toEqual({});
      expect(goals.cache()).toEqual({});
      expect(catalogue.cache()).toEqual({});
      lateGoal.resolve(goal);
      lateFood.resolve([food]);
      read.resolve([record]);
      write.resolve();
      await Promise.all([discardedRead, discardedWrite, discardedGoal, discardedFood]);
      expect(goals.cache()).toEqual({});
      expect(catalogue.cache()).toEqual({});
      expect(journal.cache()).toEqual({});
    },
  );
});
