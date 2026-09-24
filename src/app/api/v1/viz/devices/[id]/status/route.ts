/**
 * Holograph — governed device lifecycle.
 *
 * PATCH → transition a device's lifecycle (REGISTERED → ACTIVE → SUSPENDED;
 * any non-terminal → REVOKED; NOT_IMPLEMENTED → REGISTERED). Permission:
 * viz:device.manage (HIGH-RISK, MFA step-up). A FUTURE_HOLOGRAPHIC_DEVICE can
 * never be ACTIVE/SUSPENDED (no physical holographic hardware support exists
 * or is claimed), and ACTIVE additionally requires an IMPLEMENTED rendering
 * backend.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded, parseBody } from "@/lib/api";
import { setDeviceStatus } from "@/lib/viz/devices";
import { VIZ_DEVICE_STATUS } from "@/db/schema/visualization";
import { vizActor, vizErrorResponse } from "../../../_shared";

const StatusSchema = z
  .object({
    status: z.enum(VIZ_DEVICE_STATUS as unknown as [string, ...string[]]),
    rationale: z.string().trim().min(4).max(2000),
  })
  .strict();

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "viz:device.manage",
      action: "viz.device.status",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "VIZ_DEVICE", objectId: id },
    },
    async (ctx) => {
      const body = await parseBody(request, StatusSchema);
      try {
        const result = await setDeviceStatus(
          id,
          body.status as (typeof VIZ_DEVICE_STATUS)[number],
          body.rationale,
          vizActor(ctx),
          ctx.principal,
        );
        return NextResponse.json({ device: result });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}
