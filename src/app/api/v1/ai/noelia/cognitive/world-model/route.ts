import { z } from "zod";
import { cognitiveRoute } from "@/lib/noelia/cognitive/api";

export const dynamic = "force-dynamic";

const Schema = z
  .object({
    legalEntityId: z.string().min(1).max(64).optional(),
    includeDecisions: z.boolean().optional(),
    includeDocuments: z.boolean().optional(),
    includeSimulations: z.boolean().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .strict();

/**
 * POST /api/v1/ai/noelia/cognitive/world-model
 *
 * The authorized slice of the BEYU world model. Recorded, derived and simulated
 * state are explicitly distinguished; no financial value is estimated.
 */
export const POST = cognitiveRoute({
  action: "ai.noelia.cognitive.world_model",
  permission: "ai:noelia.query",
  capability: "noelia.world_model.query",
  schema: Schema,
  rateLimit: 30,
});
