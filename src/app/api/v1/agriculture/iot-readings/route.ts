/** Agriculture OS — iot-readings */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  deviceId: z.string().min(1),
  capturedAt: z.string().min(1),
  metricCode: z.string().min(1),
  value: z.union([z.string(), z.number()]).transform(String),
  unit: z.string().min(1),

});

export const GET = agriListRoute({
  action: "agriculture.iot.readings.list",
  objectType: "AGRICULTURE_IOT_READING",
  load: async (ctx) => {
    const rows = await db.select().from(s.iotReadings).where(eq(s.iotReadings.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.iot.readings.create",
  objectType: "AGRICULTURE_IOT_READING",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.iotReadings, body as Record<string, unknown>, agriActor(ctx), "agriculture.iot.readings.create", "AGRICULTURE_IOT_READING"),
});
