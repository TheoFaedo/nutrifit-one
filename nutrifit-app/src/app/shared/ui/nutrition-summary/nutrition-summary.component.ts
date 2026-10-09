import { Component, input } from '@angular/core';
import { formatNutrition } from './nutrition-format';

export interface NutritionSummaryValues {
  energy: number | null;
  carbs: number | null;
  fats: number | null;
  protein: number | null;
}

@Component({
  selector: 'app-nutrition-summary',
  template: `<dl aria-label="Nutrition values">
    <div>
      <dt>Energy</dt>
      <dd>{{ format(values().energy) }} kcal</dd>
    </div>
    <div>
      <dt>Carbs</dt>
      <dd>{{ format(values().carbs) }} g</dd>
    </div>
    <div>
      <dt>Fat</dt>
      <dd>{{ format(values().fats) }} g</dd>
    </div>
    <div>
      <dt>Protein</dt>
      <dd>{{ format(values().protein) }} g</dd>
    </div>
  </dl>`,
  styles: [
    `
      dl {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
        margin: 13px 0 0;
      }
      dl div {
        display: grid;
        gap: 4px;
      }
      dt {
        color: var(--muted);
        font-size: 11px;
      }
      dd {
        margin: 0;
        color: var(--ink);
        font-size: 14px;
        font-weight: 600;
      }
      @media (max-width: 540px) {
        dl {
          grid-template-columns: 1fr 1fr;
        }
      }
    `,
  ],
})
export class NutritionSummaryComponent {
  readonly values = input.required<NutritionSummaryValues>();
  readonly format = formatNutrition;
}
