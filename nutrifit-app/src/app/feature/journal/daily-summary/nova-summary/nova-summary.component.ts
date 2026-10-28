import { Component, computed, inject, input } from '@angular/core';
import { I18nService } from '@core/i18n/i18n.service';
import { formatNutrition } from '@shared/ui/nutrition-summary/nutrition-format';

@Component({
  selector: 'app-nova-summary',
  templateUrl: './nova-summary.component.html',
  styleUrl: './nova-summary.component.less',
})
export class NovaSummaryComponent {
  readonly i18n = inject(I18nService);
  readonly energy = input.required<number | null>();
  readonly groups = input<number[] | null>(null);
  readonly formatValue = formatNutrition;
  readonly averageTransformationScore = computed(() => {
    const groups = this.groups();
    if (!groups) {
      return null;
    }
    const calories = groups.reduce((sum, value) => sum + value, 0);
    if (calories <= 0) {
      return null;
    }
    return groups.reduce((score, value, index) => score + value * (index + 1), 0) / calories;
  });

  transformationComment(score: number): string {
    const level = Math.max(1, Math.min(4, Math.round(Number(score.toFixed(1)))));
    return this.i18n.t('summary', `transformationComment${level}`);
  }
}
