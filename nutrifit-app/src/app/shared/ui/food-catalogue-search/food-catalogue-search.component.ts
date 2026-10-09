import { Component, input, output } from '@angular/core';
import { BarcodeScannerComponent } from '../barcode-scanner/barcode-scanner.component';

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
    <div class="controls" role="group" [attr.aria-label]="groupLabel()">
      <label class="search-field">
        <span>{{ searchLabel() }}</span>
        <input
          type="search"
          [value]="query()"
          (input)="queryChanged.emit($any($event.target).value)"
          (keyup.enter)="searchRequested.emit()"
          inputmode="search"
          [placeholder]="placeholder()"
        />
      </label>
      <label class="sort-field">
        <span>{{ sortLabel() }}</span>
        <select [value]="sort()" (change)="sortChanged.emit($any($event.target).value)">
          @for (option of sortOptions(); track option.value) {
            <option [value]="option.value">{{ option.label }}</option>
          }
        </select>
      </label>
      <app-barcode-scanner (detected)="barcodeDetected.emit($event)" />
      <button
        class="search-button"
        type="button"
        [disabled]="searching()"
        (click)="searchRequested.emit()"
      >
        {{ searching() ? 'Searching…' : 'Search' }}
      </button>
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
      .search-button {
        display: inline-flex;
        min-height: 42px;
        align-items: center;
        justify-content: center;
        padding: 0 16px;
        border: 1px solid var(--line);
        border-radius: 999px;
        color: var(--ink);
        background: #fff;
        font: inherit;
        font-size: 12px;
        font-weight: 650;
        cursor: pointer;
      }
      .search-button:hover:not(:disabled) {
        border-color: #aab99d;
        background: #f0f4e8;
      }
      .search-button:disabled {
        opacity: 0.55;
        cursor: wait;
      }
      input:focus-visible,
      select:focus-visible,
      .search-button:focus-visible {
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
        .search-button {
          width: 100%;
        }
      }
    `,
  ],
})
export class FoodCatalogueSearchComponent {
  readonly groupLabel = input('Search the food catalogue');
  readonly searchLabel = input('Search foods, recipes, or barcode');
  readonly placeholder = input('Enter a name or barcode');
  readonly sortLabel = input('Sort foods');
  readonly query = input('');
  readonly sort = input('');
  readonly sortOptions = input.required<readonly FoodSortOption[]>();
  readonly searching = input(false);
  readonly queryChanged = output<string>();
  readonly sortChanged = output<string>();
  readonly searchRequested = output<void>();
  readonly barcodeDetected = output<string>();
}
