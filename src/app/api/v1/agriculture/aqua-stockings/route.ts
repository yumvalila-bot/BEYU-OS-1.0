/** Agriculture OS — aqua-stockings */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  aquaUnitId: z.string().min(1),
  species: z.string().min(1),
  stockedOn: z.string().min(1),
  countStocked: z.number().int(),

});

export const GET = agriListRoute({
  action: "agriculture.aqua.stockings.list",
  objectType: "AGRICULTURE_AQUA_STOCKING",
  load: async (ctx) => {
    const rows = await db.select().from(s.aquaStockings).where(eq(s.aquaStockings.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.aqua.stockings.create",
  objectType: "AGRICULTURE_AQUA_STOCKING",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.aquaStockings, body as Record<string, unknown>, agriActor(ctx), "agriculture.aqua.stockings.create", "AGRICULTURE_AQUA_STOCKING"),
});
