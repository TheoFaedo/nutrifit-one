import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { IntakeJournalService } from '@core/services/intake-journal.service';
import { supabase } from '@core/services/supabase.client';

describe('Journal historical brands', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['FOOD', { brand: 'Consumed brand' }, 'Consumed brand'],
    ['FOOD', null, null],
    ['RECIPE', { brand: 'Unexpected brand' }, null],
  ])('reads the consumed version brand for %s', async (kind, details, expected) => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'entry',
          food_version_id: 'old-version',
          quantity_id: 'portion',
          ratio: 1,
          meal_type: 'LUNCH',
          consumed_at: '2026-11-04T12:00:00Z',
          food_versions: {
            name: 'Food',
            kind,
            product_details: details,
            quantities: [{ id: 'portion', energy_kcal: 100 }],
          },
        },
      ],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    vi.spyOn(supabase, 'from').mockReturnValue({ select } as never);
    const service = TestBed.inject(IntakeJournalService);
    vi.spyOn(service, 'distribution').mockResolvedValue(null);
    const entries = await service.forDate('2026-11-04');
    expect(entries[0].brand).toBe(expected);
    expect(entries[0].food_version_id).toBe('old-version');
    expect(select.mock.calls[0][0]).toContain('product_details(brand)');
  });
});
