/** Agriculture OS — process-runs */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  processKind: z.string().min(1),
  startedAt: z.string().min(1),
  batchId: z.string().min(1).optional(),
  endedAt: z.string().min(1).optional(),
  inputQty: z.string().min(1).optional(),
  outputQty: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.process.runs.list",
  objectType: "AGRICULTURE_PROCESS_RUN",
  load: async (ctx) => {
    const rows = await db.select().from(s.processRuns).where(eq(s.processRuns.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.process.runs.create",
  objectType: "AGRICULTURE_PROCESS_RUN",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.processRuns, body as Record<string, unknown>, agriActor(ctx), "agriculture.process.runs.create", "AGRICULTURE_PROCESS_RUN"),
});
