/** Agriculture OS — insurance-claims */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  policyId: z.string().min(1),
  claimNo: z.string().min(1),
  filedOn: z.string().min(1),
  amount: z.string().min(1).optional(),
  currency: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.insurance.claims.list",
  objectType: "AGRICULTURE_INSURANCE_CLAIM",
  load: async (ctx) => {
    const rows = await db.select().from(s.insuranceClaims).where(eq(s.insuranceClaims.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.insurance.claims.create",
  objectType: "AGRICULTURE_INSURANCE_CLAIM",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.insuranceClaims, body as Record<string, unknown>, agriActor(ctx), "agriculture.insurance.claims.create", "AGRICULTURE_INSURANCE_CLAIM"),
});
