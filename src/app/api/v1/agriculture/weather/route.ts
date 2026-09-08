/** Agriculture OS — weather */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  capturedAt: z.string().min(1),
  provider: z.string().min(1),
  farmId: z.string().min(1).optional(),
  locationLabel: z.string().min(1).optional(),
  gpsLatitude: z.string().min(1).optional(),
  gpsLongitude: z.string().min(1).optional(),
  temperatureC: z.union([z.string(), z.number()]).transform(String).optional(),
  rainfallMm: z.union([z.string(), z.number()]).transform(String).optional(),
  humidityPct: z.union([z.string(), z.number()]).transform(String).optional(),
  windMs: z.union([z.string(), z.number()]).transform(String).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.weather.list",
  objectType: "AGRICULTURE_WEATHER_READING",
  load: async (ctx) => {
    const rows = await db.select().from(s.weatherReadings).where(eq(s.weatherReadings.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.weather.create",
  objectType: "AGRICULTURE_WEATHER_READING",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.weatherReadings, body as Record<string, unknown>, agriActor(ctx), "agriculture.weather.create", "AGRICULTURE_WEATHER_READING"),
});
