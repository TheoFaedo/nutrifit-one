import { DOCUMENT } from '@angular/common';
import { Component, effect, inject, input, output } from '@angular/core';

@Component({
  selector: 'app-modal-dialog',
  template: `
    @if (open()) {
      <div class="modal-backdrop" (click)="backdropClick($event)">
        <section
          class="modal-dialog"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="labelledBy()"
          tabindex="-1"
          (keydown)="keydown($event)"
        >
          <button
            class="modal-close"
            type="button"
            aria-label="Close dialog"
            (click)="closed.emit()"
          >
            ×
          </button>
          <ng-content />
        </section>
      </div>
    }
  `,
  styles: `
    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 20;
      display: grid;
      place-items: center;
      padding: 20px;
      background: #1f251db8;
    }
    .modal-dialog {
      position: relative;
      width: min(100%, 620px);
      max-height: min(88vh, 800px);
      overflow: auto;
      padding: 24px;
      color: var(--ink);
      background: #fff;
      border-radius: 20px;
      box-shadow: 0 24px 80px #0004;
    }
    .modal-close {
      position: absolute;
      z-index: 1;
      top: 12px;
      right: 14px;
      width: 40px;
      height: 40px;
      border: 0;
      border-radius: 50%;
      background: #f1f2e8;
      color: var(--ink);
      font-size: 24px;
      cursor: pointer;
    }
    .modal-close:focus-visible,
    .modal-dialog :focus-visible {
      outline: 3px solid #879365;
      outline-offset: 2px;
    }
    @media (max-width: 600px) {
      .modal-backdrop {
        padding: 10px;
      }
      .modal-dialog {
        max-height: 94vh;
        padding: 20px 16px;
      }
    }
  `,
})
export class ModalDialogComponent {
  readonly open = input(false);
  readonly labelledBy = input.required<string>();
  readonly closed = output<void>();
  private readonly document = inject(DOCUMENT);
  private returnFocus: HTMLElement | null = null;

  constructor() {
    effect(() => {
      if (this.open()) {
        this.returnFocus =
          this.document.activeElement instanceof HTMLElement ? this.document.activeElement : null;
        setTimeout(() => {
          this.dialogElement()
            ?.querySelector<HTMLElement>('input, select, button:not(.modal-close), .modal-close')
            ?.focus();
        });
      } else {
        this.returnFocus?.focus();
        this.returnFocus = null;
      }
    });
  }
  backdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }
  keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closed.emit();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const items = Array.from(
      this.dialogElement()?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (!items.length) {
      return;
    }
    if (event.shiftKey && this.document.activeElement === items[0]) {
      event.preventDefault();
      items.at(-1)?.focus();
    } else if (!event.shiftKey && this.document.activeElement === items.at(-1)) {
      event.preventDefault();
      items[0].focus();
    }
  }
  private dialogElement(): HTMLElement | null {
    return this.document.querySelector<HTMLElement>('.modal-dialog');
  }
}
