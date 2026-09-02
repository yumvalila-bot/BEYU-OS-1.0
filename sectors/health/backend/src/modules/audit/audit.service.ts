import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { DbConnection, DB_CONNECTION } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import {
  requestStorage,
  currentCorrelationId,
} from "../../common/observability/correlation-id.middleware";
import {
  AUDIT_GENESIS,
  AUDIT_HASH_VERSION,
  auditHashInput,
  sha256Hex,
} from "../../common/crypto/crypto";

export interface AuditEvent {
  operation: string;
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  authDecision?: "allowed" | "denied" | "breakglass";
  resultStatus?: "ok" | "error";
  causationId?: string;
  requestId?: string;
  sourceService?: string;
  dataClassification?: string;
}

/**
 * Append-only, tamper-evident audit log.
 *
 * Every new row participates in a per-tenant SHA-256 hash chain anchored at
 * HEALTH_AUDIT_GENESIS_v1. Same-tenant writers are serialized with a
 * pg_advisory_xact_lock keyed on the tenant, and the link is derived as "the
 * entry no other row points at", which is exact without relying on any column
 * ordering. Together those guarantee two concurrent writers for one tenant
 * cannot both derive the same prev_hash.
 *
 * Note that this earlier claimed a `SELECT ... FOR UPDATE` on the chain tip.
 * It never had one, and FOR UPDATE would not have been sufficient anyway: on an
 * empty chain there is no row to lock.
 *
 * Division of enforcement, stated precisely because it is not symmetric:
 *   DATABASE (triggers from migrations 011/012) — DELETEs are rejected, hash
 *     fields and core columns cannot be updated after insert, and entry_hash
 *     must be a 64-char digest. Despite the comment in 012, the database does
 *     NOT verify that prev_hash equals the prior entry_hash.
 *   APPLICATION (this service) — the prev_hash link itself, and therefore chain
 *     continuity, which is asserted by audit-chain-integrity.spec.ts.
 *
 * Health audit remains a sector layer — anchoring into BEYU's constitutional
 * chain is ARCHITECTURE-BLOCKED pending governance.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly tenantCtx: TenantContext,
  ) {}

  async record(tx: DbConnection, ev: AuditEvent): Promise<string> {
    const actor = this.tenantCtx.current();
    if (!actor) {
      throw new Error("audit.record called outside actor context");
    }
    const cid = currentCorrelationId();
    const reqCtx = (requestStorage as any).getStore?.() as any;

    const tenantId = String(actor.tenantId);
    const entityCode = actor.entityCode ?? null;
    const countryCode = actor.countryCode ?? null;
    const actorId = String(actor.userId);
    const correlationId = cid;
    const causationId = ev.causationId ?? null;
    const requestId = ev.requestId ?? reqCtx?.requestId ?? null;
    const operation = ev.operation;
    const resourceType = ev.resourceType;
    const resourceId = ev.resourceId ?? null;
    const sourceService = ev.sourceService ?? "health-api";
    const authDecision = ev.authDecision ?? "allowed";
    const resultStatus = ev.resultStatus ?? "ok";
    const dataClassification = ev.dataClassification ?? "phi";
    const before = ev.before ? JSON.stringify(ev.before) : null;
    const after = ev.after ? JSON.stringify(ev.after) : null;
    const metadata = JSON.stringify(ev.metadata ?? {});
    const profLicense = actor.licenceNumber ?? null;
    const practitionerId = actor.practitionerId ?? null;
    const facilityId = actor.facilityId ?? null;
    const ward = actor.ward ?? null;
    const department = actor.department ?? null;
    const room = actor.room ?? null;
    const servicePoint = actor.servicePoint ?? null;
    const tz = actor.timezone ?? null;
    const sessionId = actor.sessionId ?? null;
    const createdAt = new Date().toISOString();

    // Serialize audit writers for this tenant before deriving the chain link.
    //
    // FOR UPDATE cannot serve here. On an empty chain there is no prior row to
    // lock, so two first-writers would both proceed and both anchor at the
    // genesis hash; and beyu_identity.tenants, the one row that always exists,
    // is read-only for the runtime role (SELECT ... FOR UPDATE returns 42501
    // permission denied for table tenants), so locking it would require
    // escalating the runtime role's privileges on the identity schema. An
    // advisory transaction lock is keyed on the tenant, needs no table
    // privilege, works with zero existing rows, and is released automatically
    // at COMMIT or ROLLBACK. Verified on real PostgreSQL 16.14: ten concurrent
    // same-tenant writers without this lock produced three genesis-rooted
    // entries and seven reused prev_hash values; with it, one genesis root and
    // no reuse, including across successive bursts.
    await tx.query(
      `SELECT pg_advisory_xact_lock(hashtext('health.audit_chain:' || $1::text))`,
      [tenantId],
    );

    // The chain tip is the entry that no other row points at.
    //
    // This cannot be derived by ordering. audit_id is gen_random_uuid() and so
    // carries no chronological information — the previous ORDER BY audit_id
    // DESC selected an arbitrary row, not the tip, which broke the chain even
    // for strictly sequential writers. created_at is the transaction start
    // timestamp and concurrent writers can share it. Set membership is exact
    // and needs neither.
    const last = (await tx.query(
      `WITH tip AS (
         SELECT a.entry_hash AS h FROM health.audit_log a
          WHERE a.tenant_id = $1::uuid AND a.entry_hash IS NOT NULL
            AND NOT EXISTS (
                  SELECT 1 FROM health.audit_log b
                   WHERE b.tenant_id = a.tenant_id
                     AND b.prev_hash = a.entry_hash)
          LIMIT 1
       ), last_unhashed AS (
         SELECT audit_id::text AS h FROM health.audit_log
          WHERE tenant_id = $1::uuid AND entry_hash IS NULL
          ORDER BY created_at DESC, audit_id DESC LIMIT 1
       )
       SELECT COALESCE((SELECT h FROM tip),
                       (SELECT h FROM last_unhashed),
                       $2) AS prev`,
      [tenantId, AUDIT_GENESIS],
    )) as any;
    // DbConnection.query() resolves to the ROW ARRAY, not a node-postgres
    // result object. This previously read `last?.rows?.[0]?.prev`, which is
    // undefined on an array, so prevHash silently fell back to AUDIT_GENESIS
    // for every single row and the per-tenant chain never actually chained —
    // every entry claimed to be the first. Both defects above were real but
    // were masked by this one.
    const prevHash: string =
      (last as unknown as Array<{ prev: string }> | undefined)?.[0]?.prev ??
      AUDIT_GENESIS;

    const auditId = randomUUID();
    const input = auditHashInput({
      auditId,
      tenantId,
      entityCode,
      countryCode,
      actorId,
      correlationId,
      operation,
      resourceType,
      resourceId,
      createdAt,
      prevHash,
    });
    const entryHash = sha256Hex(input);

    await tx.query(
      `INSERT INTO health.audit_log (
          audit_id, tenant_id, entity_code, country_code, actor_global_user_id,
          professional_license_number, practitioner_id, facility_id,
          ward, department, room, service_point, timezone, session_id,
          correlation_id, causation_id, request_id, operation,
          resource_type, resource_id, before_snapshot, after_snapshot,
          metadata, source_service, auth_decision, result_status,
          data_classification, created_at, prev_hash, entry_hash, hash_version
       ) VALUES ($1::uuid,$2,$3,$4,$5::uuid,$6,$7::uuid,$8::uuid,$9,$10,$11,$12,$13,$14,
                 $15,$16,$17,$18,$19,$20,$21::jsonb,$22::jsonb,$23::jsonb,$24,$25,$26,$27,$28::timestamptz,$29,$30,$31)`,
      [
        auditId,
        tenantId,
        entityCode,
        countryCode,
        actorId,
        profLicense,
        practitionerId,
        facilityId,
        ward,
        department,
        room,
        servicePoint,
        tz,
        sessionId,
        correlationId,
        causationId,
        requestId,
        operation,
        resourceType,
        resourceId,
        before,
        after,
        metadata,
        sourceService,
        authDecision,
        resultStatus,
        dataClassification,
        createdAt,
        prevHash,
        entryHash,
        AUDIT_HASH_VERSION,
      ],
    );
    return auditId;
  }
}
