/** UJENZI OS — hazards */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { createHazard } from "@/lib/ujenzi";

const CreateSchema = z.object({
  projectId: z.string().min(1),
  hazard: z.string().min(1),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  mitigation: z.string().optional(),
  identifiedOn: z.string().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.hazards.list",
  objectType: "UJENZI_HAZARD",
  load: async (ctx, request) => {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const conditions = [eq(s.ujenziHazardRegister.tenantId, ctx.principal.tenantId)];
    if (projectId) conditions.push(eq(s.ujenziHazardRegister.projectId, projectId));
    const rows = await db.select().from(s.ujenziHazardRegister).where(and(...conditions));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.hazards.create",
  objectType: "UJENZI_HAZARD",
  schema: CreateSchema,
  create: async (ctx, body) => createHazard({ ...body, tenantId: ctx.principal.tenantId }, ujenziActor(ctx)),
});
