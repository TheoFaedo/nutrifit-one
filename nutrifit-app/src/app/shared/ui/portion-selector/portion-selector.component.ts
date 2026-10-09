import { Component, input, output } from '@angular/core';
import { FoodPortion } from '../../../core/services/food-catalogue.service';

@Component({
  selector: 'app-portion-selector',
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        min-width: 0;
      }
      select {
        display: block;
        width: 100%;
        min-width: 0;
        min-height: 42px;
        box-sizing: border-box;
        padding: 10px 12px;
        border: 1px solid var(--line);
        border-radius: 9px;
        color: var(--ink);
        background: #fbfaf7;
        font: inherit;
        font-size: 14px;
      }
      select:focus-visible {
        outline: 3px solid #879365;
        outline-offset: 2px;
      }
    `,
  ],
  template: `
    <select [value]="selection()" (change)="selectionChange.emit($any($event.target).value)">
      @for (portion of portions(); track portion.id) {
        <option [value]="portion.id">
          {{
            portion.quantity_number === 1
              ? portion.quantity_unit
              : portion.quantity_number + ' ' + portion.quantity_unit
          }}
        </option>
      }
    </select>
  `,
})
export class PortionSelectorComponent {
  readonly portions = input<FoodPortion[]>([]);
  readonly selection = input('');
  readonly selectionChange = output<string>();
}
