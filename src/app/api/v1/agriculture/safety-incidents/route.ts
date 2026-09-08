/** Agriculture OS — safety-incidents */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  occurredOn: z.string().min(1),
  title: z.string().min(1),
  farmId: z.string().min(1).optional(),
  severity: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.safety.incidents.list",
  objectType: "AGRICULTURE_SAFETY_INCIDENT",
  load: async (ctx) => {
    const rows = await db.select().from(s.safetyIncidents).where(eq(s.safetyIncidents.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.safety.incidents.create",
  objectType: "AGRICULTURE_SAFETY_INCIDENT",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.safetyIncidents, body as Record<string, unknown>, agriActor(ctx), "agriculture.safety.incidents.create", "AGRICULTURE_SAFETY_INCIDENT"),
});
