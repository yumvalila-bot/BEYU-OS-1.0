/** Agriculture OS — orders */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  code: z.string().min(1),
  buyerId: z.string().min(1).optional(),
  listingId: z.string().min(1).optional(),
  orderedOn: z.string().min(1).optional(),
  currency: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.orders.list",
  objectType: "AGRICULTURE_ORDER",
  load: async (ctx) => {
    const rows = await db.select().from(s.orders).where(eq(s.orders.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.orders.create",
  objectType: "AGRICULTURE_ORDER",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.orders, body as Record<string, unknown>, agriActor(ctx), "agriculture.orders.create", "AGRICULTURE_ORDER"),
});
