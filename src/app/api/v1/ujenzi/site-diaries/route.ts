/** UJENZI OS — siteDiaries */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { recordSiteDiary } from "@/lib/ujenzi";

const CreateSchema = z.object({
  projectId: z.string().min(1),
  siteId: z.string().optional(),
  diaryDate: z.string().min(1),
  weather: z.string().optional(),
  labourCount: z.number().int().optional(),
  labourHours: z.string().optional(),
  workDone: z.string().optional(),
  hindrances: z.string().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.siteDiaries.list",
  objectType: "UJENZI_SITE_DIARY",
  load: async (ctx, request) => {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const conditions = [eq(s.ujenziSiteDiaries.tenantId, ctx.principal.tenantId)];
    if (projectId) conditions.push(eq(s.ujenziSiteDiaries.projectId, projectId));
    const rows = await db.select().from(s.ujenziSiteDiaries).where(and(...conditions));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.siteDiaries.create",
  objectType: "UJENZI_SITE_DIARY",
  schema: CreateSchema,
  create: async (ctx, body) => recordSiteDiary({ ...body, tenantId: ctx.principal.tenantId }, ujenziActor(ctx)),
});
