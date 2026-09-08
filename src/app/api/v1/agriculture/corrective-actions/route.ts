/** Agriculture OS — corrective-actions */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  title: z.string().min(1),
  violationId: z.string().min(1).optional(),
  dueOn: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.corrective.actions.list",
  objectType: "AGRICULTURE_CORRECTIVE_ACTION",
  load: async (ctx) => {
    const rows = await db.select().from(s.correctiveActions).where(eq(s.correctiveActions.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.corrective.actions.create",
  objectType: "AGRICULTURE_CORRECTIVE_ACTION",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.correctiveActions, body as Record<string, unknown>, agriActor(ctx), "agriculture.corrective.actions.create", "AGRICULTURE_CORRECTIVE_ACTION"),
});
