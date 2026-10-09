import { Injectable } from '@angular/core';
import { supabase } from './supabase.client';
import { FoodPortion } from './food-catalogue.service';

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
}
export interface IntakeInput {
  foodVersionId: string;
  quantityId: string;
  ratio: number;
  mealType: MealType;
  consumedAt: string;
}

@Injectable({ providedIn: 'root' })
export class IntakeJournalService {
  async forDate(date: string): Promise<IntakeRecord[]> {
    const { data, error } = await supabase
      .from('intakes')
      .select(
        'id,food_version_id,quantity_id,ratio,meal_type,consumed_at,food_versions!inner(name,kind,quantities!inner(id,quantity_number,quantity_unit,is_reference,energy_kcal,carbs_g,fats_g,proteins_g))',
      )
      .eq('consumed_on', date)
      .order('created_at');
    if (error) {
      throw error;
    }
    return (data ?? []).map((row: Record<string, unknown>) => {
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
      };
    });
  }

  async add(userId: string, input: IntakeInput): Promise<void> {
    const { error } = await supabase.from('intakes').insert({
      user_id: userId,
      food_version_id: input.foodVersionId,
      quantity_id: input.quantityId,
      ratio: input.ratio,
      meal_type: input.mealType,
      consumed_at: input.consumedAt,
    });
    if (error) {
      throw error;
    }
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
