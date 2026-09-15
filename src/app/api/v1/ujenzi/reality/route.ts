import { z } from "zod";
import { registerRealityCapture } from "@/lib/ujenzi";
import { ujenziCreateRoute } from "@/lib/ujenzi/http";

const Schema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  captureKind: z.string().min(1),
  contentBase64: z.string().min(1),
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.reality.register",
  objectType: "UJENZI_REALITY_CAPTURE",
  schema: Schema,
  create: (ctx, body) =>
    registerRealityCapture({
      tenantId: ctx.principal.tenantId,
      projectId: body.projectId,
      code: body.code,
      captureKind: body.captureKind,
      bytes: Buffer.from(body.contentBase64, "base64"),
    }),
});
