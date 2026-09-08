/** Agriculture OS — inputs */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  unitOfMeasure: z.string().min(1),
  manufacturer: z.string().min(1).optional(),
  registrationNumber: z.string().min(1).optional(),
  activeIngredient: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.inputs.list",
  objectType: "AGRICULTURE_INPUT",
  load: async (ctx) => {
    const rows = await db.select().from(s.agriInputs).where(eq(s.agriInputs.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.inputs.create",
  objectType: "AGRICULTURE_INPUT",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.agriInputs, body as Record<string, unknown>, agriActor(ctx), "agriculture.inputs.create", "AGRICULTURE_INPUT"),
});
