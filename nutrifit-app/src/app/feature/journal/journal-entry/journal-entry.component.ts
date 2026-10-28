import { Component, computed, ElementRef, inject, input, output, signal } from '@angular/core';
import { IntakeRecord } from '@core/services/intake-journal.service';
import { I18nService } from '@core/i18n/i18n.service';
import { formatNutrition } from '@shared/ui/nutrition-summary/nutrition-format';

const ACTION_WIDTH = 112;
const SWIPE_THRESHOLD = 40;

@Component({
  selector: 'app-journal-entry',
  templateUrl: './journal-entry.component.html',
  styleUrl: './journal-entry.component.less',
  host: { '[attr.data-entry-id]': 'entry().id' },
})
export class JournalEntryComponent {
  readonly entry = input.required<IntakeRecord>();
  readonly open = input(false);
  readonly openRequested = output<boolean>();
  readonly editRequested = output<void>();
  readonly deleteRequested = output<void>();
  readonly i18n = inject(I18nService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly dragOffset = signal<number | null>(null);
  readonly offset = computed(() => this.dragOffset() ?? (this.open() ? -ACTION_WIDTH : 0));
  readonly energy = computed(() => {
    const entry = this.entry();
    return entry.portion.energy_kcal === null ? null : entry.portion.energy_kcal * entry.ratio;
  });
  readonly formatNutrition = formatNutrition;
  private gesture: {
    id: number;
    x: number;
    y: number;
    initial: number;
    horizontal: boolean;
  } | null = null;
  private suppressClick = false;

  pointerDown(event: PointerEvent): void {
    this.suppressClick = false;
    if (!event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest('button')) {
      return;
    }
    this.gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      initial: this.open() ? -ACTION_WIDTH : 0,
      horizontal: false,
    };
  }

  pointerMove(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || gesture.id !== event.pointerId) {
      return;
    }
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.horizontal && Math.max(Math.abs(dx), Math.abs(dy)) < 8) {
      return;
    }
    if (!gesture.horizontal && Math.abs(dy) >= Math.abs(dx)) {
      this.cancelGesture();
      return;
    }
    if (!gesture.horizontal) {
      gesture.horizontal = true;
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    }
    this.suppressClick = true;
    this.dragOffset.set(Math.max(-ACTION_WIDTH, Math.min(0, gesture.initial + dx)));
  }

  pointerUp(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || gesture.id !== event.pointerId) {
      return;
    }
    if (gesture.horizontal) {
      const dx = event.clientX - gesture.x;
      this.openRequested.emit(Math.abs(dx) >= SWIPE_THRESHOLD ? dx < 0 : this.open());
    }
    this.cancelGesture();
  }

  cancelGesture(): void {
    this.gesture = null;
    this.dragOffset.set(null);
  }

  toggle(event: MouseEvent): void {
    if (this.suppressClick) {
      event.preventDefault();
      this.suppressClick = false;
      return;
    }
    this.openRequested.emit(!this.open());
  }

  focusToggle(): void {
    this.element.nativeElement.querySelector<HTMLButtonElement>('.entry-toggle')?.focus();
  }
}
