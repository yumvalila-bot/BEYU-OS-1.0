import { z } from "zod";
import { recordDefect } from "@/lib/ujenzi";
import { ujenziCreateRoute } from "@/lib/ujenzi/http";

const Schema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  title: z.string().min(1),
  severity: z.string().optional(),
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.defects.create",
  objectType: "UJENZI_DEFECT",
  schema: Schema,
  create: (ctx, body) => recordDefect({ tenantId: ctx.principal.tenantId, ...body }),
});
