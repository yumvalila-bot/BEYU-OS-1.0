/** UJENZI OS — hseIncidents */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { recordHseIncident } from "@/lib/ujenzi";

const CreateSchema = z.object({
  projectId: z.string().min(1),
  siteId: z.string().optional(),
  incidentType: z.enum(["INCIDENT", "NEAR_MISS"]).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  occurredAt: z.string().optional(),
  description: z.string().min(1),
});

export const GET = ujenziListRoute({
  action: "ujenzi.hseIncidents.list",
  objectType: "UJENZI_HSE_INCIDENT",
  load: async (ctx, request) => {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const conditions = [eq(s.ujenziHseIncidents.tenantId, ctx.principal.tenantId)];
    if (projectId) conditions.push(eq(s.ujenziHseIncidents.projectId, projectId));
    const rows = await db.select().from(s.ujenziHseIncidents).where(and(...conditions));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.hseIncidents.create",
  objectType: "UJENZI_HSE_INCIDENT",
  schema: CreateSchema,
  create: async (ctx, body) => recordHseIncident({ ...body, tenantId: ctx.principal.tenantId }, ujenziActor(ctx)),
});
