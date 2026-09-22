/**
 * Universal Dimensional Graphics Foundation — governed scene configurations.
 *
 * GET  → list scene configurations visible to the principal (tenant-scoped,
 *        classification-filtered, RLS-bounded). Permission: viz:scene.read.
 * POST → create a scene configuration. Requires viz:scene.manage AND the
 *        visualized sector's OWN read boundary at creation time — a principal
 *        cannot pre-configure a scene into data they cannot read. Creating a
 *        scene never mutates sector data and never posts anything
 *        (CAP_POSTING stays LOCKED).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded, parseBody } from "@/lib/api";
import { listScenes, createScene } from "@/lib/viz/service";
import { VIZ_SECTOR_CODES } from "@/lib/viz/dimensions";
import { vizActor, vizErrorResponse } from "../_shared";

const CreateSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    sector: z.enum(VIZ_SECTOR_CODES as unknown as [string, ...string[]]),
    subjectType: z.string().trim().min(1).max(120).nullish(),
    subjectId: z.string().trim().min(1).max(200).nullish(),
    dimensions: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
    layers: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(120),
            dimensionId: z.string().trim().min(1).max(40),
            kind: z.enum(["TABLE", "MAP", "SPATIAL", "TIMELINE", "CHART", "METRIC_RAIL", "RISK_OVERLAY"]),
            label: z.string().trim().min(1).max(200),
            visible: z.boolean(),
          })
          .strict(),
      )
      .max(40)
      .optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    legalEntityId: z.string().trim().min(1).max(200).nullish(),
    classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]).optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "viz:scene.read",
      action: "viz.scene.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "VIZ_SCENE" },
    },
    async (ctx) => {
      try {
        const params = new URL(request.url).searchParams;
        const sector = params.get("sector");
        const status = params.get("status");
        const scenes = await listScenes(ctx.principal, {
          ...(sector ? { sector: sector as (typeof VIZ_SECTOR_CODES)[number] } : {}),
          ...(status === "ARCHIVED" ? { status: "ARCHIVED" as const } : {}),
        });
        return NextResponse.json({ scenes });
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
      permission: "viz:scene.manage",
      action: "viz.scene.create",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "VIZ_SCENE" },
    },
    async (ctx) => {
      const body = await parseBody(request, CreateSchema);
      try {
        const scene = await createScene(
          {
            ...body,
            sector: body.sector as (typeof VIZ_SECTOR_CODES)[number],
            subjectType: body.subjectType ?? null,
            subjectId: body.subjectId ?? null,
            legalEntityId: body.legalEntityId ?? null,
          },
          vizActor(ctx),
          ctx.principal,
        );
        return NextResponse.json({ scene }, { status: 201 });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}
