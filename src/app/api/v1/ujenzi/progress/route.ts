import { z } from "zod";
import { certifyProgress } from "@/lib/ujenzi";
import { ujenziActor, ujenziCreateRoute } from "@/lib/ujenzi/http";

const Schema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1).max(50),
  period: z.string().min(1),
  certifiedAmount: z.string().optional(),
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.progress.create",
  objectType: "UJENZI_PROGRESS_CERTIFICATE",
  schema: Schema,
  create: (ctx, body) => certifyProgress({ tenantId: ctx.principal.tenantId, ...body }, ujenziActor(ctx)),
});
