/** POST /api/v1/agriculture/sync — idempotent offline envelope ingest */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { acceptSyncEnvelope } from "@/lib/agriculture";
import { agriActor, agriErrorResponse } from "@/lib/agriculture/http";

const SyncSchema = z.object({
  envelopeId: z.string().min(8).max(128),
  deviceId: z.string().optional(),
  operation: z.string().min(1).max(80),
  payload: z.record(z.string(), z.unknown()),
  clientOccurredAt: z.string().min(1),
});

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.sync.accept",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_SYNC_ENVELOPE" },
    },
    async (ctx) => {
      try {
        const parsed = SyncSchema.parse(await request.json());
        const result = await acceptSyncEnvelope({ tenantId: ctx.principal.tenantId, ...parsed }, agriActor(ctx));
        return NextResponse.json(result, { status: result.replay ? 200 : 201 });
      } catch (err) {
        return agriErrorResponse(err, ctx.traceId);
      }
    },
  );
}
