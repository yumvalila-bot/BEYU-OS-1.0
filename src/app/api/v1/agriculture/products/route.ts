/** Agriculture OS — products */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  productKind: z.string().min(1),
  unitOfMeasure: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.products.list",
  objectType: "AGRICULTURE_PRODUCT",
  load: async (ctx) => {
    const rows = await db.select().from(s.products).where(eq(s.products.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.products.create",
  objectType: "AGRICULTURE_PRODUCT",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.products, body as Record<string, unknown>, agriActor(ctx), "agriculture.products.create", "AGRICULTURE_PRODUCT"),
});
