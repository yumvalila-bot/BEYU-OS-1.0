/** Agriculture OS — trace-batches */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  batchCode: z.string().min(1),
  qty: z.union([z.string(), z.number()]).transform(String),
  productId: z.string().min(1).optional(),
  harvestId: z.string().min(1).optional(),
  originFarmId: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.trace.batches.list",
  objectType: "AGRICULTURE_TRACE_BATCH",
  load: async (ctx) => {
    const rows = await db.select().from(s.traceBatches).where(eq(s.traceBatches.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.trace.batches.create",
  objectType: "AGRICULTURE_TRACE_BATCH",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.traceBatches, body as Record<string, unknown>, agriActor(ctx), "agriculture.trace.batches.create", "AGRICULTURE_TRACE_BATCH"),
});
