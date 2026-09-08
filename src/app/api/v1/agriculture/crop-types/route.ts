/** Agriculture OS — crop-types */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  variety: z.string().min(1).optional(),
  unitOfMeasure: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.crop.types.list",
  objectType: "AGRICULTURE_CROP_TYPE",
  load: async (ctx) => {
    const rows = await db.select().from(s.cropTypes).where(eq(s.cropTypes.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.crop.types.create",
  objectType: "AGRICULTURE_CROP_TYPE",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.cropTypes, body as Record<string, unknown>, agriActor(ctx), "agriculture.crop.types.create", "AGRICULTURE_CROP_TYPE"),
});
