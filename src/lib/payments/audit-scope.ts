/**
 * Audit appends for the payments domain.
 *
 * `audit_log` is RLS-protected with FORCE ROW LEVEL SECURITY, so an append is
 * only admitted inside a scope that either names the owning tenant or is the
 * short-lived platform scope used for tenant-less rows. Authenticated routes get
 * that scope from `guarded()` (src/lib/api.ts); a webhook delivery, a CLI
 * invocation and a script do not, which is why every append in this domain goes
 * through the helper instead of calling `recordAudit` bare.
 *
 * When a scope is already open — the authenticated request, or the ingest path
 * after the event has been attributed to a connection — the append joins it. That
 * is not a convenience: `withDatabaseRlsContext` issues `SET LOCAL`, and a nested
 * call would replace the caller's tenant list for the remainder of the
 * transaction, silently widening or narrowing the scope of unrelated statements.
 */
import { recordAudit } from "@/lib/audit";
import type { AuditInput } from "@/lib/audit";
import { hasDatabaseTransactionContext } from "@/db";
import { withDatabaseRlsContext } from "@/lib/tenant-scope";

export type AuditScope = "TENANT" | "PLATFORM";

/**
 * `tenantId: null` is an explicit statement that the row is not tenant-owned: a
 * refusal that arrived before attribution was possible, or a platform-global
 * configuration record such as a provider registration. It is honoured with
 * platform scope, which permits reading and appending tenant-less rows only.
 */
export async function appendPaymentAudit(input: AuditInput): Promise<void> {
  if (hasDatabaseTransactionContext()) {
    await recordAudit(input);
    return;
  }
  const tenantId = typeof input.tenantId === "string" && input.tenantId.length > 0 ? input.tenantId : null;
  if (tenantId) {
    await withDatabaseRlsContext([tenantId], false, () => recordAudit(input));
    return;
  }
  await withDatabaseRlsContext([], true, () => recordAudit(input));
}

/**
 * Runs `operation` in the tenant scope of an attributed payment event, and is a
 * no-op when the caller already established a scope. Webhook handling uses this
 * so that a delivery is never processed under the platform scope "because nothing
 * else was open".
 */
export async function withPaymentTenantScope<T>(tenantId: string, operation: () => Promise<T>): Promise<T> {
  if (hasDatabaseTransactionContext()) return operation();
  return withDatabaseRlsContext([tenantId], false, operation);
}
