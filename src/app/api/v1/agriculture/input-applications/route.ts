/** Agriculture OS — input-applications */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  cropCycleId: z.string().min(1),
  inputId: z.string().min(1),
  appliedDate: z.string().min(1),
  quantityApplied: z.string().min(1),
  applicationMethod: z.string().min(1).optional(),
  appliedBy: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.input.applications.list",
  objectType: "AGRICULTURE_INPUT_APPLICATION",
  load: async (ctx) => {
    const rows = await db.select().from(s.inputApplications).where(eq(s.inputApplications.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.input.applications.create",
  objectType: "AGRICULTURE_INPUT_APPLICATION",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.inputApplications, body as Record<string, unknown>, agriActor(ctx), "agriculture.input.applications.create", "AGRICULTURE_INPUT_APPLICATION"),
});
