import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { traverseTwin, detectOrphans } from "@/lib/ujenzi";

export async function GET(request: NextRequest) {
  return guarded(
    request,
    { permission: "ujenzi:data.read", action: "ujenzi.twin.graph", rateLimit: { limit: 60, windowMs: 60_000 }, audit: { objectType: "UJENZI_TWIN" } },
    async (ctx) => {
      const projectId = request.nextUrl.searchParams.get("projectId");
      const kind = request.nextUrl.searchParams.get("kind") ?? "PROJECT";
      const id = request.nextUrl.searchParams.get("id") ?? projectId;
      if (!projectId || !id) return NextResponse.json({ error: "projectId required" }, { status: 400 });
      const [graph, orphans] = await Promise.all([
        traverseTwin(ctx.principal.tenantId, projectId, kind, id),
        detectOrphans(ctx.principal.tenantId, projectId),
      ]);
      return NextResponse.json({ ...graph, orphans });
    },
  );
}
