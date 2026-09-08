/** Agriculture OS — measurements */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  measuredAt: z.string().min(1),
  metricCode: z.string().min(1),
  value: z.union([z.string(), z.number()]).transform(String),
  unit: z.string().min(1),
  fieldId: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.measurements.list",
  objectType: "AGRICULTURE_MEASUREMENT",
  load: async (ctx) => {
    const rows = await db.select().from(s.measurements).where(eq(s.measurements.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.measurements.create",
  objectType: "AGRICULTURE_MEASUREMENT",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.measurements, body as Record<string, unknown>, agriActor(ctx), "agriculture.measurements.create", "AGRICULTURE_MEASUREMENT"),
});
