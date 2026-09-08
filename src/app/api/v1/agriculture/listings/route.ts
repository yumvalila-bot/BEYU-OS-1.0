/** Agriculture OS — listings */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  title: z.string().min(1),
  qtyAvailable: z.union([z.string(), z.number()]).transform(String),
  sellerFarmId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  askingPrice: z.union([z.string(), z.number()]).transform(String).optional(),
  currency: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.listings.list",
  objectType: "AGRICULTURE_LISTING",
  load: async (ctx) => {
    const rows = await db.select().from(s.listings).where(eq(s.listings.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.listings.create",
  objectType: "AGRICULTURE_LISTING",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.listings, body as Record<string, unknown>, agriActor(ctx), "agriculture.listings.create", "AGRICULTURE_LISTING"),
});
