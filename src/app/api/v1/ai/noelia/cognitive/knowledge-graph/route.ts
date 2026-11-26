import { z } from "zod";
import { cognitiveRoute } from "@/lib/noelia/cognitive/api";

export const dynamic = "force-dynamic";

const NODE_TYPES = [
  "PERSON", "ENTITY", "COMPANY", "COUNTRY", "PROJECT", "ASSET", "DOCUMENT",
  "POLICY", "CONTRACT", "DECISION", "EVENT", "OBJECTIVE", "RISK", "WORKFLOW", "TENANT",
] as const;

const Schema = z
  .object({
    subjectType: z.enum(NODE_TYPES),
    subjectRef: z.string().min(1).max(128),
    depth: z.number().int().min(1).max(3).optional(),
    limit: z.number().int().min(1).max(120).optional(),
  })
  .strict();

/**
 * POST /api/v1/ai/noelia/cognitive/knowledge-graph
 *
 * Bounded traversal of the institutional graph. Classification and tenant
 * filtering happen in SQL before any edge is returned.
 */
export const POST = cognitiveRoute({
  action: "ai.noelia.cognitive.knowledge_graph",
  permission: "ai:noelia.query",
  capability: "noelia.knowledge_graph.query",
  schema: Schema,
  rateLimit: 30,
});
