/** UJENZI OS — governed transition: projects.handover */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { ujenziActor, ujenziErrorResponse } from "@/lib/ujenzi/http";
import { handoverProject } from "@/lib/ujenzi";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "ujenzi:data.manage",
      action: "ujenzi.projects.handover",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "UJENZI_PROJECT", objectId: id },
    },
    async (ctx) => {
      try {
        const body = await request.json().catch(() => ({}));
        const result = await handoverProject({ tenantId: ctx.principal.tenantId, projectId: id }, ujenziActor(ctx));
        return NextResponse.json(result);
      } catch (err) {
        return ujenziErrorResponse(err, ctx.traceId);
      }
    },
  );
}
