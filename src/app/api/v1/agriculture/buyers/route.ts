/** Agriculture OS — buyers */
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
  action: "agriculture.buyers.list",
  objectType: "AGRICULTURE_BUYER",
  load: async (ctx) => {
    const rows = await db.select().from(s.buyers).where(eq(s.buyers.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.buyers.create",
  objectType: "AGRICULTURE_BUYER",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.buyers, body as Record<string, unknown>, agriActor(ctx), "agriculture.buyers.create", "AGRICULTURE_BUYER"),
});
