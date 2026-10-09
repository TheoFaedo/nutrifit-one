import { Component, input, output, signal, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  FoodCatalogueService,
  FoodRecord,
  PortionInput,
  RecipeInput,
  FoodPortion,
} from '../../../core/services/food-catalogue.service';

@Component({
  selector: 'app-food-editor',
  imports: [FormsModule],
  templateUrl: './food-editor.component.html',
  styleUrl: './food-editor.component.less',
})
export class FoodEditorComponent implements OnInit {
  readonly food = input<FoodRecord | null>(null);
  readonly initialKind = input<'FOOD' | 'RECIPE'>('FOOD');
  readonly saved = output<FoodRecord>();
  readonly dismissed = output<void>();
  readonly kind = signal<'FOOD' | 'RECIPE'>('FOOD');
  readonly saving = signal(false);
  readonly error = signal('');
  private readonly catalogue = inject(FoodCatalogueService);
  readonly ingredients = signal<FoodRecord[]>([]);
  parts: { versionId: string; portionId: string; ratio: number }[] = [
    { versionId: '', portionId: '', ratio: 1 },
  ];
  name = '';
  isPublic = false;
  barcode = '';
  quantity = 1;
  unit = 'portion';
  portions: PortionInput[] = [this.newPortion()];
  constructor() {}
  ngOnInit(): void {
    void this.loadIngredients();
    const food = this.food();
    this.kind.set(food?.kind ?? this.initialKind());
    if (!food) {
      return;
    }
    this.name = food.name;
    this.isPublic = food.is_public;
    this.barcode = food.barcode ?? '';
    if (food.portions.length) {
      this.portions = food.portions.map((portion) => ({
        quantity_number: portion.quantity_number,
        quantity_unit: portion.quantity_unit,
        is_reference: portion.is_reference,
        energy_kcal: portion.energy_kcal,
        carbs_g: portion.carbs_g,
        fats_g: portion.fats_g,
        proteins_g: portion.proteins_g,
      }));
    }
    const reference = food.portions.find((portion) => portion.is_reference) ?? food.portions[0];
    if (reference) {
      this.quantity = reference.quantity_number;
      this.unit = reference.quantity_unit;
    }
    if (food.kind === 'RECIPE' && food.parts.length) {
      this.parts = food.parts.map((part) => ({
        versionId: part.ingredient_version_id,
        portionId: part.quantity_id,
        ratio: part.ratio,
      }));
    }
  }
  private async loadIngredients(): Promise<void> {
    try {
      this.ingredients.set(await this.catalogue.search('', 'asc'));
    } catch {
      this.error.set('Foods could not be loaded for recipe ingredients.');
    }
  }
  portionsFor(versionId: string): FoodPortion[] {
    return this.ingredients().find((item) => item.version_id === versionId)?.portions ?? [];
  }
  private newPortion(): PortionInput {
    return {
      quantity_number: 100,
      quantity_unit: 'g',
      is_reference: this.portions?.length === 0,
      energy_kcal: null,
      carbs_g: null,
      fats_g: null,
      proteins_g: null,
    };
  }
  addPortion(): void {
    this.portions = [...this.portions, this.newPortion()];
  }
  removePortion(index: number): void {
    this.portions = this.portions.filter((_, i) => i !== index);
  }
  addPart(): void {
    this.parts = [...this.parts, { versionId: '', portionId: '', ratio: 1 }];
  }
  removePart(index: number): void {
    this.parts = this.parts.filter((_, i) => i !== index);
  }
  setPublic(event: Event): void {
    this.isPublic = (event.target as HTMLInputElement).checked;
  }
  async save(): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const current = this.food();
      let id: string;
      if (this.kind() === 'FOOD') {
        id = await this.catalogue.save({
          name: this.name.trim(),
          isPublic: this.isPublic,
          barcode: current?.barcode ?? (this.barcode || null),
          portions: this.portions.map((portion, index) => ({
            ...portion,
            quantity_number: Number(portion.quantity_number),
            is_reference: index === 0,
          })),
          ...(current ? { foodId: current.id } : {}),
        });
      } else {
        const recipe: RecipeInput = {
          name: this.name.trim(),
          isPublic: this.isPublic,
          referenceQuantity: Number(this.quantity),
          referenceUnit: this.unit.trim(),
          parts: this.parts.map((part) => ({
            ingredient_version_id: part.versionId,
            quantity_id: part.portionId,
            ratio: Number(part.ratio),
          })),
          ...(current ? { foodId: current.id } : {}),
        };
        id = await this.catalogue.saveRecipe(recipe);
      }
      const fresh = await this.catalogue.current(id);
      if (!fresh) {
        throw new Error('The saved item could not be loaded.');
      }
      this.saved.emit(fresh);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The item could not be saved.');
    } finally {
      this.saving.set(false);
    }
  }
}
