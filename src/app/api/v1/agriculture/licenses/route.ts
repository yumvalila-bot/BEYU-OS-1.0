/** Agriculture OS — licenses */
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
  action: "agriculture.licenses.list",
  objectType: "AGRICULTURE_LICENSE",
  load: async (ctx) => {
    const rows = await db.select().from(s.licenses).where(eq(s.licenses.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.licenses.create",
  objectType: "AGRICULTURE_LICENSE",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.licenses, body as Record<string, unknown>, agriActor(ctx), "agriculture.licenses.create", "AGRICULTURE_LICENSE"),
});
