import { Injectable } from '@angular/core';
import { supabase } from './supabase.client';

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
  barcode: string | null;
  source: string | null;
  portions: FoodPortion[];
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
  barcode: string | null;
  portions: PortionInput[];
  foodId?: string;
  source?: string;
  sourcePayload?: unknown;
}

@Injectable({ providedIn: 'root' })
export class FoodCatalogueService {
  async search(term: string): Promise<FoodRecord[]> {
    let query = supabase.from('foods').select('id,author_id,is_public,food_versions!inner(id,version_number,name,product_details(barcode,source),quantities(id,quantity_number,quantity_unit,is_reference,energy_kcal,carbs_g,fats_g,proteins_g))')
      .eq('food_versions.is_current', true).order('name', { referencedTable: 'food_versions' }).limit(60);
    if (term.trim()) query = query.ilike('food_versions.name', `%${term.trim().replaceAll('%', '\\%')}%`);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => {
      const versions = row['food_versions'] as Record<string, unknown>[];
      const version = versions[0];
      const details = (version['product_details'] as Record<string, unknown>[] | null)?.[0];
      return {
        id: String(row['id']), author_id: String(row['author_id']), is_public: Boolean(row['is_public']),
        version_id: String(version['id']), version_number: Number(version['version_number']), name: String(version['name']),
        barcode: details?.['barcode'] ? String(details['barcode']) : null, source: details?.['source'] ? String(details['source']) : null,
        portions: (version['quantities'] as FoodPortion[]) ?? [],
      };
    });
  }

  async save(input: FoodInput): Promise<void> {
    const { error } = await supabase.rpc('save_food_snapshot', {
      p_name: input.name, p_is_public: input.isPublic, p_quantities: input.portions,
      p_food_id: input.foodId ?? null, p_barcode: input.barcode, p_source: input.source ?? null,
      p_source_payload: input.sourcePayload ?? null,
    });
    if (error) throw error;
  }

  async lookupBarcode(barcode: string): Promise<{ name: string; portions: PortionInput[]; payload: unknown } | null> {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_en,nutriments,serving_size,serving_quantity,product_quantity,product_quantity_unit`);
    if (!response.ok) throw new Error('Open Food Facts is temporarily unavailable. Local matches are still shown.');
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object') return null;
    const product = (payload as { product?: Record<string, unknown>; status?: number }).product;
    if (!product || (typeof product['product_name'] !== 'string' && typeof product['product_name_en'] !== 'string')) return null;
    const nutrients = (product['nutriments'] ?? {}) as Record<string, unknown>;
    const number = (...keys: string[]): number | null => {
      for (const key of keys) {
        const value = nutrients[key];
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
      }
      return null;
    };
    const calories = (suffix: '100g' | 'serving'): number | null => {
      const kcal = number(`energy-kcal_${suffix}`);
      if (kcal !== null) return kcal;
      const kj = number(`energy-kj_${suffix}`, `energy_${suffix}`);
      return kj === null ? null : kj / 4.184;
    };
    const makePortion = (amount: number, unit: string, suffix: '100g' | 'serving', fallback?: PortionInput): PortionInput => ({
      quantity_number: amount, quantity_unit: unit, is_reference: suffix === '100g',
      energy_kcal: calories(suffix) ?? fallback?.energy_kcal ?? null,
      carbs_g: number(`carbohydrates_${suffix}`, `carbs_${suffix}`) ?? fallback?.carbs_g ?? null,
      fats_g: number(`fat_${suffix}`, `fats_${suffix}`) ?? fallback?.fats_g ?? null,
      proteins_g: number(`proteins_${suffix}`, `protein_${suffix}`) ?? fallback?.proteins_g ?? null,
    });
    const unit = String(product['serving_size'] ?? '').match(/(?:^|\s)(g|kg|ml|l|piece|pieces|portion)\b/i)?.[1]?.toLowerCase();
    const amountFromLabel = String(product['serving_size'] ?? '').match(/([\d.,]+)\s*(?:g|kg|ml|l|piece|pieces|portion)\b/i)?.[1];
    const servingAmount = number('serving_quantity') ?? (amountFromLabel ? Number(amountFromLabel.replace(',', '.')) : null);
    const servingUnit = unit ?? (servingAmount !== null ? 'g' : null);
    const reference = makePortion(100, 'g', '100g');
    const portions = [reference];
    if (servingAmount !== null && servingAmount > 0 && servingUnit && !(servingAmount === 100 && servingUnit === 'g')) {
      const computedServing: PortionInput = {
        quantity_number: servingAmount, quantity_unit: servingUnit, is_reference: false,
        energy_kcal: reference.energy_kcal === null ? null : reference.energy_kcal * servingAmount / 100,
        carbs_g: reference.carbs_g === null ? null : reference.carbs_g * servingAmount / 100,
        fats_g: reference.fats_g === null ? null : reference.fats_g * servingAmount / 100,
        proteins_g: reference.proteins_g === null ? null : reference.proteins_g * servingAmount / 100,
      };
      portions.push(makePortion(servingAmount, servingUnit, 'serving', computedServing));
    }
    return {
      name: String(product['product_name'] ?? product['product_name_en']), payload, portions,
    };
  }
}
