/** Agriculture OS — equipment-service */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  equipmentId: z.string().min(1),
  serviceDate: z.string().min(1),
  serviceKind: z.string().min(1),
  notes: z.string().min(1).optional(),
  performedBy: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.equipment.service.list",
  objectType: "AGRICULTURE_EQUIPMENT_SERVICE",
  load: async (ctx) => {
    const rows = await db.select().from(s.equipmentService).where(eq(s.equipmentService.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.equipment.service.create",
  objectType: "AGRICULTURE_EQUIPMENT_SERVICE",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.equipmentService, body as Record<string, unknown>, agriActor(ctx), "agriculture.equipment.service.create", "AGRICULTURE_EQUIPMENT_SERVICE"),
});
