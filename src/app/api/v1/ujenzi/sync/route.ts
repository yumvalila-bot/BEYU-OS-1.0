import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { acceptSyncEnvelope } from "@/lib/ujenzi";
import { ujenziActor, ujenziErrorResponse } from "@/lib/ujenzi/http";

const SyncSchema = z.object({
  envelopeId: z.string().min(1),
  deviceId: z.string().optional(),
  operation: z.string().min(1),
  payload: z.record(z.unknown()),
  clientOccurredAt: z.string().min(1),
});

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "ujenzi:data.manage",
      action: "ujenzi.sync.accept",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "UJENZI_SYNC_ENVELOPE" },
    },
    async (ctx) => {
      try {
        const parsed = SyncSchema.parse(await request.json());
        const result = await acceptSyncEnvelope({ tenantId: ctx.principal.tenantId, ...parsed }, ujenziActor(ctx));
        return NextResponse.json(result, { status: result.replay ? 200 : 201 });
      } catch (err) {
        return ujenziErrorResponse(err, ctx.traceId);
      }
    },
  );
}
