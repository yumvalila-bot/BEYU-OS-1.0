/** UJENZI OS — claims */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { submitClaim } from "@/lib/ujenzi";

const CreateSchema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  title: z.string().min(1),
  claimant: z.string().optional(),
  respondent: z.string().optional(),
  amount: z.string().optional(),
  currency: z.string().optional(),
  noticeDate: z.string().optional(),
  description: z.string().optional(),
  evidenceRef: z.string().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.claims.list",
  objectType: "UJENZI_CLAIM",
  load: async (ctx, request) => {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const conditions = [eq(s.ujenziClaims.tenantId, ctx.principal.tenantId)];
    if (projectId) conditions.push(eq(s.ujenziClaims.projectId, projectId));
    const rows = await db.select().from(s.ujenziClaims).where(and(...conditions));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.claims.create",
  objectType: "UJENZI_CLAIM",
  schema: CreateSchema,
  create: async (ctx, body) => submitClaim({ ...body, tenantId: ctx.principal.tenantId }, ujenziActor(ctx)),
});
