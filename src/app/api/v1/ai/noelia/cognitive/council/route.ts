import { z } from "zod";
import { cognitiveRoute } from "@/lib/noelia/cognitive/api";

export const dynamic = "force-dynamic";

const BRAINS = [
  "EXECUTIVE", "INSTITUTIONAL", "KNOWLEDGE", "ANALYTICAL",
  "OPERATIONAL", "LEARNING", "COLLECTIVE", "PERSONAL_CONTEXT",
] as const;

const Schema = z
  .object({
    question: z.string().min(10).max(2000),
    findings: z
      .array(
        z
          .object({
            brain: z.enum(BRAINS),
            capability: z.string().max(80).nullable(),
            task: z.string().min(3).max(300),
            claimKind: z.enum(["FACT", "INFERENCE", "ASSUMPTION", "PREDICTION", "RECOMMENDATION", "UNKNOWN", "SIMULATION"]),
            statement: z.string().min(3).max(1500),
            evidenceRefs: z.array(z.string().max(200)).max(20),
            assumptions: z.array(z.string().max(300)).max(20).optional(),
            confidence: z.number().min(0).max(1).nullable().optional(),
          })
          .strict(),
      )
      .max(24)
      .default([]),
    maxParticipants: z.number().int().min(2).max(6).optional(),
  })
  .strict();

/**
 * POST /api/v1/ai/noelia/cognitive/council
 *
 * Convene the Intelligence Council. Findings supplied by the caller are the
 * evidence bundle; the council reconciles them, preserves disagreement and
 * returns a recommendation — never a decision.
 */
export const POST = cognitiveRoute({
  action: "ai.noelia.cognitive.council",
  permission: "ai:executive.read",
  capability: "noelia.council.deliberate",
  schema: Schema,
  rateLimit: 10,
});
