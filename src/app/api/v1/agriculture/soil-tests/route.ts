/** Agriculture OS — soil-tests */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  sampledOn: z.string().min(1),
  fieldId: z.string().min(1).optional(),
  ph: z.union([z.string(), z.number()]).transform(String).optional(),
  organicMatterPct: z.union([z.string(), z.number()]).transform(String).optional(),
  nitrogenPpm: z.string().min(1).optional(),
  phosphorusPpm: z.string().min(1).optional(),
  potassiumPpm: z.string().min(1).optional(),
  labName: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.soil.tests.list",
  objectType: "AGRICULTURE_SOIL_TEST",
  load: async (ctx) => {
    const rows = await db.select().from(s.soilTests).where(eq(s.soilTests.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.soil.tests.create",
  objectType: "AGRICULTURE_SOIL_TEST",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.soilTests, body as Record<string, unknown>, agriActor(ctx), "agriculture.soil.tests.create", "AGRICULTURE_SOIL_TEST"),
});
