import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '@core/services/auth.service';
import { FoodCatalogueService, FoodRecord } from '@core/services/food-catalogue.service';
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
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
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

    const sortButton = page.querySelector('.sort-button') as HTMLButtonElement;
    const sortMenu = page.querySelector('.sort-menu') as HTMLElement;
    // JSDOM does not implement the native Popover API.
    sortMenu.hidePopover = vi.fn();
    sortButton.click();
    expect(sortButton.getAttribute('popovertarget')).toBe(sortMenu.id);
    expect(sortMenu.querySelectorAll('.sort-option')).toHaveLength(4);
    (sortMenu.querySelectorAll<HTMLButtonElement>('.sort-option')[3]).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(names()).toEqual(['Zucchini', 'Apple']);
    expect(sortMenu.querySelectorAll('.sort-option')[3].getAttribute('aria-pressed')).toBe('true');
    expect(sortMenu.hidePopover).toHaveBeenCalled();
    expect(document.activeElement).toBe(sortButton);
  });

  it('opens selected food details in a dialog and keeps the row selected after closing', async () => {
    const fixture = TestBed.createComponent(MealComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    const row = page.querySelector('.food-list .row') as HTMLButtonElement;
    row.click();
    fixture.detectChanges();

    expect(page.querySelector('[role="dialog"] app-food-details')).toBeTruthy();
    expect(row.classList.contains('active')).toBe(true);
    (page.querySelector('.modal-close') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(page.querySelector('[role="dialog"]')).toBeNull();
    expect(row.classList.contains('active')).toBe(true);
  });

  it('returns from the food editor to the selected food details', async () => {
    const fixture = TestBed.createComponent(MealComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    (page.querySelector('.food-list .row') as HTMLButtonElement).click();
    fixture.detectChanges();
    (page.querySelector('app-food-details button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(page.querySelector('app-food-editor')).toBeTruthy();

    const cancel = Array.from(page.querySelectorAll('app-food-editor button')).find(
      (button) => button.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    cancel.click();
    fixture.detectChanges();
    expect(page.querySelector('app-food-details')).toBeTruthy();
    expect(page.querySelector('app-food-editor')).toBeNull();
  });
  it('shows cached catalogue results immediately on return and ignores an older search response', async () => {
    const first = TestBed.createComponent(MealComponent);
    await first.whenStable();
    first.destroy();
    const search = vi.mocked(TestBed.inject(FoodCatalogueService).search);
    let finish!: (foods: FoodRecord[]) => void;
    search.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const returned = TestBed.createComponent(MealComponent);
    expect(returned.componentInstance.foods()).toHaveLength(2);
    expect(returned.componentInstance.loading()).toBe(false);
    returned.detectChanges();
    expect(returned.componentInstance.refreshing()).toBe(true);
    returned.componentInstance.query.set('Pear');
    search.mockResolvedValueOnce([food('p', 'Pear')]);
    await returned.componentInstance.load();
    finish([food('o', 'Old result')]);
    await returned.whenStable();
    expect(returned.componentInstance.foods().map((item) => item.name)).toEqual(['Pear']);
    expect(returned.componentInstance.error()).toBe('');
  });
});
