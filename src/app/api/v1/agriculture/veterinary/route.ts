/** Agriculture OS — veterinary */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  herdId: z.string().min(1),
  recordDate: z.string().min(1),
  recordKind: z.string().min(1),
  animalId: z.string().min(1).optional(),
  diagnosis: z.string().min(1).optional(),
  treatment: z.string().min(1).optional(),
  performedBy: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.veterinary.list",
  objectType: "AGRICULTURE_VETERINARY_RECORD",
  load: async (ctx) => {
    const rows = await db.select().from(s.veterinaryRecords).where(eq(s.veterinaryRecords.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.veterinary.create",
  objectType: "AGRICULTURE_VETERINARY_RECORD",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.veterinaryRecords, body as Record<string, unknown>, agriActor(ctx), "agriculture.veterinary.create", "AGRICULTURE_VETERINARY_RECORD"),
});
