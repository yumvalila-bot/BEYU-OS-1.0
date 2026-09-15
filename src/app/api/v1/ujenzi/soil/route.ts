import { z } from "zod";
import { recordSoilTest } from "@/lib/ujenzi";
import { ujenziActor, ujenziCreateRoute } from "@/lib/ujenzi/http";

const Schema = z.object({
  siteId: z.string().min(1),
  testKind: z.string().min(1),
  laboratoryName: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
  assumed: z.boolean().optional(),
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.soil.create",
  objectType: "UJENZI_SOIL_TEST",
  schema: Schema,
  create: (ctx, body) => recordSoilTest({ tenantId: ctx.principal.tenantId, ...body }, ujenziActor(ctx)),
});
