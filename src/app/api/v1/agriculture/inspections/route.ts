/** Agriculture OS — inspections */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  inspectedOn: z.string().min(1),
  farmId: z.string().min(1).optional(),
  inspector: z.string().min(1).optional(),
  outcome: z.string().min(1).optional(),
  findings: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.inspections.list",
  objectType: "AGRICULTURE_INSPECTION",
  load: async (ctx) => {
    const rows = await db.select().from(s.inspections).where(eq(s.inspections.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.inspections.create",
  objectType: "AGRICULTURE_INSPECTION",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.inspections, body as Record<string, unknown>, agriActor(ctx), "agriculture.inspections.create", "AGRICULTURE_INSPECTION"),
});
