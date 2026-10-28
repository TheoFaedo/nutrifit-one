import { Service, inject } from '@angular/core';
import { supabase } from './supabase.client';
import { FoodCatalogueService, FoodPortion, RecipePart, validNova } from '@core/services/food-catalogue.service';

export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACKS';
export interface IntakeRecord {
  id: string;
  food_version_id: string;
  quantity_id: string;
  ratio: number;
  meal_type: MealType;
  consumed_at: string;
  food_name: string;
  kind: 'FOOD' | 'RECIPE';
  portion: FoodPortion;
  nova_group?: number | null;
  nova_calories?: number[] | null;
}
export interface IntakeInput {
  foodVersionId: string;
  quantityId: string;
  ratio: number;
  mealType: MealType;
  consumedAt: string;
}

@Service()
export class IntakeJournalService {
  private readonly catalogue = inject(FoodCatalogueService);

  async distribution(
    versionId: string,
    portion: FoodPortion,
    ratio: number,
    path: string[] = [],
  ): Promise<number[] | null> {
    if (path.includes(versionId) || portion.energy_kcal === null) {
      return null;
    }
    const food = await this.catalogue.version(versionId);
    if (!food) {
      return null;
    }
    const energy = Number(portion.energy_kcal) * ratio;
    if (food.kind === 'FOOD') {
      return this.foodDistribution(food.nova_group, energy);
    }
    return this.recipeDistribution(food.parts, energy, [...path, versionId]);
  }

  private foodDistribution(groupValue: unknown, energy: number): number[] | null {
    const group = validNova(groupValue);
    if (group === null) {
      return null;
    }
    const result = [0, 0, 0, 0];
    result[group - 1] = energy;
    return result;
  }

  private async recipeDistribution(
    parts: RecipePart[],
    energy: number,
    path: string[],
  ): Promise<number[] | null> {
    if (!parts.length) {
      return null;
    }
    const distributions = await Promise.all(parts.map((part) => this.partDistribution(part, path)));
    if (distributions.some((distribution) => distribution === null)) {
      return null;
    }
    const sums = [0, 0, 0, 0];
    distributions.forEach((distribution) => this.addDistribution(sums, distribution));
    return this.scaleDistribution(sums, energy);
  }

  private partDistribution(part: RecipePart, path: string[]): Promise<number[] | null> | null {
    const portion = part.portions.find((item) => item.id === part.quantity_id);
    if (!portion) {
      return null;
    }
    return this.distribution(part.ingredient_version_id, portion, part.ratio, path);
  }

  private addDistribution(sums: number[], distribution: number[] | null): void {
    distribution?.forEach((value, index) => (sums[index] += value));
  }

  private scaleDistribution(sums: number[], energy: number): number[] | null {
    const total = sums.reduce((sum, value) => sum + value, 0);
    if (total === 0) {
      return energy === 0 ? sums : null;
    }
    return sums.map((value) => (value * energy) / total);
  }

  async forDate(date: string): Promise<IntakeRecord[]> {
    const { data, error } = await supabase
      .from('intakes')
      .select(
        'id,food_version_id,quantity_id,ratio,meal_type,consumed_at,food_versions!inner(name,kind,nova_group,quantities!inner(id,quantity_number,quantity_unit,is_reference,energy_kcal,carbs_g,fats_g,proteins_g))',
      )
      .eq('consumed_on', date)
      .order('created_at');
    if (error) {
      throw error;
    }
    return Promise.all(
      (data ?? []).map(async (row: Record<string, unknown>) => {
        const relation = row['food_versions'];
        const version = Array.isArray(relation)
          ? (relation[0] as Record<string, unknown> | undefined)
          : (relation as Record<string, unknown> | null);
        if (!version) {
          throw new Error('The food details for this journal entry could not be loaded.');
        }
        const quantities = version['quantities'];
        const portions = Array.isArray(quantities)
          ? (quantities as FoodPortion[])
          : quantities && typeof quantities === 'object'
            ? [quantities as FoodPortion]
            : [];
        const portion = portions.find((item) => item.id === row['quantity_id']);
        if (!portion) {
          throw new Error('The portion for this journal entry could not be loaded.');
        }
        return {
          id: String(row['id']),
          food_version_id: String(row['food_version_id']),
          quantity_id: String(row['quantity_id']),
          ratio: Number(row['ratio']),
          meal_type: String(row['meal_type']) as MealType,
          consumed_at: String(row['consumed_at']),
          food_name: String(version['name']),
          kind: String(version['kind']) as 'FOOD' | 'RECIPE',
          portion,
          nova_group: validNova(version['nova_group']),
          nova_calories: await this.distribution(
            String(row['food_version_id']),
            portion,
            Number(row['ratio']),
          ),
        };
      }),
    );
  }

  async add(userId: string, input: IntakeInput): Promise<string> {
    const { data, error } = await supabase
      .from('intakes')
      .insert({
        user_id: userId,
        food_version_id: input.foodVersionId,
        quantity_id: input.quantityId,
        ratio: input.ratio,
        meal_type: input.mealType,
        consumed_at: input.consumedAt,
      })
      .select('id')
      .single();
    if (error) {
      throw error;
    }
    return String(data.id);
  }

  async update(id: string, input: IntakeInput): Promise<void> {
    const { error } = await supabase
      .from('intakes')
      .update({
        food_version_id: input.foodVersionId,
        quantity_id: input.quantityId,
        ratio: input.ratio,
        meal_type: input.mealType,
        consumed_at: input.consumedAt,
      })
      .eq('id', id);
    if (error) {
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('intakes').delete().eq('id', id);
    if (error) {
      throw error;
    }
  }
}
