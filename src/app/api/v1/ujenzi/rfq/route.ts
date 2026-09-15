import { z } from "zod";
import { createRfq } from "@/lib/ujenzi";
import { ujenziCreateRoute } from "@/lib/ujenzi/http";

const Schema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  title: z.string().min(1),
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.rfq.create",
  objectType: "UJENZI_RFQ",
  schema: Schema,
  create: (ctx, body) => createRfq({ tenantId: ctx.principal.tenantId, ...body }),
});
