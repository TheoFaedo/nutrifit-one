import { DiscardedCacheResponse } from '@core/stores/keyed-cache';
import { JournalStore } from '@core/stores/journal.store';
import { DailyGoalsStore } from '@core/stores/daily-goals.store';
import { FoodCatalogueStore, catalogueKey } from '@core/stores/food-catalogue.store';
import { CacheSession } from '@core/stores/cache-session.service';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '@core/services/auth.service';
import { DailyGoal } from '@core/services/daily-goals.service';
import {
  FoodCatalogueSort,
  FoodPortion,
  PortionInput,
  FoodRecord,
} from '@core/services/food-catalogue.service';
import { IntakeInput, IntakeRecord, MealType } from '@core/services/intake-journal.service';
import { BrandComponent } from '@shared/ui/brand/brand.component';
import { BottomNavComponent } from '@shared/ui/bottom-nav/bottom-nav.component';
import { DailySummaryComponent } from './daily-summary/daily-summary.component';
import {
  FOOD_CATALOGUE_SORT_OPTIONS,
  FoodCatalogueSearchComponent,
} from '@shared/ui/food-catalogue-search/food-catalogue-search.component';
import { formatNutrition } from '@shared/ui/nutrition-summary/nutrition-format';
import { PortionSelectorComponent } from '@shared/ui/portion-selector/portion-selector.component';
import {
  NutritionSummaryComponent,
  NutritionSummaryValues,
} from '@shared/ui/nutrition-summary/nutrition-summary.component';
import { FoodEditorComponent } from '@shared/ui/food-editor/food-editor.component';
import { ModalDialogComponent } from '@shared/ui/modal-dialog/modal-dialog.component';
import { LanguageSwitchComponent } from '@shared/ui/language-switch/language-switch.component';
import { I18nService } from '@core/i18n/i18n.service';
import { Language } from '@core/i18n/translations';

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
    LanguageSwitchComponent,
    BottomNavComponent,
    DailySummaryComponent,
    NutritionSummaryComponent,
    FoodCatalogueSearchComponent,
    PortionSelectorComponent,
    FoodEditorComponent,
    ModalDialogComponent,
  ],
  templateUrl: './journal.component.html',
  styleUrl: './journal.component.less',
})
export class JournalComponent {
  readonly ratioInputType =
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
      ? 'text'
      : 'number';
  private readonly auth = inject(AuthService);
  private readonly journal = inject(JournalStore);
  private readonly catalogue = inject(FoodCatalogueStore);
  private readonly goalsService = inject(DailyGoalsStore);
  readonly i18n = inject(I18nService);
  readonly languageError = signal(false);
  private foodRequest = 0;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  readonly date = signal(todayParis());
  readonly entries = computed(() => this.journal.peek(this.date()).data ?? []);
  readonly dailyGoal = computed<DailyGoal | null>(
    () => this.goalsService.peek(this.date()).data ?? null,
  );
  readonly foods = signal<FoodRecord[]>([]);
  readonly historicalFood = signal<FoodRecord | null>(null);
  readonly foodSort = signal<FoodCatalogueSort>('recent');
  readonly sortOptions = FOOD_CATALOGUE_SORT_OPTIONS;
  readonly foodsLoading = signal(false);
  readonly foodsRefreshing = computed(
    () => this.catalogue.peek(catalogueKey(this.query().trim(), this.foodSort())).isRefreshing,
  );
  readonly foodsInitialLoading = computed(
    () =>
      this.foodsLoading() &&
      !this.catalogue.peek(catalogueKey(this.query().trim(), this.foodSort())).hasLoaded,
  );
  readonly foodsMore = signal(false);
  readonly foodError = signal('');
  readonly dialogError = signal('');
  readonly hasLoaded = computed(() => this.journal.peek(this.date()).hasLoaded);
  readonly loading = computed(() => this.journal.peek(this.date()).isLoading);
  readonly refreshing = computed(
    () =>
      this.journal.peek(this.date()).isRefreshing ||
      this.goalsService.peek(this.date()).isRefreshing,
  );
  readonly loadError = computed(
    () => this.journal.peek(this.date()).error || this.goalsService.peek(this.date()).error,
  );
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
  readonly amount = signal('1');
  readonly mealType = signal<MealType>('BREAKFAST');
  readonly selectedFood = computed(() =>
    this.historicalFood()?.version_id === this.selectedFoodId()
      ? this.historicalFood()
      : (this.foods().find((food) => food.version_id === this.selectedFoodId()) ?? null),
  );
  readonly selectedPortions = computed(() => this.selectedFood()?.portions ?? []);
  async languageChanged(language: Language): Promise<void> {
    this.languageError.set(false);
    try {
      const user = await this.auth.user();
      if (user) {
        await this.i18n.saveForUser(user.id, language);
      }
    } catch {
      this.languageError.set(true);
    }
  }
  readonly selectedNutrition = computed<NutritionSummaryValues>(() => {
    const portion = this.selectedPortions().find((item) => item.id === this.selectedPortionId());
    const multiplier = this.parseRatio(this.amount());
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
    const session = inject(CacheSession);
    effect(() => {
      session.generation();
      untracked(() => {
        this.foods.set([]);
        this.barcodeFoods.set([]);
        this.closeDialog();
      });
    });
    effect(() => {
      this.catalogue.revision();
      untracked(() => {
        if (this.dialogOpen() && this.dialogView() === 'search') {
          void this.loadFoods();
        }
      });
    });
    void this.load();
  }

  async load(): Promise<void> {
    const date = this.date();
    this.error.set('');
    await Promise.allSettled([this.journal.forDate(date), this.goalsService.forDate(date)]);
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
    this.historicalFood.set(null);
    this.dialogView.set('search');
    this.creatingFood.set(false);
    this.editingId.set(null);
    this.mealType.set(type);
    this.amount.set('1');
    this.query.set('');
    this.barcode.set('');
    this.barcodeError.set('');
    this.offProduct.set(null);
    this.selectedFoodId.set('');
    this.selectedPortionId.set('');
    this.dialogError.set('');
    this.dialogOpen.set(true);
    void this.loadFoods();
  }
  startCreateFood(): void {
    this.dialogOpen.set(true);
    this.dialogView.set('search');
    this.creatingFood.set(true);
    this.dialogError.set('');
  }
  createdFood(food: FoodRecord): void {
    this.creatingFood.set(false);
    this.historicalFood.set(food);
    this.selectedFoodId.set(food.version_id);
    this.selectedPortionId.set(food.portions[0]?.id ?? '');
    this.amount.set('1');
    this.editingId.set(null);
    this.dialogView.set('details');
    this.dialogError.set('');
  }
  cancelCreateFood(): void {
    this.creatingFood.set(false);
  }
  async edit(entry: IntakeRecord): Promise<void> {
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
    this.amount.set(String(entry.ratio));
    this.selectedFoodId.set(entry.food_version_id);
    this.selectedPortionId.set(entry.quantity_id);
    this.query.set(entry.food_name);
    this.dialogOpen.set(true);
  }
  chooseFood(food: FoodRecord): void {
    this.historicalFood.set(food);
    this.selectedFoodId.set(food.version_id);
    this.selectedPortionId.set(food.portions[0]?.id ?? '');
    this.amount.set('1');
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
    const first = this.catalogue.peek(catalogueKey(this.query().trim(), this.foodSort()));
    if (first.stale) {
      append = false;
    }
    const offset = append ? this.foods().length : 0;
    if (!append && first.hasLoaded) {
      this.foods.set(first.data as FoodRecord[]);
    }
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
      if (request === this.foodRequest && !(error instanceof DiscardedCacheResponse)) {
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
    const amount = this.parseRatio(this.amount());
    if (!this.hasValidEntryDetails(food, amount)) {
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
      await this.journal.saveEntry(
        this.date(),
        user.id,
        input,
        this.toIntakeRecord(id ?? '', food, input),
        id,
      );
      this.closeDialog();
    } catch (error) {
      this.dialogError.set(this.message(error, 'The entry could not be saved.'));
    } finally {
      this.saving.set(false);
    }
  }
  async remove(entry: IntakeRecord): Promise<void> {
    try {
      await this.journal.remove(this.date(), entry.id);
    } catch (error) {
      this.error.set(this.message(error, 'The entry could not be deleted.'));
    }
  }
  private toIntakeRecord(id: string, food: FoodRecord, input: IntakeInput): IntakeRecord {
    const portion = food.portions.find((item) => item.id === input.quantityId);
    if (!portion) {
      throw new Error('The selected portion could not be loaded.');
    }
    return {
      id,
      food_version_id: food.version_id,
      quantity_id: input.quantityId,
      ratio: input.ratio,
      meal_type: input.mealType,
      consumed_at: input.consumedAt,
      food_name: food.name,
      kind: food.kind,
      portion,
    };
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
  private hasValidEntryDetails(food: FoodRecord | null, amount: number): food is FoodRecord {
    return (
      food !== null &&
      food.portions.some((portion) => portion.id === this.selectedPortionId()) &&
      Number.isFinite(amount) &&
      amount > 0 &&
      Math.round(amount * 10) === amount * 10
    );
  }
  private parseRatio(value: string): number {
    const normalized = value.trim().replace(',', '.');
    return normalized ? Number(normalized) : Number.NaN;
  }
}
