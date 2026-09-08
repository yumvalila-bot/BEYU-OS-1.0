/** Agriculture OS — projects */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  legalEntityId: z.string().min(1).optional(),
  startsOn: z.string().min(1).optional(),
  endsOn: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.projects.list",
  objectType: "AGRICULTURE_PROJECT",
  load: async (ctx) => {
    const rows = await db.select().from(s.projects).where(eq(s.projects.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.projects.create",
  objectType: "AGRICULTURE_PROJECT",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.projects, body as Record<string, unknown>, agriActor(ctx), "agriculture.projects.create", "AGRICULTURE_PROJECT"),
});
