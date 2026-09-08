/** Agriculture OS — land-parcels */
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
  areaHa: z.union([z.string(), z.number()]).transform(String),
  tenureType: z.string().min(1).optional(),
  titleRef: z.string().min(1).optional(),
  countryCode: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  gpsLatitude: z.string().min(1).optional(),
  gpsLongitude: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.land.parcels.list",
  objectType: "AGRICULTURE_LAND_PARCEL",
  load: async (ctx) => {
    const rows = await db.select().from(s.landParcels).where(eq(s.landParcels.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.land.parcels.create",
  objectType: "AGRICULTURE_LAND_PARCEL",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.landParcels, body as Record<string, unknown>, agriActor(ctx), "agriculture.land.parcels.create", "AGRICULTURE_LAND_PARCEL"),
});
