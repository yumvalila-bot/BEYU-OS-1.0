/** Agriculture OS — observations */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  observedAt: z.string().min(1),
  observationKind: z.string().min(1),
  body: z.string().min(1),
  farmId: z.string().min(1).optional(),
  fieldId: z.string().min(1).optional(),
  gpsLatitude: z.string().min(1).optional(),
  gpsLongitude: z.string().min(1).optional(),
  observedBy: z.string().min(1).optional(),
  offlineEnvelopeId: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.observations.list",
  objectType: "AGRICULTURE_FIELD_OBSERVATION",
  load: async (ctx) => {
    const rows = await db.select().from(s.fieldObservations).where(eq(s.fieldObservations.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.observations.create",
  objectType: "AGRICULTURE_FIELD_OBSERVATION",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.fieldObservations, body as Record<string, unknown>, agriActor(ctx), "agriculture.observations.create", "AGRICULTURE_FIELD_OBSERVATION"),
});
