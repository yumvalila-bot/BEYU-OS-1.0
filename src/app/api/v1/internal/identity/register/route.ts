/**
 * POST /api/v1/internal/identity/register
 *
 * Canonical identity provisioning for sector OSs (service-to-service).
 *
 * BEYU OS is the SYSTEM OF RECORD for GlobalUserId. A sector (Health) that
 * registers a human calls this endpoint to provision — idempotently — the
 * canonical party + user and receives the GlobalUserId it MUST reference in
 * its own link table. The sector NEVER mints its own canonical id outside
 * the explicit test harness.
 *
 * Idempotency: keyed by email. A repeat registration for an existing email
 * returns the existing canonical identity (created: false) — link-once
 * semantics are enforced on the SECTOR side via its link table.
 *
 * The canonical user is created with a random, never-disclosed password
 * (the sector holds the human credential; the canonical account cannot be
 * used to log in interactively).
 *
 * Constitutional authority: this endpoint creates an IDENTITY, not any
 * authority. Role/permission grants remain governed BEYU mutations; a
 * sector cannot mint itself constitutional roles here.
 */

import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { parties, users, tenants } from "@/db/schema";
import { newId } from "@/lib/ids";
import { recordAudit, recordAuditTx } from "@/lib/audit";
import { apiError, apiOk, guardedInternal } from "@/lib/internal/api";

export const dynamic = "force-dynamic";

const RegisterSchema = z
  .object({
    email: z.string().email().max(320).transform((v) => v.toLowerCase().trim()),
    displayName: z.string().min(1).max(200),
    tenantCode: z.string().min(2).max(50),
    sector: z.enum(["HEALTH_OS", "AGRICULTURE_OS", "FINANCE_OS", "FOUNDATION_OS"]),
    sectorUserId: z.string().min(1).max(100),
    countryCode: z.string().length(2).optional(),
  })
  .strict();

export async function POST(request: Request) {
  return guardedInternal(
    request,
    {
      action: "identity.register",
      schema: RegisterSchema,
      rateLimit: { limit: 60, windowMs: 60_000 },
    },
    async ({ body, token, traceId }) => {
      // Issuer must match the sector it is provisioning for: HEALTH_OS tokens
      // register HEALTH_OS identities — a sector cannot provision on behalf of
      // another sector.
      if (token.iss !== body.sector) {
        await recordAudit({
          tenantId: null,
          actorType: "SERVICE",
          action: "internal.identity.register",
          objectType: "PARTY",
          objectId: "unknown",
          outcome: "DENIED",
          reason: "ISSUER_SECTOR_MISMATCH",
          traceId,
        });
        return apiError(
          "ISSUER_SECTOR_MISMATCH",
          `Token issued by ${token.iss} cannot provision for ${body.sector}.`,
          403,
          traceId,
        );
      }

      const tenant = await db
        .select({ id: tenants.id, status: tenants.status, code: tenants.code })
        .from(tenants)
        .where(eq(tenants.code, body.tenantCode))
        .limit(1);
      if (tenant.length === 0) {
        return apiError("TENANT_NOT_FOUND", `Tenant ${body.tenantCode} does not exist.`, 404, traceId);
      }
      if (tenant[0].status !== "ACTIVE") {
        return apiError("TENANT_NOT_ACTIVE", `Tenant ${body.tenantCode} is not ACTIVE.`, 409, traceId);
      }
      const tenantId = tenant[0].id;

      const existing = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
      if (existing.length > 0) {
        const u = existing[0];
        await recordAudit({
          tenantId,
          actorType: "SERVICE",
          action: "internal.identity.register",
          objectType: "USER",
          objectId: u.id,
          outcome: "SUCCESS",
          reason: "IDEMPOTENT_EXISTING",
          oldValue: null,
          newValue: { email: u.email, sector: body.sector, idempotent: true },
          traceId,
        });
        return apiOk(
          {
            globalUserId: u.id,
            partyId: u.partyId,
            email: u.email,
            tenantId: u.primaryTenantId,
            status: u.status,
            created: false,
          },
          traceId,
        );
      }

      const partyId = newId("PTY");
      const userId = newId("USR");
      // Random secret, hashed and never disclosed: the canonical account has
      // no usable interactive credential — the sector owns authentication.
      const canonicalPasswordHash = createHash("sha256")
        .update(randomBytes(48))
        .update(body.email)
        .digest("hex");

      await db.transaction(async (tx) => {
        await tx.insert(parties).values({
          id: partyId,
          type: "PERSON",
          displayName: body.displayName,
          email: body.email,
          countryCode: body.countryCode ?? null,
          classification: "CONFIDENTIAL",
          status: "ACTIVE",
        });
        await tx.insert(users).values({
          id: userId,
          partyId,
          email: body.email,
          passwordHash: canonicalPasswordHash,
          passwordAlgo: "sha256-random",
          passwordMustChange: true,
          primaryTenantId: tenantId,
          isServiceAccount: false,
          status: "ACTIVE",
        });
        await recordAuditTx(tx, {
          tenantId,
          actorType: "SERVICE",
          action: "internal.identity.register",
          objectType: "USER",
          objectId: userId,
          outcome: "SUCCESS",
          newValue: {
            partyId,
            email: body.email,
            sector: body.sector,
            sectorUserId: body.sectorUserId,
            tenantCode: body.tenantCode,
          },
          traceId,
        });
      });

      return apiOk(
        {
          globalUserId: userId,
          partyId,
          email: body.email,
          tenantId,
          status: "ACTIVE",
          created: true,
        },
        traceId,
        201,
      );
    },
  );
}
