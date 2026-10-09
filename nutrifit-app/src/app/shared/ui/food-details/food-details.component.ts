import { Component, computed, effect, input, output, signal } from '@angular/core';
import { FoodPortion, FoodRecord, RecipePart } from '../../../core/services/food-catalogue.service';
import { NutritionSummaryComponent } from '../nutrition-summary/nutrition-summary.component';
import { PortionSelectorComponent } from '../portion-selector/portion-selector.component';

@Component({
  selector: 'app-food-details',
  imports: [NutritionSummaryComponent, PortionSelectorComponent],
  template: `
    <section class="detail" aria-labelledby="food-title">
      <div class="heading">
        <div>
          <span class="eyebrow"
            >{{ food().kind === 'RECIPE' ? 'Recipe' : 'Food' }} ·
            {{ food().is_public ? 'Public' : 'Private' }} · Version
            {{ food().version_number }}</span
          >
          <h2 id="food-title">{{ food().name }}</h2>
        </div>
        @if (food().author_id === currentUserId()) {
          <button class="secondary-button" type="button" (click)="edit.emit(food())">Edit</button>
        }
      </div>
      @if (food().barcode) {
        <p class="meta">Barcode {{ food().barcode }}</p>
      }
      <div class="amount-controls">
        <label class="amount"
          ><span>Calculate per</span
          ><app-portion-selector
            [portions]="food().portions"
            [selection]="selection()"
            (selectionChange)="selectPortion($event)"
          /></label
        >
        <label class="amount"
          ><span>Ratio</span
          ><input
            type="number"
            min="0.1"
            step="0.1"
            [value]="ratio()"
            (input)="ratio.set(+$any($event.target).value)"
          />× {{ baseQuantity() }} {{ selectedPortion().quantity_unit }}</label
        >
      </div>
      <div class="portion-list">
        <h3>Nutrition for {{ effectiveQuantity() }} {{ selectedPortion().quantity_unit }}</h3>
        <article class="portion-card">
          <app-nutrition-summary [values]="scaledNutrition(selectedPortion())" />
        </article>
      </div>
      @if (food().kind === 'RECIPE') {
        <div class="portion-list">
          <h3>Ingredients in this version</h3>
          @for (part of food().parts; track part.quantity_id) {
            <article class="portion-card">
              <strong>{{ portionLabel(part) }} {{ part.ingredient_name }}</strong>
              <p class="note">
                {{ part.ingredient_kind === 'RECIPE' ? 'Recipe' : 'Food' }} snapshot
              </p>
            </article>
          }
        </div>
      }
      <p class="note">
        Values are scaled proportionally from each portion. Units are kept as entered.
      </p>
    </section>
  `,
  styles: [
    `
      .detail {
        padding: 22px;
        background: #fff;
        border: 1px solid var(--line);
        border-radius: 18px;
      }
      h2 {
        margin: 5px 0 16px;
        font:
          400 27px Georgia,
          serif;
      }
      .heading {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
      }
      .eyebrow {
        color: #68714c;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .amount-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        margin: 20px 0;
      }
      .amount {
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--muted);
        font-size: 12px;
      }
      input,
      select {
        min-height: 42px;
        box-sizing: border-box;
        padding: 10px 12px;
        color: var(--ink);
        background: #fbfaf7;
        border: 1px solid var(--line);
        border-radius: 9px;
        font: inherit;
      }
      input {
        width: 92px;
      }
      h3 {
        margin: 16px 0 10px;
        font-size: 15px;
      }
      .portion-card {
        padding: 14px;
        margin-top: 10px;
        background: #f8f8f3;
        border-radius: 12px;
      }
      .meta,
      .note {
        color: var(--muted);
        font-size: 12px;
      }
      .note {
        margin: 18px 0 0;
      }
      .secondary-button {
        min-height: 42px;
        padding: 0 16px;
        color: var(--ink);
        background: #fff;
        border: 1px solid var(--line);
        border-radius: 999px;
        font: inherit;
        font-size: 12px;
        cursor: pointer;
      }
      button:focus-visible,
      input:focus-visible,
      select:focus-visible {
        outline: 3px solid #879365;
        outline-offset: 2px;
      }
      @media (max-width: 540px) {
        .detail {
          padding: 17px;
        }
      }
    `,
  ],
})
export class FoodDetailsComponent {
  readonly food = input.required<FoodRecord>();
  readonly currentUserId = input('');
  readonly edit = output<FoodRecord>();
  readonly selectedPortionId = signal('');
  readonly ratio = signal(1);
  readonly baseQuantity = computed(() => this.selectedPortion().quantity_number);
  readonly effectiveQuantity = computed(() => this.baseQuantity() * this.ratio());
  readonly selection = computed(() => this.selectedPortion().id);
  constructor() {
    effect(() => {
      const portion = this.referencePortion();
      this.selectedPortionId.set(portion.id);
    });
  }
  referencePortion(): FoodPortion {
    const portions = this.food().portions;
    return (
      portions.find((portion) => portion.is_reference) ??
      portions[0] ?? {
        id: '',
        quantity_number: 1,
        quantity_unit: '',
        is_reference: false,
        energy_kcal: null,
        carbs_g: null,
        fats_g: null,
        proteins_g: null,
      }
    );
  }
  selectedPortion(): FoodPortion {
    const portions = this.food().portions;
    return (
      portions.find((portion) => portion.id === this.selectedPortionId()) ?? this.referencePortion()
    );
  }
  selectPortion(id: string): void {
    const portion = this.food().portions.find((item) => item.id === id);
    if (!portion) {
      return;
    }
    this.selectedPortionId.set(portion.id);
    this.ratio.set(1);
  }
  scaledNutrition(portion: FoodPortion): {
    energy: number | null;
    carbs: number | null;
    fats: number | null;
    protein: number | null;
  } {
    const scale = this.effectiveQuantity() / this.selectedPortion().quantity_number;
    const calculated = this.food().kind === 'RECIPE' ? this.recipeNutrition() : null;
    return {
      energy: this.scaleNutrient(portion.energy_kcal, calculated?.energy ?? null, scale),
      carbs: this.scaleNutrient(portion.carbs_g, calculated?.carbs ?? null, scale),
      fats: this.scaleNutrient(portion.fats_g, calculated?.fats ?? null, scale),
      protein: this.scaleNutrient(portion.proteins_g, calculated?.protein ?? null, scale),
    };
  }
  private scaleNutrient(
    value: number | null,
    fallback: number | null,
    scale: number,
  ): number | null {
    const nutrition = value ?? fallback;
    return nutrition === null ? null : nutrition * scale;
  }
  private recipeNutrition(): {
    energy: number | null;
    carbs: number | null;
    fats: number | null;
    protein: number | null;
  } {
    const parts = this.food().parts;
    const sum = (key: 'energy_kcal' | 'carbs_g' | 'fats_g' | 'proteins_g'): number | null => {
      if (!parts.length) {
        return null;
      }
      let total = 0;
      for (const part of parts) {
        const portion = part.portions.find((item) => item.id === part.quantity_id);
        const value = portion?.[key];
        if (typeof value !== 'number') {
          return null;
        }
        total += value * part.ratio;
      }
      return total;
    };
    return {
      energy: sum('energy_kcal'),
      carbs: sum('carbs_g'),
      fats: sum('fats_g'),
      protein: sum('proteins_g'),
    };
  }
  portionLabel(part: RecipePart): string {
    const portion = part.portions.find((item) => item.id === part.quantity_id);
    return portion
      ? `${part.ratio} × ${portion.quantity_number} ${portion.quantity_unit}`
      : `${part.ratio} × portion`;
  }
}
