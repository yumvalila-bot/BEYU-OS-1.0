import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { apiError, apiOk, rateLimit } from "@/lib/api";
import { newId, ID_PREFIX } from "@/lib/ids";
import { trustedClientIp } from "@/lib/session";
import { BOOTSTRAP_ENROLLMENT_COOKIE } from "@/lib/constants";
import { completeEnrollment } from "@/lib/bootstrap/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/auth/bootstrap/complete
 *
 * Step 3 (final): atomically activate the administrator with their established
 * password + verified MFA and SEAL the bootstrap forever. No body is required;
 * the ceremony is identified solely by the httpOnly enrollment cookie.
 *
 * Deliberately does NOT establish a login session: the operator must sign in
 * through the normal login page (Identity + Password + 6-digit MFA), proving the
 * credential they just set works end to end. This also means the enrollment
 * ceremony grants no ambient authority.
 */
export async function POST(): Promise<NextResponse> {
  const h = await headers();
  const ip = trustedClientIp(h);
  const userAgent = h.get("user-agent");
  const traceId = newId(ID_PREFIX.event);

  const rlKey = ip ? `bootstrap:complete:ip:${ip}` : "bootstrap:complete:global";
  if (!rateLimit(rlKey, 12, 60_000).ok) {
    return apiError("RATE_LIMITED", "Too many attempts. Try again shortly.", 429, traceId);
  }

  const jar = await cookies();
  const token = jar.get(BOOTSTRAP_ENROLLMENT_COOKIE)?.value;

  const result = await completeEnrollment({ token, ip, userAgent, traceId });
  if (!result.ok) {
    switch (result.code) {
      case "NO_SESSION":
        return apiError("ENROLLMENT_NOT_ACTIVE", "No active enrollment ceremony.", 409, traceId);
      case "EXPIRED":
        jar.delete(BOOTSTRAP_ENROLLMENT_COOKIE);
        return apiError("ENROLLMENT_EXPIRED", "The enrollment ceremony has expired. Start again.", 410, traceId);
      case "MFA_NOT_VERIFIED":
        return apiError("MFA_NOT_VERIFIED", "Verify your authenticator code before completing.", 409, traceId);
      case "ALREADY_SEALED":
        return apiError("BOOTSTRAP_SEALED", "Administrator enrollment is already complete.", 409, traceId);
      case "STATE_CONFLICT":
      default:
        return apiError("ENROLLMENT_CONFLICT", "The enrollment could not be completed.", 409, traceId);
    }
  }

  jar.delete(BOOTSTRAP_ENROLLMENT_COOKIE);
  return apiOk(
    {
      administratorActivated: true,
      bootstrapSealed: true,
      email: result.email,
      next: "sign-in",
    },
    traceId,
  );
}
