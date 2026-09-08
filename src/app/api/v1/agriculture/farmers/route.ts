/** Agriculture OS — farmers */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  code: z.string().min(1),
  displayName: z.string().min(1),
  legalEntityId: z.string().min(1).optional(),
  partyId: z.string().min(1).optional(),
  farmerKind: z.string().min(1).optional(),
  countryCode: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.farmers.list",
  objectType: "AGRICULTURE_FARMER",
  load: async (ctx) => {
    const rows = await db.select().from(s.farmers).where(eq(s.farmers.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.farmers.create",
  objectType: "AGRICULTURE_FARMER",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.farmers, body as Record<string, unknown>, agriActor(ctx), "agriculture.farmers.create", "AGRICULTURE_FARMER"),
});
