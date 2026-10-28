import { Service } from '@angular/core';
import { supabase } from './supabase.client';

export function validNova(value: unknown): number | null {
  if (typeof value === 'string' && /^[1-4]$/.test(value)) {
    return Number(value);
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 4) {
    return null;
  }
  return value;
}

export interface FoodPortion {
  id: string;
  quantity_number: number;
  quantity_unit: string;
  is_reference: boolean;
  energy_kcal: number | null;
  carbs_g: number | null;
  fats_g: number | null;
  proteins_g: number | null;
}

export interface FoodRecord {
  id: string;
  author_id: string;
  is_public: boolean;
  version_id: string;
  version_number: number;
  name: string;
  kind: 'FOOD' | 'RECIPE';
  nova_group?: number | null;
  barcode: string | null;
  source: string | null;
  portions: FoodPortion[];
  parts: RecipePart[];
}

export type FoodCatalogueSort = 'recent' | 'newest' | 'asc' | 'desc';
const foodSelect =
  'id,author_id,is_public,food_versions!inner(id,version_number,name,kind,nova_group,product_details(barcode,source),quantities(id,quantity_number,quantity_unit,is_reference,energy_kcal,carbs_g,fats_g,proteins_g),recipe_parts!recipe_parts_recipe_version_id_fkey(id,ingredient_version_id,quantity_id,ratio,ingredient:food_versions!recipe_parts_ingredient_version_id_fkey(id,name,kind,quantities(id,quantity_number,quantity_unit,is_reference,energy_kcal,carbs_g,fats_g,proteins_g))))';

export interface RecipePart {
  ingredient_version_id: string;
  quantity_id: string;
  ratio: number;
  ingredient_name: string;
  ingredient_kind: 'FOOD' | 'RECIPE';
  portions: FoodPortion[];
}
export interface RecipePartInput {
  ingredient_version_id: string;
  quantity_id: string;
  ratio: number;
}
export interface RecipeInput {
  name: string;
  isPublic: boolean;
  referenceQuantity: number;
  referenceUnit: string;
  parts: RecipePartInput[];
  foodId?: string;
}

export interface PortionInput {
  quantity_number: number;
  quantity_unit: string;
  is_reference: boolean;
  energy_kcal: number | null;
  carbs_g: number | null;
  fats_g: number | null;
  proteins_g: number | null;
}

export interface FoodInput {
  name: string;
  isPublic: boolean;
  novaGroup?: number | null;
  barcode: string | null;
  portions: PortionInput[];
  foodId?: string;
  source?: string;
  sourcePayload?: unknown;
}

@Service()
export class FoodCatalogueService {
  async search(term: string, sort: FoodCatalogueSort = 'asc'): Promise<FoodRecord[]> {
    return this.journalPage(term, sort, 0, 100);
  }

  async journalPage(
    term: string,
    sort: FoodCatalogueSort,
    offset: number,
    limit = 20,
    barcode: string | null = null,
  ): Promise<FoodRecord[]> {
    const { data: ids, error: idsError } = await supabase.rpc('journal_food_ids', {
      p_term: term,
      p_sort: sort,
      p_offset: offset,
      p_limit: limit,
      p_barcode: barcode,
    });
    if (idsError) {
      throw idsError;
    }
    const orderedIds = (ids ?? []).map((row: { food_id: string }) => row.food_id);
    if (!orderedIds.length) {
      return [];
    }
    const { data, error } = await supabase
      .from('foods')
      .select(foodSelect)
      .in('id', orderedIds)
      .eq('food_versions.is_current', true);
    if (error) {
      throw error;
    }
    const byId = new Map(this.mapFoods(data ?? []).map((food) => [food.id, food]));
    return orderedIds
      .map((id: string) => byId.get(id))
      .filter((food: FoodRecord | undefined): food is FoodRecord => Boolean(food));
  }

  async version(versionId: string): Promise<FoodRecord | null> {
    const { data, error } = await supabase
      .from('foods')
      .select(foodSelect)
      .eq('food_versions.id', versionId)
      .limit(1);
    if (error) {
      throw error;
    }
    return this.mapFoods(data ?? [])[0] ?? null;
  }

  async current(foodId: string): Promise<FoodRecord | null> {
    const { data, error } = await supabase
      .from('foods')
      .select(foodSelect)
      .eq('id', foodId)
      .eq('food_versions.is_current', true)
      .limit(1);
    if (error) {
      throw error;
    }
    return this.mapFoods(data ?? [])[0] ?? null;
  }

  private mapFoods(rows: Record<string, unknown>[]): FoodRecord[] {
    return rows.map((row: Record<string, unknown>) => {
      const versions = row['food_versions'] as Record<string, unknown>[];
      const version = versions[0];
      const details = (version['product_details'] as Record<string, unknown>[] | null)?.[0];
      return {
        id: String(row['id']),
        author_id: String(row['author_id']),
        is_public: Boolean(row['is_public']),
        version_id: String(version['id']),
        version_number: Number(version['version_number']),
        name: String(version['name']),
        kind: String(version['kind'] ?? 'FOOD') as 'FOOD' | 'RECIPE',
        nova_group: validNova(version['nova_group']),
        barcode: details?.['barcode'] ? String(details['barcode']) : null,
        source: details?.['source'] ? String(details['source']) : null,
        portions: (version['quantities'] as FoodPortion[]) ?? [],
        parts: ((version['recipe_parts'] as Record<string, unknown>[] | undefined) ?? []).map(
          (part) => {
            const ingredient = part['ingredient'] as Record<string, unknown>;
            return {
              ingredient_version_id: String(part['ingredient_version_id']),
              quantity_id: String(part['quantity_id']),
              ratio: Number(part['ratio']),
              ingredient_name: String(ingredient['name']),
              ingredient_kind: String(ingredient['kind']) as 'FOOD' | 'RECIPE',
              portions: (ingredient['quantities'] as FoodPortion[]) ?? [],
            };
          },
        ),
      };
    });
  }

  async save(input: FoodInput): Promise<string> {
    const { data, error } = await supabase.rpc('save_food_snapshot', {
      p_name: input.name,
      p_nova_group: input.novaGroup ?? null,
      p_is_public: input.isPublic,
      p_quantities: input.portions,
      p_food_id: input.foodId ?? null,
      p_barcode: input.barcode,
      p_source: input.source ?? null,
      p_source_payload: input.sourcePayload ?? null,
    });
    if (error) {
      throw error;
    }
    return String(data);
  }

  async saveRecipe(input: RecipeInput): Promise<string> {
    const { data, error } = await supabase.rpc('save_recipe_snapshot', {
      p_name: input.name,
      p_is_public: input.isPublic,
      p_reference_quantity: input.referenceQuantity,
      p_reference_unit: input.referenceUnit,
      p_parts: input.parts,
      p_food_id: input.foodId ?? null,
    });
    if (error) {
      throw error;
    }
    return String(data);
  }

  async lookupBarcode(
    barcode: string,
  ): Promise<{
    name: string;
    portions: PortionInput[];
    payload: unknown;
    novaGroup: number | null;
  } | null> {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=nova_group,product_name,product_name_en,product_name_fr,nutriments,nutrition_data_per,serving_size,serving_quantity,serving_quantity_unit,product_quantity,product_quantity_unit`,
    );
    // Open Food Facts returns 404 when a barcode has no matching product.
    // Treat that as an empty result; reserve the error for actual service failures.
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error('Open Food Facts is temporarily unavailable. Local matches are still shown.');
    }
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const product = (payload as { product?: Record<string, unknown>; status?: number }).product;
    const productName = [
      product?.['product_name'],
      product?.['product_name_fr'],
      product?.['product_name_en'],
    ].find((name): name is string => typeof name === 'string' && name.trim().length > 0);
    if (!product || !productName) {
      return null;
    }
    const nutrients = (product['nutriments'] ?? {}) as Record<string, unknown>;
    const number = (...keys: string[]): number | null => {
      for (const key of keys) {
        const value = nutrients[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
          return value;
        }
        if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
          return Number(value);
        }
      }
      return null;
    };
    const calories = (suffix: '100g' | 'serving'): number | null => {
      const baseEnergyKeys = suffix === '100g' ? ['energy-kcal'] : [];
      const kcal = number(`energy-kcal_${suffix}`, ...baseEnergyKeys);
      if (kcal !== null) {
        return kcal;
      }
      const baseKjKeys = suffix === '100g' ? ['energy-kj', 'energy'] : [];
      const kj = number(`energy-kj_${suffix}`, `energy_${suffix}`, ...baseKjKeys);
      return kj === null ? null : kj / 4.184;
    };
    const makePortion = (
      amount: number,
      unit: string,
      suffix: '100g' | 'serving',
      fallback?: PortionInput,
    ): PortionInput => {
      const baseMacroKeys = suffix === '100g';
      return {
        quantity_number: amount,
        quantity_unit: unit,
        is_reference: suffix === '100g',
        energy_kcal: calories(suffix) ?? fallback?.energy_kcal ?? null,
        carbs_g:
          number(
            `carbohydrates_${suffix}`,
            `carbs_${suffix}`,
            ...(baseMacroKeys ? ['carbohydrates', 'carbs'] : []),
          ) ??
          fallback?.carbs_g ??
          null,
        fats_g:
          number(`fat_${suffix}`, `fats_${suffix}`, ...(baseMacroKeys ? ['fat', 'fats'] : [])) ??
          fallback?.fats_g ??
          null,
        proteins_g:
          number(
            `proteins_${suffix}`,
            `protein_${suffix}`,
            ...(baseMacroKeys ? ['proteins', 'protein'] : []),
          ) ??
          fallback?.proteins_g ??
          null,
      };
    };
    const unit = String(product['serving_quantity_unit'] ?? product['serving_size'] ?? '')
      .match(/(?:^|\s|\d)(g|kg|ml|l|piece|pieces|portion)\b/i)?.[1]
      ?.toLowerCase();
    const amountFromLabel = String(product['serving_size'] ?? '').match(
      /([\d.,]+)\s*(?:g|kg|ml|l|piece|pieces|portion)\b/i,
    )?.[1];
    const productNumber = (...keys: string[]): number | null => {
      for (const key of keys) {
        const value = product[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
          return value;
        }
        if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
          return Number(value);
        }
      }
      return null;
    };
    const servingAmount =
      productNumber('serving_quantity') ??
      (amountFromLabel ? Number(amountFromLabel.replace(',', '.')) : null);
    const productAmount = productNumber('product_quantity');
    const productUnit = String(product['product_quantity_unit'] ?? '')
      .trim()
      .toLowerCase();
    const portionAmount = servingAmount ?? productAmount;
    const servingUnit = unit ?? (productUnit || (portionAmount !== null ? 'g' : null));
    const referenceUnit =
      String(product['nutrition_data_per'] ?? '')
        .match(/(?:^|[^a-z])(ml|g)\s*$/i)?.[1]
        ?.toLowerCase() ?? 'g';
    const reference = makePortion(100, referenceUnit, '100g');
    const portions = [reference];
    if (
      portionAmount !== null &&
      portionAmount > 0 &&
      servingUnit &&
      !(portionAmount === 100 && servingUnit === referenceUnit)
    ) {
      const computedServing: PortionInput = {
        quantity_number: portionAmount,
        quantity_unit: servingUnit,
        is_reference: false,
        energy_kcal:
          reference.energy_kcal === null ? null : (reference.energy_kcal * portionAmount) / 100,
        carbs_g: reference.carbs_g === null ? null : (reference.carbs_g * portionAmount) / 100,
        fats_g: reference.fats_g === null ? null : (reference.fats_g * portionAmount) / 100,
        proteins_g:
          reference.proteins_g === null ? null : (reference.proteins_g * portionAmount) / 100,
      };
      portions.push(makePortion(portionAmount, servingUnit, 'serving', computedServing));
    }
    return {
      name: productName.trim(),
      novaGroup: validNova(product['nova_group']),
      payload,
      portions,
    };
  }
}
