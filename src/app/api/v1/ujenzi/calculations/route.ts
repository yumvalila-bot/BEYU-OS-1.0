import { z } from "zod";
import { recordEngineeringCalculation } from "@/lib/ujenzi";
import { ujenziActor, ujenziCreateRoute } from "@/lib/ujenzi/http";

const Schema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1).max(50),
  discipline: z.string().min(1),
  method: z.string().min(1),
  formulaOrModel: z.string().min(1),
  inputs: z.record(z.unknown()),
  result: z.record(z.unknown()),
  assumptions: z.array(z.string()).optional(),
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.calculations.create",
  objectType: "UJENZI_CALCULATION",
  schema: Schema,
  create: (ctx, body) =>
    recordEngineeringCalculation({ tenantId: ctx.principal.tenantId, ...body }, ujenziActor(ctx)),
});
