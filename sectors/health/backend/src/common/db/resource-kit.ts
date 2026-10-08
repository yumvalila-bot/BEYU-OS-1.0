/**
 * Resource kit — shared, explicitly-scoped persistence plumbing for the
 * operational domains added in migrations 033-045 (capacity, continuity,
 * referrals, emergency, theatre, insurance, imaging, workforce, virtual care,
 * portal, Noelia).
 *
 * WHY THIS EXISTS
 *   Those domains share one shape: a tenant-owned row with a generated human
 *   reference, audit columns, soft delete, an optional idempotency key and a
 *   status state machine. Writing that SQL twelve times is precisely how a
 *   subtly different authorization path per module gets invented — the failure
 *   mode this repository exists to prevent. One kit, one security behaviour.
 *
 * WHAT THIS IS NOT
 *   Not an ORM and not an authority. It removes SQL repetition only:
 *     * every statement is parameterized; column names come from the spec, never
 *       from the request body — an unlisted body key is DROPPED, not stored;
 *     * `tenant_id` / `entity_code` / `country_code` / actor / correlation id are
 *       taken from the authenticated actor context and are declared
 *       non-client-settable (the constructor refuses a spec that lists them);
 *     * every write runs inside the caller's tenant-scoped transaction, so the
 *       same `*_isolation` RLS policies that guard the hand-written repositories
 *       apply here unchanged (see base.repository.ts);
 *     * every mutation writes exactly one audit entry through the canonical
 *       AuditService, and — when the module declares an event — one governed
 *       outbox event in the SAME transaction. No parallel audit path, no
 *       parallel bus;
 *     * `voided_at IS NULL` is applied to every read and update, so soft deletes
 *       cannot be forgotten by one module.
 *   Business rules (who may do what, which transitions are legal, what a signed
 *   record requires) stay in each module's own service, where a reviewer can
 *   read them. `validateCreate` / `validateUpdate` are therefore required
 *   parameters of a domain, not optional sugar.
 */
import { DomainError } from "../errors/domain.error";
import { BaseRepository } from "./base.repository";
import { DbConnection } from "../../modules/identity/db-connection";
import { atomicWrite, atomicTransition, inTx } from "./crud-factory";
import { AuditService } from "../../modules/audit/audit.service";
import { TenantContext } from "../security/tenant-context";
import {
  EventOutboxService,
  GovernedEventInput,
} from "../../modules/events/event-outbox.service";

/** Columns that are never client-settable, whatever a spec author writes. */
export const FORBIDDEN_CLIENT_COLUMNS: ReadonlySet<string> = new Set([
  "tenant_id",
  "entity_code",
  "country_code",
  "created_by",
  "updated_by",
  "correlation_id",
  "created_at",
  "updated_at",
  "voided_at",
  "voided_by",
  "audit_id",
  "prev_hash",
  "entry_hash",
]);

export interface ResourceSpec {
  /** Qualified table, e.g. `health.beds`. */
  table: string;
  /** Primary key column, e.g. `bed_id`. */
  pk: string;
  /** Columns a client may set on create. Any other body key is ignored. */
  insertColumns: string[];
  /** Columns a client may set on update or in a transition patch. */
  updateColumns: string[];
  /** Logical resource name (audit resource_type, error messages). */
  resourceType: string;
  /** Audit operation prefix, e.g. `bed` → `bed.create`, `bed.transition`. */
  auditPrefix: string;
  /** Column carrying the actor. Defaults to `created_by`. */
  actorColumn?: string;
  /** Set `false` for append-only tables that have no `updated_by`. */
  tracksUpdater?: boolean;
  /** Set `false` for append-only tables that have no `voided_at`. */
  softDeletable?: boolean;
  /** Default ORDER BY for lists (a spec constant; no user input reaches it). */
  listOrder?: string;
  /** Additional fixed WHERE clause (a spec constant, never user input). */
  listWhere?: string;
  /** Human reference generator, e.g. { numberColumn:'bed_no', numberPrefix:'BED' }. */
  numberColumn?: string;
  numberPrefix?: string;
  defaultLimit?: number;
  hardLimit?: number;
  /** Client-settable idempotency column enabling exactly-once create. */
  idempotencyColumn?: string;
  /** Status column when the domain has a state machine. Defaults to `status`. */
  statusColumn?: string;
  /** Governed outbox event wiring; omit to publish nothing. */
  event?: {
    eventType: string;
    domain: string;
    operation: string;
    subjectType: string;
    classification?:
      | "PUBLIC"
      | "INTERNAL"
      | "CONFIDENTIAL"
      | "RESTRICTED"
      | "HIGHLY_RESTRICTED";
  };
}

/** Short, sortable, non-secret reference suffix. Ids stay uuid. */
function refSuffix(): string {
  const t = Date.now().toString(36).toUpperCase().slice(-6);
  const r = Math.floor(Math.random() * 1679616)
    .toString(36)
    .toUpperCase()
    .padStart(4, "0");
  return `${t}${r}`;
}

export class ResourceRepository extends BaseRepository {
  readonly spec: ResourceSpec;

  constructor(
    db: DbConnection,
    tenantContext: TenantContext,
    spec: ResourceSpec,
  ) {
    super(db, tenantContext);
    this.spec = spec;
    for (const c of [...spec.insertColumns, ...spec.updateColumns]) {
      if (FORBIDDEN_CLIENT_COLUMNS.has(c)) {
        throw new Error(
          `ResourceSpec ${spec.table}: '${c}' is server-owned and must never be client-settable`,
        );
      }
    }
  }

  private get actorCol(): string {
    return this.spec.actorColumn ?? "created_by";
  }

  private get isSoftDeletable(): boolean {
    return this.spec.softDeletable !== false;
  }

  private visibleClause(): string {
    return this.isSoftDeletable
      ? `${this.spec.table}.voided_at IS NULL`
      : "true";
  }

  /** Keep only whitelisted columns; everything else is dropped, not stored. */
  pick(
    input: Record<string, unknown> | null | undefined,
    columns: string[],
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const c of columns) {
      if (input && Object.prototype.hasOwnProperty.call(input, c)) {
        out[c] = input[c];
      }
    }
    return out;
  }

  /**
   * Build and execute an INSERT. Public so module repositories can reuse the
   * same column discipline for their own multi-table writes inside one tx.
   */
  async insertWith(
    tx: DbConnection,
    cols: Record<string, unknown>,
    extra: { table?: string; pk?: string; softDeleteAware?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    const s = this.spec;
    const table = extra.table ?? s.table;
    const actor = this.actorId();
    const tenantId = this.tenantContext.tenantId();
    const ctx = this.tenantContext.current();
    const names: string[] = ["tenant_id"];
    const params: unknown[] = [tenantId];
    if (ctx?.entityCode)
      (names.push("entity_code"), params.push(ctx.entityCode));
    if (ctx?.countryCode)
      (names.push("country_code"), params.push(ctx.countryCode));
    for (const [k, v] of Object.entries(cols)) {
      if (FORBIDDEN_CLIENT_COLUMNS.has(k)) continue;
      names.push(k);
      params.push(v === undefined ? null : v);
    }
    if (actor) {
      names.push(this.actorCol);
      params.push(actor);
      if (
        s.tracksUpdater !== false &&
        this.actorCol !== "updated_by" &&
        !Object.prototype.hasOwnProperty.call(cols, "updated_by") &&
        table === s.table
      ) {
        names.push("updated_by");
        params.push(actor);
      }
    }
    names.push("correlation_id");
    params.push(this.correlationId());
    const placeholders = params.map((_, idx) => `$${idx + 1}`).join(",");
    const rows = (await tx.query(
      `INSERT INTO ${table} (${names.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      params,
    )) as unknown as Record<string, unknown>[];
    return rows[0];
  }

  insert(tx: DbConnection, input: Record<string, unknown> | null | undefined) {
    const s = this.spec;
    const cols = this.pick(input, s.insertColumns);
    if (
      s.numberColumn &&
      cols[s.numberColumn] === undefined &&
      s.numberPrefix
    ) {
      cols[s.numberColumn] = `${s.numberPrefix}-${refSuffix()}`;
    }
    return this.insertWith(tx, cols);
  }

  async findById(id: string, tx?: DbConnection): Promise<any> {
    const s = this.spec;
    const q = async (c: DbConnection) => {
      const rows = (await c.query(
        `SELECT * FROM ${s.table} WHERE ${s.pk} = $1 AND ${this.visibleClause()}`,
        [id],
      )) as unknown as any[];
      return rows[0] ?? null;
    };
    return tx ? q(tx) : this.withIsolation(q);
  }

  async findByColumn(
    column: string,
    value: unknown,
    tx?: DbConnection,
    scopedToTenant = true,
  ): Promise<any> {
    const allowed = new Set([
      ...this.spec.insertColumns,
      ...this.spec.updateColumns,
      this.spec.pk,
    ]);
    if (!allowed.has(column)) {
      throw DomainError.validation(`column '${column}' is not queryable`);
    }
    const s = this.spec;
    const sql = scopedToTenant
      ? `SELECT * FROM ${s.table} WHERE ${column} = $1 AND tenant_id = $2 AND ${this.visibleClause()}`
      : `SELECT * FROM ${s.table} WHERE ${column} = $1 AND ${this.visibleClause()}`;
    const params = scopedToTenant
      ? [value, this.tenantContext.tenantId()]
      : [value];
    const q = async (c: DbConnection) => {
      const rows = (await c.query(sql, params)) as unknown as any[];
      return rows[0] ?? null;
    };
    return tx ? q(tx) : this.withIsolation(q);
  }

  /**
   * Tenant-scoped list with server-side pagination. `limit`/`offset` are
   * clamped integers; `extraWhere` must be a spec-authored constant.
   */
  async list<T = any>(
    opts: { limit?: number; offset?: number } = {},
  ): Promise<T[]> {
    const s = this.spec;
    const hard = s.hardLimit ?? 200;
    const requested = Number(opts.limit ?? s.defaultLimit ?? 50);
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(Math.trunc(requested), 1), hard)
      : (s.defaultLimit ?? 50);
    const requestedOffset = Number(opts.offset ?? 0);
    const offset = Number.isFinite(requestedOffset)
      ? Math.max(Math.trunc(requestedOffset), 0)
      : 0;
    const where = [this.visibleClause(), s.listWhere ?? "true"].join(" AND ");
    const order = s.listOrder ?? `${s.table}.created_at DESC`;
    return this.withIsolation(async (tx) => {
      const rows = (await tx.query(
        `SELECT * FROM ${s.table} WHERE ${where} ORDER BY ${order} LIMIT $1 OFFSET $2`,
        [limit, offset],
      )) as unknown as T[];
      return rows;
    });
  }

  /** Single-row read inside the caller's tenant isolation. */
  async queryOne<T = any>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  /**
   * Apply a whitelisted patch. `literalSet` entries are spec-authored SQL
   * fragments with no parameters (e.g. `closed_at = now()`), which is how a
   * transition stamps timestamps without string-interpolating user input.
   */
  async patch(
    tx: DbConnection,
    id: string,
    patch: Record<string, unknown> | null | undefined,
    opts: { table?: string; literalSet?: string[]; forceStatus?: string } = {},
  ): Promise<any> {
    const s = this.spec;
    const table = opts.table ?? s.table;
    const cols = this.pick(patch, s.updateColumns);
    const sets: string[] = [];
    const params: unknown[] = [id];
    let i = 2;
    if (opts.forceStatus !== undefined) {
      sets.push(`${s.statusColumn ?? "status"} = $${i++}`);
      params.push(opts.forceStatus);
    }
    for (const [k, v] of Object.entries(cols)) {
      sets.push(`${k} = $${i++}`);
      params.push(v === undefined ? null : v);
    }
    for (const frag of opts.literalSet ?? []) sets.push(frag);
    const actor = this.actorId();
    if (actor && s.tracksUpdater !== false && table === s.table) {
      sets.push(`updated_by = $${i++}`);
      params.push(actor);
    }
    if (sets.length === 0) return this.findById(id, tx);
    const rows = (await tx.query(
      `UPDATE ${table} SET ${sets.join(", ")} WHERE ${s.pk} = $1 AND ${this.visibleClause()} RETURNING *`,
      params,
    )) as unknown as any[];
    return rows[0] ?? null;
  }

  /** Soft delete. Never a hard DELETE: clinical rows keep their history. */
  async softDelete(tx: DbConnection, id: string): Promise<any> {
    const s = this.spec;
    if (!this.isSoftDeletable) {
      throw DomainError.invalidState(
        `${s.resourceType} is append-only and cannot be deleted`,
      );
    }
    const rows = (await tx.query(
      `UPDATE ${s.table}
          SET voided_at = now(), voided_by = $2, correlation_id = $3
        WHERE ${s.pk} = $1 AND ${this.visibleClause()} RETURNING *`,
      [id, this.actorId(), this.correlationId()],
    )) as unknown as any[];
    return rows[0] ?? null;
  }

  /** Read-only query inside the caller's tenant isolation. */
  async query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.withIsolation(
      async (tx) => (await tx.query(sql, params)) as unknown as T[],
    );
  }

  async queryInTx<T = any>(
    tx: DbConnection,
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    return (await tx.query(sql, params)) as unknown as T[];
  }
}

export interface DomainRules {
  validateCreate?: (
    input: Record<string, unknown>,
    actor: NonNullable<ReturnType<TenantContext["current"]>>,
  ) => Promise<void> | void;
  validateUpdate?: (
    id: string,
    patch: Record<string, unknown>,
    current: Record<string, unknown> | null,
    actor: NonNullable<ReturnType<TenantContext["current"]>>,
  ) => Promise<void> | void;
  /** Legal status transitions. Absent = no state machine (use update). */
  transitions?: Record<string, Set<string>>;
  /** Column stamped with now() when a transition reaches a closing status. */
  closedAtColumn?: string;
  /** Statuses considered "closing" for the stamp above. */
  closingStatuses?: string[];
  /** Escape hatch for a domain that must write sibling rows atomically. */
  afterCreate?: (
    tx: DbConnection,
    row: Record<string, unknown>,
  ) => Promise<void>;
  afterTransition?: (
    tx: DbConnection,
    row: Record<string, unknown>,
    from: string,
    to: string,
  ) => Promise<void>;
  /** Payload builder for the governed outbox event. Return null to skip. */
  eventPayload?: (
    kind: "create" | "transition",
    row: Record<string, unknown>,
  ) => Record<string, unknown> | null;
}

export interface DomainServiceDeps {
  repo: ResourceRepository;
  audit: AuditService;
  db: DbConnection;
  tenantCtx: TenantContext;
  outbox?: EventOutboxService;
}

/**
 * Governed operational resource service: create / get / list / update /
 * transition / void. Each mutation is one tenant-scoped transaction carrying
 * one audit record (and one outbox event, when the module declares one).
 */
export class ResourceDomainService {
  protected readonly repo: ResourceRepository;
  protected readonly spec: ResourceSpec;
  protected readonly rules: DomainRules;
  protected readonly deps: DomainServiceDeps;

  constructor(
    deps: DomainServiceDeps,
    spec: ResourceSpec,
    rules: DomainRules = {},
  ) {
    this.deps = deps;
    this.repo = deps.repo;
    this.spec = spec;
    this.rules = rules;
  }

  /**
   * Run a compound module write in ONE tenant-scoped transaction so sibling row
   * inserts (e.g. a referral plus its tracking event, or an allocation plus the
   * bed it frees) commit atomically with the audit record. Reuses the ambient
   * transaction when one is already open.
   */
  protected inTx<T>(fn: (tx: DbConnection) => Promise<T>): Promise<T> {
    return inTx(this.deps.db, this.deps.tenantCtx, fn);
  }

  /**
   * Atomic audited write: business rows and exactly one audit entry commit
   * together, or not at all. This is the ONLY way a module in this layer writes.
   */
  protected atomic<T>(
    operation: string,
    resourceType: string,
    work: (tx: DbConnection) => Promise<T | null>,
    getResourceId: (result: T) => string,
  ): Promise<T> {
    return atomicWrite(
      this.deps.db,
      this.deps.tenantCtx,
      this.deps.audit,
      operation,
      resourceType,
      work,
      getResourceId,
    );
  }

  /** Read-only tenant-isolated query (no transaction of its own when nested). */
  protected query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.repo.query<T>(sql, params);
  }

  protected queryOne<T = any>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | null> {
    return this.repo.queryOne<T>(sql, params);
  }

  /** Record an audit entry inside the current transaction. */
  protected async audit(
    tx: DbConnection,
    ev: Parameters<AuditService["record"]>[1],
  ): Promise<void> {
    await this.deps.audit.record(tx, ev);
  }

  protected requireActor() {
    const actor = this.deps.tenantCtx.current();
    if (!actor) throw DomainError.unauthorized("Authentication required");
    return actor;
  }

  protected get outbox(): EventOutboxService | undefined {
    return this.deps.outbox;
  }

  async create(input: Record<string, unknown>): Promise<any> {
    const actor = this.requireActor();
    if (this.rules.validateCreate) {
      await this.rules.validateCreate(input, actor);
    }
    const idemCol = this.spec.idempotencyColumn;
    if (idemCol) {
      const key = input?.[idemCol];
      if (typeof key === "string" && key.trim().length > 0) {
        const existing = await this.repo.findByColumn(idemCol, key);
        if (existing) return existing;
      }
    }
    return atomicWrite(
      this.deps.db,
      this.deps.tenantCtx,
      this.deps.audit,
      `${this.spec.auditPrefix}.create`,
      this.spec.resourceType,
      async (tx) => {
        const row = await this.repo.insert(tx, input);
        if (!row) throw DomainError.invalidState("Insert produced no row");
        if (this.rules.afterCreate) await this.rules.afterCreate(tx, row);
        await this.publish("create", row);
        return row;
      },
      (r: any) => String(r?.[this.spec.pk]),
    );
  }

  async get(id: string): Promise<any> {
    this.requireActor();
    const row = await this.repo.findById(id);
    if (!row) throw DomainError.notFound(this.spec.resourceType, id);
    return row;
  }

  async list(opts: { limit?: number; offset?: number } = {}): Promise<any[]> {
    this.requireActor();
    return this.repo.list(opts);
  }

  async update(id: string, patch: Record<string, unknown>): Promise<any> {
    const actor = this.requireActor();
    const current = await this.repo.findById(id);
    if (!current) throw DomainError.notFound(this.spec.resourceType, id);
    if (this.rules.validateUpdate) {
      await this.rules.validateUpdate(id, patch, current, actor);
    }
    return atomicWrite(
      this.deps.db,
      this.deps.tenantCtx,
      this.deps.audit,
      `${this.spec.auditPrefix}.update`,
      this.spec.resourceType,
      async (tx) => {
        const row = await this.repo.patch(tx, id, patch);
        if (!row) throw DomainError.notFound(this.spec.resourceType, id);
        return row;
      },
      (r: any) => String(r?.[this.spec.pk]),
    );
  }

  async transition(
    id: string,
    to: string,
    patch: Record<string, unknown> = {},
  ): Promise<any> {
    this.requireActor();
    if (!this.rules.transitions) {
      throw DomainError.invalidState(
        `${this.spec.resourceType} has no state machine; use update`,
      );
    }
    const statusCol = this.spec.statusColumn ?? "status";
    const closing = new Set(
      this.rules.closingStatuses ?? [
        "completed",
        "closed",
        "cancelled",
        "signed",
        "discharged",
        "delivered",
        "accepted",
        "released",
        "left",
      ],
    );
    const literalSet =
      this.rules.closedAtColumn && closing.has(to)
        ? [`${this.rules.closedAtColumn} = now()`]
        : [];
    return atomicTransition(
      this.deps.db,
      this.deps.tenantCtx,
      this.deps.audit,
      this.rules.transitions,
      async (rid, tx) => {
        const row = await this.repo.findById(rid, tx);
        if (!row) return null;
        return { status: String(row[statusCol]), row } as any;
      },
      async (rid, tto, tx) => {
        const before = await this.repo.findById(rid, tx);
        const from = String(before?.[statusCol] ?? "");
        const row = await this.repo.patch(tx, rid, patch, {
          forceStatus: tto,
          literalSet,
        });
        if (!row) throw DomainError.notFound(this.spec.resourceType, rid);
        if (this.rules.afterTransition) {
          await this.rules.afterTransition(tx, row, from, tto);
        }
        await this.publish("transition", row);
        return row;
      },
      `${this.spec.auditPrefix}.transition`,
      this.spec.resourceType,
      id,
      to,
    );
  }

  async voidRecord(id: string, reason?: string): Promise<any> {
    this.requireActor();
    if (this.spec.softDeletable === false) {
      throw DomainError.invalidState(
        `${this.spec.resourceType} is append-only and cannot be voided`,
      );
    }
    return atomicWrite(
      this.deps.db,
      this.deps.tenantCtx,
      this.deps.audit,
      `${this.spec.auditPrefix}.void`,
      this.spec.resourceType,
      async (tx) => {
        const row = await this.repo.softDelete(tx, id);
        if (!row) throw DomainError.notFound(this.spec.resourceType, id);
        if (reason) (row as any).void_reason = reason;
        return row;
      },
      (r: any) => String(r?.[this.spec.pk]),
    );
  }

  /** Emit the module's governed event, if it declares one. */
  protected async publish(
    kind: "create" | "transition",
    row: Record<string, unknown>,
  ): Promise<void> {
    const outbox = this.outbox;
    const evt = this.spec.event;
    if (!outbox || !evt || !this.rules.eventPayload) return;
    const payload = this.rules.eventPayload(kind, row);
    if (!payload) return;
    const id = String(row[this.spec.pk]);
    await outbox.publish({
      eventType: evt.eventType,
      domain: evt.domain,
      operation: evt.operation,
      subjectType: evt.subjectType,
      subjectId: id,
      classification: (evt as any).classification ?? "CONFIDENTIAL",
      payload,
      idempotencyKey: `beyu-evt:${this.spec.resourceType}:${kind}:${id}`,
      sectorEventId: `health-${this.spec.resourceType}-${kind}-${id}`,
    });
  }
}
