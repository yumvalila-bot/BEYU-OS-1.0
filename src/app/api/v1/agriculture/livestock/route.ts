/**
 * BEYU OS — Agriculture OS: Livestock API (DRAFT domain)
 *
 * GET /api/v1/agriculture/livestock — List herds for current tenant
 *
 * POST /api/v1/agriculture/livestock/events is served by the nested
 * livestock/events route (this file previously exported a non-standard
 * `POST_events` symbol that Next.js route handlers do not support).
 *
 * Authorized by RBAC (`agriculture:data.read`). The handler runs inside the
 * guarded() tenant RLS context.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { listHerds } from "@/lib/agriculture";

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.livestock.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_LIVESTOCK_HERD" },
    },
    async (ctx) => {
      const farmId = request.nextUrl.searchParams.get("farmId") ?? undefined;
      const herds = await listHerds(ctx.principal.tenantId, farmId);
      return NextResponse.json({ herds });
    },
  );
}
