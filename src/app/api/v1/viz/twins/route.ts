/**
 * Universal Dimensional Graphics Foundation — digital-twin registrations.
 *
 * GET  → list twin identity bindings visible to the principal. Permission:
 *        viz:scene.read.
 * POST → register a twin binding (`sector:subjectType:subjectId`). Requires
 *        viz:scene.manage AND the sector's own read boundary — a twin cannot
 *        be pinned into unreadable data. A registration is an IDENTITY
 *        binding only: twin state is projected LIVE from the adapter on every
 *        access and is never cached here.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded, parseBody } from "@/lib/api";
import { listTwins, registerTwin } from "@/lib/viz/service";
import { VIZ_SECTOR_CODES } from "@/lib/viz/dimensions";
import { vizActor, vizErrorResponse } from "../_shared";

const RegisterSchema = z
  .object({
    sector: z.enum(VIZ_SECTOR_CODES as unknown as [string, ...string[]]),
    subjectType: z.string().trim().min(1).max(120),
    subjectId: z.string().trim().min(1).max(200),
    name: z.string().trim().min(2).max(200),
    legalEntityId: z.string().trim().min(1).max(200).nullish(),
    classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]).optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "viz:scene.read",
      action: "viz.twin.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "VIZ_DIGITAL_TWIN" },
    },
    async (ctx) => {
      try {
        const sector = new URL(request.url).searchParams.get("sector");
        const twins = await listTwins(ctx.principal, sector ? { sector: sector as (typeof VIZ_SECTOR_CODES)[number] } : {});
        return NextResponse.json({ twins });
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
      action: "viz.twin.register",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "VIZ_DIGITAL_TWIN" },
    },
    async (ctx) => {
      const body = await parseBody(request, RegisterSchema);
      try {
        const twin = await registerTwin(
          { ...body, sector: body.sector as (typeof VIZ_SECTOR_CODES)[number], legalEntityId: body.legalEntityId ?? null },
          vizActor(ctx),
          ctx.principal,
        );
        return NextResponse.json({ twin }, { status: 201 });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}
