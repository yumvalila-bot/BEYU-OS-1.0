/**
 * POST /api/v1/internal/identity/lookup
 *
 * Canonical identity resolution + status for sector OSs.
 *
 * A sector (Health) uses this to:
 *   - resolve a GlobalUserId it holds a link for (revocation / status
 *     re-check at login and token refresh), and
 *   - resolve an email to its canonical GlobalUserId (conflict/duplicate
 *     prevention before provisioning a second canonical identity).
 *
 * Returns the canonical user's lifecycle status so the sector can fail
 * closed on SUSPENDED/TERMINATED/DISSOLVED identities. Lookup of a
 * non-existent identity is 404 — indistinguishable from "never registered".
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { parties, users, tenants } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { withDatabaseRlsContext } from "@/lib/tenant-scope";
import { apiError, apiOk, guardedInternal } from "@/lib/internal/api";

export const dynamic = "force-dynamic";

const LookupSchema = z
  .object({
    email: z.string().email().max(320).transform((v) => v.toLowerCase().trim()).optional(),
    globalUserId: z.string().regex(/^USR_[A-Za-z0-9]+$/).max(64).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.email) !== Boolean(v.globalUserId), {
    message: "Provide exactly one of email or globalUserId.",
  });

export async function POST(request: Request) {
  return guardedInternal(
    request,
    {
      action: "identity.lookup",
      schema: LookupSchema,
      rateLimit: { limit: 300, windowMs: 60_000 },
    },
    async ({ body, traceId }) => {
      const rows = await db
        .select({
          id: users.id,
          partyId: users.partyId,
          email: users.email,
          status: users.status,
          tenantId: users.primaryTenantId,
          tenantCode: tenants.code,
          displayName: parties.displayName,
          countryCode: parties.countryCode,
          partyStatus: parties.status,
        })
        .from(users)
        .innerJoin(tenants, eq(tenants.id, users.primaryTenantId))
        .innerJoin(parties, eq(parties.id, users.partyId))
        .where(
          body.email
            ? eq(users.email, body.email)
            : eq(users.id, body.globalUserId as string),
        )
        .limit(1);

      if (rows.length === 0) {
        // Audited miss (denied) — canonical identity not found. No tenant
        // context exists for an unknown identity; the denial is still
        // recorded server-side (guardedInternal logs) and the caller's own
        // outbox row accounts for the failed call.
        return apiError("IDENTITY_NOT_FOUND", "No canonical identity matches the request.", 404, traceId);
      }

      const u = rows[0];
      // The audit ledger is RLS-guarded: write within an explicit
      // transaction-local context for the identity's tenant.
      await withDatabaseRlsContext([u.tenantId], false, () =>
        recordAudit({
          tenantId: u.tenantId,
          actorType: "SERVICE",
          action: "internal.identity.lookup",
          objectType: "USER",
          objectId: u.id,
          outcome: "SUCCESS",
          traceId,
        }),
      );

      return apiOk(
        {
          globalUserId: u.id,
          partyId: u.partyId,
          email: u.email,
          displayName: u.displayName,
          status: u.status,
          partyStatus: u.partyStatus,
          tenantId: u.tenantId,
          tenantCode: u.tenantCode,
          countryCode: u.countryCode,
        },
        traceId,
      );
    },
  );
}
