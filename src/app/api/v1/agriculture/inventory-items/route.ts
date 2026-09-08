/** Agriculture OS — inventory-items */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  unitOfMeasure: z.string().min(1),

});

export const GET = agriListRoute({
  action: "agriculture.inventory.items.list",
  objectType: "AGRICULTURE_INVENTORY_ITEM",
  load: async (ctx) => {
    const rows = await db.select().from(s.inventoryItems).where(eq(s.inventoryItems.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.inventory.items.create",
  objectType: "AGRICULTURE_INVENTORY_ITEM",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.inventoryItems, body as Record<string, unknown>, agriActor(ctx), "agriculture.inventory.items.create", "AGRICULTURE_INVENTORY_ITEM"),
});
