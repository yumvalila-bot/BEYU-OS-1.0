import { NextRequest, NextResponse } from "next/server";
import { resolvePrincipal } from "@/lib/session";
import { signHealthAuthorizationAssertion } from "@/lib/health-authorization-assertion";

/**
 * Same-origin browser hand-off. The BEYU session cookie is read server-side;
 * no BEYU session token or private signing material reaches the browser.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "ORIGIN_NOT_ALLOWED" }, { status: 403 });
  }
  const principal = await resolvePrincipal();
  if (!principal) {
    return NextResponse.json({ error: "BEYU_SESSION_REQUIRED" }, { status: 401 });
  }
  try {
    const result = signHealthAuthorizationAssertion(principal);
    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
    });
  } catch {
    return NextResponse.json({ error: "HEALTH_FEDERATION_UNAVAILABLE" }, { status: 503 });
  }
}
