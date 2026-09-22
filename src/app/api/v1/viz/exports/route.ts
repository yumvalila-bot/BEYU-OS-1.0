/**
 * Universal Dimensional Graphics Foundation — the governed export path (§31).
 *
 * GET  → the export ledger for this tenant (viz_exports): every export is
 *        reconstructible evidence — format, sha256 content hash, byte size,
 *        row count, requester. Permission: viz:export.
 * POST → create a governed export of a stored scene or twin and return it as
 *        an attachment. VIEWING IS NOT EXPORTING: this path requires
 *        viz:export IN ADDITION to everything the view required, re-resolved
 *        per request. The content is the SAME governed manifest the screen
 *        receives (one projection, one allowlist) — an export can never be
 *        wider than the authorized view. Server-side artifacts are JSON/CSV;
 *        SVG/PNG are client-side from the identical manifest; PDF/IFC are
 *        NOT_IMPLEMENTED and honestly refused.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded, parseBody } from "@/lib/api";
import { createExport, listExports } from "@/lib/viz/service";
import { VIZ_SECTOR_CODES } from "@/lib/viz/dimensions";
import { contentDisposition } from "@/lib/viz/exports";
import { vizActor, vizErrorResponse } from "../_shared";

const CreateSchema = z
  .object({
    sceneId: z.string().trim().min(1).max(200).nullish(),
    twinId: z.string().trim().min(1).max(200).nullish(),
    sector: z.enum(VIZ_SECTOR_CODES as unknown as [string, ...string[]]),
    format: z.enum(["JSON", "CSV"]),
    dimensions: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    subjectId: z.string().trim().min(1).max(200).nullish(),
  })
  .strict()
  .refine((v) => Boolean(v.sceneId) !== Boolean(v.twinId), {
    message: "Exactly one of sceneId or twinId is required.",
  });

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "viz:export",
      action: "viz.export.list",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "VIZ_EXPORT" },
    },
    async (ctx) => {
      try {
        const exports = await listExports(ctx.principal);
        return NextResponse.json({ exports });
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
      permission: "viz:export",
      action: "viz.export.create",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "VIZ_EXPORT" },
    },
    async (ctx) => {
      const body = await parseBody(request, CreateSchema);
      try {
        const { artifact } = await createExport(
          {
            sceneId: body.sceneId ?? null,
            twinId: body.twinId ?? null,
            sector: body.sector as (typeof VIZ_SECTOR_CODES)[number],
            dimensions: body.dimensions ?? [],
            subjectId: body.subjectId ?? null,
            format: body.format,
          },
          vizActor(ctx),
          ctx.principal,
        );
        // Attachment download: the exact governed bytes whose sha256 was just
        // ledgered — reconstructible evidence, filename ASCII-safe by
        // construction (no header-injection surface).
        return new NextResponse(artifact.content, {
          status: 201,
          headers: {
            "Content-Type": artifact.format === "CSV" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
            "Content-Disposition": contentDisposition(artifact),
            "X-BEYU-Export-Hash": artifact.contentHash,
          },
        });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}
