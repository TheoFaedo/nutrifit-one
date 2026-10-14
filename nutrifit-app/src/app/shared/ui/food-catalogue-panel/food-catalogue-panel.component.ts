import { Component, input, output } from '@angular/core';
import {
  FoodRecord,
  FoodCatalogueSort,
  PortionInput,
} from '@core/services/food-catalogue.service';
import {
  FoodCatalogueSearchComponent,
  FoodSortOption,
} from '../food-catalogue-search/food-catalogue-search.component';
import { FoodSearchListComponent } from '../food-search-list/food-search-list.component';

@Component({
  selector: 'app-food-catalogue-panel',
  imports: [FoodCatalogueSearchComponent, FoodSearchListComponent],
  template: `
    <app-food-catalogue-search
      groupLabel="Search the catalogue"
      searchLabel="Search by name or barcode"
      placeholder="Food name or barcode"
      sortLabel="Sort by"
      [query]="query()"
      [sort]="sort()"
      [sortOptions]="sortOptions()"
      (queryChanged)="queryChanged.emit($event)"
      (sortChanged)="sortChanged.emit($event)"
      (barcodeDetected)="barcodeDetected.emit($event)"
    />
    <hr aria-label="Search results" />
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (offProduct(); as product) {
      <article class="off-result">
        <div>
          <span class="eyebrow">Open Food Facts</span>
          <h2>{{ product.name }}</h2>
          <p>
            {{ product.portions.length }} portion{{ product.portions.length === 1 ? '' : 's' }}
            with nutrition data when available · External product data
          </p>
        </div>
        <button class="secondary-button" type="button" (click)="importProduct.emit()">
          Use this product
        </button>
      </article>
    }
    <app-food-search-list
      [foods]="foods()"
      [showSearch]="false"
      [loading]="loading()"
      [selectedId]="selectedId()"
      (foodSelected)="foodSelected.emit($event)"
    />
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        padding: 18px;
        background: #fff;
        border: 1px solid var(--line);
        border-radius: 18px;
        overflow: hidden;
      }
      hr {
        border: 0;
        border-top: 1px solid var(--line);
        margin: 16px 0 8px;
      }
      .error {
        padding: 11px 14px;
        color: #8d312c;
        background: #fff0ed;
        border-radius: 10px;
        font-size: 13px;
      }
      .off-result {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        padding: 16px;
        margin: 10px 0;
        background: #f1f2e8;
        border-radius: 14px;
      }
      .off-result h2 {
        margin: 5px 0;
        font-size: 18px;
      }
      .off-result p {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
      }
      .eyebrow {
        color: #68714c;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .secondary-button {
        min-height: 42px;
        padding: 0 16px;
        color: var(--ink);
        background: #fff;
        border: 1px solid var(--line);
        border-radius: 999px;
        font: inherit;
        font-size: 12px;
        font-weight: 650;
        cursor: pointer;
      }
      @media (max-width: 540px) {
        :host {
          padding: 13px;
        }
        .off-result {
          align-items: flex-start;
          flex-direction: column;
        }
      }
    `,
  ],
})
export class FoodCataloguePanelComponent {
  readonly query = input('');
  readonly sort = input<FoodCatalogueSort>('recent');
  readonly sortOptions = input.required<readonly FoodSortOption[]>();
  readonly foods = input<FoodRecord[]>([]);
  readonly loading = input(false);
  readonly error = input('');
  readonly selectedId = input<string | null>(null);
  readonly offProduct = input<{
    name: string;
    portions: PortionInput[];
    payload: unknown;
  } | null>(null);
  readonly queryChanged = output<string>();
  readonly sortChanged = output<string>();
  readonly barcodeDetected = output<string>();
  readonly foodSelected = output<FoodRecord>();
  readonly importProduct = output<void>();
}
