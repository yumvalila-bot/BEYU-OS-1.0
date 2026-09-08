/** Agriculture OS — hazard-mitigations */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  hazardId: z.string().min(1),
  title: z.string().min(1),
  ownerRole: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.hazard.mitigations.list",
  objectType: "AGRICULTURE_HAZARD_MITIGATION",
  load: async (ctx) => {
    const rows = await db.select().from(s.hazardMitigations).where(eq(s.hazardMitigations.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.hazard.mitigations.create",
  objectType: "AGRICULTURE_HAZARD_MITIGATION",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.hazardMitigations, body as Record<string, unknown>, agriActor(ctx), "agriculture.hazard.mitigations.create", "AGRICULTURE_HAZARD_MITIGATION"),
});
