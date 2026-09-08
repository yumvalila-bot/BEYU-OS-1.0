/** Agriculture OS — aqua-harvests */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  aquaUnitId: z.string().min(1),
  code: z.string().min(1),
  harvestDate: z.string().min(1),
  quantityKg: z.union([z.string(), z.number()]).transform(String),
  species: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.aqua.harvests.list",
  objectType: "AGRICULTURE_AQUA_HARVEST",
  load: async (ctx) => {
    const rows = await db.select().from(s.aquaHarvests).where(eq(s.aquaHarvests.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.aqua.harvests.create",
  objectType: "AGRICULTURE_AQUA_HARVEST",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.aquaHarvests, body as Record<string, unknown>, agriActor(ctx), "agriculture.aqua.harvests.create", "AGRICULTURE_AQUA_HARVEST"),
});
