import { z } from "zod";
import { recordHseIncident } from "@/lib/ujenzi";
import { ujenziCreateRoute } from "@/lib/ujenzi/http";

const Schema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  title: z.string().min(1),
  severity: z.string().optional(),
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.hse.incident",
  objectType: "UJENZI_HSE",
  schema: Schema,
  create: (ctx, body) => recordHseIncident({ tenantId: ctx.principal.tenantId, ...body }),
});
