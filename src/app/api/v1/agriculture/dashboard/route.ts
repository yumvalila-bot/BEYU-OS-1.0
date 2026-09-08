/** GET /api/v1/agriculture/dashboard */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { agricultureDashboard } from "@/lib/agriculture";

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.dashboard.read",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_DASHBOARD" },
    },
    async (ctx) => NextResponse.json({ dashboard: await agricultureDashboard(ctx.principal.tenantId) }),
  );
}
