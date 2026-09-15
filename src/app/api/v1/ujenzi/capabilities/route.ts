import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { UJENZI_CAPABILITY_REGISTRY } from "@/lib/ujenzi";

export async function GET(request: NextRequest) {
  return guarded(
    request,
    { permission: "ujenzi:data.read", action: "ujenzi.capabilities.list", rateLimit: { limit: 60, windowMs: 60_000 }, audit: { objectType: "UJENZI_CAPABILITY" } },
    async () => NextResponse.json({ architecture: "ONE_UJENZI_SECTOR_OS", capabilities: UJENZI_CAPABILITY_REGISTRY }),
  );
}
