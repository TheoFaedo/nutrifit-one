import { Component, input } from '@angular/core';
import { DailyGoal } from '../../core/services/daily-goals.service';
import { NutritionSummaryValues } from '../../shared/ui/nutrition-summary/nutrition-summary.component';

@Component({
  selector: 'app-daily-summary',
  templateUrl: './daily-summary.component.html',
  styleUrl: './daily-summary.component.less',
})
export class DailySummaryComponent {
  readonly totals = input.required<NutritionSummaryValues>();
  readonly goal = input<DailyGoal | null>(null);

  formatValue(value: number | null): string {
    return value === null ? '—' : value.toFixed(1).replace(/\.0$/, '');
  }

  progressWidth(consumed: number | null, target: number | null): number {
    return consumed === null || target === null || target <= 0
      ? 0
      : Math.min(100, (consumed / target) * 100);
  }

  exceedsGoal(consumed: number | null, target: number | null): boolean {
    return consumed !== null && target !== null && consumed > target;
  }
}
