/** Agriculture OS — irrigation */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  irrigatedOn: z.string().min(1),
  fieldId: z.string().min(1).optional(),
  waterSourceId: z.string().min(1).optional(),
  volumeM3: z.union([z.string(), z.number()]).transform(String).optional(),
  method: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.irrigation.list",
  objectType: "AGRICULTURE_IRRIGATION_LOG",
  load: async (ctx) => {
    const rows = await db.select().from(s.irrigationLogs).where(eq(s.irrigationLogs.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.irrigation.create",
  objectType: "AGRICULTURE_IRRIGATION_LOG",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.irrigationLogs, body as Record<string, unknown>, agriActor(ctx), "agriculture.irrigation.create", "AGRICULTURE_IRRIGATION_LOG"),
});
