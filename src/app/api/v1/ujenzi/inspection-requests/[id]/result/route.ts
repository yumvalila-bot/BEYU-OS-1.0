/** UJENZI OS — governed transition: inspectionRequests.result */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { ujenziActor, ujenziErrorResponse } from "@/lib/ujenzi/http";
import { recordInspectionResult } from "@/lib/ujenzi";

const Schema = z.object({
  result: z.enum(["PASSED", "FAILED", "REJECTED"]),
  findings: z.string().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "ujenzi:data.manage",
      action: "ujenzi.inspectionRequests.result",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "UJENZI_INSPECTION_REQUEST", objectId: id },
    },
    async (ctx) => {
      try {
        const body = Schema.parse(await request.json());
        const result = await recordInspectionResult({ tenantId: ctx.principal.tenantId, inspectionRequestId: id, result: body.result, findings: body.findings }, ujenziActor(ctx));
        return NextResponse.json(result);
      } catch (err) {
        return ujenziErrorResponse(err, ctx.traceId);
      }
    },
  );
}
