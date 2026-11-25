import { z } from "zod";
import { cognitiveRoute } from "@/lib/noelia/cognitive/api";

export const dynamic = "force-dynamic";

const Schema = z
  .object({
    objective: z.string().min(5).max(500),
    scenarioKind: z.string().min(3).max(80),
    method: z.enum(["LINEAR_COMBINATION", "PROPORTIONAL_SCALING"]),
    variables: z
      .array(
        z
          .object({
            key: z.string().min(2).max(60),
            label: z.string().min(2).max(120),
            optimistic: z.number().finite().nullable(),
            baseline: z.number().finite().nullable(),
            adverse: z.number().finite().nullable(),
            unit: z.string().min(1).max(20),
            provenance: z.enum(["OBSERVED", "RECORDED", "ESTIMATE", "UNAVAILABLE"]),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    assumptions: z.array(z.string().max(400)).max(20).default([]),
    limitations: z.array(z.string().max(400)).max(20).optional(),
  })
  .strict();

/**
 * POST /api/v1/ai/noelia/cognitive/simulation
 *
 * Deterministic strategic simulation. NEVER a posting, NEVER an institutional
 * record: output is structurally labelled SIMULATION and all metrics carry the
 * SCENARIO status.
 */
export const POST = cognitiveRoute({
  action: "ai.noelia.cognitive.simulation",
  permission: "ai:analytics.read",
  capability: "noelia.scenario.simulate",
  schema: Schema,
  rateLimit: 20,
});
