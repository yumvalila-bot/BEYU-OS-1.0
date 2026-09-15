import { z } from "zod";
import { createWorkPackage } from "@/lib/ujenzi";
import { ujenziCreateRoute } from "@/lib/ujenzi/http";

const Schema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  title: z.string().min(1),
  scheduleActivityId: z.string().optional(),
  plannedQty: z.string().optional(),
  unit: z.string().optional(),
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.work_packages.create",
  objectType: "UJENZI_WORK_PACKAGE",
  schema: Schema,
  create: (ctx, body) => createWorkPackage({ tenantId: ctx.principal.tenantId, ...body }),
});
