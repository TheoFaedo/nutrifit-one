import { Component, computed, inject, input, output } from '@angular/core';
import { BarcodeScannerComponent } from '@shared/ui/barcode-scanner/barcode-scanner.component';
import { I18nService } from '@core/i18n/i18n.service';

let nextSortMenuId = 0;

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
      <button
        #sortButton
        class="sort-button"
        type="button"
        [attr.popovertarget]="sortMenuId"
        [attr.aria-label]="sortButtonLabel()"
        [title]="sortButtonLabel()"
        (click)="positionSortMenu(sortMenu, sortButton)"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <path d="M4 7h16M7 12h10M10 17h4" />
        </svg>
      </button>
      <div
        #sortMenu
        class="sort-menu"
        popover="auto"
        (keydown.escape)="$event.stopPropagation()"
        [id]="sortMenuId"
        role="group"
        [attr.aria-label]="sortLabel() || i18n.t('catalogue', 'sort')"
      >
        @for (option of sortOptions(); track option.value) {
          <button
            class="sort-option"
            type="button"
            [attr.aria-pressed]="sort() === option.value"
            [attr.autofocus]="sort() === option.value ? '' : null"
            (click)="selectSort(option.value, sortMenu, sortButton)"
          >
            <span>{{ i18n.t('catalogue', sortTranslationKey(option.value)) }}</span>
            <span class="selected-mark" aria-hidden="true">✓</span>
          </button>
        }
      </div>
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
      .search-field {
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
      input {
        box-sizing: border-box;
        width: 100%;
        height: 42px;
        min-width: 0;
        padding: 11px 12px;
        border: 1px solid var(--line);
        border-radius: 9px;
        color: var(--ink);
        background: #fbfaf7;
        font: inherit;
        font-size: 14px;
      }
      .sort-button {
        display: inline-flex;
        box-sizing: border-box;
        flex: 0 0 42px;
        align-items: center;
        justify-content: center;
        width: 42px;
        height: 42px;
        padding: 0;
        border: 1px solid var(--line);
        border-radius: 9px;
        color: var(--ink);
        background: #fbfaf7;
        cursor: pointer;
      }
      .sort-button svg {
        width: 22px;
        height: 22px;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
      }
      .sort-menu {
        position: fixed;
        inset: auto;
        box-sizing: border-box;
        width: 224px;
        max-width: calc(100vw - 16px);
        max-height: 240px;
        overflow-y: auto;
        margin: 0;
        padding: 6px;
        border: 1px solid var(--line);
        border-radius: 12px;
        color: var(--ink);
        background: #fffefa;
        box-shadow: 0 8px 28px rgb(29 36 26 / 16%);
      }
      .sort-option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
        min-height: 42px;
        padding: 10px;
        border: 0;
        border-radius: 7px;
        color: inherit;
        background: transparent;
        font: inherit;
        font-size: 13px;
        text-align: start;
        cursor: pointer;
      }
      .sort-option[aria-pressed='true'] {
        background: #eef1e5;
        font-weight: 600;
      }
      .selected-mark {
        visibility: hidden;
      }
      .sort-option[aria-pressed='true'] .selected-mark {
        visibility: visible;
      }
      .sort-button:hover,
      .sort-option:hover {
        background: #f0f2e9;
      }
      input:focus-visible,
      .sort-button:focus-visible,
      .sort-option:focus-visible {
        outline: 3px solid #879365;
        outline-offset: 2px;
      }
      @media (max-width: 540px) {
        .search-field {
          flex: 1 1 calc(100% - 52px);
        }
      }
    `,
  ],
})
export class FoodCatalogueSearchComponent {
  readonly i18n = inject(I18nService);
  readonly sortMenuId = `food-sort-menu-${nextSortMenuId++}`;
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

  readonly sortButtonLabel = computed(() => {
    const label = this.sortLabel() || this.i18n.t('catalogue', 'sort');
    const selected = this.sortOptions().find((option) => option.value === this.sort());
    return selected
      ? `${label} : ${this.i18n.t('catalogue', this.sortTranslationKey(selected.value))}`
      : label;
  });

  positionSortMenu(menu: HTMLElement, button: HTMLButtonElement): void {
    const bounds = button.getBoundingClientRect();
    const width = Math.min(224, window.innerWidth - 16);
    const height = Math.min(240, this.sortOptions().length * 42 + 14);
    const top = bounds.bottom + 6;
    menu.style.left = `${Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
  }

  selectSort(value: string, menu: HTMLElement, button: HTMLButtonElement): void {
    this.sortChanged.emit(value);
    menu.hidePopover();
    button.focus();
  }

  sortTranslationKey(value: string): string {
    switch (value) {
      case 'recent':
        return 'recentlyUsed';
      case 'newest':
        return 'newest';
      case 'asc':
        return 'nameAsc';
      default:
        return 'nameDesc';
    }
  }
}
