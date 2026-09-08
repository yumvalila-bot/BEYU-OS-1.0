/** Agriculture OS — violations */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  title: z.string().min(1),
  inspectionId: z.string().min(1).optional(),
  severity: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.violations.list",
  objectType: "AGRICULTURE_VIOLATION",
  load: async (ctx) => {
    const rows = await db.select().from(s.violations).where(eq(s.violations.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.violations.create",
  objectType: "AGRICULTURE_VIOLATION",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.violations, body as Record<string, unknown>, agriActor(ctx), "agriculture.violations.create", "AGRICULTURE_VIOLATION"),
});
