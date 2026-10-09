import { Component, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { DailyGoal, DailyGoalsService } from '../../core/services/daily-goals.service';
import {
  FoodCatalogueService,
  FoodCatalogueSort,
  FoodPortion,
  PortionInput,
  FoodRecord,
} from '../../core/services/food-catalogue.service';
import {
  IntakeInput,
  IntakeJournalService,
  IntakeRecord,
  MealType,
} from '../../core/services/intake-journal.service';
import { BrandComponent } from '../../shared/ui/brand/brand.component';
import { BottomNavComponent } from '../../shared/ui/bottom-nav/bottom-nav.component';
import { DailySummaryComponent } from './daily-summary.component';
import {
  FOOD_CATALOGUE_SORT_OPTIONS,
  FoodCatalogueSearchComponent,
} from '../../shared/ui/food-catalogue-search/food-catalogue-search.component';
import { formatNutrition } from '../../shared/ui/nutrition-summary/nutrition-format';
import { PortionSelectorComponent } from '../../shared/ui/portion-selector/portion-selector.component';
import {
  NutritionSummaryComponent,
  NutritionSummaryValues,
} from '../../shared/ui/nutrition-summary/nutrition-summary.component';
import { FoodEditorComponent } from '../../shared/ui/food-editor/food-editor.component';

const meals: { type: MealType; label: string }[] = [
  { type: 'BREAKFAST', label: 'Breakfast' },
  { type: 'LUNCH', label: 'Lunch' },
  { type: 'DINNER', label: 'Dinner' },
  { type: 'SNACKS', label: 'Snacks' },
];
const todayParis = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
export const parisInstant = (date: string): string => {
  const [year, month, day] = date.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day, 12);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    timeZoneName: 'longOffset',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const zone =
    formatter.formatToParts(new Date(target)).find((part) => part.type === 'timeZoneName')?.value ??
    'GMT+01:00';
  const match = zone.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offsetMinutes = match
    ? (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3]))
    : 60;
  return new Date(target - offsetMinutes * 60_000).toISOString();
};

@Component({
  selector: 'app-journal-page',
  imports: [
    FormsModule,
    BrandComponent,
    BottomNavComponent,
    DailySummaryComponent,
    NutritionSummaryComponent,
    FoodCatalogueSearchComponent,
    PortionSelectorComponent,
    FoodEditorComponent,
  ],
  templateUrl: './journal.component.html',
  styleUrl: './journal.component.less',
})
export class JournalComponent {
  private readonly auth = inject(AuthService);
  private readonly journal = inject(IntakeJournalService);
  private readonly catalogue = inject(FoodCatalogueService);
  private readonly goalsService = inject(DailyGoalsService);
  private readonly document = inject(DOCUMENT);
  private dayRequest = 0;
  private foodRequest = 0;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private returnFocus: HTMLElement | null = null;
  readonly date = signal(todayParis());
  readonly entries = signal<IntakeRecord[]>([]);
  readonly dailyGoal = signal<DailyGoal | null>(null);
  readonly foods = signal<FoodRecord[]>([]);
  readonly historicalFood = signal<FoodRecord | null>(null);
  readonly foodSort = signal<FoodCatalogueSort>('recent');
  readonly sortOptions = FOOD_CATALOGUE_SORT_OPTIONS;
  readonly foodsLoading = signal(false);
  readonly foodsMore = signal(false);
  readonly foodError = signal('');
  readonly dialogError = signal('');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly dialogOpen = signal(false);
  readonly dialogView = signal<'search' | 'details'>('search');
  readonly creatingFood = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly query = signal('');
  readonly barcode = signal('');
  readonly barcodeSearching = signal(false);
  readonly barcodeError = signal('');
  readonly offProduct = signal<{ name: string; portions: PortionInput[]; payload: unknown } | null>(
    null,
  );
  readonly selectedFoodId = signal('');
  readonly selectedPortionId = signal('');
  readonly amount = signal(1);
  readonly mealType = signal<MealType>('BREAKFAST');
  readonly selectedFood = computed(() =>
    this.historicalFood()?.version_id === this.selectedFoodId()
      ? this.historicalFood()
      : (this.foods().find((food) => food.version_id === this.selectedFoodId()) ?? null),
  );
  readonly selectedPortions = computed(() => this.selectedFood()?.portions ?? []);
  readonly selectedNutrition = computed<NutritionSummaryValues>(() => {
    const portion = this.selectedPortions().find((item) => item.id === this.selectedPortionId());
    const multiplier = Number(this.amount());
    const scale = (value: number | null): number | null =>
      value === null || !Number.isFinite(multiplier) ? value : value * multiplier;
    return {
      energy: scale(portion?.energy_kcal ?? null),
      carbs: scale(portion?.carbs_g ?? null),
      fats: scale(portion?.fats_g ?? null),
      protein: scale(portion?.proteins_g ?? null),
    };
  });
  readonly barcodeFoods = signal<FoodRecord[]>([]);
  readonly groupedMeals = computed(() =>
    meals.map((meal) => ({
      ...meal,
      entries: this.entries().filter((entry) => entry.meal_type === meal.type),
    })),
  );
  readonly dailyTotals = computed(() => this.totals(this.entries()));

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const request = ++this.dayRequest;
    const date = this.date();
    this.loading.set(true);
    this.error.set('');
    this.entries.set([]);
    this.dailyGoal.set(null);
    try {
      const [entries, goal] = await Promise.all([
        this.journal.forDate(date),
        this.goalsService.forDate(date),
      ]);
      if (request !== this.dayRequest) {
        return;
      }
      this.entries.set(entries);
      this.dailyGoal.set(goal);
    } catch (error) {
      if (request !== this.dayRequest) {
        return;
      }
      this.error.set(this.message(error, 'The journal could not be loaded.'));
    } finally {
      if (request === this.dayRequest) {
        this.loading.set(false);
      }
    }
  }
  async changeDate(delta: number): Promise<void> {
    const current = new Date(`${this.date()}T12:00:00Z`);
    current.setUTCDate(current.getUTCDate() + delta);
    this.date.set(current.toISOString().slice(0, 10));
    await this.load();
  }
  setDate(value: string): void {
    if (value) {
      this.date.set(value);
      void this.load();
    }
  }
  startAdd(type: MealType): void {
    this.rememberFocus();
    this.historicalFood.set(null);
    this.dialogView.set('search');
    this.creatingFood.set(false);
    this.editingId.set(null);
    this.mealType.set(type);
    this.amount.set(1);
    this.query.set('');
    this.barcode.set('');
    this.barcodeError.set('');
    this.offProduct.set(null);
    this.selectedFoodId.set('');
    this.selectedPortionId.set('');
    this.dialogError.set('');
    this.dialogOpen.set(true);
    void this.loadFoods();
    this.focusDialog();
  }
  startCreateFood(): void {
    this.rememberFocus();
    this.dialogOpen.set(true);
    this.dialogView.set('search');
    this.creatingFood.set(true);
    this.dialogError.set('');
    this.focusDialog();
  }
  createdFood(food: FoodRecord): void {
    this.creatingFood.set(false);
    this.historicalFood.set(food);
    this.selectedFoodId.set(food.version_id);
    this.selectedPortionId.set(food.portions[0]?.id ?? '');
    this.amount.set(1);
    this.editingId.set(null);
    this.dialogView.set('details');
    this.dialogError.set('');
    this.focusDialog();
  }
  cancelCreateFood(): void {
    this.creatingFood.set(false);
    this.focusDialog();
  }
  async edit(entry: IntakeRecord): Promise<void> {
    this.rememberFocus();
    this.dialogError.set('');
    try {
      const food = await this.catalogue.version(entry.food_version_id);
      if (!food) {
        throw new Error('The saved food version could not be loaded.');
      }
      this.historicalFood.set(food);
    } catch (error) {
      this.error.set(this.message(error, 'The entry could not be edited.'));
      return;
    }
    this.dialogView.set('details');
    this.editingId.set(entry.id);
    this.mealType.set(entry.meal_type);
    this.amount.set(entry.ratio);
    this.selectedFoodId.set(entry.food_version_id);
    this.selectedPortionId.set(entry.quantity_id);
    this.query.set(entry.food_name);
    this.dialogOpen.set(true);
    this.focusDialog();
  }
  chooseFood(food: FoodRecord): void {
    this.historicalFood.set(food);
    this.selectedFoodId.set(food.version_id);
    this.selectedPortionId.set(food.portions[0]?.id ?? '');
    this.amount.set(1);
    this.dialogView.set('details');
    this.dialogError.set('');
  }
  selectPortion(value: string): void {
    this.selectedPortionId.set(value);
  }
  async lookupBarcode(): Promise<void> {
    const code = this.barcode().trim();
    this.barcodeError.set('');
    this.offProduct.set(null);
    this.barcodeFoods.set([]);
    if (!code) {
      this.barcodeError.set('Enter a barcode first.');
      return;
    }
    this.barcodeSearching.set(true);
    try {
      const [product, local] = await Promise.allSettled([
        this.catalogue.lookupBarcode(code),
        this.catalogue.journalPage('', this.foodSort(), 0, 100, code),
      ]);
      if (code !== this.barcode().trim() || !this.dialogOpen()) {
        return;
      }
      if (product.status === 'fulfilled') {
        this.offProduct.set(product.value);
      } else {
        this.barcodeError.set(
          this.message(
            product.reason,
            'Open Food Facts is unavailable. Local matches are still shown.',
          ),
        );
      }
      if (local.status === 'fulfilled') {
        this.barcodeFoods.set(local.value);
      } else {
        this.barcodeError.set(
          this.message(local.reason, 'Local barcode matches could not be loaded.'),
        );
      }
    } finally {
      this.barcodeSearching.set(false);
    }
  }
  async searchJournal(): Promise<void> {
    const term = this.query().trim();
    if (/^\d{8,14}$/.test(term)) {
      ++this.foodRequest;
      this.foods.set([]);
      this.foodsMore.set(false);
      this.barcode.set(term);
      await this.lookupBarcode();
      return;
    }
    this.barcode.set('');
    this.barcodeFoods.set([]);
    this.offProduct.set(null);
    this.barcodeError.set('');
    await this.loadFoods();
  }
  searchChanged(value: string): void {
    this.query.set(value);
    ++this.foodRequest;
    this.foods.set([]);
    this.foodsMore.set(false);
    this.barcodeFoods.set([]);
    this.offProduct.set(null);
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => {
      void this.searchJournal();
    }, 250);
  }
  setFoodSort(value: string): void {
    const sort: FoodCatalogueSort = ['recent', 'newest', 'asc', 'desc'].includes(value)
      ? (value as FoodCatalogueSort)
      : 'recent';
    this.foodSort.set(sort);
    void this.loadFoods();
  }
  async loadFoods(append = false): Promise<void> {
    const request = ++this.foodRequest;
    const offset = append ? this.foods().length : 0;
    this.foodsLoading.set(true);
    this.foodError.set('');
    try {
      const foods = await this.catalogue.journalPage(this.query().trim(), this.foodSort(), offset);
      if (request !== this.foodRequest || !this.dialogOpen()) {
        return;
      }
      this.foods.set(append ? [...this.foods(), ...foods] : foods);
      this.foodsMore.set(foods.length === 20);
    } catch (error) {
      if (request === this.foodRequest) {
        this.foodError.set(this.message(error, 'Foods could not be loaded.'));
      }
    } finally {
      if (request === this.foodRequest) {
        this.foodsLoading.set(false);
      }
    }
  }
  async scannedBarcode(code: string): Promise<void> {
    this.query.set(code);
    this.barcode.set(code);
    await this.lookupBarcode();
  }
  closeDialog(): void {
    this.dialogOpen.set(false);
    ++this.foodRequest;
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.returnFocus?.focus();
  }
  async chooseOffProduct(): Promise<void> {
    const product = this.offProduct();
    if (!product) {
      return;
    }
    this.saving.set(true);
    this.dialogError.set('');
    try {
      const foodId = await this.catalogue.save({
        name: product.name,
        isPublic: true,
        barcode: this.barcode().trim(),
        portions: product.portions,
        source: 'Open Food Facts',
        sourcePayload: product.payload,
      });
      const food = await this.catalogue.current(foodId);
      if (!food) {
        throw new Error('The imported product could not be loaded.');
      }
      this.chooseFood(food);
      this.offProduct.set(null);
    } catch (error) {
      this.dialogError.set(this.message(error, 'The product could not be imported.'));
    } finally {
      this.saving.set(false);
    }
  }
  backToFoods(): void {
    this.dialogView.set('search');
    this.dialogError.set('');
    void this.loadFoods();
  }
  async saveEntry(): Promise<void> {
    const food = this.selectedFood();
    const amount = Number(this.amount());
    if (
      !food ||
      !this.selectedPortions().some((portion) => portion.id === this.selectedPortionId()) ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      Math.round(amount * 10) !== amount * 10
    ) {
      this.dialogError.set('Choose a food and portion, and enter a positive amount in tenths.');
      return;
    }
    this.saving.set(true);
    this.dialogError.set('');
    try {
      const user = await this.auth.user();
      if (!user) {
        throw new Error('Sign in to use the journal.');
      }
      const input: IntakeInput = {
        foodVersionId: food.version_id,
        quantityId: this.selectedPortionId(),
        ratio: amount,
        mealType: this.mealType(),
        consumedAt: parisInstant(this.date()),
      };
      const id = this.editingId();
      if (id) {
        await this.journal.update(id, input);
      } else {
        await this.journal.add(user.id, input);
      }
      this.closeDialog();
      await this.load();
    } catch (error) {
      this.dialogError.set(this.message(error, 'The entry could not be saved.'));
    } finally {
      this.saving.set(false);
    }
  }
  async remove(entry: IntakeRecord): Promise<void> {
    try {
      await this.journal.remove(entry.id);
      await this.load();
    } catch (error) {
      this.error.set(this.message(error, 'The entry could not be deleted.'));
    }
  }
  portionLabel(portion: FoodPortion): string {
    return `${formatNutrition(portion.quantity_number)} ${portion.quantity_unit}`;
  }
  formatDate(date: string): string {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' }).format(
      new Date(`${date}T12:00:00Z`),
    );
  }
  readonly formatNutrition = formatNutrition;
  totals(entries: IntakeRecord[]): NutritionSummaryValues {
    const total = (
      key: keyof Pick<FoodPortion, 'energy_kcal' | 'carbs_g' | 'fats_g' | 'proteins_g'>,
    ): number | null => {
      if (entries.some((entry) => entry.portion[key] === null)) {
        return null;
      }
      return entries.reduce((sum, entry) => sum + Number(entry.portion[key]) * entry.ratio, 0);
    };
    return {
      energy: total('energy_kcal'),
      carbs: total('carbs_g'),
      fats: total('fats_g'),
      protein: total('proteins_g'),
    };
  }
  async signOut(): Promise<void> {
    await this.auth.signOut();
  }
  private message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
  private rememberFocus(): void {
    this.returnFocus =
      this.document.activeElement instanceof HTMLElement ? this.document.activeElement : null;
  }
  private focusDialog(): void {
    setTimeout(() =>
      this.document
        .querySelector<HTMLElement>('.entry-dialog input, .entry-dialog .dialog-close')
        ?.focus(),
    );
  }
  dialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeDialog();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const dialog = this.document.querySelector('.entry-dialog');
    const focusable = Array.from(
      dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled])',
      ) ?? [],
    );
    if (!focusable.length) {
      return;
    }
    if (event.shiftKey && this.document.activeElement === focusable[0]) {
      event.preventDefault();
      focusable.at(-1)?.focus();
    } else if (!event.shiftKey && this.document.activeElement === focusable.at(-1)) {
      event.preventDefault();
      focusable[0].focus();
    }
  }
}
