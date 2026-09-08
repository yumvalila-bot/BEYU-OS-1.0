/**
 * BEYU Foundation OS — compliance health dashboard payload.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { complianceDashboard, deadlinesMissingEvidence } from "@/lib/foundation/compliance";

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:compliance.read",
      action: "foundation.compliance.dashboard",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_DEADLINE" },
    },
    async (ctx) => {
      const params = new URL(request.url).searchParams;
      const foundationId = params.get("foundationId") ?? undefined;
      const todayIso = params.get("today") ?? new Date().toISOString().slice(0, 10);
      const dashboard = await complianceDashboard(ctx.principal, todayIso, foundationId);
      const missing = await deadlinesMissingEvidence(ctx.principal);
      return NextResponse.json({ ...dashboard, evidenceMissing: missing.length, evidenceMissingIds: missing });
    },
  );
}
