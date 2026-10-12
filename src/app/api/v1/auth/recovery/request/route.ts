import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { recordAudit, publishEvent } from "@/lib/audit";
import { apiError, apiOk, rateLimit } from "@/lib/api";
import { newId, ID_PREFIX } from "@/lib/ids";
import { RECOVERY_RATE_LIMIT, recoveryRateLimitKeys, trustedClientIp } from "@/lib/auth-limits";
import { withDatabaseRlsContext } from "@/lib/tenant-scope";

export const dynamic = "force-dynamic";

/**
 * GOVERNED PASSWORD-RECOVERY REQUEST — `/api/v1/auth/recovery/request`.
 *
 * WHY THIS EXISTS
 *   The canonical sign-in surface (and the authoritative reference) carries a
 *   "Forgot Password?" action. BEYU OS has no self-service credential reset and
 *   must NOT grow one here: a second credential path would be a second identity
 *   mechanism. What was missing was the honest, governed first half — a recorded
 *   request that a human identity administrator acts on through the existing
 *   identity authority. This endpoint is that half, and only that half.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   • it never verifies, issues, resets or changes a password, MFA secret or
 *     recovery code;
 *   • it never creates, reads or extends a session, and sets NO cookie;
 *   • it never returns account data — not the display name, not the tenant, not
 *     whether the identity exists;
 *   • it introduces no second identity store, no second audit system and no
 *     second rate limiter: it reuses `recordAudit`/`publishEvent` (the one
 *     hash-chained ledger and event bus) and the one `rateLimit` primitive with
 *     its own policy in `src/lib/auth-limits.ts`.
 *
 * UNIFORM RESPONSE — NO ENUMERATION
 *   The response is identical (202 + one sentence) whether or not the identity
 *   exists, and the request is recorded in the audit ledger either way: a
 *   tenant-scoped `identity.recovery.requested` event for a known identity, and
 *   a tenant-less denial record for an unknown one (the same shape the login
 *   route already uses for an unknown identity). An attacker gains no oracle.
 *
 * CSRF / AUTHORIZATION
 *   This is an unsafe method on `/api/v1/**`, so the existing proxy Origin check
 *   refuses a foreign-origin request before any handler runs. It carries no
 *   authority of its own: recording a request grants nothing to anybody.
 */
const RecoverySchema = z.object({
  identifier: z.string().min(3).max(200),
});

const ACCEPTED_MESSAGE =
  "If that identity exists, a governed recovery request has been recorded. An authorised identity administrator acts on it under least privilege; no credential is ever sent by email or shown on screen.";

export async function POST(request: Request): Promise<NextResponse> {
  const h = await headers();
  const ip = trustedClientIp(h);
  const userAgent = h.get("user-agent");
  const traceId = newId(ID_PREFIX.event);

  let body: z.infer<typeof RecoverySchema>;
  try {
    body = RecoverySchema.parse(await request.json());
  } catch {
    if (ip) {
      const limited = rateLimit(`recovery:ip:${ip}`, RECOVERY_RATE_LIMIT.perIpAccount, RECOVERY_RATE_LIMIT.windowMs);
      if (!limited.ok) return apiError("RATE_LIMITED", "Too many attempts. Try again shortly.", 429, traceId);
    }
    return apiError("VALIDATION_FAILED", "Enter the BEYU identity address you sign in with.", 422, traceId);
  }

  const identifier = body.identifier.trim().toLowerCase();

  // Same bucket identity model as login: the per-account budget always applies,
  // the per-(IP, account) budget only under a trusted proxy — so spoofed
  // forwarding headers can never mint a fresh bucket.
  for (const key of recoveryRateLimitKeys(ip, identifier)) {
    const limit = key.startsWith("recovery:ipacct:") ? RECOVERY_RATE_LIMIT.perIpAccount : RECOVERY_RATE_LIMIT.perAccount;
    const limited = rateLimit(key, limit, RECOVERY_RATE_LIMIT.windowMs);
    if (!limited.ok) return apiError("RATE_LIMITED", "Too many attempts. Try again shortly.", 429, traceId);
  }

  const [user] = await db
    .select({ id: users.id, tenantId: users.primaryTenantId, status: users.status })
    .from(users)
    .where(eq(users.email, identifier))
    .limit(1);

  if (user) {
    await withDatabaseRlsContext([user.tenantId], false, async () => {
      await recordAudit({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: "identity.recovery.requested",
        objectType: "USER",
        objectId: user.id,
        outcome: "SUCCESS",
        reason: "Self-service recovery request recorded for governed administrative action",
        ipAddress: ip,
        userAgent,
        traceId,
      });
      await publishEvent({
        type: "IDENTITY_RECOVERY_REQUESTED",
        source: "beyu-os/identity",
        domain: "IDENTITY",
        operation: "RECOVERY_REQUESTED",
        destinationDomain: null,
        tenantId: user.tenantId,
        legalEntityId: null,
        subjectType: "USER",
        subjectId: user.id,
        actorUserId: user.id,
        classification: "INTERNAL",
        payload: { channel: "WEB", credentialChanged: false },
        traceId,
        correlationId: traceId,
        causationId: null,
        authorityContext: null,
        policyVersion: null,
      });
    });
  } else {
    // No tenant is known for an unknown identifier. The short-lived
    // transaction-local platform scope is used only for this tenant-less audit
    // append (exactly as the login denial path does); it performs no tenant data
    // read and is never retained on the pool.
    await withDatabaseRlsContext([], true, async () => {
      await recordAudit({
        action: "identity.recovery.requested",
        objectType: "USER",
        objectId: identifier,
        outcome: "DENIED",
        reason: "Unknown identity",
        ipAddress: ip,
        userAgent,
        traceId,
      });
    });
  }

  // Uniform, account-agnostic answer — 202 because nothing has been decided
  // about the caller's credentials here.
  return apiOk({ accepted: true, message: ACCEPTED_MESSAGE }, traceId, 202);
}
