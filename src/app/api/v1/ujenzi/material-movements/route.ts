/** UJENZI OS — material movements */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { recordMaterialMovement } from "@/lib/ujenzi";

const CreateSchema = z.object({
  projectId: z.string().min(1),
  siteId: z.string().optional(),
  materialId: z.string().min(1),
  movementType: z.enum(["RECEIPT", "ISSUE", "RETURN", "WASTAGE"]),
  quantity: z.string().min(1),
  unit: z.string().min(1),
  unitCost: z.string().optional(),
  reference: z.string().optional(),
  movedOn: z.string().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.materialMovements.list",
  objectType: "UJENZI_MATERIAL_MOVEMENT",
  load: async (ctx, request) => {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const conditions = [eq(s.ujenziMaterialMovements.tenantId, ctx.principal.tenantId)];
    if (projectId) conditions.push(eq(s.ujenziMaterialMovements.projectId, projectId));
    const rows = await db.select().from(s.ujenziMaterialMovements).where(and(...conditions));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.materialMovements.record",
  objectType: "UJENZI_MATERIAL_MOVEMENT",
  schema: CreateSchema,
  create: async (ctx, body) => recordMaterialMovement({ ...body, tenantId: ctx.principal.tenantId }, ujenziActor(ctx)),
});
