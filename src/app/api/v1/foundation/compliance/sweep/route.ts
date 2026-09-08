/**
 * BEYU Foundation OS — timely compliance sweep.
 *
 * POST /api/v1/foundation/compliance/sweep { todayIso?, channels? }
 *
 * Idempotent: re-running schedules nothing twice. Intended for a governed
 * scheduler invoking with a service principal holding
 * foundation:compliance.manage.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { runComplianceSweep } from "@/lib/foundation/compliance";
import type { NotificationChannel } from "@/lib/foundation/types";
import { foundationErrorResponse, foundationServiceContext } from "../../_shared";

const SweepSchema = z.object({
  todayIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  channels: z.array(z.enum(["IN_APP", "EMAIL", "PUSH", "SMS", "CALENDAR", "WEBHOOK"])).optional(),
});

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:compliance.manage",
      action: "foundation.compliance.sweep",
      rateLimit: { limit: 12, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_DEADLINE" },
    },
    async (ctx) => {
      try {
        const body = SweepSchema.parse(await request.json().catch(() => ({})));
        const result = await runComplianceSweep(foundationServiceContext(ctx), {
          todayIso: body.todayIso ?? new Date().toISOString().slice(0, 10),
          channels: body.channels as NotificationChannel[] | undefined,
        });
        return NextResponse.json(result);
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
