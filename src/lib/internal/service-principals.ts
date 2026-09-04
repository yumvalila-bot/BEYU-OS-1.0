/**
 * Service-principal status check (Phase 6 hardening).
 *
 * The cross-OS service-token model uses one shared secret, so the STATIC
 * issuer allowlist alone cannot revoke a single issuer — it could only rotate
 * the secret for everyone (up to MAX_SERVICE_TOKEN_LIFETIME_S exposure).
 *
 * This registry adds per-issuer status, checked on EVERY internal endpoint
 * after signature validation:
 *
 *   row absent            → allowed (static allowlist governs; the registry is
 *                           an explicit negative-action overlay)
 *   ACTIVE                → allowed
 *   SUSPENDED / REVOKED   → denied immediately (403), audited
 *   registry unreachable  → denied (503) — fail closed, never open
 *
 * Writes are administrative actions (documented runbook); the runtime role
 * only reads. Shared-secret rotation remains the response for compromise of
 * the secret itself.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";

export type ServicePrincipalCheck =
  | { ok: true }
  | { ok: false; code: "SERVICE_PRINCIPAL_SUSPENDED" | "SERVICE_PRINCIPAL_REVOKED" }
  | { ok: false; code: "SERVICE_PRINCIPAL_REGISTRY_UNAVAILABLE" };

export async function checkServicePrincipal(issuer: string): Promise<ServicePrincipalCheck> {
  let rows: { status: string }[];
  try {
    rows = (
      await db.execute(
        sql`select "status" from "service_principals" where "issuer" = ${issuer}`,
      )
    ).rows as { status: string }[];
  } catch {
    // Registry unreachable (e.g. migration not applied, database down):
    // fail closed — an internal endpoint never opens because a check errored.
    return { ok: false, code: "SERVICE_PRINCIPAL_REGISTRY_UNAVAILABLE" };
  }
  if (rows.length === 0) return { ok: true };
  const status = rows[0].status;
  if (status === "ACTIVE") return { ok: true };
  if (status === "SUSPENDED") return { ok: false, code: "SERVICE_PRINCIPAL_SUSPENDED" };
  return { ok: false, code: "SERVICE_PRINCIPAL_REVOKED" };
}
