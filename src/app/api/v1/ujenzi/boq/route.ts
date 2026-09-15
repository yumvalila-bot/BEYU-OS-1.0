import { z } from "zod";
import { recordBoqItem } from "@/lib/ujenzi";
import { ujenziCreateRoute } from "@/lib/ujenzi/http";

const Schema = z.object({
  projectId: z.string().min(1),
  itemCode: z.string().min(1),
  description: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.string().min(1),
  sourceKind: z.string().min(1),
  sourceId: z.string().optional(),
  rate: z.string().optional(),
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.boq.create",
  objectType: "UJENZI_BOQ",
  schema: Schema,
  create: (ctx, body) => recordBoqItem({ tenantId: ctx.principal.tenantId, ...body }),
});
