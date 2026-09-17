/** UJENZI OS — punchItems */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { createPunchItem } from "@/lib/ujenzi";

const CreateSchema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  description: z.string().min(1),
  category: z.string().optional(),
  raisedOn: z.string().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.punchItems.list",
  objectType: "UJENZI_PUNCH_ITEM",
  load: async (ctx, request) => {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const conditions = [eq(s.ujenziPunchItems.tenantId, ctx.principal.tenantId)];
    if (projectId) conditions.push(eq(s.ujenziPunchItems.projectId, projectId));
    const rows = await db.select().from(s.ujenziPunchItems).where(and(...conditions));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.punchItems.create",
  objectType: "UJENZI_PUNCH_ITEM",
  schema: CreateSchema,
  create: async (ctx, body) => createPunchItem({ ...body, tenantId: ctx.principal.tenantId }, ujenziActor(ctx)),
});
