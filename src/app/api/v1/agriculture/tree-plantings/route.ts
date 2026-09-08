/** Agriculture OS — tree-plantings */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  treeId: z.string().min(1),
  plantingDate: z.string().min(1),
  sourceLotId: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.tree.plantings.list",
  objectType: "AGRICULTURE_TREE_PLANTING",
  load: async (ctx) => {
    const rows = await db.select().from(s.treePlantings).where(eq(s.treePlantings.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.tree.plantings.create",
  objectType: "AGRICULTURE_TREE_PLANTING",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.treePlantings, body as Record<string, unknown>, agriActor(ctx), "agriculture.tree.plantings.create", "AGRICULTURE_TREE_PLANTING"),
});
