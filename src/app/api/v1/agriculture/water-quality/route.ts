/** Agriculture OS — water-quality */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  aquaUnitId: z.string().min(1),
  sampledAt: z.string().min(1),
  ph: z.union([z.string(), z.number()]).transform(String).optional(),
  dissolvedOxygenMgl: z.union([z.string(), z.number()]).transform(String).optional(),
  temperatureC: z.union([z.string(), z.number()]).transform(String).optional(),
  turbidityNtu: z.union([z.string(), z.number()]).transform(String).optional(),
  source: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.water.quality.list",
  objectType: "AGRICULTURE_WATER_QUALITY",
  load: async (ctx) => {
    const rows = await db.select().from(s.waterQuality).where(eq(s.waterQuality.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.water.quality.create",
  objectType: "AGRICULTURE_WATER_QUALITY",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.waterQuality, body as Record<string, unknown>, agriActor(ctx), "agriculture.water.quality.create", "AGRICULTURE_WATER_QUALITY"),
});
