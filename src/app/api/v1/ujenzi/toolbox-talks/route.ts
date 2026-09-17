/** UJENZI OS — toolboxTalks */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { insertUjenziRow } from "@/lib/ujenzi";

const CreateSchema = z.object({
  projectId: z.string().min(1),
  talkDate: z.string().min(1),
  topic: z.string().min(1),
  attendees: z.number().int().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.toolboxTalks.list",
  objectType: "UJENZI_TOOLBOX_TALK",
  load: async (ctx, request) => {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const conditions = [eq(s.ujenziToolboxTalks.tenantId, ctx.principal.tenantId)];
    if (projectId) conditions.push(eq(s.ujenziToolboxTalks.projectId, projectId));
    const rows = await db.select().from(s.ujenziToolboxTalks).where(and(...conditions));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.toolboxTalks.create",
  objectType: "UJENZI_TOOLBOX_TALK",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertUjenziRow(s.ujenziToolboxTalks, body as Record<string, unknown>, ujenziActor(ctx), "ujenzi.toolboxTalks.create", "UJENZI_TOOLBOX_TALK"),
});
