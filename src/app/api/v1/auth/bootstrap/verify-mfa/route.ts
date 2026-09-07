import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { apiError, apiOk, rateLimit } from "@/lib/api";
import { newId, ID_PREFIX } from "@/lib/ids";
import { trustedClientIp } from "@/lib/session";
import { BOOTSTRAP_ENROLLMENT_COOKIE } from "@/lib/constants";
import { verifyEnrollmentMfa } from "@/lib/bootstrap/service";

export const dynamic = "force-dynamic";

const VerifySchema = z.object({ code: z.string().min(6).max(6) });

/**
 * POST /api/v1/auth/bootstrap/verify-mfa
 *
 * Step 2: the operator proves possession of the authenticator by entering the
 * first 6-digit code. The enrollment token is read from the httpOnly cookie
 * only — it is never accepted from the body or a header, so it cannot leak
 * through logs or referrers. Replay-protected and locked after repeated failures.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const h = await headers();
  const ip = trustedClientIp(h);
  const userAgent = h.get("user-agent");
  const traceId = newId(ID_PREFIX.event);

  const rlKey = ip ? `bootstrap:verify:ip:${ip}` : "bootstrap:verify:global";
  if (!rateLimit(rlKey, 12, 60_000).ok) {
    return apiError("RATE_LIMITED", "Too many attempts. Try again shortly.", 429, traceId);
  }

  let body: z.infer<typeof VerifySchema>;
  try {
    body = VerifySchema.parse(await request.json());
  } catch {
    return apiError("VALIDATION_FAILED", "A 6-digit authenticator code is required.", 422, traceId);
  }

  const jar = await cookies();
  const token = jar.get(BOOTSTRAP_ENROLLMENT_COOKIE)?.value;

  const result = await verifyEnrollmentMfa({ token, code: body.code, ip, userAgent, traceId });
  if (!result.ok) {
    switch (result.code) {
      case "NO_SESSION":
      case "WRONG_STEP":
        return apiError("ENROLLMENT_NOT_ACTIVE", "No active enrollment ceremony.", 409, traceId);
      case "EXPIRED":
        jar.delete(BOOTSTRAP_ENROLLMENT_COOKIE);
        return apiError("ENROLLMENT_EXPIRED", "The enrollment ceremony has expired. Start again.", 410, traceId);
      case "LOCKED":
        return apiError("MFA_LOCKED", "MFA verification is temporarily locked.", 423, traceId);
      case "INVALID_MFA":
      default:
        return apiError("INVALID_MFA", "MFA verification failed.", 401, traceId);
    }
  }

  return apiOk({ mfaVerified: true, next: "complete" }, traceId);
}
