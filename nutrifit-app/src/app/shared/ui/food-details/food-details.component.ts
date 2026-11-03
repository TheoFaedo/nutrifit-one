import { Component, computed, effect, input, output, signal } from '@angular/core';
import { FoodPortion, FoodRecord, RecipePart } from '@core/services/food-catalogue.service';
import { NutritionSummaryComponent } from '@shared/ui/nutrition-summary/nutrition-summary.component';
import { PortionSelectorComponent } from '@shared/ui/portion-selector/portion-selector.component';

@Component({
  selector: 'app-food-details',
  imports: [NutritionSummaryComponent, PortionSelectorComponent],
  templateUrl: './food-details.component.html',
  styleUrl: './food-details.component.less',
})
export class FoodDetailsComponent {
  readonly ratioInputType =
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
      ? 'text'
      : 'number';
  readonly food = input.required<FoodRecord>();
  readonly currentUserId = input('');
  readonly assumptions = computed(() => {
    const payload = this.food().source_payload;
    if (!payload || typeof payload !== 'object' || !('assumptions' in payload)) {
      return [];
    }
    const values: unknown = payload.assumptions;
    return Array.isArray(values)
      ? values.filter((item): item is string => typeof item === 'string')
      : [];
  });
  readonly edit = output<FoodRecord>();
  readonly selectedPortionId = signal('');
  readonly ratioInput = signal('1');
  readonly ratio = computed(() => {
    const value = this.ratioInput().trim().replace(',', '.');
    const parsed = value ? Number(value) : 1;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  });
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
    this.ratioInput.set('1');
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
