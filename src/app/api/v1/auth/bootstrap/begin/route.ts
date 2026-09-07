import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { apiError, apiOk, rateLimit } from "@/lib/api";
import { newId, ID_PREFIX } from "@/lib/ids";
import { trustedClientIp } from "@/lib/session";
import { BOOTSTRAP_ENROLLMENT_COOKIE } from "@/lib/constants";
import { beginEnrollment } from "@/lib/bootstrap/service";

export const dynamic = "force-dynamic";

const BeginSchema = z.object({
  bootstrapSecret: z.string().min(1).max(512),
  password: z.string().min(1).max(200),
});

function productionMode(): boolean {
  return process.env.NODE_ENV === "production" || process.env.BEYU_ENV === "production";
}

/**
 * POST /api/v1/auth/bootstrap/begin
 *
 * Step 1 of the one-time administrator enrollment ceremony.
 *
 * Authorizes with the owner-controlled bootstrap secret, validates the owner's
 * chosen password, and issues a fresh (server-generated) TOTP secret + recovery
 * codes. The MFA secret and recovery codes are returned ONCE for the operator to
 * capture; the raw enrollment token is set as an httpOnly cookie and never
 * returned in the body. The secret is compared in constant time and is never
 * echoed, logged, or persisted in plaintext.
 *
 * Rate limited aggressively per source to resist brute force of the secret.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const h = await headers();
  const ip = trustedClientIp(h);
  const userAgent = h.get("user-agent");
  const traceId = newId(ID_PREFIX.event);

  // Throttle every begin attempt per source (and a global floor) so the
  // bootstrap secret cannot be brute forced. The account identity is unknown
  // pre-authorization, so we key on source + a coarse global bucket.
  const rlKeys = ip ? [`bootstrap:begin:ip:${ip}`, "bootstrap:begin:global"] : ["bootstrap:begin:global"];
  for (const key of rlKeys) {
    const limit = key.endsWith(":global") ? 30 : 8;
    if (!rateLimit(key, limit, 60_000).ok) {
      return apiError("RATE_LIMITED", "Too many attempts. Try again shortly.", 429, traceId);
    }
  }

  let body: z.infer<typeof BeginSchema>;
  try {
    body = BeginSchema.parse(await request.json());
  } catch {
    return apiError("VALIDATION_FAILED", "A bootstrap secret and password are required.", 422, traceId);
  }

  const result = await beginEnrollment({
    secret: body.bootstrapSecret,
    password: body.password,
    ip,
    userAgent,
    traceId,
  });

  if (!result.ok) {
    switch (result.code) {
      case "SECRET_NOT_CONFIGURED":
        return apiError(
          "BOOTSTRAP_NOT_CONFIGURED",
          "The bootstrap secret has not been provisioned for this deployment.",
          409,
          traceId,
        );
      case "NOT_PREPARED":
        return apiError(
          "BOOTSTRAP_NOT_PREPARED",
          "No administrator identity is prepared for enrollment.",
          409,
          traceId,
        );
      case "ALREADY_SEALED":
        return apiError("BOOTSTRAP_SEALED", "Administrator enrollment is already complete.", 409, traceId);
      case "IN_PROGRESS":
        return apiError("BOOTSTRAP_IN_PROGRESS", "An enrollment is already in progress.", 409, traceId);
      case "WEAK_PASSWORD":
        return apiError("WEAK_PASSWORD", "The password does not meet policy.", 422, traceId, result.reasons);
      case "INVALID_SECRET":
      default:
        // Generic denial: never distinguish a wrong secret from other failures
        // in a way that helps an attacker probe the state.
        return apiError("BOOTSTRAP_UNAUTHORIZED", "Bootstrap authorization failed.", 401, traceId);
    }
  }

  const jar = await cookies();
  jar.set(BOOTSTRAP_ENROLLMENT_COOKIE, result.enrollmentToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: productionMode(),
    path: "/",
    expires: result.expiresAt,
  });

  // The MFA secret, otpauth URI and recovery codes are shown exactly once.
  return apiOk(
    {
      email: result.email,
      mfa: {
        method: "TOTP",
        secret: result.mfaSecret,
        otpauthUri: result.otpauthUri,
        issuer: "BEYU OS",
        digits: 6,
        period: 30,
      },
      recoveryCodes: result.recoveryCodes,
      expiresAt: result.expiresAt,
      next: "verify-mfa",
    },
    traceId,
    201,
  );
}
