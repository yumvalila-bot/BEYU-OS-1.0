/** Agriculture OS — pest-observations */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  observedAt: z.string().min(1),
  pestName: z.string().min(1),
  fieldId: z.string().min(1).optional(),
  severity: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.pest.observations.list",
  objectType: "AGRICULTURE_PEST_OBSERVATION",
  load: async (ctx) => {
    const rows = await db.select().from(s.pestObservations).where(eq(s.pestObservations.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.pest.observations.create",
  objectType: "AGRICULTURE_PEST_OBSERVATION",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.pestObservations, body as Record<string, unknown>, agriActor(ctx), "agriculture.pest.observations.create", "AGRICULTURE_PEST_OBSERVATION"),
});
