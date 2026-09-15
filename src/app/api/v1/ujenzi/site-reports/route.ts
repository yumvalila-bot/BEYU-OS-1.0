import { z } from "zod";
import { recordSiteReport } from "@/lib/ujenzi";
import { ujenziCreateRoute } from "@/lib/ujenzi/http";

const Schema = z.object({
  projectId: z.string().min(1),
  reportDate: z.string().min(1),
  body: z.string().min(1),
  offlineEnvelopeId: z.string().optional(),
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.site_reports.create",
  objectType: "UJENZI_SITE_REPORT",
  schema: Schema,
  create: (ctx, body) => recordSiteReport({ tenantId: ctx.principal.tenantId, ...body }),
});
