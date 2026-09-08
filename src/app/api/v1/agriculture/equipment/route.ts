/** Agriculture OS — equipment */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  equipmentKind: z.string().min(1),
  farmId: z.string().min(1).optional(),
  serialNo: z.string().min(1).optional(),
  acquiredOn: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.equipment.list",
  objectType: "AGRICULTURE_EQUIPMENT",
  load: async (ctx) => {
    const rows = await db.select().from(s.equipment).where(eq(s.equipment.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.equipment.create",
  objectType: "AGRICULTURE_EQUIPMENT",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.equipment, body as Record<string, unknown>, agriActor(ctx), "agriculture.equipment.create", "AGRICULTURE_EQUIPMENT"),
});
