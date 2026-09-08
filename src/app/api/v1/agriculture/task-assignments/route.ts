/** Agriculture OS — task-assignments */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  taskId: z.string().min(1),
  assigneeUserId: z.string().min(1).optional(),
  assigneeRole: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.task.assignments.list",
  objectType: "AGRICULTURE_TASK_ASSIGNMENT",
  load: async (ctx) => {
    const rows = await db.select().from(s.taskAssignments).where(eq(s.taskAssignments.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.task.assignments.create",
  objectType: "AGRICULTURE_TASK_ASSIGNMENT",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.taskAssignments, body as Record<string, unknown>, agriActor(ctx), "agriculture.task.assignments.create", "AGRICULTURE_TASK_ASSIGNMENT"),
});
