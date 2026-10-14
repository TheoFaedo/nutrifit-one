import { Component, inject, input, output } from '@angular/core';
import { BarcodeScannerComponent } from '../barcode-scanner/barcode-scanner.component';
import { I18nService } from '@core/i18n/i18n.service';

export interface FoodSortOption {
  value: string;
  label: string;
}

export const FOOD_CATALOGUE_SORT_OPTIONS = [
  { value: 'recent', label: 'Recently used' },
  { value: 'newest', label: 'Newest created' },
  { value: 'asc', label: 'Name A–Z' },
  { value: 'desc', label: 'Name Z–A' },
] as const satisfies readonly FoodSortOption[];

@Component({
  selector: 'app-food-catalogue-search',
  imports: [BarcodeScannerComponent],
  template: `
    <div
      class="controls"
      role="group"
      [attr.aria-label]="groupLabel() || i18n.t('catalogue', 'searchGroup')"
    >
      <label class="search-field">
        <span>{{ searchLabel() || i18n.t('catalogue', 'searchLabel') }}</span>
        <input
          type="search"
          [value]="query()"
          (input)="queryChanged.emit($any($event.target).value)"
          (keyup.enter)="searchRequested.emit()"
          inputmode="search"
          [placeholder]="placeholder() || i18n.t('catalogue', 'searchPlaceholder')"
        />
      </label>
      <label class="sort-field">
        <span>{{ sortLabel() || i18n.t('catalogue', 'sort') }}</span>
        <select [value]="sort()" (change)="sortChanged.emit($any($event.target).value)">
          @for (option of sortOptions(); track option.value) {
            <option [value]="option.value">
              {{ i18n.t('catalogue', sortTranslationKey(option.value)) }}
            </option>
          }
        </select>
      </label>
      <app-barcode-scanner (detected)="barcodeDetected.emit($event)" />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .controls {
        display: flex;
        flex-wrap: wrap;
        align-items: end;
        gap: 10px;
      }
      .search-field,
      .sort-field {
        display: grid;
        gap: 7px;
        min-width: 0;
        color: var(--ink);
        font-size: 12px;
        font-weight: 600;
      }
      .search-field {
        flex: 1 1 220px;
      }
      .sort-field {
        flex: 0 1 150px;
      }
      input,
      select {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        padding: 11px 12px;
        border: 1px solid var(--line);
        border-radius: 9px;
        color: var(--ink);
        background: #fbfaf7;
        font: inherit;
        font-size: 14px;
      }
      select {
        cursor: pointer;
      }
      input:focus-visible,
      select:focus-visible {
        outline: 3px solid #879365;
        outline-offset: 2px;
      }
      @media (max-width: 540px) {
        .controls {
          align-items: stretch;
          flex-direction: column;
        }
        .search-field,
        .sort-field {
          width: 100%;
          flex-basis: auto;
        }
      }
    `,
  ],
})
export class FoodCatalogueSearchComponent {
  readonly i18n = inject(I18nService);
  readonly groupLabel = input('');
  readonly searchLabel = input('');
  readonly placeholder = input('');
  readonly sortLabel = input('');
  readonly query = input('');
  readonly sort = input('');
  readonly sortOptions = input.required<readonly FoodSortOption[]>();
  readonly searching = input(false);
  readonly queryChanged = output<string>();
  readonly sortChanged = output<string>();
  readonly searchRequested = output<void>();
  readonly barcodeDetected = output<string>();

  sortTranslationKey(value: string): string {
    return value === 'recent'
      ? 'recentlyUsed'
      : value === 'newest'
        ? 'newest'
        : value === 'asc'
          ? 'nameAsc'
          : 'nameDesc';
  }
}
