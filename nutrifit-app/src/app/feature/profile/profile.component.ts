import { DiscardedCacheResponse } from '@core/stores/keyed-cache';
import { CacheSession } from '@core/stores/cache-session.service';
import { DailyGoalsStore } from '@core/stores/daily-goals.store';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, map, merge, tap } from 'rxjs';
import { NutritionFacts } from '@core/models/nutrition-facts.model';
import type { NutritionFactsValues } from '@core/models/nutrition-facts.model';
import { AuthService } from '@core/services/auth.service';
import { BrandComponent } from '@shared/ui/brand/brand.component';
import { BottomNavComponent } from '@shared/ui/bottom-nav/bottom-nav.component';
import { AppUpdateComponent } from './app-update/app-update.component';
import { LanguageSwitchComponent } from '@shared/ui/language-switch/language-switch.component';
import { I18nService } from '@core/i18n/i18n.service';
import { Language } from '@core/i18n/translations';

@Component({
  selector: 'app-profile-page',
  imports: [
    ReactiveFormsModule,
    BrandComponent,
    BottomNavComponent,
    AppUpdateComponent,
    LanguageSwitchComponent,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.less',
})
export class ProfileComponent {
  private readonly session = inject(CacheSession);
  private readonly auth = inject(AuthService);
  private readonly goalsService = inject(DailyGoalsStore);
  readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);
  readonly name = signal('');
  readonly avatar = signal('');
  readonly loading = computed(() => this.goalsService.peek(this.parisDate()).isLoading);
  readonly refreshing = computed(() => this.goalsService.peek(this.parisDate()).isRefreshing);
  readonly loadError = computed(() => this.goalsService.peek(this.parisDate()).error);
  readonly saving = signal(false);
  readonly signingOut = signal(false);
  readonly updatingTargets = signal(false);
  readonly error = signal('');
  readonly languageError = signal(false);
  private languageUserId: string | null = null;
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
    let generation = this.session.generation();
    effect(() => {
      const next = this.session.generation();
      if (next === generation) {
        return;
      }
      generation = next;
      this.name.set('');
      this.avatar.set('');
      this.savedTargets.set(null);
      this.form.reset({ energy: 0, carbs: 0, fats: 0, protein: 0 }, { emitEvent: false });
      this.recalculationVersion++;
    });
    effect(() => {
      const goal = this.goalsService.peek(this.parisDate()).data;
      if (!goal) {
        return;
      }
      const targets = NutritionFacts.from({
        energy: goal.energy_kcal,
        carbs: goal.carbs_g,
        fats: goal.fats_g,
        protein: goal.proteins_g,
      }).toValues();
      this.savedTargets.set(targets);
      if (!this.form.dirty) {
        this.facts = NutritionFacts.from(targets);
        this.form.setValue(targets, { emitEvent: false });
      }
    });
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
      this.form.markAsPristine();
      this.savedTargets.set(value);
      this.saved.set(true);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.t('profile', 'saveFailed'));
    } finally {
      this.saving.set(false);
    }
  }

  async languageChanged(language: Language): Promise<void> {
    this.languageError.set(false);
    try {
      const user = await this.auth.user();
      if (!user) {
        throw new Error('No session');
      }
      this.languageUserId = user.id;
      await this.i18n.saveForUser(user.id, language);
    } catch {
      this.languageError.set(true);
    }
  }

  async retryLanguageSave(): Promise<void> {
    if (!this.languageUserId) {
      return;
    }
    await this.languageChanged(this.i18n.language());
  }

  restoreSavedTargets(): void {
    const targets = this.savedTargets();
    if (!targets || this.saving()) {
      return;
    }
    this.recalculationVersion += 1;
    this.facts = NutritionFacts.from(targets);
    this.form.setValue(targets, { emitEvent: false });
    this.form.markAsPristine();
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
        error instanceof Error ? error.message : this.i18n.t('profile', 'signoutFailed'),
      );
      this.signingOut.set(false);
    }
  }

  async load(): Promise<void> {
    this.error.set('');
    const generation = this.session.generation();
    try {
      const request = this.goalsService.forDate(this.parisDate());
      void request.catch(() => undefined);
      const user = await this.auth.user();
      if (generation !== this.session.generation()) {
        return;
      }
      this.name.set(
        String(
          user?.user_metadata['full_name'] ?? user?.user_metadata['name'] ?? user?.email ?? '',
        ),
      );
      this.avatar.set(
        String(user?.user_metadata['avatar_url'] ?? user?.user_metadata['picture'] ?? ''),
      );
      const goal = await request;
      if (!goal) {
        throw new Error(this.i18n.t('profile', 'missingTargets'));
      }
    } catch (error) {
      if (generation !== this.session.generation() || error instanceof DiscardedCacheResponse) {
        return;
      }
      this.error.set(error instanceof Error ? error.message : this.i18n.t('profile', 'loadFailed'));
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
