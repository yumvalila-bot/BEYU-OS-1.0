/** UJENZI OS — projects */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { createProject } from "@/lib/ujenzi";

const CreateSchema = z.object({
  legalEntityId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  countryCode: z.string().min(1),
  client: z.string().optional(),
  contractRef: z.string().optional(),
  contractValue: z.string().optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
  region: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().optional(),
  plannedEndDate: z.string().optional(),
  notes: z.string().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.projects.list",
  objectType: "UJENZI_PROJECT",
  load: async (ctx) => {
    const rows = await db.select().from(s.ujenziProjects).where(eq(s.ujenziProjects.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.projects.create",
  objectType: "UJENZI_PROJECT",
  schema: CreateSchema,
  create: async (ctx, body) => createProject({ ...body, tenantId: ctx.principal.tenantId }, ujenziActor(ctx)),
});
