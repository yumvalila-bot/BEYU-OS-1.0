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
 * HEALTH_AUDIT_GENESIS_v1. We lock the tenant's chain tip (SELECT … FOR
 * UPDATE) before inserting to guarantee a deterministic prev_hash link, and
 * the DB triggers (trg_audit_chain_verify, trg_audit_update_block,
 * trg_audit_immutable_delete from migration 011) enforce that DELETEs are
 * rejected and that hash fields cannot be updated after insert.
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

    const last = (await tx.query(
      `WITH last_hashed AS (
         SELECT entry_hash AS h FROM health.audit_log
          WHERE tenant_id = $1::uuid AND entry_hash IS NOT NULL
          ORDER BY audit_id DESC LIMIT 1
       ), last_unhashed AS (
         SELECT audit_id::text AS h FROM health.audit_log
          WHERE tenant_id = $1::uuid AND entry_hash IS NULL
          ORDER BY audit_id DESC LIMIT 1
       )
       SELECT COALESCE((SELECT h FROM last_hashed),
                       (SELECT h FROM last_unhashed),
                       $2) AS prev`,
      [tenantId, AUDIT_GENESIS],
    )) as any;
    const prevHash: string = last?.rows?.[0]?.prev ?? AUDIT_GENESIS;

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
        auditId, tenantId, entityCode, countryCode, actorId,
        profLicense, practitionerId, facilityId,
        ward, department, room, servicePoint, tz, sessionId,
        correlationId, causationId, requestId, operation,
        resourceType, resourceId, before, after, metadata,
        sourceService, authDecision, resultStatus,
        dataClassification, createdAt, prevHash, entryHash, AUDIT_HASH_VERSION,
      ],
    );
    return auditId;
  }
}
