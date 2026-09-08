/** Agriculture OS — water-sources */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  farmId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  sourceKind: z.string().min(1),

});

export const GET = agriListRoute({
  action: "agriculture.water.sources.list",
  objectType: "AGRICULTURE_WATER_SOURCE",
  load: async (ctx) => {
    const rows = await db.select().from(s.waterSources).where(eq(s.waterSources.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.water.sources.create",
  objectType: "AGRICULTURE_WATER_SOURCE",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.waterSources, body as Record<string, unknown>, agriActor(ctx), "agriculture.water.sources.create", "AGRICULTURE_WATER_SOURCE"),
});
