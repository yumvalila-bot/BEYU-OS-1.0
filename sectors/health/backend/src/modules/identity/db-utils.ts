/**
 * Shared transaction helpers.
 *
 * Sets the RLS GUCs once per transaction, then executes the supplied body with
 * the audited connection. Every mutation must be wrapped in `atomicWrite` so
 * that:
 *  - RLS is scoped to the actor's tenant/country/entity,
 *  - audit is recorded inside the same transaction (fail-closed),
 *  - the actor's GlobalUserID is available via app.actor_id for provenance.
 */
import { DbConnection } from "./db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { AuditService } from "../audit/audit.service";

interface WriteOpts {
  resourceType: string;
  resourceId?: string;
  operation: string;
  work: (tx: DbConnection) => Promise<any>;
}

export async function withIsolation<T>(
  db: DbConnection,
  tenantCtx: TenantContext,
  resourceType: string,
  fn: (tx: DbConnection) => Promise<T>,
): Promise<T> {
  const actor = tenantCtx.current();
  return db.transaction(async (tx) => {
    await tx.query(
      `SELECT set_config('app.tenant_id', $1, true),
              set_config('app.country_code', $2, true),
              set_config('app.entity_code', $3, true),
              set_config('app.actor_id', $4, true)`,
      [actor?.tenantId ?? "", actor?.countryCode ?? "", actor?.entityCode ?? "", actor?.userId ?? ""],
    );
    return fn(tx);
  });
}

export async function atomicWrite<T>(
  db: DbConnection,
  tenantCtx: TenantContext,
  audit: AuditService,
  opts: WriteOpts,
): Promise<T> {
  return withIsolation(db, tenantCtx, opts.resourceType, async (tx) => {
    const result = await opts.work(tx);
    const resourceId = opts.resourceId
      ?? (result && typeof result === "object" && "session_id" in (result as any) ? (result as any).session_id : undefined)
      ?? (result && typeof result === "object" && "evidence_id" in (result as any) ? (result as any).evidence_id : undefined)
      ?? (result && typeof result === "object" && "machine_id" in (result as any) ? (result as any).machine_id : undefined);
    await audit.record(tx, {
      operation: opts.operation,
      resourceType: opts.resourceType,
      resourceId,
      after: result as any,
    });
    return result as T;
  });
}
