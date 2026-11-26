import { z } from "zod";
import { cognitiveRoute } from "@/lib/noelia/cognitive/api";

export const dynamic = "force-dynamic";

const Schema = z
  .object({
    keyword: z.string().min(1).max(120).optional(),
    legalEntityId: z.string().min(1).max(64).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    includeSuperseded: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

/**
 * POST /api/v1/ai/noelia/cognitive/decision-memory
 *
 * Recorded institutional decisions with rationale, approving authority and
 * provenance — read-only. NOELIA cannot create or amend a decision record.
 */
export const POST = cognitiveRoute({
  action: "ai.noelia.cognitive.decision_memory",
  permission: "ai:noelia.query",
  capability: "noelia.decision_memory.query",
  schema: Schema,
  rateLimit: 30,
});
