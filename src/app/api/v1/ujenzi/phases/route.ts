/** UJENZI OS — phases */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { insertUjenziRow } from "@/lib/ujenzi";

const CreateSchema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  plannedStart: z.string().optional(),
  plannedEnd: z.string().optional(),
  actualStart: z.string().optional(),
  actualEnd: z.string().optional(),
  progressPct: z.string().optional(),
  status: z.string().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.phases.list",
  objectType: "UJENZI_PROJECT_PHASE",
  load: async (ctx, request) => {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const conditions = [eq(s.ujenziProjectPhases.tenantId, ctx.principal.tenantId)];
    if (projectId) conditions.push(eq(s.ujenziProjectPhases.projectId, projectId));
    const rows = await db.select().from(s.ujenziProjectPhases).where(and(...conditions));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.phases.create",
  objectType: "UJENZI_PROJECT_PHASE",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertUjenziRow(s.ujenziProjectPhases, body as Record<string, unknown>, ujenziActor(ctx), "ujenzi.phases.create", "UJENZI_PROJECT_PHASE"),
});
