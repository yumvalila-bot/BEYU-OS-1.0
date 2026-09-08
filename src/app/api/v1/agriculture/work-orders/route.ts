/** Agriculture OS — work-orders */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  workKind: z.string().min(1),
  farmId: z.string().min(1).optional(),
  fieldId: z.string().min(1).optional(),
  dueOn: z.string().min(1).optional(),
  assignedRole: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.work.orders.list",
  objectType: "AGRICULTURE_WORK_ORDER",
  load: async (ctx) => {
    const rows = await db.select().from(s.workOrders).where(eq(s.workOrders.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.work.orders.create",
  objectType: "AGRICULTURE_WORK_ORDER",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.workOrders, body as Record<string, unknown>, agriActor(ctx), "agriculture.work.orders.create", "AGRICULTURE_WORK_ORDER"),
});
