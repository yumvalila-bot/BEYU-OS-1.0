/** Agriculture OS — inventory-moves */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  lotId: z.string().min(1),
  moveKind: z.string().min(1),
  qty: z.union([z.string(), z.number()]).transform(String),
  reason: z.string().min(1).optional(),
  refType: z.string().min(1).optional(),
  refId: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.inventory.moves.list",
  objectType: "AGRICULTURE_INVENTORY_MOVE",
  load: async (ctx) => {
    const rows = await db.select().from(s.inventoryMoves).where(eq(s.inventoryMoves.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.inventory.moves.create",
  objectType: "AGRICULTURE_INVENTORY_MOVE",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.inventoryMoves, body as Record<string, unknown>, agriActor(ctx), "agriculture.inventory.moves.create", "AGRICULTURE_INVENTORY_MOVE"),
});
