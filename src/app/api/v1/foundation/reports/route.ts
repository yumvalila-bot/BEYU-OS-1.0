/**
 * BEYU Foundation OS — governed reports.
 *
 * GET /api/v1/foundation/reports?type=executive&foundationId=…
 *     type = executive | donor | grant | impact | tax
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { apiError } from "@/lib/api";
import {
  donorReport,
  executiveSummary,
  grantReport,
  impactReport,
  taxPositionReport,
} from "@/lib/foundation/reports";
import { foundationErrorResponse } from "../_shared";

const REPORT_PERMISSION: Record<string, "foundation:registry.read" | "foundation:donor.read" | "foundation:grant.read" | "foundation:impact.read" | "foundation:tax.read"> = {
  executive: "foundation:registry.read",
  donor: "foundation:donor.read",
  grant: "foundation:grant.read",
  impact: "foundation:impact.read",
  tax: "foundation:tax.read",
};

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "executive";
  const permission = REPORT_PERMISSION[type];
  if (!permission) {
    return apiError("VALIDATION_FAILED", `Unknown report type ${type}`, 422, "report");
  }
  return guarded(
    request,
    {
      permission,
      action: `foundation.report.${type}`,
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_REPORT" },
    },
    async (ctx) => {
      try {
        const params = new URL(request.url).searchParams;
        switch (type) {
          case "executive": {
            const foundationId = params.get("foundationId");
            if (!foundationId) return apiError("VALIDATION_FAILED", "foundationId is required", 422, ctx.traceId);
            return NextResponse.json(await executiveSummary(ctx.principal, foundationId, new Date().toISOString().slice(0, 10)));
          }
          case "donor": {
            const donorId = params.get("donorId");
            if (!donorId) return apiError("VALIDATION_FAILED", "donorId is required", 422, ctx.traceId);
            return NextResponse.json(await donorReport(ctx.principal, donorId));
          }
          case "grant": {
            const grantId = params.get("grantId");
            if (!grantId) return apiError("VALIDATION_FAILED", "grantId is required", 422, ctx.traceId);
            return NextResponse.json(await grantReport(ctx.principal, grantId));
          }
          case "impact":
            return NextResponse.json(await impactReport(ctx.principal, params.get("programId") ?? undefined));
          case "tax": {
            const foundationId = params.get("foundationId");
            if (!foundationId) return apiError("VALIDATION_FAILED", "foundationId is required", 422, ctx.traceId);
            return NextResponse.json(await taxPositionReport(ctx.principal, foundationId));
          }
          default:
            return apiError("VALIDATION_FAILED", `Unknown report type ${type}`, 422, ctx.traceId);
        }
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
