/** Agriculture OS — suppliers */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  countryCode: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.suppliers.list",
  objectType: "AGRICULTURE_SUPPLIER",
  load: async (ctx) => {
    const rows = await db.select().from(s.suppliers).where(eq(s.suppliers.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.suppliers.create",
  objectType: "AGRICULTURE_SUPPLIER",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.suppliers, body as Record<string, unknown>, agriActor(ctx), "agriculture.suppliers.create", "AGRICULTURE_SUPPLIER"),
});
