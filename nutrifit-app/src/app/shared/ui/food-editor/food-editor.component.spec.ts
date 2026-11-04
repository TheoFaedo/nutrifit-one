import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FoodCatalogueService, FoodRecord } from '@core/services/food-catalogue.service';
import { FoodEditorComponent } from '@shared/ui/food-editor/food-editor.component';

const food: FoodRecord = {
  id: 'food',
  author_id: 'user',
  is_public: false,
  version_id: 'v1',
  version_number: 1,
  name: 'Food',
  kind: 'FOOD',
  brand: 'Original',
  barcode: null,
  source: null,
  parts: [],
  portions: [],
};

describe('Food editor brands', () => {
  const api = {
    search: vi.fn(),
    save: vi.fn(),
    saveRecipe: vi.fn(),
    current: vi.fn(),
  };
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    api.search.mockResolvedValue([]);
    api.save.mockResolvedValue('food');
    api.saveRecipe.mockResolvedValue('food');
    api.current.mockResolvedValue(food);
    TestBed.configureTestingModule({
      providers: [{ provide: FoodCatalogueService, useValue: api }],
    });
  });

  it.each([
    ['  New Brand ', 'New Brand'],
    ['', null],
  ])('creates a food with brand %j', async (brand, expected) => {
    const fixture = TestBed.createComponent(FoodEditorComponent);
    await fixture.whenStable();
    fixture.componentInstance.name = 'Food';
    fixture.componentInstance.brand = brand;
    await fixture.componentInstance.save();
    expect(api.save).toHaveBeenLastCalledWith(expect.objectContaining({ brand: expected }));
  });

  it('prefills the brand and allows correction and removal in new versions', async () => {
    const fixture = TestBed.createComponent(FoodEditorComponent);
    fixture.componentRef.setInput('food', food);
    await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('[name="brand"]') as HTMLInputElement;
    expect(input.value).toBe('Original');
    input.value = 'Corrected';
    input.dispatchEvent(new Event('input'));
    await fixture.componentInstance.save();
    expect(api.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ foodId: 'food', brand: 'Corrected' }),
    );
    input.value = '';
    input.dispatchEvent(new Event('input'));
    await fixture.componentInstance.save();
    expect(api.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ foodId: 'food', brand: null }),
    );
  });

  it('hides and omits brand when saving a recipe', async () => {
    const fixture = TestBed.createComponent(FoodEditorComponent);
    fixture.componentRef.setInput('food', { ...food, kind: 'RECIPE' });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[name="brand"]')).toBeNull();
    await fixture.componentInstance.save();
    expect(api.saveRecipe).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ brand: expect.anything() }),
    );
  });
});
