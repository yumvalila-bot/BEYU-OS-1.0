/** Agriculture OS — ai-advice */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  topic: z.string().min(1),
  adviceText: z.string().min(1),
  farmId: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.ai.advice.list",
  objectType: "AGRICULTURE_AI_ADVICE",
  load: async (ctx) => {
    const rows = await db.select().from(s.aiAdvice).where(eq(s.aiAdvice.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.ai.advice.create",
  objectType: "AGRICULTURE_AI_ADVICE",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.aiAdvice, body as Record<string, unknown>, agriActor(ctx), "agriculture.ai.advice.create", "AGRICULTURE_AI_ADVICE"),
});
