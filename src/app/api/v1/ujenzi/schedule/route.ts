import { z } from "zod";
import { recordScheduleActivity } from "@/lib/ujenzi";
import { ujenziCreateRoute } from "@/lib/ujenzi/http";

const Schema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  durationDays: z.number().int().optional(),
  predecessorCode: z.string().optional(),
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.schedule.create",
  objectType: "UJENZI_SCHEDULE",
  schema: Schema,
  create: (ctx, body) => recordScheduleActivity({ tenantId: ctx.principal.tenantId, ...body }),
});
