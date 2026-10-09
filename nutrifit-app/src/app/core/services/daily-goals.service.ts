import { Injectable } from '@angular/core';
import { supabase } from './supabase.client';

export interface DailyGoal {
  energy_kcal: number;
  carbs_g: number;
  fats_g: number;
  proteins_g: number;
}

@Injectable({ providedIn: 'root' })
export class DailyGoalsService {
  async forDate(date: string): Promise<DailyGoal | null> {
    const { data, error } = await supabase
      .from('daily_goals')
      .select('energy_kcal,carbs_g,fats_g,proteins_g')
      .lte('valid_from', date)
      .or(`valid_to.is.null,valid_to.gte.${date}`)
      .order('valid_from', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw error;
    }
    return data;
  }

  async save(goal: DailyGoal): Promise<void> {
    const { error } = await supabase.rpc('update_daily_goal', {
      p_energy_kcal: goal.energy_kcal,
      p_carbs_g: goal.carbs_g,
      p_fats_g: goal.fats_g,
      p_proteins_g: goal.proteins_g,
    });
    if (error) {
      throw error;
    }
  }
}
