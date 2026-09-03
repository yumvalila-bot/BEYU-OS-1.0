/**
 * Transactional governed-event outbox writer (Phase 8).
 *
 * THE TRANSACTIONAL OUTBOX PATTERN: business code calls publish() INSIDE the
 * same database transaction as the business mutation (inTx joins the ambient
 * transaction), so the event and the business change commit atomically or
 * not at all. The dispatcher (outbox-dispatcher.service.ts) later delivers
 * the row to BEYU OS through authenticated governed transport.
 *
 * Events are provider 'beyu.events'. The row's request_payload carries the
 * full interoperability envelope the dispatcher forwards verbatim; the
 * idempotency key defines exactly-once identity on the BEYU side.
 */
import { Inject, Injectable } from "@nestjs/common";
import { DB_CONNECTION, type DbConnection } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { currentCorrelationId } from "../../common/observability/correlation-id.middleware";
import { inTx } from "../../common/db/crud-factory";

/** Event envelope persisted to the outbox (forwarded verbatim to BEYU). */
export interface GovernedEventInput {
  /** REQUIRED exactly-once identity (unique per business occurrence). */
  idempotencyKey: string;
  /** Sector-side event id (recorded on the BEYU event payload + receipt). */
  sectorEventId: string;
  eventType: string;
  eventVersion?: string;
  schemaVersion?: string;
  domain: string;
  operation: string;
  destinationDomain?: string | null;
  subjectType: string;
  subjectId: string;
  /** Canonical GlobalUserID of the acting human, if any. */
  actorGlobalUserId?: string | null;
  classification?:
    | "PUBLIC"
    | "INTERNAL"
    | "CONFIDENTIAL"
    | "RESTRICTED"
    | "HIGHLY_RESTRICTED";
  correlationId?: string;
  causationId?: string | null;
  occurredAt?: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class EventOutboxService {
  constructor(
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly tenantCtx: TenantContext,
  ) {}

  /**
   * Atomically persist a governed event alongside the caller's business
   * transaction. MUST be called inside the business transaction for the
   * atomicity guarantee (inTx joins the ambient transaction when present).
   */
  async publish(event: GovernedEventInput): Promise<string> {
    const actor = this.tenantCtx.current();
    const envelope = {
      sectorEventId: event.sectorEventId,
      eventType: event.eventType,
      eventVersion: event.eventVersion ?? "1",
      schemaVersion: event.schemaVersion ?? "1",
      domain: event.domain,
      operation: event.operation,
      destinationDomain: event.destinationDomain ?? null,
      subjectType: event.subjectType,
      subjectId: event.subjectId,
      actorGlobalUserId: event.actorGlobalUserId ?? null,
      classification: event.classification ?? "INTERNAL",
      correlationId: event.correlationId ?? currentCorrelationId() ?? `evt-${event.idempotencyKey}`,
      causationId: event.causationId ?? null,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      payload: event.payload,
    };

    // Joins the caller's AMBIENT business transaction when present (the
    // transactional-outbox guarantee); otherwise opens a tenant-scoped one.
    // The outbox ROW's actor column stores the SECTOR actor uuid (its own
    // identity layer); the CANONICAL GlobalUserId travels inside the
    // envelope (request_payload) — the two layers are bridged, never
    // conflated.
    const rows = await inTx(this.db, this.tenantCtx, (tx) =>
      tx.query<{ id: string }>(
      `INSERT INTO health.beyu_outbox
         (idempotency_key, provider, action, actor_global_user_id, tenant_id, entity_code, country_code,
          request_payload, status, correlation_id, created_at)
       VALUES ($1, 'beyu.events', 'event.publish', $2::uuid, $3::uuid, $4, $5,
               $6::jsonb, 'pending', $7, now())
       ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = now()
       RETURNING id`,
        [
          event.idempotencyKey,
          actor?.globalUserId ?? null,
          actor?.tenantId ?? null,
          actor?.entityCode ?? null,
          actor?.countryCode ?? null,
          JSON.stringify(envelope),
          envelope.correlationId,
        ],
      ),
    );
    return rows[0].id;
  }

  /** Outbox row state (for tests, reconciliation and operator tooling). */
  async row(idempotencyKey: string): Promise<Record<string, unknown> | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT id, idempotency_key, provider, action, status, attempt_count,
              next_attempt_at, last_attempt_at, delivered_at, last_error,
              request_payload, response_payload, attempt_log
         FROM health.beyu_outbox WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    const row = rows[0] ?? null;
    if (!row) return null;
    // PGlite may return jsonb columns as strings depending on version.
    for (const key of ["request_payload", "response_payload", "attempt_log"]) {
      if (typeof row[key] === "string") {
        try {
          row[key] = JSON.parse(row[key] as string);
        } catch {
          /* leave as-is */
        }
      }
    }
    return row;
  }
}
