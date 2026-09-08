/** Agriculture OS — order-items */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  orderId: z.string().min(1),
  qty: z.union([z.string(), z.number()]).transform(String),
  productId: z.string().min(1).optional(),
  unitPrice: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.order.items.list",
  objectType: "AGRICULTURE_ORDER_ITEM",
  load: async (ctx) => {
    const rows = await db.select().from(s.orderItems).where(eq(s.orderItems.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.order.items.create",
  objectType: "AGRICULTURE_ORDER_ITEM",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.orderItems, body as Record<string, unknown>, agriActor(ctx), "agriculture.order.items.create", "AGRICULTURE_ORDER_ITEM"),
});
