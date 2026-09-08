/** Agriculture OS — shipments */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  code: z.string().min(1),
  fromWarehouseId: z.string().min(1).optional(),
  buyerId: z.string().min(1).optional(),
  shippedOn: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.shipments.list",
  objectType: "AGRICULTURE_SHIPMENT",
  load: async (ctx) => {
    const rows = await db.select().from(s.shipments).where(eq(s.shipments.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.shipments.create",
  objectType: "AGRICULTURE_SHIPMENT",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.shipments, body as Record<string, unknown>, agriActor(ctx), "agriculture.shipments.create", "AGRICULTURE_SHIPMENT"),
});
