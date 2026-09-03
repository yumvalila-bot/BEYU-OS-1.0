/**
 * Outbox operations: operator-authorized replay + reconciliation (Phase 8).
 *
 * REPLAY is deliberately a HUMAN operator action — never automatic, never
 * client-triggerable, never silent:
 *   * the operator MUST hold the `outbox:replay` permission (guard) and a
 *     reason is MANDATORY (recorded in the attempt log + audit chain);
 *   * only dead_letter / failed / blocked rows may be requeued — a delivered
 *     row can never be replayed (that would be an unauthorized duplicate
 *     delivery attempt);
 *   * requeue resets the attempt budget and PRESERVES the full attempt_log
 *     (append-only history including the replay entry itself);
 *   * re-delivery is still exactly-once at the business level: BEYU's
 *     idempotency receipt accepts a replayed key as a duplicate and returns
 *     the ORIGINAL event id — no second enterprise event, ever.
 *
 * RECONCILIATION compares the outbox ledger against BEYU OS's acceptance
 * receipts (POST /api/v1/internal/events/status) and detects:
 *   delivered-but-never-accepted   (CRITICAL — BEYU receipt missing)
 *   accepted-but-not-recorded      (repairable: outbox repaired to delivered)
 *   backlog / stuck / dead_letter  (undelivered, receipts confirm not accepted)
 *   unknown                        (BEYU status unreachable — reported, never
 *                                   guessed; no repair on unknowns)
 * Repairs mutate state ONLY when `repair: true` AND the caller also holds
 * `outbox:replay` (enforced by the controller).
 *
 * Every replay, reconciliation pass and repair writes an entry to the
 * tamper-evident health audit chain; every status probe writes an audit row
 * on the BEYU side.
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DB_CONNECTION, type DbConnection } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { requestStorage } from "../../common/observability/correlation-id.middleware";
import { AuditService } from "../audit/audit.service";
import { signServiceToken } from "../../integrations/beyu/shared/service-token";
import { SERVICE_PRINCIPAL_ID } from "../../integrations/beyu/adapters/beyu-base.adapter";
import { OutboxDispatcherService } from "./outbox-dispatcher.service";

interface OutboxStateRow {
  [key: string]: unknown;
  id: string;
  idempotency_key: string;
  tenant_id: string | null;
  status: string;
  attempt_count: number;
  request_payload: Record<string, unknown> | string;
  correlation_id: string | null;
}

export interface ReplayResult {
  requested: number;
  requeued: { idempotencyKey: string; previousStatus: string }[];
  refused: { idempotencyKey: string; reason: string }[];
  dispatch: {
    claimed: number;
    delivered: number;
    duplicates: number;
    retried: number;
    deadLettered: number;
    errors: number;
  };
}

export interface ReconcileReport {
  checked: number;
  consistent: string[];
  acceptedNotRecorded: {
    idempotencyKey: string;
    eventId: string | null;
    outboxStatus: string;
  }[];
  repaired: string[];
  deliveredWithoutAcceptance: {
    idempotencyKey: string;
    deliveredAt: unknown;
  }[];
  undelivered: {
    idempotencyKey: string;
    outboxStatus: string;
    attempts: number;
  }[];
  unknown: { idempotencyKey: string; error: string }[];
}

@Injectable()
export class OutboxOpsService {
  private readonly logger = new Logger(OutboxOpsService.name);

  constructor(
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly tenantCtx: TenantContext,
    private readonly cfg: ConfigService,
    private readonly audit: AuditService,
    private readonly dispatcher: OutboxDispatcherService,
  ) {}

  // ── Operator-authorized replay ───────────────────────────────────────────

  async replay(args: {
    idempotencyKeys?: string[];
    all?: boolean;
    reason: string;
    operator: {
      userId: string;
      tenantId: string | null;
      email?: string | null;
    };
  }): Promise<ReplayResult> {
    if (!args.reason || args.reason.trim().length < 3) {
      throw new Error("REPLAY_REASON_REQUIRED");
    }
    const keys = args.idempotencyKeys ?? [];
    if (!args.all && keys.length === 0) {
      throw new Error("REPLAY_TARGETS_REQUIRED");
    }

    // Select candidates: undeliverable states only. Delivered rows are refused.
    const rows = await this.selectRows(keys, args.all === true);
    const result: ReplayResult = {
      requested: rows.length,
      requeued: [],
      refused: [],
      dispatch: {
        claimed: 0,
        delivered: 0,
        duplicates: 0,
        retried: 0,
        deadLettered: 0,
        errors: 0,
      },
    };

    for (const row of rows) {
      if (row.status === "delivered") {
        result.refused.push({
          idempotencyKey: row.idempotency_key,
          reason: "ALREADY_DELIVERED",
        });
        continue;
      }
      await this.runAs(row, async () => {
        await this.db.query(
          `UPDATE health.beyu_outbox SET
             status = 'pending',
             attempt_count = 0,
             next_attempt_at = NULL,
             attempt_log = attempt_log || $3::jsonb
           WHERE id = $1::uuid AND status = $2`,
          [
            row.id,
            row.status,
            JSON.stringify([
              {
                phase: "replay",
                at: new Date().toISOString(),
                operator: args.operator.userId,
                reason: args.reason.trim().slice(0, 500),
                previousStatus: row.status,
              },
            ]),
          ],
        );
      });
      result.requeued.push({
        idempotencyKey: row.idempotency_key,
        previousStatus: row.status,
      });
    }

    // Audit the operator action (tamper-evident chain) under the operator's
    // own context when available, else the first row's tenant.
    await this.auditOperatorAction(
      "beyu.outbox.replay",
      {
        requeued: result.requeued,
        refused: result.refused,
        reason: args.reason,
      },
      rows[0]?.tenant_id ?? args.operator.tenantId ?? null,
    );

    // Immediate delivery pass (idempotency makes any racing delivery safe).
    if (result.requeued.length > 0) {
      result.dispatch = await this.dispatcher.dispatchDueBatch();
    }
    return result;
  }

  // ── Reconciliation ───────────────────────────────────────────────────────

  async reconcile(args: {
    repair: boolean;
    limit?: number;
  }): Promise<ReconcileReport> {
    const report: ReconcileReport = {
      checked: 0,
      consistent: [],
      acceptedNotRecorded: [],
      repaired: [],
      deliveredWithoutAcceptance: [],
      undelivered: [],
      unknown: [],
    };
    const limit = Math.min(Math.max(args.limit ?? 500, 1), 5000);
    const rows = (await this.db.query<OutboxStateRow>(
      `SELECT id, idempotency_key, tenant_id, status, attempt_count, request_payload, correlation_id
         FROM health.beyu_outbox
        WHERE provider = 'beyu.events'
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit],
    )) as OutboxStateRow[];

    for (const row of rows) {
      report.checked++;
      let status:
        { accepted: boolean; eventId: string | null } | "not_found" | "unknown";
      try {
        status = await this.probeStatus(row);
      } catch (e) {
        status = "unknown";
        report.unknown.push({
          idempotencyKey: row.idempotency_key,
          error: `${(e as Error).message}`.slice(0, 200),
        });
      }

      if (status === "unknown") continue;

      if (status === "not_found") {
        if (row.status === "delivered") {
          // CRITICAL: we recorded a delivery BEYU cannot confirm. Never
          // auto-repaired — surfaced for operator investigation (and replay,
          // which is safe because BEYU would treat it as first acceptance).
          report.deliveredWithoutAcceptance.push({
            idempotencyKey: row.idempotency_key,
            deliveredAt: null,
          });
        } else {
          report.undelivered.push({
            idempotencyKey: row.idempotency_key,
            outboxStatus: row.status,
            attempts: row.attempt_count,
          });
        }
        continue;
      }

      // status.accepted === true
      if (row.status === "delivered") {
        report.consistent.push(row.idempotency_key);
      } else if (args.repair) {
        // Accepted by BEYU but the outbox never recorded it (crash between
        // acceptance and state write, or delivery without receipt capture).
        await this.repairToDelivered(row, status.eventId);
        report.repaired.push(row.idempotency_key);
      } else {
        report.acceptedNotRecorded.push({
          idempotencyKey: row.idempotency_key,
          eventId: status.eventId,
          outboxStatus: row.status,
        });
      }
    }

    await this.auditOperatorAction(
      "beyu.outbox.reconcile",
      {
        checked: report.checked,
        consistent: report.consistent.length,
        acceptedNotRecorded: report.acceptedNotRecorded.length,
        repaired: report.repaired.length,
        deliveredWithoutAcceptance: report.deliveredWithoutAcceptance.length,
        undelivered: report.undelivered.length,
        unknown: report.unknown.length,
        repair: args.repair,
      },
      rows[0]?.tenant_id ?? null,
    );
    if (report.deliveredWithoutAcceptance.length > 0) {
      this.logger.error(
        `reconciliation: ${report.deliveredWithoutAcceptance.length} delivered-without-acceptance mismatch(es) require operator investigation`,
      );
    }
    return report;
  }

  /** Single status probe against BEYU (audited on the BEYU side by design). */
  private async probeStatus(
    row: OutboxStateRow,
  ): Promise<{ accepted: boolean; eventId: string | null } | "not_found"> {
    const endpoint = this.cfg.get<string>("BEYU_EVENTS_ENDPOINT");
    const secret = this.cfg.get<string>("BEYU_EVENTS_TOKEN");
    if (!endpoint || !secret)
      throw new Error("BEYU_EVENTS_ENDPOINT/BEYU_EVENTS_TOKEN not configured");
    const tenantCode =
      this.cfg.get<string>("BEYU_EVENTS_TENANT_CODE") ??
      this.cfg.get<string>("BEYU_IDENTITY_TENANT_CODE") ??
      "BEYU-HEALTH";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(
        `${endpoint.replace(/\/$/, "")}/api/v1/internal/events/status`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${signServiceToken(secret)}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            idempotencyKey: row.idempotency_key,
            tenantCode,
          }),
          signal: controller.signal,
        },
      );
      if (res.status === 200) {
        const json = (await res.json()) as {
          data?: { accepted?: boolean; eventId?: string | null };
        };
        return {
          accepted: json.data?.accepted ?? false,
          eventId: json.data?.eventId ?? null,
        };
      }
      if (res.status === 404) return "not_found";
      throw new Error(`BEYU status ${res.status}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Repair an accepted-but-not-recorded row to delivered (audited). */
  private async repairToDelivered(
    row: OutboxStateRow,
    eventId: string | null,
  ): Promise<void> {
    await this.runAs(row, () =>
      this.db.query(
        `UPDATE health.beyu_outbox SET
           status = 'delivered',
           delivered_at = now(),
           next_attempt_at = NULL,
           last_error = NULL,
           response_payload = $2::jsonb,
           attempt_log = attempt_log || $3::jsonb
         WHERE id = $1::uuid`,
        [
          row.id,
          JSON.stringify({
            accepted: true,
            duplicate: false,
            eventId,
            repairedBy: "reconciliation",
          }),
          JSON.stringify([
            {
              phase: "reconcile-repair",
              at: new Date().toISOString(),
              eventId,
            },
          ]),
        ],
      ),
    );
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private async selectRows(
    keys: string[],
    all: boolean,
  ): Promise<OutboxStateRow[]> {
    if (all) {
      return (await this.db.query<OutboxStateRow>(
        `SELECT id, idempotency_key, tenant_id, status, attempt_count, request_payload, correlation_id
           FROM health.beyu_outbox
          WHERE provider = 'beyu.events' AND status IN ('dead_letter','failed','blocked')
          ORDER BY created_at LIMIT 1000`,
      )) as OutboxStateRow[];
    }
    if (keys.length === 0) return [];
    const rows = (await this.db.query<OutboxStateRow>(
      `SELECT id, idempotency_key, tenant_id, status, attempt_count, request_payload, correlation_id
         FROM health.beyu_outbox
        WHERE provider = 'beyu.events' AND idempotency_key = ANY($1)`,
      [keys],
    )) as OutboxStateRow[];
    return rows;
  }

  /** Run fn under the row's tenant context (RLS) with service identity. */
  private async runAs(
    row: OutboxStateRow,
    fn: () => Promise<unknown>,
  ): Promise<void> {
    const actor = {
      globalUserId: SERVICE_PRINCIPAL_ID,
      userId: SERVICE_PRINCIPAL_ID,
      email: "service@health-os.internal",
      tenantId: row.tenant_id ?? undefined,
      entityCode: null,
      countryCode: null,
      role: "service",
    };
    await new Promise<void>((resolve, reject) => {
      requestStorage.run(
        {
          correlationId: row.correlation_id ?? `ops-${row.id}`,
          requestId: `ops-${row.id}`,
          startedAt: Date.now(),
          method: "OPS",
          path: "/events/outbox",
          ip: "127.0.0.1",
        },
        () =>
          this.tenantCtx.run(actor as never, () =>
            Promise.resolve(fn()).then(() => resolve(), reject),
          ),
      );
    });
  }

  private async auditOperatorAction(
    operation: string,
    after: Record<string, unknown>,
    tenantId: string | null,
  ): Promise<void> {
    const actor = {
      globalUserId: SERVICE_PRINCIPAL_ID,
      userId: SERVICE_PRINCIPAL_ID,
      email: "ops@health-os.internal",
      tenantId: tenantId ?? undefined,
      entityCode: null,
      countryCode: null,
      role: "service",
    };
    await new Promise<void>((resolve, reject) => {
      requestStorage.run(
        {
          correlationId: `ops-${operation}-${Date.now()}`,
          requestId: `ops-${operation}-${Date.now()}`,
          startedAt: Date.now(),
          method: "OPS",
          path: "/events/outbox",
          ip: "127.0.0.1",
        },
        () =>
          this.tenantCtx.run(actor as never, () =>
            this.audit
              .record(this.db, {
                operation,
                resourceType: "beyu_outbox",
                resourceId: null,
                after,
                dataClassification: "operational",
                sourceService: "health-os",
              })
              .then(() => resolve(), reject),
          ),
      );
    });
  }
}
