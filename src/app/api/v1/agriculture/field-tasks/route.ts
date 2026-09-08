/** Agriculture OS — field-tasks */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  title: z.string().min(1),
  workOrderId: z.string().min(1).optional(),
  fieldId: z.string().min(1).optional(),
  dueOn: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.field.tasks.list",
  objectType: "AGRICULTURE_FIELD_TASK",
  load: async (ctx) => {
    const rows = await db.select().from(s.fieldTasks).where(eq(s.fieldTasks.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.field.tasks.create",
  objectType: "AGRICULTURE_FIELD_TASK",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.fieldTasks, body as Record<string, unknown>, agriActor(ctx), "agriculture.field.tasks.create", "AGRICULTURE_FIELD_TASK"),
});
