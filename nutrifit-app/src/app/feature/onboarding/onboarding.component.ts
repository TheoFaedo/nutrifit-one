import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NutritionFacts } from '../../core/models/nutrition-facts.model';
import { supabase } from '../../core/services/supabase.client';
import { BrandComponent } from '../../shared/ui/brand/brand.component';

type GoalPreset = 'lose' | 'maintain' | 'gain';
const presets: Record<GoalPreset, NutritionFacts> = {
  lose: NutritionFacts.from({ energy: 1800, carbs: 200, fats: 60, protein: 120 }),
  maintain: NutritionFacts.from({ energy: 2200, carbs: 275, fats: 73, protein: 110 }),
  gain: NutritionFacts.from({ energy: 2600, carbs: 325, fats: 87, protein: 130 }),
};

@Component({
  selector: 'app-onboarding-page',
  imports: [ReactiveFormsModule, BrandComponent],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.less',
})
export class OnboardingComponent {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly goals = [
    { id: 'lose' as const, icon: '↘', title: 'Lose weight', detail: 'A gentle calorie deficit' },
    { id: 'maintain' as const, icon: '↔', title: 'Maintain weight', detail: 'A steady, balanced routine' },
    { id: 'gain' as const, icon: '↗', title: 'Gain weight', detail: 'A little more fuel each day' },
  ];
  readonly selected = signal<GoalPreset>('maintain');
  readonly nutritionFacts = signal(presets.maintain);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly form = new FormGroup({
    nutritionFacts: new FormGroup({
      energy: new FormControl(presets.maintain.energy, { nonNullable: true, validators: [Validators.required, Validators.min(0), Validators.max(10000)] }),
      carbs: new FormControl(presets.maintain.carbs, { nonNullable: true, validators: [Validators.required, Validators.min(0), Validators.max(1000)] }),
      fats: new FormControl(presets.maintain.fats, { nonNullable: true, validators: [Validators.required, Validators.min(0), Validators.max(1000)] }),
      protein: new FormControl(presets.maintain.protein, { nonNullable: true, validators: [Validators.required, Validators.min(0), Validators.max(1000)] }),
    }),
  });

  constructor() {
    const factsForm = this.form.controls.nutritionFacts;
    factsForm.controls.energy.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((energy) => {
      this.updateNutritionFacts(this.nutritionFacts().withEnergy(this.asNumber(energy)));
    });
    factsForm.controls.carbs.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((carbs) => {
      this.updateNutritionFacts(this.nutritionFacts().withCarbs(this.asNumber(carbs)));
    });
    factsForm.controls.fats.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((fats) => {
      this.updateNutritionFacts(this.nutritionFacts().withFats(this.asNumber(fats)));
    });
    factsForm.controls.protein.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((protein) => {
      this.updateNutritionFacts(this.nutritionFacts().withProtein(this.asNumber(protein)));
    });
  }

  choose(goal: GoalPreset): void {
    this.selected.set(goal);
    this.updateNutritionFacts(presets[goal]);
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const nutritionFacts = this.nutritionFacts();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Your session has expired. Sign in again to continue.');
      const { error: saveError } = await supabase.rpc('complete_onboarding', {
        p_energy_kcal: nutritionFacts.energy,
        p_carbs_g: nutritionFacts.carbs,
        p_fats_g: nutritionFacts.fats,
        p_proteins_g: nutritionFacts.protein,
      });
      if (saveError) throw saveError;
      await this.router.navigateByUrl('/journal');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Your targets could not be saved. Please try again.');
      this.saving.set(false);
    }
  }

  private updateNutritionFacts(nutritionFacts: NutritionFacts): void {
    this.nutritionFacts.set(nutritionFacts);
    this.form.controls.nutritionFacts.setValue(nutritionFacts.toValues(), { emitEvent: false });
  }

  private asNumber(value: number | null): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }
}
