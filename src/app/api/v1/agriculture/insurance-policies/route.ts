/** Agriculture OS — insurance-policies */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  policyNo: z.string().min(1),
  insurer: z.string().min(1),
  coverKind: z.string().min(1),
  effectiveFrom: z.string().min(1),
  farmId: z.string().min(1).optional(),
  effectiveTo: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.insurance.policies.list",
  objectType: "AGRICULTURE_INSURANCE_POLICY",
  load: async (ctx) => {
    const rows = await db.select().from(s.insurancePolicies).where(eq(s.insurancePolicies.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.insurance.policies.create",
  objectType: "AGRICULTURE_INSURANCE_POLICY",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.insurancePolicies, body as Record<string, unknown>, agriActor(ctx), "agriculture.insurance.policies.create", "AGRICULTURE_INSURANCE_POLICY"),
});
