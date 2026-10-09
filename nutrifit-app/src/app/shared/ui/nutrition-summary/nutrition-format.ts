export function formatNutrition(value: number | null): string {
  return value === null ? '—' : value.toFixed(1).replace(/\.0$/, '');
}
