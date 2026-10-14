import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '@core/services/auth.service';
import {
  FoodCatalogueService,
  FoodCatalogueSort,
  FoodRecord,
  PortionInput,
} from '@core/services/food-catalogue.service';
import { BrandComponent } from '@shared/ui/brand/brand.component';
import { BottomNavComponent } from '@shared/ui/bottom-nav/bottom-nav.component';
import { FoodDetailsComponent } from '@shared/ui/food-details/food-details.component';
import { FOOD_CATALOGUE_SORT_OPTIONS } from '@shared/ui/food-catalogue-search/food-catalogue-search.component';
import { FoodCataloguePanelComponent } from '@shared/ui/food-catalogue-panel/food-catalogue-panel.component';
import { FoodEditorComponent } from '@shared/ui/food-editor/food-editor.component';
import { ModalDialogComponent } from '@shared/ui/modal-dialog/modal-dialog.component';
import { Subject, debounceTime, filter } from 'rxjs';
import { LanguageSwitchComponent } from '@shared/ui/language-switch/language-switch.component';
import { I18nService } from '@core/i18n/i18n.service';
import { Language } from '@core/i18n/translations';

@Component({
  selector: 'app-meal-page',
  imports: [
    BrandComponent,
    LanguageSwitchComponent,
    BottomNavComponent,
    FoodDetailsComponent,
    FoodCataloguePanelComponent,
    FoodEditorComponent,
    ModalDialogComponent,
  ],
  templateUrl: './meal.component.html',
  styleUrl: './meal.component.less',
})
export class MealComponent {
  private readonly catalogue = inject(FoodCatalogueService);
  private readonly auth = inject(AuthService);
  readonly i18n = inject(I18nService);
  readonly languageError = signal(false);
  readonly foods = signal<FoodRecord[]>([]);
  readonly selected = signal<FoodRecord | null>(null);
  readonly currentUserId = signal('');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly query = signal('');
  readonly sortOptions = FOOD_CATALOGUE_SORT_OPTIONS;
  readonly sortOrder = signal<FoodCatalogueSort>('asc');
  private readonly queryChanges = new Subject<string>();
  private searchGeneration = 0;
  readonly barcode = signal('');
  readonly offProduct = signal<{ name: string; portions: PortionInput[]; payload: unknown } | null>(
    null,
  );
  readonly editing = signal(false);
  readonly detailsOpen = signal(false);
  readonly editorKind = signal<'FOOD' | 'RECIPE'>('FOOD');
  readonly searchResults = computed(() => {
    const value = this.query().trim().toLocaleLowerCase();
    const barcode = this.barcode().trim();
    const matches = this.foods().filter((food) =>
      barcode ? food.barcode === barcode : !value || food.name.toLocaleLowerCase().includes(value),
    );
    const direction = this.sortOrder() === 'desc' ? -1 : 1;
    return this.sortOrder() === 'asc' || this.sortOrder() === 'desc'
      ? matches.sort((left, right) => direction * left.name.localeCompare(right.name))
      : matches;
  });
  setSortOrder(value: string): void {
    const sort: FoodCatalogueSort = ['recent', 'newest', 'asc', 'desc'].includes(value)
      ? (value as FoodCatalogueSort)
      : 'recent';
    this.sortOrder.set(sort);
    void this.load();
  }

  async languageChanged(language: Language): Promise<void> {
    this.languageError.set(false);
    try {
      const user = await this.auth.user();
      if (user) {
        await this.i18n.saveForUser(user.id, language);
      }
    } catch {
      this.languageError.set(true);
    }
  }

  constructor() {
    this.queryChanges
      .pipe(
        debounceTime(500),
        filter((value) => !/^\d{8,14}$/.test(value.trim())),
        takeUntilDestroyed(),
      )
      .subscribe(() => void this.load());
    void this.auth
      .user()
      .then((user) => this.currentUserId.set(user?.id ?? ''))
      .catch(() => undefined);
    void this.load();
  }

  async load(): Promise<void> {
    const generation = ++this.searchGeneration;
    this.loading.set(true);
    this.error.set('');
    try {
      const foods = await this.catalogue.search(this.query(), this.sortOrder());
      if (generation === this.searchGeneration) {
        this.foods.set(foods);
      }
    } catch (error) {
      if (generation === this.searchGeneration) {
        this.error.set(this.message(error, 'Foods could not be loaded.'));
      }
    } finally {
      if (generation === this.searchGeneration) {
        this.loading.set(false);
      }
    }
  }

  queryChanged(value: string): void {
    this.query.set(value);
    this.barcode.set('');
    this.offProduct.set(null);
    this.searchGeneration++;
    this.queryChanges.next(value);
    if (/^\d{8,14}$/.test(value.trim())) {
      void this.lookupBarcode();
    }
  }
  async scannedBarcode(code: string): Promise<void> {
    this.query.set(code);
    this.queryChanges.next(code);
    await this.lookupBarcode();
  }
  select(food: FoodRecord): void {
    this.selected.set(food);
    this.editing.set(false);
    this.detailsOpen.set(true);
    this.error.set('');
  }
  newFood(): void {
    this.selected.set(null);
    this.editorKind.set('FOOD');
    this.editing.set(true);
    this.detailsOpen.set(true);
    this.error.set('');
  }

  editorSaved(food: FoodRecord): void {
    const wasEditing = Boolean(this.selected());
    this.closeEditor();
    void this.load().then(() => {
      if (wasEditing) {
        const fresh = this.foods().find((item) => item.id === food.id) ?? food;
        this.select(fresh);
      } else {
        this.selected.set(null);
      }
    });
  }

  closeEditor(): void {
    this.editing.set(false);
    if (!this.selected()) {
      this.detailsOpen.set(false);
    }
  }

  edit(food: FoodRecord): void {
    this.selected.set(food);
    this.editing.set(true);
    this.detailsOpen.set(true);
    this.error.set('');
  }

  async lookupBarcode(): Promise<void> {
    this.error.set('');
    this.offProduct.set(null);
    const code = this.query().trim();
    if (!code) {
      this.error.set('Enter a barcode first.');
      return;
    }
    this.barcode.set(code);
    const generation = ++this.searchGeneration;
    this.loading.set(true);
    try {
      const foods = await this.catalogue.search('', this.sortOrder());
      if (generation === this.searchGeneration) {
        this.foods.set(foods);
      }
    } catch {
      // The external lookup can still be useful if local search is unavailable.
    }
    try {
      const product = await this.catalogue.lookupBarcode(code);
      if (generation === this.searchGeneration) {
        this.offProduct.set(product);
      }
    } catch (error) {
      if (generation === this.searchGeneration) {
        this.error.set(
          this.message(error, 'Open Food Facts is unavailable. Local matches remain available.'),
        );
      }
    } finally {
      if (generation === this.searchGeneration) {
        this.loading.set(false);
      }
    }
  }

  importOff(): void {
    const product = this.offProduct();
    if (!product) {
      return;
    }
    this.newFood();
  }

  private message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
