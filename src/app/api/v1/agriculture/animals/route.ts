/** Agriculture OS — animals */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  herdId: z.string().min(1),
  tagCode: z.string().min(1),
  sex: z.string().min(1).optional(),
  birthDate: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.animals.list",
  objectType: "AGRICULTURE_ANIMAL",
  load: async (ctx) => {
    const rows = await db.select().from(s.animals).where(eq(s.animals.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.animals.create",
  objectType: "AGRICULTURE_ANIMAL",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.animals, body as Record<string, unknown>, agriActor(ctx), "agriculture.animals.create", "AGRICULTURE_ANIMAL"),
});
