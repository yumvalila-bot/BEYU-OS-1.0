/** UJENZI OS — variations */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { requestVariation } from "@/lib/ujenzi";

const CreateSchema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  title: z.string().min(1),
  reason: z.string().optional(),
  description: z.string().optional(),
  costImpact: z.string().optional(),
  currency: z.string().optional(),
  scheduleImpactDays: z.number().int().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.variations.list",
  objectType: "UJENZI_VARIATION",
  load: async (ctx, request) => {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const conditions = [eq(s.ujenziVariations.tenantId, ctx.principal.tenantId)];
    if (projectId) conditions.push(eq(s.ujenziVariations.projectId, projectId));
    const rows = await db.select().from(s.ujenziVariations).where(and(...conditions));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.variations.create",
  objectType: "UJENZI_VARIATION",
  schema: CreateSchema,
  create: async (ctx, body) => requestVariation({ ...body, tenantId: ctx.principal.tenantId }, ujenziActor(ctx)),
});
