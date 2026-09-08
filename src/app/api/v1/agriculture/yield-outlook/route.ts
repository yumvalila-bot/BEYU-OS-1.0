/** Agriculture OS — yield-outlook */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  asOf: z.string().min(1),
  method: z.string().min(1),
  explanation: z.string().min(1),
  cropCycleId: z.string().min(1).optional(),
  outlookKg: z.union([z.string(), z.number()]).transform(String).optional(),
  basis: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.yield.outlook.list",
  objectType: "AGRICULTURE_YIELD_OUTLOOK",
  load: async (ctx) => {
    const rows = await db.select().from(s.yieldOutlook).where(eq(s.yieldOutlook.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.yield.outlook.create",
  objectType: "AGRICULTURE_YIELD_OUTLOOK",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.yieldOutlook, body as Record<string, unknown>, agriActor(ctx), "agriculture.yield.outlook.create", "AGRICULTURE_YIELD_OUTLOOK"),
});
