import { Component, computed, input, output, signal, inject } from '@angular/core';
import { I18nService } from '@core/i18n/i18n.service';
import { FoodRecord } from '@core/services/food-catalogue.service';

@Component({
  selector: 'app-food-search-list',
  template: `
    @if (showSearch()) {
      <label class="search"
        ><span>{{ searchLabel() }}</span
        ><input
          type="search"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
          [placeholder]="i18n.t('catalogue', 'searchFoods')"
          autofocus
      /></label>
    }
    <section class="results" [attr.aria-label]="i18n.t('catalogue', 'resultsLabel')">
      <h2>{{ i18n.t('catalogue', 'resultsLabel') }}</h2>
      <div class="results-list">
        @if (loading()) {
          <p class="muted" aria-live="polite">{{ i18n.t('catalogue', 'loading') }}</p>
        } @else if (matches().length === 0) {
          <p class="muted">{{ i18n.t('catalogue', 'noMatches') }}</p>
        } @else {
          @for (food of matches(); track food.id) {
            <button
              class="row"
              type="button"
              [class.active]="selectedId() === food.id"
              (click)="foodSelected.emit(food)"
            >
              <span
                ><strong>{{ food.name }}</strong
                ><small
                  >{{ i18n.t('foodEditor', food.kind === 'RECIPE' ? 'recipe' : 'food') }} ·
                  {{ food.portions.length }}
                  {{
                    i18n.t('catalogue', food.portions.length === 1 ? 'portion' : 'portions')
                  }}</small
                ></span
              ><span aria-hidden="true">›</span>
            </button>
          }
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .search {
        display: grid;
        gap: 7px;
        padding: 12px;
        color: var(--ink);
        font-size: 12px;
        font-weight: 600;
      }
      input {
        box-sizing: border-box;
        width: 100%;
        padding: 11px 12px;
        color: var(--ink);
        background: #fbfaf7;
        border: 1px solid var(--line);
        border-radius: 9px;
        font: inherit;
      }
      .results {
        margin-top: 16px;
      }
      .results h2 {
        margin: 0 8px 10px;
        color: var(--green-dark);
        font-size: 15px;
        font-weight: 700;
      }
      .results-list {
        max-height: clamp(300px, 65vh, 800px);
        overflow: auto;
      }
      .muted {
        padding: 10px;
        color: var(--muted);
        font-size: 13px;
      }
      .row {
        display: flex;
        width: 100%;
        justify-content: space-between;
        align-items: center;
        padding: 14px 12px;
        text-align: left;
        color: var(--ink);
        background: #fff;
        border: 1px solid var(--line);
        border-radius: 11px;
        cursor: pointer;
      }
      .row + .row {
        margin-top: 6px;
      }
      .row:hover,
      .row.active {
        background: #f1f2e8;
      }
      .row span:first-child {
        display: grid;
        gap: 5px;
      }
      small {
        color: var(--muted);
        font-size: 12px;
      }
      button:focus-visible,
      input:focus-visible {
        outline: 3px solid #879365;
        outline-offset: 2px;
      }
    `,
  ],
})
export class FoodSearchListComponent {
  readonly i18n = inject(I18nService);
  readonly foods = input<FoodRecord[]>([]);
  readonly loading = input(false);
  readonly selectedId = input<string | null>(null);
  readonly searchLabel = input('Search foods');
  readonly showSearch = input(true);
  readonly foodSelected = output<FoodRecord>();
  readonly query = signal('');
  readonly matches = computed(() => {
    const term = this.query().trim().toLocaleLowerCase();
    return this.foods().filter((food) => !term || food.name.toLocaleLowerCase().includes(term));
  });
}
