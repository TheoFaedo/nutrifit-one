import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '@core/services/auth.service';
import { DailyGoal, DailyGoalsService } from '@core/services/daily-goals.service';
import { FoodCatalogueService, FoodRecord } from '@core/services/food-catalogue.service';
import { IntakeJournalService, IntakeRecord } from '@core/services/intake-journal.service';
import { MealComponent } from '@feature/meal/meal.component';
import { FoodCatalogueStore } from '@core/stores/food-catalogue.store';
import { JournalStore } from '@core/stores/journal.store';
import { JournalComponent, parisInstant } from './journal.component';

const portion = {
  id: 'portion-old',
  quantity_number: 100,
  quantity_unit: 'g',
  is_reference: true,
  energy_kcal: 120,
  carbs_g: null,
  fats_g: 3,
  proteins_g: 4,
};
const entry: IntakeRecord = {
  id: 'entry-1',
  food_version_id: 'old-version',
  quantity_id: portion.id,
  ratio: 1.5,
  meal_type: 'LUNCH',
  consumed_at: '2026-10-08T10:00:00Z',
  food_name: 'Old food',
  kind: 'FOOD',
  portion,
};
const oldFood: FoodRecord = {
  id: 'food-1',
  author_id: 'user-1',
  is_public: false,
  version_id: 'old-version',
  version_number: 1,
  name: 'Old food',
  kind: 'FOOD',
  barcode: null,
  source: null,
  portions: [portion],
  parts: [],
};

describe('JournalComponent', () => {
  const journal = {
    forDate: vi.fn<(date: string) => Promise<IntakeRecord[]>>(),
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
  const goals = { forDate: vi.fn<(date: string) => Promise<DailyGoal | null>>() };
  const catalogue = {
    search: vi.fn().mockResolvedValue([]),
    journalPage: vi.fn(),
    version: vi.fn(),
    lookupBarcode: vi.fn(),
    save: vi.fn(),
  };
  const auth = { user: vi.fn().mockResolvedValue({ id: 'user-1' }) };

  beforeEach(async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    vi.clearAllMocks();
    journal.forDate.mockResolvedValue([]);
    goals.forDate.mockResolvedValue(null);
    catalogue.journalPage.mockResolvedValue([]);
    catalogue.version.mockResolvedValue(oldFood);
    journal.update.mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [JournalComponent],
      providers: [
        provideRouter([]),
        { provide: IntakeJournalService, useValue: journal },
        { provide: DailyGoalsService, useValue: goals },
        { provide: FoodCatalogueService, useValue: catalogue },
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();
  });

  it('shows zero for an empty day and an unknown value for a missing nutrient', async () => {
    const fixture = TestBed.createComponent(JournalComponent);
    const component = fixture.componentInstance;
    await fixture.whenStable();
    expect(component.dailyTotals()).toEqual({ energy: 0, carbs: 0, fats: 0, protein: 0 });
    TestBed.inject(JournalStore).write(component.date(), [entry]);
    expect(component.dailyTotals()).toEqual({ energy: 180, carbs: null, fats: 4.5, protein: 6 });
  });

  it('keeps the last selected date when older requests finish later', async () => {
    const fixture = TestBed.createComponent(JournalComponent);
    const component = fixture.componentInstance;
    await fixture.whenStable();
    let finishOld!: (value: IntakeRecord[]) => void;
    journal.forDate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    const old = component.changeDate(-1);
    const newerDate = component.date();
    journal.forDate.mockResolvedValueOnce([entry]);
    await component.changeDate(1);
    finishOld([]);
    await old;
    expect(component.date()).not.toBe(newerDate);
    expect(component.entries()).toEqual([entry]);
    expect(goals.forDate).toHaveBeenCalledWith(component.date());
  });

  it('uses the goal for the selected date and Paris dates across daylight saving changes', async () => {
    const fixture = TestBed.createComponent(JournalComponent);
    const component = fixture.componentInstance;
    await fixture.whenStable();
    const goal = { energy_kcal: 2100, carbs_g: 250, fats_g: 70, proteins_g: 100 };
    goals.forDate.mockResolvedValueOnce(goal);
    component.setDate('2026-03-29');
    await fixture.whenStable();
    expect(goals.forDate).toHaveBeenCalledWith('2026-03-29');
    expect(component.dailyGoal()).toEqual(goal);
    expect(parisInstant('2026-03-29')).toBe('2026-03-29T10:00:00.000Z');
    expect(parisInstant('2026-10-25')).toBe('2026-10-25T11:00:00.000Z');
  });

  it('uses both catalogue sort modes and keeps an edited snapshot', async () => {
    const fixture = TestBed.createComponent(JournalComponent);
    const component = fixture.componentInstance;
    await fixture.whenStable();
    component.startAdd('LUNCH');
    await component.loadFoods();
    expect(catalogue.journalPage).toHaveBeenCalledWith('', 'recent', 0, 20, null);
    component.setFoodSort('newest');
    await component.loadFoods();
    expect(catalogue.journalPage).toHaveBeenCalledWith('', 'newest', 0, 20, null);
    component.closeDialog();
    await component.edit(entry);
    expect(catalogue.version).toHaveBeenCalledWith('old-version');
    expect(component.selectedFood()?.version_id).toBe('old-version');
    expect(component.selectedPortionId()).toBe('portion-old');
    await component.saveEntry();
    expect(journal.update).toHaveBeenCalledWith(
      'entry-1',
      expect.objectContaining({
        foodVersionId: 'old-version',
        quantityId: 'portion-old',
        ratio: 1.5,
      }),
    );
  });

  it('uses the shared search controls in the food dialog', async () => {
    const fixture = TestBed.createComponent(JournalComponent);
    await fixture.whenStable();
    fixture.componentInstance.startAdd('LUNCH');
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('.entry-dialog') as HTMLElement;
    const search = dialog.querySelector('app-food-catalogue-search input') as HTMLInputElement;
    const sortMenu = dialog.querySelector('.sort-menu') as HTMLElement;
    // JSDOM does not implement the native Popover API.
    sortMenu.hidePopover = vi.fn();

    expect(search).toBeTruthy();
    (sortMenu.querySelectorAll<HTMLButtonElement>('.sort-option')[1]).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.foodSort()).toBe('newest');
    expect(catalogue.journalPage).toHaveBeenCalledWith('', 'newest', 0, 20, null);
    fixture.componentInstance.closeDialog();
  });

  it('moves focus into the dialog and restores it after Escape', async () => {
    const fixture = TestBed.createComponent(JournalComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const opener = fixture.nativeElement.querySelector('.meal-section button') as HTMLButtonElement;
    opener.focus();
    opener.click();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.contains(document.activeElement)).toBe(true);
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(opener);
  });
  it('shows cached journal data immediately after visiting the catalogue and keeps it after a refresh failure', async () => {
    journal.forDate.mockResolvedValueOnce([entry]);
    const first = TestBed.createComponent(JournalComponent);
    await first.whenStable();
    first.componentInstance.setDate('2020-01-01');
    await first.whenStable();
    first.destroy();
    const meal = TestBed.createComponent(MealComponent);
    await meal.whenStable();
    meal.destroy();
    let reject!: (error: Error) => void;
    journal.forDate.mockImplementationOnce(
      () =>
        new Promise((_, no) => {
          reject = no;
        }),
    );
    const returned = TestBed.createComponent(JournalComponent);
    expect(returned.componentInstance.entries()).toEqual([entry]);
    expect(returned.componentInstance.date()).not.toBe('2020-01-01');
    expect(returned.componentInstance.loading()).toBe(false);
    expect(returned.componentInstance.refreshing()).toBe(true);
    reject(new Error('offline'));
    await returned.whenStable();
    returned.detectChanges();
    expect(returned.nativeElement.textContent).toContain('Old food');
    expect(returned.nativeElement.textContent).toContain('offline');
  });

  it('restarts stale pagination at page one and preserves an empty cached result while refreshing', async () => {
    const fixture = TestBed.createComponent(JournalComponent);
    await fixture.whenStable();
    fixture.componentInstance.startAdd('LUNCH');
    await fixture.componentInstance.loadFoods();
    const store = TestBed.inject(FoodCatalogueStore);
    store.invalidateRecent();
    await fixture.componentInstance.loadFoods(true);
    expect(catalogue.journalPage).toHaveBeenLastCalledWith('', 'recent', 0, 20, null);
    let resolve!: (foods: FoodRecord[]) => void;
    catalogue.journalPage.mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        }),
    );
    const refresh = fixture.componentInstance.loadFoods();
    expect(fixture.componentInstance.foodsInitialLoading()).toBe(false);
    expect(fixture.componentInstance.foodsRefreshing()).toBe(true);
    resolve([]);
    await refresh;
  });
});
