export interface NutritionFactsValues {
  energy: number;
  carbs: number;
  fats: number;
  protein: number;
}

/** Domain object that keeps daily energy and macronutrient targets consistent. */
export class NutritionFacts {
  private constructor(
    readonly energy: number,
    readonly carbs: number,
    readonly fats: number,
    readonly protein: number,
  ) {}

  static from(values: NutritionFactsValues): NutritionFacts {
    return new NutritionFacts(values.energy, values.carbs, values.fats, values.protein);
  }

  withCarbs(carbs: number): NutritionFacts {
    return new NutritionFacts(this.energyFrom(carbs, this.fats, this.protein), carbs, this.fats, this.protein);
  }

  withFats(fats: number): NutritionFacts {
    return new NutritionFacts(this.energyFrom(this.carbs, fats, this.protein), this.carbs, fats, this.protein);
  }

  withProtein(protein: number): NutritionFacts {
    return new NutritionFacts(this.energyFrom(this.carbs, this.fats, protein), this.carbs, this.fats, protein);
  }

  withEnergy(energy: number): NutritionFacts {
    const currentEnergy = this.energyFrom(this.carbs, this.fats, this.protein);
    const distribution = currentEnergy > 0
      ? { carbs: this.carbs, fats: this.fats, protein: this.protein }
      : { carbs: energy * 0.4 / 4, fats: energy * 0.3 / 9, protein: energy * 0.3 / 4 };
    const scale = currentEnergy > 0 ? energy / currentEnergy : 1;

    return new NutritionFacts(
      energy,
      this.round(distribution.carbs * scale),
      this.round(distribution.fats * scale),
      this.round(distribution.protein * scale),
    );
  }

  toValues(): NutritionFactsValues {
    return { energy: this.energy, carbs: this.carbs, fats: this.fats, protein: this.protein };
  }

  private energyFrom(carbs: number, fats: number, protein: number): number {
    return this.round(carbs * 4 + fats * 9 + protein * 4);
  }

  private round(value: number): number {
    return Math.round(value * 10) / 10;
  }
}
