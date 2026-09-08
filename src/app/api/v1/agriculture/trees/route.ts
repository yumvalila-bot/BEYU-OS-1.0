/** Agriculture OS — trees */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  farmId: z.string().min(1),
  speciesId: z.string().min(1),
  code: z.string().min(1),
  fieldId: z.string().min(1).optional(),
  plantedOn: z.string().min(1).optional(),
  gpsLatitude: z.string().min(1).optional(),
  gpsLongitude: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.trees.list",
  objectType: "AGRICULTURE_TREE",
  load: async (ctx) => {
    const rows = await db.select().from(s.trees).where(eq(s.trees.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.trees.create",
  objectType: "AGRICULTURE_TREE",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.trees, body as Record<string, unknown>, agriActor(ctx), "agriculture.trees.create", "AGRICULTURE_TREE"),
});
