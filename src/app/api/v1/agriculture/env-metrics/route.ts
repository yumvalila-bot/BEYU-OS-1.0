/** Agriculture OS — env-metrics */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  period: z.string().min(1),
  metricCode: z.string().min(1),
  value: z.union([z.string(), z.number()]).transform(String),
  unit: z.string().min(1),
  source: z.string().min(1),
  farmId: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.env.metrics.list",
  objectType: "AGRICULTURE_ENV_METRIC",
  load: async (ctx) => {
    const rows = await db.select().from(s.envMetrics).where(eq(s.envMetrics.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.env.metrics.create",
  objectType: "AGRICULTURE_ENV_METRIC",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.envMetrics, body as Record<string, unknown>, agriActor(ctx), "agriculture.env.metrics.create", "AGRICULTURE_ENV_METRIC"),
});
