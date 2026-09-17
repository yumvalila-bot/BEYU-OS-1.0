/** UJENZI OS — material catalog */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { createMaterial } from "@/lib/ujenzi";

const CreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional(),
  unit: z.string().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.materials.list",
  objectType: "UJENZI_MATERIAL",
  load: async (ctx) => {
    const rows = await db.select().from(s.ujenziMaterialCatalog).where(eq(s.ujenziMaterialCatalog.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.materials.create",
  objectType: "UJENZI_MATERIAL",
  schema: CreateSchema,
  create: async (ctx, body) => createMaterial({ ...body, tenantId: ctx.principal.tenantId }, ujenziActor(ctx)),
});
