/** Agriculture OS — shipment-items */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  shipmentId: z.string().min(1),
  qty: z.union([z.string(), z.number()]).transform(String),
  batchId: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.shipment.items.list",
  objectType: "AGRICULTURE_SHIPMENT_ITEM",
  load: async (ctx) => {
    const rows = await db.select().from(s.shipmentItems).where(eq(s.shipmentItems.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.shipment.items.create",
  objectType: "AGRICULTURE_SHIPMENT_ITEM",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.shipmentItems, body as Record<string, unknown>, agriActor(ctx), "agriculture.shipment.items.create", "AGRICULTURE_SHIPMENT_ITEM"),
});
