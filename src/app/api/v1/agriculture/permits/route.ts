/** Agriculture OS — permits */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  farmId: z.string().min(1).optional(),
  issuer: z.string().min(1).optional(),
  issuedOn: z.string().min(1).optional(),
  expiresOn: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.permits.list",
  objectType: "AGRICULTURE_PERMIT",
  load: async (ctx) => {
    const rows = await db.select().from(s.permits).where(eq(s.permits.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.permits.create",
  objectType: "AGRICULTURE_PERMIT",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.permits, body as Record<string, unknown>, agriActor(ctx), "agriculture.permits.create", "AGRICULTURE_PERMIT"),
});
