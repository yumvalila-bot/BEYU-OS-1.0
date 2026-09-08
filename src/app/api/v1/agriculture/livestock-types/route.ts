/** Agriculture OS — livestock-types */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  species: z.string().min(1),
  purpose: z.string().min(1),
  breed: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.livestock.types.list",
  objectType: "AGRICULTURE_LIVESTOCK_TYPE",
  load: async (ctx) => {
    const rows = await db.select().from(s.livestockTypes).where(eq(s.livestockTypes.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.livestock.types.create",
  objectType: "AGRICULTURE_LIVESTOCK_TYPE",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.livestockTypes, body as Record<string, unknown>, agriActor(ctx), "agriculture.livestock.types.create", "AGRICULTURE_LIVESTOCK_TYPE"),
});
