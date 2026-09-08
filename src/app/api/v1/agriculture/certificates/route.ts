/** Agriculture OS — certificates */
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
  scheme: z.string().min(1).optional(),
  issuedOn: z.string().min(1).optional(),
  expiresOn: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.certificates.list",
  objectType: "AGRICULTURE_CERTIFICATE",
  load: async (ctx) => {
    const rows = await db.select().from(s.certificates).where(eq(s.certificates.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.certificates.create",
  objectType: "AGRICULTURE_CERTIFICATE",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.certificates, body as Record<string, unknown>, agriActor(ctx), "agriculture.certificates.create", "AGRICULTURE_CERTIFICATE"),
});
