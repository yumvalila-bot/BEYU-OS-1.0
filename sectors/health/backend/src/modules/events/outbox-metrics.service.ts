/**
 * Outbox operational metrics (Phase 16 observability).
 *
 * DB-backed GAUGES for the governed event runtime, read through the narrow
 * SECURITY DEFINER aggregate health.beyu_outbox_metrics() (counts and ages
 * only — no row data crosses the tenant boundary):
 *
 *   outbox_pending_total            governed events awaiting delivery
 *   outbox_failed_total             governed events in retry backoff
 *   outbox_blocked_total            governed events blocked (target not
 *                                   configured when written)
 *   outbox_dead_letter_total        governed events dead-lettered (operator
 *                                   attention required)
 *   outbox_delivered_total          governed events delivered + accepted
 *   outbox_oldest_undelivered_age_s age of the oldest undelivered row
 *   dispatcher configuration        endpoint/interval/limits + configured?
 *
 * Also surfaced: the sync-adapter track (providers other than 'beyu.events')
 * so a blocked finance backlog cannot hide behind the governed track.
 *
 * These are point-in-time gauges for readiness + operator dashboards. Process
 * counters (attempts, duplicates, auth failures) are reconstructable from the
 * append-only attempt_log / root receipts — durable and auditable by design.
 */
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DB_CONNECTION, type DbConnection } from "../identity/db-connection";

export interface OutboxTrackMetrics {
  pending: number;
  failed: number;
  blocked: number;
  dead_letter: number;
  delivered: number;
  oldest_undelivered_age_seconds: number | null;
}

export interface OutboxMetricsSnapshot {
  governed_events: OutboxTrackMetrics;
  sync_adapters: OutboxTrackMetrics;
  dispatcher: {
    configured: boolean;
    interval_ms: number | null;
    max_attempts: number;
    lease_ms: number;
    timeout_ms: number;
  };
  timestamp: string;
}

interface MetricRow {
  [key: string]: unknown;
  provider: string;
  status: string;
  n: string | number;
  oldest_created: string | Date | null;
}

@Injectable()
export class OutboxMetricsService {
  constructor(
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly cfg: ConfigService,
  ) {}

  async snapshot(): Promise<OutboxMetricsSnapshot> {
    const rows = (await this.db.query<MetricRow>(
      `SELECT provider, status, n, oldest_created FROM health.beyu_outbox_metrics()`,
    )) as MetricRow[];
    const governed = this.fold(
      rows.filter((r) => r.provider === "beyu.events"),
    );
    const sync = this.fold(rows.filter((r) => r.provider !== "beyu.events"));
    const interval = Number(
      this.cfg.get("BEYU_EVENTS_DISPATCH_INTERVAL_MS") ?? 5000,
    );
    return {
      governed_events: governed,
      sync_adapters: sync,
      dispatcher: {
        configured: Boolean(this.cfg.get<string>("BEYU_EVENTS_ENDPOINT")),
        interval_ms: interval,
        max_attempts: Number(this.cfg.get("BEYU_EVENTS_MAX_ATTEMPTS") ?? 8),
        lease_ms: Number(this.cfg.get("BEYU_EVENTS_LEASE_MS") ?? 60000),
        timeout_ms: Number(this.cfg.get("BEYU_EVENTS_TIMEOUT_MS") ?? 8000),
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness contribution (Phase 17): the dispatcher is never allowed to
   * fail readiness on its own (a backlog is an operational condition, not an
   * unreadiness of the service), but degraded states are REPORTED:
   *   - dead_letter > 0                      → degraded (operator attention)
   *   - endpoint unconfigured with undelivered rows → degraded (backlog)
   */
  async readiness(): Promise<{
    status: "up" | "degraded";
    detail: Record<string, unknown>;
  }> {
    const snap = await this.snapshot();
    const undelivered =
      snap.governed_events.pending +
      snap.governed_events.failed +
      snap.governed_events.blocked +
      snap.governed_events.dead_letter;
    const degraded =
      snap.governed_events.dead_letter > 0 ||
      (!snap.dispatcher.configured && undelivered > 0);
    return {
      status: degraded ? "degraded" : "up",
      detail: {
        configured: snap.dispatcher.configured,
        pending: snap.governed_events.pending,
        failed: snap.governed_events.failed,
        blocked: snap.governed_events.blocked,
        dead_letter: snap.governed_events.dead_letter,
        oldest_undelivered_age_seconds:
          snap.governed_events.oldest_undelivered_age_seconds,
      },
    };
  }

  private fold(rows: MetricRow[]): OutboxTrackMetrics {
    const out: OutboxTrackMetrics = {
      pending: 0,
      failed: 0,
      blocked: 0,
      dead_letter: 0,
      delivered: 0,
      oldest_undelivered_age_seconds: null,
    };
    let oldest: Date | null = null;
    for (const r of rows) {
      const n = Number(r.n);
      if (r.status in out) out[r.status as keyof OutboxTrackMetrics] = n;
      if (r.status !== "delivered" && r.oldest_created) {
        const d = new Date(r.oldest_created);
        if (!oldest || d < oldest) oldest = d;
      }
    }
    if (oldest) {
      out.oldest_undelivered_age_seconds = Math.max(
        0,
        Math.floor((Date.now() - oldest.getTime()) / 1000),
      );
    }
    return out;
  }
}
