import { z } from "zod";
import { recordRfi } from "@/lib/ujenzi";
import { ujenziCreateRoute } from "@/lib/ujenzi/http";

const Schema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  question: z.string().min(1),
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.rfis.create",
  objectType: "UJENZI_RFI",
  schema: Schema,
  create: (ctx, body) => recordRfi({ tenantId: ctx.principal.tenantId, ...body }),
});
