/** Agriculture OS — tree-species */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1).optional(),
  typicalYieldUnit: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.tree.species.list",
  objectType: "AGRICULTURE_TREE_SPECIES",
  load: async (ctx) => {
    const rows = await db.select().from(s.treeSpecies).where(eq(s.treeSpecies.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.tree.species.create",
  objectType: "AGRICULTURE_TREE_SPECIES",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.treeSpecies, body as Record<string, unknown>, agriActor(ctx), "agriculture.tree.species.create", "AGRICULTURE_TREE_SPECIES"),
});
