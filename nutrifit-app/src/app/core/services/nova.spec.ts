import { describe, expect, it } from 'vitest';
import { validNova } from '@core/services/food-catalogue.service';

describe('NOVA group validation', () => {
  it('accepts groups 1 to 4 and rejects missing or invalid values', () => {
    for (const group of [1, 2, 3, 4]) {
      expect(validNova(group)).toBe(group);
      expect(validNova(String(group))).toBe(group);
    }
    for (const value of [null, undefined, 0, 5, 1.5, '', ' 1', 'x']) {
      expect(validNova(value)).toBeNull();
    }
  });
});
