/** Agriculture OS — aqua-units */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  farmId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  unitKind: z.string().min(1).optional(),
  volumeM3: z.union([z.string(), z.number()]).transform(String).optional(),
  areaHa: z.union([z.string(), z.number()]).transform(String).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.aqua.units.list",
  objectType: "AGRICULTURE_AQUA_UNIT",
  load: async (ctx) => {
    const rows = await db.select().from(s.aquaUnits).where(eq(s.aquaUnits.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.aqua.units.create",
  objectType: "AGRICULTURE_AQUA_UNIT",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.aquaUnits, body as Record<string, unknown>, agriActor(ctx), "agriculture.aqua.units.create", "AGRICULTURE_AQUA_UNIT"),
});
