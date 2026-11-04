import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FoodRecord } from '@core/services/food-catalogue.service';
import { FoodSearchListComponent } from '@shared/ui/food-search-list/food-search-list.component';
import { FoodDetailsComponent } from '@shared/ui/food-details/food-details.component';
import { JournalEntryComponent } from '@feature/journal/journal-entry/journal-entry.component';

const portion = {
  id: 'portion',
  quantity_number: 100,
  quantity_unit: 'g',
  is_reference: true,
  energy_kcal: 100,
  carbs_g: 10,
  fats_g: 4,
  proteins_g: 6,
};
const food: FoodRecord = {
  id: 'food',
  version_id: 'version',
  version_number: 1,
  author_id: 'user',
  is_public: false,
  name: 'Food',
  brand: 'Brand',
  kind: 'FOOD',
  source: null,
  barcode: null,
  parts: [],
  portions: [portion],
};

describe('Brand display', () => {
  beforeEach(() => vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false })));

  it.each([
    ['FOOD', 'Brand', true],
    ['FOOD', null, false],
    ['FOOD', '   ', false],
    ['RECIPE', 'Brand', false],
  ] as const)(
    'shows brand below the name only for branded foods (%s, %j)',
    async (kind, brand, visible) => {
      const record = { ...food, kind, brand };
      const list = TestBed.createComponent(FoodSearchListComponent);
      list.componentRef.setInput('foods', [record]);
      const details = TestBed.createComponent(FoodDetailsComponent);
      details.componentRef.setInput('food', record);
      const entry = TestBed.createComponent(JournalEntryComponent);
      entry.componentRef.setInput('entry', {
        id: 'entry',
        food_name: 'Food',
        kind,
        brand,
        portion,
        ratio: 1,
      });
      await Promise.all([list.whenStable(), details.whenStable(), entry.whenStable()]);
      for (const [fixture, selector] of [
        [list, '.row strong'],
        [details, 'h2'],
        [entry, '.entry-name strong'],
      ] as const) {
        const next = (fixture.nativeElement as HTMLElement).querySelector(
          selector,
        )?.nextElementSibling;
        expect(next?.textContent?.trim() === 'Brand').toBe(visible);
      }
    },
  );
});
