/** Agriculture OS — warehouses */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  farmId: z.string().min(1).optional(),
  countryCode: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.warehouses.list",
  objectType: "AGRICULTURE_WAREHOUSE",
  load: async (ctx) => {
    const rows = await db.select().from(s.warehouses).where(eq(s.warehouses.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.warehouses.create",
  objectType: "AGRICULTURE_WAREHOUSE",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.warehouses, body as Record<string, unknown>, agriActor(ctx), "agriculture.warehouses.create", "AGRICULTURE_WAREHOUSE"),
});
