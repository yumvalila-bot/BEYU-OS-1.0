/** UJENZI OS — ncrs */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { createNcr } from "@/lib/ujenzi";

const CreateSchema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  dueDate: z.string().optional(),
  raisedOn: z.string().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.ncrs.list",
  objectType: "UJENZI_NCR",
  load: async (ctx, request) => {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const conditions = [eq(s.ujenziNcrs.tenantId, ctx.principal.tenantId)];
    if (projectId) conditions.push(eq(s.ujenziNcrs.projectId, projectId));
    const rows = await db.select().from(s.ujenziNcrs).where(and(...conditions));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.ncrs.create",
  objectType: "UJENZI_NCR",
  schema: CreateSchema,
  create: async (ctx, body) => createNcr({ ...body, tenantId: ctx.principal.tenantId }, ujenziActor(ctx)),
});
