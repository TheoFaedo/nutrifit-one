import { z } from "zod";

const macro = z.number().finite().min(0).max(100);
export const proposalSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    carbs_g: macro,
    fats_g: macro,
    proteins_g: macro,
    estimated: z.boolean(),
    assumptions: z.array(z.string().trim().min(1).max(1000)).max(20),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.carbs_g + value.fats_g + value.proteins_g > 100) {
      ctx.addIssue({ code: "custom", message: "Macros must fit in 100 g" });
    }
    if (value.estimated && value.assumptions.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Estimates require explicit assumptions",
      });
    }
  });
export type Proposal = z.infer<typeof proposalSchema>;
const round = (n: number, digits: number) =>
  Math.round((n + Number.EPSILON) * 10 ** digits) / 10 ** digits;

/** Normalize to the precision persisted by PostgreSQL before computing energy. */
export function previewFood(input: Proposal) {
  const validated = proposalSchema.parse(input);
  const proposal = {
    ...validated,
    carbs_g: round(validated.carbs_g, 3),
    fats_g: round(validated.fats_g, 3),
    proteins_g: round(validated.proteins_g, 3),
  };
  proposalSchema.parse(proposal);
  const energy_kcal = round(
    proposal.carbs_g * 4 + proposal.proteins_g * 4 + proposal.fats_g * 9,
    1,
  );
  const reference = {
    quantity_number: 100,
    quantity_unit: "g",
    is_reference: true,
    energy_kcal,
    carbs_g: proposal.carbs_g,
    fats_g: proposal.fats_g,
    proteins_g: proposal.proteins_g,
  };
  const unit = {
    ...reference,
    quantity_number: 1,
    is_reference: false,
    energy_kcal: round(energy_kcal / 100, 3),
    carbs_g: round(proposal.carbs_g / 100, 3),
    fats_g: round(proposal.fats_g / 100, 3),
    proteins_g: round(proposal.proteins_g / 100, 3),
  };
  return {
    proposal,
    kind: "FOOD",
    is_public: false,
    barcode: null,
    nova_group: null,
    source: proposal.estimated ? "AI estimate" : "AI provided",
    portions: [reference, unit],
    persisted: false,
  };
}

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Invalid calendar date");
