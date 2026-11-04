import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FoodCatalogueService } from '@core/services/food-catalogue.service';
import { supabase } from '@core/services/supabase.client';

describe('Food catalogue brands', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['  First Brand , Second Brand ', 'First Brand'],
    [undefined, null],
    ['', null],
    ['   ', null],
    [42, null],
    [['Unexpected'], null],
    [', Second', null],
  ])('imports only the first OFF brand from %j', async (brands, expected) => {
    const fetchProduct = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ product: { product_name: 'Food', brands } })),
      );
    const product = await TestBed.inject(FoodCatalogueService).lookupBarcode('123');
    expect(product?.brand).toBe(expected);
    expect(fetchProduct.mock.calls[0][0]).toContain('fields=brands,');
  });

  it.each([
    [' Brand ', 'Brand'],
    ['  ', null],
    [undefined, null],
  ])('normalizes the brand %j sent to the food RPC', async (brand, expected) => {
    const rpc = vi
      .spyOn(supabase, 'rpc')
      .mockResolvedValue({ data: 'food-id', error: null } as never);
    await TestBed.inject(FoodCatalogueService).save({
      name: 'Food',
      brand,
      barcode: null,
      isPublic: false,
      portions: [],
    });
    expect(rpc).toHaveBeenCalledWith(
      'save_food_snapshot',
      expect.objectContaining({ p_brand: expected }),
    );
  });

  it('keeps foods without product details and reads a historical brand', async () => {
    const rows = [null, { brand: ' Old Brand ', barcode: '123', source: 'Open Food Facts' }].map(
      (details, index) => ({
        id: `food-${index}`,
        author_id: 'user',
        is_public: false,
        food_versions: [
          {
            id: `version-${index}`,
            name: 'Food',
            kind: 'FOOD',
            version_number: 1,
            product_details: details,
            quantities: [],
            recipe_parts: [],
          },
        ],
      }),
    );
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const eq = vi.fn().mockReturnValue({ limit });
    const select = vi.fn().mockReturnValue({ eq });
    vi.spyOn(supabase, 'from').mockReturnValue({ select } as never);
    const service = TestBed.inject(FoodCatalogueService);
    expect((await service.version('version-0'))?.brand).toBeNull();
    rows.shift();
    const food = await service.version('version-1');
    expect(food?.brand).toBe('Old Brand');
    expect(food?.barcode).toBe('123');
    expect(food?.source).toBe('Open Food Facts');
    expect(eq).toHaveBeenLastCalledWith('food_versions.id', 'version-1');
    expect(select.mock.calls[0][0]).toContain('product_details(brand,barcode,');
  });
});
