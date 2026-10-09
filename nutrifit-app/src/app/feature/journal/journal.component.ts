import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { DailyGoal, DailyGoalsService } from '../../core/services/daily-goals.service';
import {
  FoodCatalogueService,
  FoodPortion,
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
import {
  NutritionSummaryComponent,
  NutritionSummaryValues,
} from '../../shared/ui/nutrition-summary/nutrition-summary.component';

const meals: { type: MealType; label: string }[] = [
  { type: 'BREAKFAST', label: 'Breakfast' },
  { type: 'LUNCH', label: 'Lunch' },
  { type: 'DINNER', label: 'Dinner' },
  { type: 'SNACKS', label: 'Snacks' },
];
const todayParis = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const parisInstant = (date: string): string => {
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
    DecimalPipe,
    BrandComponent,
    BottomNavComponent,
    NutritionSummaryComponent,
  ],
  templateUrl: './journal.component.html',
  styleUrl: './journal.component.less',
})
export class JournalComponent {
  private readonly auth = inject(AuthService);
  private readonly journal = inject(IntakeJournalService);
  private readonly catalogue = inject(FoodCatalogueService);
  private readonly goalsService = inject(DailyGoalsService);
  readonly date = signal(todayParis());
  readonly entries = signal<IntakeRecord[]>([]);
  readonly dailyGoal = signal<DailyGoal | null>(null);
  readonly foods = signal<FoodRecord[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly dialogOpen = signal(false);
  readonly dialogView = signal<'search' | 'details'>('search');
  readonly editingId = signal<string | null>(null);
  readonly query = signal('');
  readonly selectedFoodId = signal('');
  readonly selectedPortionId = signal('');
  readonly amount = signal(1);
  readonly mealType = signal<MealType>('BREAKFAST');
  readonly selectedFood = computed(
    () => this.foods().find((food) => food.version_id === this.selectedFoodId()) ?? null,
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
  readonly matchingFoods = computed(() => {
    const term = this.query().trim().toLocaleLowerCase();
    return this.foods().filter((food) => !term || food.name.toLocaleLowerCase().includes(term));
  });
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
    this.loading.set(true);
    this.error.set('');
    try {
      const [entries, foods, goal] = await Promise.all([
        this.journal.forDate(this.date()),
        this.catalogue.search(''),
        this.goalsService.forDate(this.date()),
      ]);
      this.entries.set(entries);
      this.foods.set(foods);
      this.dailyGoal.set(goal);
    } catch (error) {
      this.error.set(this.message(error, 'The journal could not be loaded.'));
    } finally {
      this.loading.set(false);
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
    this.dialogView.set('search');
    this.editingId.set(null);
    this.mealType.set(type);
    this.amount.set(1);
    this.query.set('');
    this.selectedFoodId.set('');
    this.selectedPortionId.set('');
    this.error.set('');
    this.dialogOpen.set(true);
  }
  edit(entry: IntakeRecord): void {
    this.dialogView.set('details');
    this.editingId.set(entry.id);
    this.mealType.set(entry.meal_type);
    this.amount.set(entry.ratio);
    this.selectedFoodId.set(entry.food_version_id);
    this.selectedPortionId.set(entry.quantity_id);
    this.query.set(entry.food_name);
    this.error.set('');
    this.dialogOpen.set(true);
  }
  chooseFood(food: FoodRecord): void {
    this.selectedFoodId.set(food.version_id);
    this.selectedPortionId.set(food.portions[0]?.id ?? '');
    this.amount.set(1);
    this.dialogView.set('details');
    this.error.set('');
  }
  backToFoods(): void {
    this.dialogView.set('search');
    this.error.set('');
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
      this.error.set('Choose a food and portion, and enter a positive amount in tenths.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
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
      this.dialogOpen.set(false);
      await this.load();
    } catch (error) {
      this.error.set(this.message(error, 'The entry could not be saved.'));
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
    return `${portion.quantity_number} ${portion.quantity_unit}`;
  }
  formatDate(date: string): string {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' }).format(
      new Date(`${date}T12:00:00Z`),
    );
  }
  formatValue(value: number | null): string {
    return value === null ? '—' : value.toFixed(1).replace(/\.0$/, '');
  }
  progressWidth(consumed: number | null, target: number | null): number {
    if (consumed === null || target === null || target <= 0) {
      return 0;
    }
    return Math.min(100, (consumed / target) * 100);
  }
  exceedsGoal(consumed: number | null, target: number | null): boolean {
    return consumed !== null && target !== null && consumed > target;
  }
  totals(entries: IntakeRecord[]): NutritionSummaryValues {
    const total = (
      key: keyof Pick<FoodPortion, 'energy_kcal' | 'carbs_g' | 'fats_g' | 'proteins_g'>,
    ): number | null => {
      if (!entries.length || entries.some((entry) => entry.portion[key] === null)) {
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
}
