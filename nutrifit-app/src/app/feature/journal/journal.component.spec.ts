import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { DailyGoal, DailyGoalsService } from '../../core/services/daily-goals.service';
import { FoodCatalogueService, FoodRecord } from '../../core/services/food-catalogue.service';
import { IntakeJournalService, IntakeRecord } from '../../core/services/intake-journal.service';
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
    journalPage: vi.fn(),
    version: vi.fn(),
    lookupBarcode: vi.fn(),
    save: vi.fn(),
  };
  const auth = { user: vi.fn().mockResolvedValue({ id: 'user-1' }) };

  beforeEach(async () => {
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
    component.entries.set([entry]);
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
    expect(catalogue.journalPage).toHaveBeenCalledWith('', 'recent', 0);
    component.setFoodSort('newest');
    await component.loadFoods();
    expect(catalogue.journalPage).toHaveBeenCalledWith('', 'newest', 0);
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
    const sort = dialog.querySelector('app-food-catalogue-search select') as HTMLSelectElement;

    expect(search).toBeTruthy();
    sort.value = 'newest';
    sort.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.componentInstance.foodSort()).toBe('newest');
    expect(catalogue.journalPage).toHaveBeenCalledWith('', 'newest', 0);
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
    const dialog = document.querySelector('.entry-dialog') as HTMLElement;
    expect(dialog.contains(document.activeElement)).toBe(true);
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(opener);
  });
});
