/** UJENZI OS — requisitions */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { createRequisition } from "@/lib/ujenzi";

const CreateSchema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  description: z.string().min(1),
  requiredBy: z.string().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.requisitions.list",
  objectType: "UJENZI_REQUISITION",
  load: async (ctx, request) => {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const conditions = [eq(s.ujenziRequisitions.tenantId, ctx.principal.tenantId)];
    if (projectId) conditions.push(eq(s.ujenziRequisitions.projectId, projectId));
    const rows = await db.select().from(s.ujenziRequisitions).where(and(...conditions));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.requisitions.create",
  objectType: "UJENZI_REQUISITION",
  schema: CreateSchema,
  create: async (ctx, body) => createRequisition({ ...body, tenantId: ctx.principal.tenantId }, ujenziActor(ctx)),
});
