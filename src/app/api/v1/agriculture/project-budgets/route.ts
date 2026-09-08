/** Agriculture OS — project-budgets */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  projectId: z.string().min(1),
  period: z.string().min(1),
  amount: z.string().min(1),
  currency: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.project.budgets.list",
  objectType: "AGRICULTURE_PROJECT_BUDGET",
  load: async (ctx) => {
    const rows = await db.select().from(s.projectBudgets).where(eq(s.projectBudgets.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.project.budgets.create",
  objectType: "AGRICULTURE_PROJECT_BUDGET",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.projectBudgets, body as Record<string, unknown>, agriActor(ctx), "agriculture.project.budgets.create", "AGRICULTURE_PROJECT_BUDGET"),
});
