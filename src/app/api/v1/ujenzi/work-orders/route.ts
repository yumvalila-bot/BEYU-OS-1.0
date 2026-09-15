import { z } from "zod";
import { recordWorkOrder } from "@/lib/ujenzi";
import { ujenziCreateRoute } from "@/lib/ujenzi/http";

const Schema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  title: z.string().min(1),
  assetId: z.string().optional(),
  workKind: z.string().optional(),
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.work_orders.create",
  objectType: "UJENZI_WORK_ORDER",
  schema: Schema,
  create: (ctx, body) => recordWorkOrder({ tenantId: ctx.principal.tenantId, ...body }),
});
