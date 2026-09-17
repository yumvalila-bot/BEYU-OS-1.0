/** UJENZI OS — purchaseOrders */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { createPurchaseOrder } from "@/lib/ujenzi";

const CreateSchema = z.object({
  projectId: z.string().min(1),
  requisitionId: z.string().optional(),
  code: z.string().min(1),
  supplierName: z.string().optional(),
  description: z.string().optional(),
  amount: z.string().optional(),
  currency: z.string().optional(),
  orderDate: z.string().optional(),
  expectedDelivery: z.string().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.purchaseOrders.list",
  objectType: "UJENZI_PURCHASE_ORDER",
  load: async (ctx, request) => {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const conditions = [eq(s.ujenziPurchaseOrders.tenantId, ctx.principal.tenantId)];
    if (projectId) conditions.push(eq(s.ujenziPurchaseOrders.projectId, projectId));
    const rows = await db.select().from(s.ujenziPurchaseOrders).where(and(...conditions));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.purchaseOrders.create",
  objectType: "UJENZI_PURCHASE_ORDER",
  schema: CreateSchema,
  create: async (ctx, body) => createPurchaseOrder({ ...body, tenantId: ctx.principal.tenantId }, ujenziActor(ctx)),
});
