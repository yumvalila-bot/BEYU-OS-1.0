/** Agriculture OS — trace-links */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  fromBatchId: z.string().min(1),
  toBatchId: z.string().min(1),
  linkKind: z.string().min(1).optional(),
  qty: z.union([z.string(), z.number()]).transform(String).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.trace.links.list",
  objectType: "AGRICULTURE_TRACE_LINK",
  load: async (ctx) => {
    const rows = await db.select().from(s.traceLinks).where(eq(s.traceLinks.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.trace.links.create",
  objectType: "AGRICULTURE_TRACE_LINK",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.traceLinks, body as Record<string, unknown>, agriActor(ctx), "agriculture.trace.links.create", "AGRICULTURE_TRACE_LINK"),
});
