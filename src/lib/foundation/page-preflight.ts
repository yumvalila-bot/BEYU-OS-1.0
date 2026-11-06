/**
 * Foundation-only pre-stream refusal boundary. It uses the same live session,
 * target scope and permission primitives as the independent page guards.
 * Nothing from this decision is forwarded as authority to the renderer.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";
import { resolvePrincipalFromToken } from "@/lib/session";
import { auditFoundationPageDenial, auditFoundationPageFailure } from "@/lib/foundation-page-access";
import { resolveFoundationTargetScope } from "@/lib/foundation/target-scope";
import { foundationPagePermissionAllowed, foundationPageRequirements } from "@/lib/foundation/page-policy";
import { ID_PREFIX, newId } from "@/lib/ids";
import type { Principal } from "@/lib/authz";

function refusal(status: 403 | 503): NextResponse {
  const unavailable = status === 503;
  const title = unavailable ? "Authorisation temporarily unavailable" : "Authorisation denied";
  const message = unavailable ? "Access cannot be checked right now. Please try again later." : "You do not have the required access to this area.";
  // Fixed strings only; no request data, errors or credentials enter this HTML.
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body><main style="max-width:42rem;margin:3rem auto;padding:1.5rem;font-family:system-ui,sans-serif;color:#0b1d3a"><h1>${title}</h1><p>${message}</p><a href="/launcher">Return to your available destinations</a></main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...(unavailable ? { "Retry-After": "30" } : {}) } });
}

export async function foundationPagePreflight(request: NextRequest): Promise<NextResponse> {
  const requirements = foundationPageRequirements(request.nextUrl.pathname);
  // Unknown or newly-added paths must not reach the renderer until their
  // independent policy is registered. Preserve a generic not-found response;
  // never assume an unregistered future page has its own effective guard.
  if (!requirements) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  // Preserve the established unauthenticated redirect and host handling.
  if (!token) return NextResponse.next();
  const resource = request.nextUrl.pathname; // matched only against the fixed page catalogue
  let principal: Principal | null = null;
  try {
    principal = await resolvePrincipalFromToken(token);
    if (!principal) return NextResponse.next();
    const scope = await resolveFoundationTargetScope(principal);
    const scopeDenied = !scope.ok;
    if (scopeDenied || !foundationPagePermissionAllowed(principal, requirements)) {
      // Audit failure cannot turn the refusal into an allowed request.
      await auditFoundationPageDenial(principal, resource, scopeDenied ? "FOUNDATION_SCOPE_DENIED" : "FOUNDATION_PERMISSION_DENIED");
      return refusal(403);
    }
    return NextResponse.next();
  } catch {
    // Do not convert an unavailable security dependency into a policy denial or
    // expose the underlying error. The audit store itself may be unavailable.
    const traceId = newId(ID_PREFIX.event);
    console.error(JSON.stringify({ event: "foundation_preflight_authorization_unavailable", traceId }));
    if (principal) await auditFoundationPageFailure(principal, resource, traceId);
    return refusal(503);
  }
}
