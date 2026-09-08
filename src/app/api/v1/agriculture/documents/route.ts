/** Agriculture OS — documents */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  farmId: z.string().min(1).optional(),
  uri: z.string().min(1).optional(),
  checksum: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.documents.list",
  objectType: "AGRICULTURE_DOCUMENT",
  load: async (ctx) => {
    const rows = await db.select().from(s.agriDocuments).where(eq(s.agriDocuments.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.documents.create",
  objectType: "AGRICULTURE_DOCUMENT",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.agriDocuments, body as Record<string, unknown>, agriActor(ctx), "agriculture.documents.create", "AGRICULTURE_DOCUMENT"),
});
