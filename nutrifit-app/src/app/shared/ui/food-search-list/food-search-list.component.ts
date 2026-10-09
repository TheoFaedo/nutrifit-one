import { Component, computed, input, output, signal } from '@angular/core';
import { FoodRecord } from '../../../core/services/food-catalogue.service';

@Component({
  selector: 'app-food-search-list',
  template: `
    <label class="search"><span>{{ searchLabel() }}</span><input type="search" [value]="query()" (input)="query.set($any($event.target).value)" placeholder="Search foods and recipes" autofocus></label>
    <section class="results" aria-label="Food search results">
      @if (loading()) { <p class="muted" aria-live="polite">Loading foods…</p> }
      @else if (matches().length === 0) { <p class="muted">No matching foods.</p> }
      @else { @for (food of matches(); track food.id) {
        <button class="row" type="button" [class.active]="selectedId() === food.id" (click)="foodSelected.emit(food)">
          <span><strong>{{ food.name }}</strong><small>{{ food.kind === 'RECIPE' ? 'Recipe' : 'Food' }} · {{ food.portions.length }} portion{{ food.portions.length === 1 ? '' : 's' }}</small></span><span aria-hidden="true">›</span>
        </button>
      } }
    </section>
  `,
  styles: [`
    :host { display: block; } .search { display: grid; gap: 7px; padding: 12px; color: var(--ink); font-size: 12px; font-weight: 600; }
    input { box-sizing: border-box; width: 100%; padding: 11px 12px; color: var(--ink); background: #fbfaf7; border: 1px solid var(--line); border-radius: 9px; font: inherit; }
    .results { max-height: 55vh; overflow: auto; padding: 8px; } .muted { padding: 10px; color: var(--muted); font-size: 13px; }
    .row { display: flex; width: 100%; justify-content: space-between; align-items: center; padding: 14px 12px; text-align: left; color: var(--ink); background: transparent; border: 0; border-radius: 11px; cursor: pointer; }
    .row:hover, .row.active { background: #f1f2e8; } .row span:first-child { display: grid; gap: 5px; } small { color: var(--muted); font-size: 12px; }
    button:focus-visible, input:focus-visible { outline: 3px solid #879365; outline-offset: 2px; }
  `],
})
export class FoodSearchListComponent {
  readonly foods = input<FoodRecord[]>([]);
  readonly loading = input(false);
  readonly selectedId = input<string | null>(null);
  readonly searchLabel = input('Search foods');
  readonly foodSelected = output<FoodRecord>();
  readonly query = signal('');
  readonly matches = computed(() => {
    const term = this.query().trim().toLocaleLowerCase();
    return this.foods().filter((food) => !term || food.name.toLocaleLowerCase().includes(term));
  });
}
