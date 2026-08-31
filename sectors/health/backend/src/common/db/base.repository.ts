/**
 * Base repository utilities shared by all domain repositories.
 *
 * Every repository method reads tenant/actor context from the request's ALS
 * (via TenantContext) rather than trusting any client-supplied tenant id. The
 * helper `applyIsolation` sets the Postgres session GUCs (app.tenant_id /
 * app.country_code / app.entity_code) so that even a direct SQL connection
 * (e.g. by a misconfigured admin script) is constrained by RLS.
 *
 * Nested `withIsolation()` calls from inside an already-open transaction are
 * automatically re-parented to the outer transaction via AsyncLocalStorage,
 * avoiding nested-transaction deadlocks on PGlite and savepoint bloat on
 * Postgres.
 *
 * Repositories use parameterized SQL exclusively — no string interpolation of
 * user input into SQL.
 */
import { Inject, Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "async_hooks";
import { DbConnection, DB_CONNECTION } from "../../modules/identity/db-connection";
import { TenantContext } from "../security/tenant-context";

const txStorage = new AsyncLocalStorage<DbConnection>();

export function runInTx<T>(tx: DbConnection, fn: () => Promise<T>): Promise<T> {
  return txStorage.run(tx, fn);
}

export function currentTx(): DbConnection | undefined {
  return txStorage.getStore();
}

/** Fields every row carries for auditability. */
export interface AuditFields {
  created_by: string | null;
  updated_by: string | null;
  correlation_id: string | null;
  created_at: Date;
  updated_at: Date;
  voided_at: Date | null;
  voided_by: string | null;
}

@Injectable()
export abstract class BaseRepository {
  constructor(
    @Inject(DB_CONNECTION) protected readonly db: DbConnection,
    protected readonly tenantContext: TenantContext,
  ) {}

  /** Execute `fn` in a transaction with isolation GUCs set for the current actor. */
  async withIsolation<T>(fn: (tx: DbConnection) => Promise<T>): Promise<T> {
    const ambient = txStorage.getStore();
    if (ambient) return fn(ambient);
    const actor = this.tenantContext.current();
    return this.db.transaction(async (tx) => {
      await tx.query(
        `SELECT set_config('app.tenant_id', $1, true),
                set_config('app.country_code', $2, true),
                set_config('app.entity_code',  $3, true)`,
        [actor?.tenantId ?? "", actor?.countryCode ?? "", actor?.entityCode ?? ""],
      );
      return runInTx(tx, () => fn(tx));
    });
  }

  /** Current actor's global user id (for created_by/updated_by). */
  protected actorId(): string | null {
    return this.tenantContext.current()?.userId ?? null;
  }

  /** Correlation id for the current request (used to stamp every row). */
  protected correlationId(): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { currentCorrelationId } = require("../observability/correlation-id.middleware") as typeof import("../observability/correlation-id.middleware");
    return currentCorrelationId();
  }

  /** Non-voided filter clause (standard for "active" queries). */
  protected notVoided(table: string): string {
    return `${table}.voided_at IS NULL`;
  }
}
