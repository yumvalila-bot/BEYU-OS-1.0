/** UJENZI OS — equipment register */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { createEquipment } from "@/lib/ujenzi";

const CreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  equipmentType: z.string().optional(),
  ownership: z.enum(["OWNED", "LEASED", "HIRED"]).optional(),
  legalEntityId: z.string().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.equipment.list",
  objectType: "UJENZI_EQUIPMENT",
  load: async (ctx) => {
    const rows = await db.select().from(s.ujenziEquipment).where(eq(s.ujenziEquipment.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.equipment.create",
  objectType: "UJENZI_EQUIPMENT",
  schema: CreateSchema,
  create: async (ctx, body) => createEquipment({ ...body, tenantId: ctx.principal.tenantId }, ujenziActor(ctx)),
});
