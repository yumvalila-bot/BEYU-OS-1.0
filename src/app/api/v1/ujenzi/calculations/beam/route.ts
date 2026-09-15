import { z } from "zod";
import { recordEngineeringCalculation, runSimpleUdlBeamMoment } from "@/lib/ujenzi";
import { ujenziActor, ujenziCreateRoute } from "@/lib/ujenzi/http";

const Schema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  w: z.number(),
  L: z.number(),
  wUnit: z.string(),
  LUnit: z.string(),
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.calculations.beam",
  objectType: "UJENZI_CALCULATION",
  schema: Schema,
  create: async (ctx, body) => {
    const run = runSimpleUdlBeamMoment({ w: body.w, L: body.L, wUnit: body.wUnit, LUnit: body.LUnit });
    const stored = await recordEngineeringCalculation(
      {
        tenantId: ctx.principal.tenantId,
        projectId: body.projectId,
        code: body.code,
        discipline: "STRUCTURAL",
        method: run.family,
        formulaOrModel: "M = wL^2/8",
        inputs: run.inputs,
        result: run.result,
        assumptions: run.warnings,
      },
      ujenziActor(ctx),
    );
    return { ...stored, ...run };
  },
});
