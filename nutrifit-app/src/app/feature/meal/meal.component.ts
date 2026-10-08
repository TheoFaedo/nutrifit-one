import { Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { NutritionFacts } from '../../core/models/nutrition-facts.model';
import { FoodCatalogueService, FoodInput, FoodPortion, FoodRecord, PortionInput } from '../../core/services/food-catalogue.service';
import { BrandComponent } from '../../shared/ui/brand/brand.component';
import { BottomNavComponent } from '../../shared/ui/bottom-nav/bottom-nav.component';

@Component({
  selector: 'app-meal-page',
  imports: [ReactiveFormsModule, BrandComponent, BottomNavComponent],
  templateUrl: './meal.component.html',
  styleUrl: './meal.component.less',
})
export class MealComponent {
  private readonly catalogue = inject(FoodCatalogueService);
  private readonly auth = inject(AuthService);
  readonly foods = signal<FoodRecord[]>([]);
  readonly selected = signal<FoodRecord | null>(null);
  readonly currentUserId = signal('');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly query = signal('');
  readonly barcode = signal('');
  readonly offProduct = signal<{ name: string; portions: PortionInput[]; payload: unknown } | null>(null);
  readonly quantity = signal(1);
  readonly editing = signal(false);
  readonly searchResults = computed(() => {
    const value = this.query().trim().toLocaleLowerCase();
    return this.foods().filter((food) => (!value || food.name.toLocaleLowerCase().includes(value)) &&
      (!this.barcode().trim() || food.barcode === this.barcode().trim()));
  });
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(160)] }),
    isPublic: new FormControl(false, { nonNullable: true }),
    barcode: new FormControl('', { nonNullable: true }),
    portions: new FormArray<FormGroup>([this.portionGroup()]),
  });

  constructor() { void this.auth.user().then((user) => this.currentUserId.set(user?.id ?? '')).catch(() => undefined); void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.foods.set(await this.catalogue.search(this.query())); }
    catch (error) { this.error.set(this.message(error, 'Foods could not be loaded.')); }
    finally { this.loading.set(false); }
  }

  async search(): Promise<void> { await this.load(); }
  select(food: FoodRecord): void { this.selected.set(food); this.quantity.set(1); this.editing.set(false); this.error.set(''); }
  scale(value: number | null, portion: FoodPortion): string { return value === null ? '—' : (value * this.quantity() / portion.quantity_number).toFixed(1).replace(/\.0$/, ''); }
  get portions(): FormArray<FormGroup> { return this.form.controls.portions; }

  newFood(): void {
    this.selected.set(null); this.editing.set(true); this.error.set(''); this.form.reset({ name: '', isPublic: false, barcode: '' });
    this.portions.clear(); this.portions.push(this.portionGroup());
  }

  edit(food: FoodRecord): void {
    this.selected.set(food); this.editing.set(true); this.error.set('');
    this.form.reset({ name: food.name, isPublic: food.is_public, barcode: food.barcode ?? '' });
    this.portions.clear(); food.portions.forEach((portion) => this.portions.push(this.portionGroup(portion)));
  }

  addPortion(): void { this.portions.push(this.portionGroup()); }
  removePortion(index: number): void { if (this.portions.length > 1) this.portions.removeAt(index); }

  recalculateNutrition(index: number, changed: 'energy_kcal' | 'carbs_g' | 'fats_g' | 'proteins_g'): void {
    const portion = this.portions.at(index);
    const value = portion.getRawValue() as Record<string, unknown>;
    const number = (key: string): number => {
      const parsed = Number(value[key]);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const facts = NutritionFacts.from({
      energy: number('energy_kcal'),
      carbs: number('carbs_g'),
      fats: number('fats_g'),
      protein: number('proteins_g'),
    });
    const calculated = changed === 'energy_kcal'
      ? facts.withEnergy(number('energy_kcal'))
      : changed === 'carbs_g'
        ? facts.withCarbs(number('carbs_g'))
        : changed === 'fats_g'
          ? facts.withFats(number('fats_g'))
          : facts.withProtein(number('proteins_g'));
    const values = calculated.toValues();
    const updates = changed === 'energy_kcal'
      ? { carbs_g: String(values.carbs), fats_g: String(values.fats), proteins_g: String(values.protein) }
      : { energy_kcal: String(values.energy) };
    portion.patchValue(updates, { emitEvent: false });
  }

  async lookupBarcode(): Promise<void> {
    this.error.set(''); this.offProduct.set(null);
    const code = this.barcode().trim();
    if (!code) { this.error.set('Enter a barcode first.'); return; }
    try { this.offProduct.set(await this.catalogue.lookupBarcode(code)); if (!this.offProduct()) this.error.set('No Open Food Facts product was found.'); }
    catch (error) { this.error.set(this.message(error, 'Open Food Facts is unavailable. Local matches remain available.')); }
  }

  importOff(): void {
    const product = this.offProduct(); if (!product) return;
    this.newFood();
    this.form.patchValue({ name: product.name, isPublic: true, barcode: this.barcode().trim() });
    this.portions.clear(); product.portions.forEach((portion) => this.portions.push(this.portionGroup(portion)));
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true); this.error.set('');
    try {
      const user = await this.auth.user();
      if (!user) throw new Error('Sign in to save a food.');
      const value = this.form.getRawValue();
      const portions: PortionInput[] = value.portions.map((item, index) => ({
        quantity_number: Number(item['quantity_number']), quantity_unit: String(item['quantity_unit']), is_reference: index === 0,
        ...this.nutritionValues(item),
      }));
      const existing = this.selected();
      const input: FoodInput = { name: value.name.trim(), isPublic: value.isPublic, barcode: existing?.barcode ?? (value.barcode.trim() || null), portions,
        ...(existing ? { foodId: existing.id, source: existing.source ?? undefined } : {}), ...(this.offProduct() ? { source: 'Open Food Facts', sourcePayload: this.offProduct()?.payload } : {}) };
      await this.catalogue.save(input);
      this.editing.set(false); this.offProduct.set(null); await this.load();
      const fresh = this.foods().find((food) => food.id === existing?.id) ?? this.foods().find((food) => food.name === input.name);
      if (fresh) this.select(fresh); else this.selected.set(null);
    } catch (error) { this.error.set(this.message(error, 'The food could not be saved.')); }
    finally { this.saving.set(false); }
  }

  private portionGroup(value?: Partial<FoodPortion | PortionInput>): FormGroup {
    return new FormGroup({
      quantity_number: new FormControl(value?.quantity_number ?? 100, { nonNullable: true, validators: [Validators.required, Validators.min(0.001)] }),
      quantity_unit: new FormControl(value?.quantity_unit ?? 'g', { nonNullable: true, validators: [Validators.required] }),
      energy_kcal: new FormControl(value?.energy_kcal == null ? '' : String(value.energy_kcal)),
      carbs_g: new FormControl(value?.carbs_g == null ? '' : String(value.carbs_g)),
      fats_g: new FormControl(value?.fats_g == null ? '' : String(value.fats_g)),
      proteins_g: new FormControl(value?.proteins_g == null ? '' : String(value.proteins_g)),
    });
  }

  private optionalNumber(value: unknown): number | null { return value === '' || value === null ? null : Number(value); }
  private nutritionValues(value: Record<string, unknown>): Pick<PortionInput, 'energy_kcal' | 'carbs_g' | 'fats_g' | 'proteins_g'> {
    const facts = [value['energy_kcal'], value['carbs_g'], value['fats_g'], value['proteins_g']];
    if (facts.some((fact) => fact === '' || fact === null)) return { energy_kcal: null, carbs_g: null, fats_g: null, proteins_g: null };
    return { energy_kcal: this.optionalNumber(facts[0]), carbs_g: this.optionalNumber(facts[1]), fats_g: this.optionalNumber(facts[2]), proteins_g: this.optionalNumber(facts[3]) };
  }
  private message(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
}
