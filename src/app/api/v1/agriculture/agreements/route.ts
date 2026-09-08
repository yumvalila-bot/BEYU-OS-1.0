/** Agriculture OS — agreements */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  code: z.string().min(1),
  counterpartyName: z.string().min(1),
  agreementKind: z.string().min(1),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.agreements.list",
  objectType: "AGRICULTURE_AGREEMENT",
  load: async (ctx) => {
    const rows = await db.select().from(s.agreements).where(eq(s.agreements.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.agreements.create",
  objectType: "AGRICULTURE_AGREEMENT",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.agreements, body as Record<string, unknown>, agriActor(ctx), "agriculture.agreements.create", "AGRICULTURE_AGREEMENT"),
});
