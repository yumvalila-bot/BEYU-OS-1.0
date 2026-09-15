import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { createLandSite, listLandSites } from "@/lib/ujenzi";
import { ujenziActor, ujenziErrorResponse } from "@/lib/ujenzi/http";

const Schema = z.object({
  projectId: z.string().optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  countryCode: z.string().length(2).optional(),
  crs: z.string().min(3).optional(),
  gpsLatitude: z.string().optional(),
  gpsLongitude: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    { permission: "ujenzi:data.read", action: "ujenzi.sites.list", rateLimit: { limit: 120, windowMs: 60_000 }, audit: { objectType: "UJENZI_SITE" } },
    async (ctx) => NextResponse.json({ sites: await listLandSites(ctx.principal.tenantId) }),
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    { permission: "ujenzi:data.manage", action: "ujenzi.sites.create", rateLimit: { limit: 60, windowMs: 60_000 }, audit: { objectType: "UJENZI_SITE" } },
    async (ctx) => {
      try {
        const body = Schema.parse(await request.json());
        return NextResponse.json(await createLandSite({ tenantId: ctx.principal.tenantId, ...body }, ujenziActor(ctx)), { status: 201 });
      } catch (err) {
        return ujenziErrorResponse(err, ctx.traceId);
      }
    },
  );
}
