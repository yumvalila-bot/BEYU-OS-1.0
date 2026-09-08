/** Agriculture OS — hazards */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  hazardKind: z.string().min(1),
  farmId: z.string().min(1).optional(),
  likelihood: z.number().int().optional(),
  impact: z.number().int().optional(),
  notes: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.hazards.list",
  objectType: "AGRICULTURE_HAZARD",
  load: async (ctx) => {
    const rows = await db.select().from(s.hazardRegister).where(eq(s.hazardRegister.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.hazards.create",
  objectType: "AGRICULTURE_HAZARD",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.hazardRegister, body as Record<string, unknown>, agriActor(ctx), "agriculture.hazards.create", "AGRICULTURE_HAZARD"),
});
