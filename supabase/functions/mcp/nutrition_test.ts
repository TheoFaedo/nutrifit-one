import { assertEquals, assertThrows } from "@std/assert";
import { previewFood, proposalSchema } from "./nutrition.ts";

Deno.test("preview normalizes persisted precision without writing", () => {
  const preview = previewFood({
    name: "Salade",
    carbs_g: 3.1234,
    fats_g: 5,
    proteins_g: 7,
    estimated: true,
    assumptions: ["Estimated dressing amount"],
  });
  assertEquals(preview.persisted, false);
  assertEquals(preview.kind, "FOOD");
  assertEquals(preview.is_public, false);
  assertEquals(preview.barcode, null);
  assertEquals(preview.nova_group, null);
  assertEquals(preview.source, "AI estimate");
  assertEquals(preview.portions[0], {
    quantity_number: 100,
    quantity_unit: "g",
    is_reference: true,
    energy_kcal: 85.5,
    carbs_g: 3.123,
    fats_g: 5,
    proteins_g: 7,
  });
  assertEquals(preview.portions[1], {
    quantity_number: 1,
    quantity_unit: "g",
    is_reference: false,
    energy_kcal: 0.855,
    carbs_g: 0.031,
    fats_g: 0.05,
    proteins_g: 0.07,
  });
});

Deno.test(
  "preview validates macro sums, estimation assumptions and extra fields",
  () => {
    const preview = previewFood({
      name: "Oats",
      carbs_g: 60,
      fats_g: 7,
      proteins_g: 13,
      estimated: false,
      assumptions: [],
    });
    assertEquals(preview.source, "AI provided");
    assertThrows(() =>
      proposalSchema.parse({
        name: "Impossible",
        carbs_g: 70,
        fats_g: 20,
        proteins_g: 20,
        estimated: false,
        assumptions: [],
      }),
    );
    assertThrows(() =>
      proposalSchema.parse({
        name: "Unexplained",
        carbs_g: 1,
        fats_g: 1,
        proteins_g: 1,
        estimated: true,
        assumptions: [],
      }),
    );
    assertThrows(() =>
      proposalSchema.parse({
        name: "Extra field",
        carbs_g: 1,
        fats_g: 1,
        proteins_g: 1,
        estimated: false,
        assumptions: [],
        is_public: true,
      }),
    );
  },
);
