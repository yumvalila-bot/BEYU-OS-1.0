/** Agriculture OS — field-zones */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  fieldId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  zoneKind: z.string().min(1).optional(),
  areaHa: z.union([z.string(), z.number()]).transform(String).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.field.zones.list",
  objectType: "AGRICULTURE_FIELD_ZONE",
  load: async (ctx) => {
    const rows = await db.select().from(s.fieldZones).where(eq(s.fieldZones.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.field.zones.create",
  objectType: "AGRICULTURE_FIELD_ZONE",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.fieldZones, body as Record<string, unknown>, agriActor(ctx), "agriculture.field.zones.create", "AGRICULTURE_FIELD_ZONE"),
});
