/** UJENZI OS — executive dashboard aggregation (real data only). */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { ujenziDashboard } from "@/lib/ujenzi";

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "ujenzi:data.read",
      action: "ujenzi.dashboard.read",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "UJENZI_DASHBOARD" },
    },
    async (ctx) => {
      const dashboard = await ujenziDashboard(ctx.principal.tenantId);
      return NextResponse.json(dashboard);
    },
  );
}
