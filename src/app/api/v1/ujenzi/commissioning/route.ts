import { z } from "zod";
import { recordCommissioningTest } from "@/lib/ujenzi";
import { ujenziCreateRoute } from "@/lib/ujenzi/http";

const Schema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  systemName: z.string().min(1),
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.commissioning.create",
  objectType: "UJENZI_COMMISSIONING",
  schema: Schema,
  create: (ctx, body) => recordCommissioningTest({ tenantId: ctx.principal.tenantId, ...body }),
});
