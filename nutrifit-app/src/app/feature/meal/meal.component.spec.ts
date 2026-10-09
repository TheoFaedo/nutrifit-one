import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { FoodCatalogueService, FoodRecord } from '../../core/services/food-catalogue.service';
import { MealComponent } from './meal.component';

const food = (id: string, name: string): FoodRecord => ({
  id,
  name,
  author_id: 'user-1',
  is_public: false,
  version_id: id,
  version_number: 1,
  kind: 'FOOD',
  barcode: null,
  source: null,
  portions: [],
  parts: [],
});

describe('MealComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MealComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: vi.fn().mockResolvedValue({ id: 'user-1' }) } },
        {
          provide: FoodCatalogueService,
          useValue: {
            search: vi.fn().mockResolvedValue([food('z', 'Zucchini'), food('a', 'Apple')]),
          },
        },
      ],
    }).compileComponents();
  });

  it('uses one catalogue search field and sorts its results from the top controls', async () => {
    const fixture = TestBed.createComponent(MealComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    const names = () =>
      Array.from(page.querySelectorAll('.food-list .row strong')).map((item) => item.textContent);

    expect(page.querySelectorAll('input[type="search"]')).toHaveLength(1);
    expect(page.querySelector('.catalogue-tools .create-tools')).toBeNull();
    expect(page.querySelectorAll('.create-tools button')).toHaveLength(1);
    expect(names()).toEqual(['Apple', 'Zucchini']);

    const sort = page.querySelector('.sort-field select') as HTMLSelectElement;
    sort.value = 'desc';
    sort.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(names()).toEqual(['Zucchini', 'Apple']);
  });
});
