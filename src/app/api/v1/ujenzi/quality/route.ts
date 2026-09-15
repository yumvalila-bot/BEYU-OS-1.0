import { z } from "zod";
import { recordNcr } from "@/lib/ujenzi";
import { ujenziCreateRoute } from "@/lib/ujenzi/http";

const Schema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  title: z.string().min(1),
  twinObjectKind: z.string().optional(),
  twinObjectId: z.string().optional(),
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.quality.ncr",
  objectType: "UJENZI_NCR",
  schema: Schema,
  create: (ctx, body) => recordNcr({ tenantId: ctx.principal.tenantId, ...body }),
});
