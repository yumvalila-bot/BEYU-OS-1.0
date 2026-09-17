/** UJENZI OS — equipment allocations */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { allocateEquipment } from "@/lib/ujenzi";

const CreateSchema = z.object({
  equipmentId: z.string().min(1),
  projectId: z.string().min(1),
  allocatedFrom: z.string().optional(),
  allocatedTo: z.string().optional(),
  notes: z.string().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.equipmentAllocations.list",
  objectType: "UJENZI_EQUIPMENT_ALLOCATION",
  load: async (ctx, request) => {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const conditions = [eq(s.ujenziEquipmentAllocations.tenantId, ctx.principal.tenantId)];
    if (projectId) conditions.push(eq(s.ujenziEquipmentAllocations.projectId, projectId));
    const rows = await db.select().from(s.ujenziEquipmentAllocations).where(and(...conditions));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.equipmentAllocations.create",
  objectType: "UJENZI_EQUIPMENT_ALLOCATION",
  schema: CreateSchema,
  create: async (ctx, body) => allocateEquipment({ ...body, tenantId: ctx.principal.tenantId }, ujenziActor(ctx)),
});
