import { z } from "zod";
import { recordItp } from "@/lib/ujenzi";
import { ujenziCreateRoute } from "@/lib/ujenzi/http";

const Schema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  title: z.string().min(1),
  acceptanceCriteria: z.string().min(1),
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.itp.create",
  objectType: "UJENZI_ITP",
  schema: Schema,
  create: (ctx, body) => recordItp({ tenantId: ctx.principal.tenantId, ...body }),
});
