/** Agriculture OS — lab-results */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  sampledOn: z.string().min(1),
  analyte: z.string().min(1),
  value: z.union([z.string(), z.number()]).transform(String),
  unit: z.string().min(1),
  fieldId: z.string().min(1).optional(),
  labName: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.lab.results.list",
  objectType: "AGRICULTURE_LAB_RESULT",
  load: async (ctx) => {
    const rows = await db.select().from(s.labResults).where(eq(s.labResults.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.lab.results.create",
  objectType: "AGRICULTURE_LAB_RESULT",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.labResults, body as Record<string, unknown>, agriActor(ctx), "agriculture.lab.results.create", "AGRICULTURE_LAB_RESULT"),
});
