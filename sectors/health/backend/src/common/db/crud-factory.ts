/**
 * Helper factory for building small domain services/controllers for modules
 * that follow the standard pattern (table insert → audit event, simple state
 * machine transitions). Reduces boilerplate for ambulance/telehealth/
 * ophthalmology/etc. while keeping audit atomic with the business write.
 *
 * Both helpers participate in ambient (ALS) transactions so nested calls
 * reuse the outer tx rather than opening a new one (prevents PGlite deadlocks
 * and savepoint bloat).
 */
import { DbConnection } from "../../modules/identity/db-connection";
import { AuditService } from "../../modules/audit/audit.service";
import { TenantContext } from "../security/tenant-context";
import { DomainError } from "../errors/domain.error";
import { runInTx, currentTx } from "./base.repository";

/**
 * Run `fn` inside a transaction with the caller's tenant boundary GUCs
 * (app.tenant_id / app.country_code / app.entity_code) set, so RLS applies.
 * Reuses an ambient (ALS) transaction when one is already open.
 *
 * Exported for callers outside the CRUD helpers that still need an audited,
 * tenant-scoped transaction — notably the BEYU adapters, which write to the
 * audit ledger but do not go through atomicWrite/atomicTransition.
 */
export async function inTx<T>(
  db: DbConnection,
  tenantCtx: TenantContext,
  fn: (tx: DbConnection) => Promise<T>,
): Promise<T> {
  const ambient = currentTx();
  if (ambient) return fn(ambient);
  const a = tenantCtx.current();
  return db.transaction(async (tx) => {
    await tx.query(
      `SELECT set_config('app.tenant_id',$1,true),set_config('app.country_code',$2,true),set_config('app.entity_code',$3,true)`,
      [a?.tenantId ?? "", a?.countryCode ?? "", a?.entityCode ?? ""],
    );
    return runInTx(tx, () => fn(tx));
  });
}

export async function atomicWrite<T>(
  db: DbConnection,
  tenantCtx: TenantContext,
  audit: AuditService,
  operation: string,
  resourceType: string,
  work: (tx: DbConnection) => Promise<T | null>,
  getResourceId: (result: T) => string,
): Promise<T> {
  return inTx(db, tenantCtx, async (tx) => {
    const result = await work(tx);
    if (!result) throw DomainError.invalidState("Operation produced no result");
    await audit.record(tx, {
      operation,
      resourceType,
      resourceId: getResourceId(result),
      after: result,
    });
    return result;
  });
}

export async function atomicTransition(
  db: DbConnection,
  tenantCtx: TenantContext,
  audit: AuditService,
  transitions: Record<string, Set<string>>,
  find: (id: string, tx: DbConnection) => Promise<{ status: string } | null>,
  update: (id: string, to: string, tx: DbConnection) => Promise<any>,
  operation: string,
  resourceType: string,
  id: string,
  to: string,
): Promise<any> {
  return inTx(db, tenantCtx, async (tx) => {
    const cur = await find(id, tx);
    if (!cur) throw DomainError.notFound(resourceType, id);
    if (!transitions[cur.status]?.has(to))
      throw DomainError.invalidState(
        `Cannot transition ${resourceType} from ${cur.status} to ${to}`,
      );
    const result = await update(id, to, tx);
    if (!result) throw DomainError.notFound(resourceType, id);
    await audit.record(tx, {
      operation,
      resourceType,
      resourceId: id,
      metadata: { to, from: cur.status },
    });
    return result;
  });
}
