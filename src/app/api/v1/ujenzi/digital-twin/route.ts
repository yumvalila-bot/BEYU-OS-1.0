import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { queryDigitalTwin, registerBuilding } from "@/lib/ujenzi";
import { ujenziActor, ujenziErrorResponse } from "@/lib/ujenzi/http";

const Schema = z.object({
  projectId: z.string().min(1),
  siteId: z.string().optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  occupancy: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    { permission: "ujenzi:data.read", action: "ujenzi.twin.query", rateLimit: { limit: 120, windowMs: 60_000 }, audit: { objectType: "UJENZI_TWIN" } },
    async (ctx) => {
      const projectId = request.nextUrl.searchParams.get("projectId") ?? undefined;
      return NextResponse.json(await queryDigitalTwin(ctx.principal.tenantId, projectId));
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    { permission: "ujenzi:data.manage", action: "ujenzi.twin.building.create", rateLimit: { limit: 60, windowMs: 60_000 }, audit: { objectType: "UJENZI_BUILDING" } },
    async (ctx) => {
      try {
        const body = Schema.parse(await request.json());
        return NextResponse.json(await registerBuilding({ tenantId: ctx.principal.tenantId, ...body }, ujenziActor(ctx)), { status: 201 });
      } catch (err) {
        return ujenziErrorResponse(err, ctx.traceId);
      }
    },
  );
}
