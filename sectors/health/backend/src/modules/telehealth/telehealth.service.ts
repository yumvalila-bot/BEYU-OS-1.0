import { Injectable } from "@nestjs/common";
import { TelehealthRepository } from "./telehealth.repository";
import { DomainError } from "../../common/errors/domain.error";
import { AuditService } from "../audit/audit.service";
import { Inject } from "@nestjs/common";
import { DbConnection, DB_CONNECTION } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { atomicWrite, atomicTransition } from "../../common/db/crud-factory";

const TRANSITIONS: Record<string, Set<string>> = {
  requested: new Set(["confirmed", "cancelled", "declined"]),
  confirmed: new Set(["in_progress", "cancelled", "missed"]),
  in_progress: new Set(["completed"]),
  completed: new Set<string>(),
  cancelled: new Set<string>(),
  declined: new Set<string>(),
  missed: new Set<string>(),
};

@Injectable()
export class TelehealthService {
  constructor(private readonly repo: TelehealthRepository, private readonly audit: AuditService,
    @Inject(DB_CONNECTION) private readonly db: DbConnection, private readonly tenantCtx: TenantContext) {}
  async createSession(input: any) {
    if (!input.patient_id) throw DomainError.validation("patient_id required");
    if (!input.consent_obtained) throw DomainError.validation("Telehealth consent is required before a session can be created");
    if (input.idempotency_key) { const e = await this.repo.findByIdempotency(input.idempotency_key); if (e) return e; }
    // NOTE: actual video URLs/tokens are produced by an external adapter. This
    // service stores opaque tokens/URLs supplied by the provider adapter, or
    // NULL if no adapter is configured (fail-closed). The adapter boundary is
    // documented via health.integration_status where 'video_provider' must be
    // 'available' before tokens can be attached.
    return atomicWrite(this.db, this.tenantCtx, this.audit, "telehealth.session.create", "telehealth_session",
      (tx) => this.repo.createSession(input, tx), (r) => r.session_id);
  }
  async transition(id: string, to: string, patch: Record<string, unknown> = {}) {
    return atomicTransition(this.db, this.tenantCtx, this.audit, TRANSITIONS,
      (sid, tx) => this.repo.findSession(sid, tx),
      async (sid, tto, tx) => {
        const p: Record<string, unknown> = { status: tto, ...patch };
        if (tto === "in_progress") p.started_at = new Date();
        if (tto === "completed") {
          const cur = await this.repo.findSession(sid, tx);
          p.ended_at = new Date();
          p.duration_sec = cur?.started_at ? Math.max(0, Math.floor((Date.now() - new Date(cur.started_at).getTime()) / 1000)) : 0;
        }
        return this.repo.updateSession(sid, p, tx);
      },
      "telehealth.session.transition", "telehealth_session", id, to);
  }
}
