import { z } from "zod";
import { ingestGeoJsonDataset } from "@/lib/ujenzi";
import { ujenziCreateRoute } from "@/lib/ujenzi/http";

const Schema = z.object({
  projectId: z.string().optional(),
  code: z.string().min(1),
  title: z.string().min(1),
  source: z.string().min(1),
  crs: z.string().min(3),
  geojson: z.unknown(),
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.gis.ingest",
  objectType: "UJENZI_GIS_DATASET",
  schema: Schema,
  create: (ctx, body) => ingestGeoJsonDataset({ tenantId: ctx.principal.tenantId, ...body }),
});
