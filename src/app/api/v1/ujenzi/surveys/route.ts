import { z } from "zod";
import { recordSurveyObservation } from "@/lib/ujenzi";
import { ujenziCreateRoute } from "@/lib/ujenzi/http";

const Schema = z.object({
  siteId: z.string().min(1),
  method: z.string().min(1),
  crs: z.string().min(3),
  eastingOrLon: z.number().optional(),
  northingOrLat: z.number().optional(),
  elevationM: z.number().optional(),
  accuracyM: z.number().optional(),
  observedOn: z.string().optional(),
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.surveys.create",
  objectType: "UJENZI_SURVEY",
  schema: Schema,
  create: (ctx, body) => recordSurveyObservation({ tenantId: ctx.principal.tenantId, ...body }),
});
