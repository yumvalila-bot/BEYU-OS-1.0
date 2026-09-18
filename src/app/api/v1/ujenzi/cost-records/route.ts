/** UJENZI OS — costRecords */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { recordCost } from "@/lib/ujenzi";

const CreateSchema = z.object({
  projectId: z.string().min(1),
  kind: z.enum(["ESTIMATE", "BUDGET", "COMMITTED", "ACTUAL", "FORECAST"]),
  amount: z.string().min(1),
  currency: z.string().optional(),
  costCode: z.string().optional(),
  description: z.string().optional(),
  eventDate: z.string().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.costRecords.list",
  objectType: "UJENZI_COST_RECORD",
  load: async (ctx, request) => {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const conditions = [eq(s.ujenziCostRecords.tenantId, ctx.principal.tenantId)];
    if (projectId) conditions.push(eq(s.ujenziCostRecords.projectId, projectId));
    const rows = await db.select().from(s.ujenziCostRecords).where(and(...conditions));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.costRecords.create",
  objectType: "UJENZI_COST_RECORD",
  schema: CreateSchema,
  create: async (ctx, body) => recordCost({ ...body, tenantId: ctx.principal.tenantId }, ujenziActor(ctx)),
});
