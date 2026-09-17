/** UJENZI OS — milestones */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { insertUjenziRow } from "@/lib/ujenzi";

const CreateSchema = z.object({
  projectId: z.string().min(1),
  phaseId: z.string().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  dueDate: z.string().optional(),
  achievedDate: z.string().optional(),
  status: z.string().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.milestones.list",
  objectType: "UJENZI_MILESTONE",
  load: async (ctx, request) => {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const conditions = [eq(s.ujenziMilestones.tenantId, ctx.principal.tenantId)];
    if (projectId) conditions.push(eq(s.ujenziMilestones.projectId, projectId));
    const rows = await db.select().from(s.ujenziMilestones).where(and(...conditions));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.milestones.create",
  objectType: "UJENZI_MILESTONE",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertUjenziRow(s.ujenziMilestones, body as Record<string, unknown>, ujenziActor(ctx), "ujenzi.milestones.create", "UJENZI_MILESTONE"),
});
