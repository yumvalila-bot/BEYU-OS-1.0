/**
 * Holograph — governed render profiles.
 *
 * GET  → list render profiles (renderer kind × device class × quality tier ×
 *        object ceiling) with the canonical renderer's REAL availability.
 *        Permission: viz:asset.read.
 * POST → create a render profile (viz:asset.manage). A profile is a
 *        PRESENTATION declaration: it can only reduce fidelity, never widen
 *        data access.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded, parseBody } from "@/lib/api";
import { listRenderProfiles, createRenderProfile } from "@/lib/viz/render-profiles";
import { RENDERER_KINDS } from "@/lib/viz/renderers";
import { vizActor, vizErrorResponse } from "../_shared";

const CreateSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    deviceClass: z.string().trim().min(1).max(60).nullish(),
    renderer: z.enum(RENDERER_KINDS as unknown as [string, ...string[]]),
    qualityTier: z.enum(["LOW", "MEDIUM", "HIGH", "ULTRA"]).optional(),
    formats: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    maxObjects: z.number().int().min(1).max(100000).optional(),
    rationale: z.string().trim().min(4).max(2000),
    classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]).optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "viz:asset.read",
      action: "viz.renderProfile.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "VIZ_RENDER_PROFILE" },
    },
    async (ctx) => {
      try {
        const params = new URL(request.url).searchParams;
        const profiles = await listRenderProfiles(ctx.principal, {
          ...(params.get("status") === "ARCHIVED" ? { status: "ARCHIVED" as const } : {}),
        });
        return NextResponse.json({ profiles });
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
      permission: "viz:asset.manage",
      action: "viz.renderProfile.create",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "VIZ_RENDER_PROFILE" },
    },
    async (ctx) => {
      const body = await parseBody(request, CreateSchema);
      try {
        const profile = await createRenderProfile(
          {
            ...body,
            deviceClass: body.deviceClass ?? null,
          },
          vizActor(ctx),
          ctx.principal,
        );
        return NextResponse.json({ profile }, { status: 201 });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}
