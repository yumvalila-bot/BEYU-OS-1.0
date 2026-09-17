/** UJENZI OS — sites */
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
  location: z.string().optional(),
  region: z.string().optional(),
  status: z.string().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.sites.list",
  objectType: "UJENZI_PROJECT_SITE",
  load: async (ctx, request) => {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const conditions = [eq(s.ujenziProjectSites.tenantId, ctx.principal.tenantId)];
    if (projectId) conditions.push(eq(s.ujenziProjectSites.projectId, projectId));
    const rows = await db.select().from(s.ujenziProjectSites).where(and(...conditions));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.sites.create",
  objectType: "UJENZI_PROJECT_SITE",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertUjenziRow(s.ujenziProjectSites, body as Record<string, unknown>, ujenziActor(ctx), "ujenzi.sites.create", "UJENZI_PROJECT_SITE"),
});
