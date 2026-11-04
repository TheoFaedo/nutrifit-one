import { Component, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { JournalEntryComponent } from '@feature/journal/journal-entry/journal-entry.component';
@Component({
  selector: 'app-root',
  imports: [JournalEntryComponent],
  template: `<app-journal-entry
      [entry]="entry"
      [open]="open()"
      (openRequested)="open.set($event); count.set(count() + 1)"
    /><output>{{ count() }}</output>`,
})
class Preview {
  readonly open = signal(false);
  readonly count = signal(0);
  readonly entry = {
    id: 'preview',
    brand: null,
    food_name: 'Aliment de démonstration',
    food_version_id: 'v1',
    quantity_id: 'p1',
    ratio: 1,
    meal_type: 'LUNCH' as const,
    consumed_at: '2026-10-28T12:00:00Z',
    kind: 'FOOD' as const,
    portion: {
      id: 'p1',
      quantity_number: 100,
      quantity_unit: 'g',
      is_reference: true,
      energy_kcal: 100,
      carbs_g: 10,
      fats_g: 4,
      proteins_g: 6,
    },
  };
}
bootstrapApplication(Preview).catch(console.error);
