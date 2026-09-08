/** Agriculture OS — inventory-lots */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  itemId: z.string().min(1),
  lotCode: z.string().min(1),
  qtyOnHand: z.union([z.string(), z.number()]).transform(String).optional(),
  expiresOn: z.string().min(1).optional(),
  warehouseId: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.inventory.lots.list",
  objectType: "AGRICULTURE_INVENTORY_LOT",
  load: async (ctx) => {
    const rows = await db.select().from(s.inventoryLots).where(eq(s.inventoryLots.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.inventory.lots.create",
  objectType: "AGRICULTURE_INVENTORY_LOT",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.inventoryLots, body as Record<string, unknown>, agriActor(ctx), "agriculture.inventory.lots.create", "AGRICULTURE_INVENTORY_LOT"),
});
