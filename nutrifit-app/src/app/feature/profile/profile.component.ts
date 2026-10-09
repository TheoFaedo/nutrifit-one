import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, map, merge, tap } from 'rxjs';
import { NutritionFacts } from '../../core/models/nutrition-facts.model';
import type { NutritionFactsValues } from '../../core/models/nutrition-facts.model';
import { AuthService } from '../../core/services/auth.service';
import { DailyGoalsService } from '../../core/services/daily-goals.service';
import { BrandComponent } from '../../shared/ui/brand/brand.component';
import { BottomNavComponent } from '../../shared/ui/bottom-nav/bottom-nav.component';

@Component({
  selector: 'app-profile-page',
  imports: [ReactiveFormsModule, BrandComponent, BottomNavComponent],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.less',
})
export class ProfileComponent {
  private readonly auth = inject(AuthService);
  private readonly goalsService = inject(DailyGoalsService);
  private readonly destroyRef = inject(DestroyRef);
  readonly name = signal('');
  readonly avatar = signal('');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly signingOut = signal(false);
  readonly updatingTargets = signal(false);
  readonly error = signal('');
  readonly saved = signal(false);
  readonly savedTargets = signal<NutritionFactsValues | null>(null);
  readonly form = new FormGroup({
    energy: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(10000)],
    }),
    carbs: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(1000)],
    }),
    fats: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(1000)],
    }),
    protein: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(1000)],
    }),
  });
  private facts = NutritionFacts.from({ energy: 0, carbs: 0, fats: 0, protein: 0 });
  private recalculationVersion = 0;

  constructor() {
    merge(
      this.form.controls.energy.valueChanges.pipe(map(() => 'energy' as const)),
      this.form.controls.carbs.valueChanges.pipe(map(() => 'carbs' as const)),
      this.form.controls.fats.valueChanges.pipe(map(() => 'fats' as const)),
      this.form.controls.protein.valueChanges.pipe(map(() => 'protein' as const)),
    )
      .pipe(
        map((field) => ({ field, version: this.recalculationVersion })),
        tap(() => this.updatingTargets.set(true)),
        debounceTime(800),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ field, version }) => {
        if (version !== this.recalculationVersion) {
          return;
        }
        if (this.form.invalid) {
          this.updatingTargets.set(false);
          return;
        }
        const current = this.form.getRawValue();
        this.facts = NutritionFacts.from(current);
        if (field === 'energy') {
          this.facts = this.facts.withEnergy(current.energy);
        }
        if (field === 'carbs') {
          this.facts = this.facts.withCarbs(current.carbs);
        }
        if (field === 'fats') {
          this.facts = this.facts.withFats(current.fats);
        }
        if (field === 'protein') {
          this.facts = this.facts.withProtein(current.protein);
        }
        this.form.setValue(this.facts.toValues(), { emitEvent: false });
        this.updatingTargets.set(false);
      });
    void this.load();
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving() || this.updatingTargets()) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.saved.set(false);
    try {
      const value = this.form.getRawValue();
      await this.goalsService.save({
        energy_kcal: value.energy,
        carbs_g: value.carbs,
        fats_g: value.fats,
        proteins_g: value.protein,
      });
      this.savedTargets.set(value);
      this.saved.set(true);
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Your targets could not be saved. Please try again.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  restoreSavedTargets(): void {
    const targets = this.savedTargets();
    if (!targets || this.saving()) {
      return;
    }
    this.recalculationVersion += 1;
    this.facts = NutritionFacts.from(targets);
    this.form.setValue(targets, { emitEvent: false });
    this.updatingTargets.set(false);
    this.error.set('');
    this.saved.set(false);
  }

  async signOut(): Promise<void> {
    if (this.signingOut()) {
      return;
    }
    this.signingOut.set(true);
    this.error.set('');
    try {
      await this.auth.signOut();
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'You could not be signed out. Please try again.',
      );
      this.signingOut.set(false);
    }
  }

  private async load(): Promise<void> {
    try {
      const user = await this.auth.user();
      this.name.set(
        String(
          user?.user_metadata['full_name'] ?? user?.user_metadata['name'] ?? user?.email ?? '',
        ),
      );
      this.avatar.set(
        String(user?.user_metadata['avatar_url'] ?? user?.user_metadata['picture'] ?? ''),
      );
      const goal = await this.goalsService.forDate(this.parisDate());
      if (!goal) {
        throw new Error('No daily targets were found.');
      }
      this.facts = NutritionFacts.from({
        energy: Number(goal.energy_kcal),
        carbs: Number(goal.carbs_g),
        fats: Number(goal.fats_g),
        protein: Number(goal.proteins_g),
      });
      const targets = this.facts.toValues();
      this.savedTargets.set(targets);
      this.form.setValue(targets, { emitEvent: false });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Your profile could not be loaded.');
    } finally {
      this.loading.set(false);
    }
  }

  private parisDate(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }
}
