/** UJENZI OS — inspectionRequests */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { createInspectionRequest } from "@/lib/ujenzi";

const CreateSchema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  inspectionType: z.string().min(1),
  requestedFor: z.string().optional(),
  inspector: z.string().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.inspectionRequests.list",
  objectType: "UJENZI_INSPECTION_REQUEST",
  load: async (ctx, request) => {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const conditions = [eq(s.ujenziInspectionRequests.tenantId, ctx.principal.tenantId)];
    if (projectId) conditions.push(eq(s.ujenziInspectionRequests.projectId, projectId));
    const rows = await db.select().from(s.ujenziInspectionRequests).where(and(...conditions));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.inspectionRequests.create",
  objectType: "UJENZI_INSPECTION_REQUEST",
  schema: CreateSchema,
  create: async (ctx, body) => createInspectionRequest({ ...body, tenantId: ctx.principal.tenantId }, ujenziActor(ctx)),
});
