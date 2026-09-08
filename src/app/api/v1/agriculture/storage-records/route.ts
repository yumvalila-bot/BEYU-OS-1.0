/** Agriculture OS — storage-records */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  warehouseId: z.string().min(1),
  qty: z.union([z.string(), z.number()]).transform(String),
  storedOn: z.string().min(1),
  batchId: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.storage.records.list",
  objectType: "AGRICULTURE_STORAGE_RECORD",
  load: async (ctx) => {
    const rows = await db.select().from(s.storageRecords).where(eq(s.storageRecords.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.storage.records.create",
  objectType: "AGRICULTURE_STORAGE_RECORD",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.storageRecords, body as Record<string, unknown>, agriActor(ctx), "agriculture.storage.records.create", "AGRICULTURE_STORAGE_RECORD"),
});
