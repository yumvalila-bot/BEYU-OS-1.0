/** UJENZI OS — boqs */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { createBoq } from "@/lib/ujenzi";

const CreateSchema = z.object({
  projectId: z.string().min(1),
  notes: z.string().optional(),
  currency: z.string().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.boqs.list",
  objectType: "UJENZI_BOQ",
  load: async (ctx, request) => {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const conditions = [eq(s.ujenziBoqs.tenantId, ctx.principal.tenantId)];
    if (projectId) conditions.push(eq(s.ujenziBoqs.projectId, projectId));
    const rows = await db.select().from(s.ujenziBoqs).where(and(...conditions));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.boqs.create",
  objectType: "UJENZI_BOQ",
  schema: CreateSchema,
  create: async (ctx, body) => createBoq({ ...body, tenantId: ctx.principal.tenantId }, ujenziActor(ctx)),
});
