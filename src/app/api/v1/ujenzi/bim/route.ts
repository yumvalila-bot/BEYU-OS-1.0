import { z } from "zod";
import { registerBimArtifact } from "@/lib/ujenzi";
import { ujenziCreateRoute } from "@/lib/ujenzi/http";

const Schema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  discipline: z.string().optional(),
  contentBase64: z.string().min(1),
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.bim.register",
  objectType: "UJENZI_BIM_ARTIFACT",
  schema: Schema,
  create: (ctx, body) =>
    registerBimArtifact({
      tenantId: ctx.principal.tenantId,
      projectId: body.projectId,
      code: body.code,
      discipline: body.discipline,
      bytes: Buffer.from(body.contentBase64, "base64"),
    }),
});
