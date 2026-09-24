/**
 * Holograph — governed device registry.
 *
 * GET  → list registered devices (tenant-scoped, classification-filtered).
 *        Permission: viz:asset.read (presentation registries are read under
 *        the registries-read grant; devices are presentation security
 *        contexts, never an authorization boundary).
 * POST → register a device (viz:device.manage — HIGH-RISK, MFA step-up).
 *        No physical holographic hardware support exists or is claimed:
 *        FUTURE_HOLOGRAPHIC_DEVICE devices start NOT_IMPLEMENTED and can
 *        never be activated.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded, parseBody } from "@/lib/api";
import { listDevices, registerDevice } from "@/lib/viz/devices";
import { VIZ_DEVICE_CLASSES, VIZ_DEVICE_STATUS } from "@/db/schema/visualization";
import { vizActor, vizErrorResponse } from "../_shared";

const CreateSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    deviceClass: z.enum(VIZ_DEVICE_CLASSES as unknown as [string, ...string[]]),
    renderingBackend: z.string().trim().min(1).max(60),
    capabilities: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    rationale: z.string().trim().min(4).max(2000),
    classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]).optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "viz:asset.read",
      action: "viz.device.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "VIZ_DEVICE" },
    },
    async (ctx) => {
      try {
        const params = new URL(request.url).searchParams;
        const devices = await listDevices(ctx.principal, {
          ...(params.get("deviceClass") ? { deviceClass: params.get("deviceClass")! } : {}),
          ...(params.get("status") ? { status: params.get("status") as (typeof VIZ_DEVICE_STATUS)[number] } : {}),
        });
        return NextResponse.json({ devices });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "viz:device.manage",
      action: "viz.device.register",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "VIZ_DEVICE" },
    },
    async (ctx) => {
      const body = await parseBody(request, CreateSchema);
      try {
        const device = await registerDevice(body, vizActor(ctx), ctx.principal);
        return NextResponse.json({ device }, { status: 201 });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}
