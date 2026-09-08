/** Agriculture OS — project-milestones */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  dueOn: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.project.milestones.list",
  objectType: "AGRICULTURE_PROJECT_MILESTONE",
  load: async (ctx) => {
    const rows = await db.select().from(s.projectMilestones).where(eq(s.projectMilestones.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.project.milestones.create",
  objectType: "AGRICULTURE_PROJECT_MILESTONE",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.projectMilestones, body as Record<string, unknown>, agriActor(ctx), "agriculture.project.milestones.create", "AGRICULTURE_PROJECT_MILESTONE"),
});
