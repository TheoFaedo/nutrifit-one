import { Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';
import { FoodRecord } from '../../../core/services/food-catalogue.service';
import { FoodSearchListComponent } from '../food-search-list/food-search-list.component';

@Component({
  selector: 'app-food-picker',
  imports: [FoodSearchListComponent],
  template: `
    <button class="choose" type="button" (click)="open()">
      {{ selected()?.name ?? 'Choose a food or recipe' }}
    </button>
    <dialog #dialog aria-labelledby="picker-title" (close)="opened.set(false)">
      <header>
        <div>
          <span class="eyebrow">Recipe ingredient</span>
          <h2 id="picker-title">Choose an ingredient</h2>
        </div>
        <button class="close" type="button" aria-label="Close" (click)="dialog.close()">×</button>
      </header>
      <app-food-search-list
        [foods]="foods()"
        [loading]="loading()"
        [searchLabel]="'Search ingredients'"
        (foodSelected)="choose($event, dialog)"
      />
    </dialog>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .choose {
        width: 100%;
        padding: 11px 12px;
        text-align: left;
        color: var(--ink);
        background: #fbfaf7;
        border: 1px solid var(--line);
        border-radius: 9px;
        font: inherit;
        cursor: pointer;
      }
      dialog {
        width: min(520px, calc(100vw - 36px));
        max-height: min(760px, calc(100vh - 40px));
        padding: 0;
        border: 1px solid var(--line);
        border-radius: 18px;
        color: var(--ink);
        background: #fff;
        box-shadow: 0 20px 70px #17200c33;
      }
      dialog::backdrop {
        background: #20261977;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 22px 8px;
      }
      h2 {
        margin: 5px 0;
        font:
          400 25px Georgia,
          serif;
      }
      .eyebrow {
        color: #68714c;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .close {
        width: 36px;
        height: 36px;
        border: 1px solid var(--line);
        border-radius: 50%;
        background: white;
        font-size: 22px;
        cursor: pointer;
      }
    `,
  ],
})
export class FoodPickerComponent {
  readonly foods = input<FoodRecord[]>([]);
  readonly loading = input(false);
  readonly selectedId = input('');
  readonly selection = output<FoodRecord>();
  readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  readonly opened = signal(false);
  readonly selected = computed(
    () => this.foods().find((food) => food.version_id === this.selectedId()) ?? null,
  );

  open(): void {
    this.dialog()?.nativeElement.showModal();
    this.opened.set(true);
  }
  choose(food: FoodRecord, dialog: HTMLDialogElement): void {
    this.selection.emit(food);
    dialog.close();
  }
}
