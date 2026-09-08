/** Agriculture OS — assets */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { agriListRoute, agriCreateRoute, agriActor } from "@/lib/agriculture/http";
import { insertAgriRow } from "@/lib/agriculture";

const CreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  assetKind: z.string().min(1),
  farmId: z.string().min(1).optional(),
  acquiredOn: z.string().min(1).optional(),
});

export const GET = agriListRoute({
  action: "agriculture.assets.list",
  objectType: "AGRICULTURE_ASSET",
  load: async (ctx) => {
    const rows = await db.select().from(s.assetRegister).where(eq(s.assetRegister.tenantId, ctx.principal.tenantId));
    return { items: rows };
  },
});

export const POST = agriCreateRoute({
  action: "agriculture.assets.create",
  objectType: "AGRICULTURE_ASSET",
  schema: CreateSchema,
  create: async (ctx, body) =>
    insertAgriRow(s.assetRegister, body as Record<string, unknown>, agriActor(ctx), "agriculture.assets.create", "AGRICULTURE_ASSET"),
});
