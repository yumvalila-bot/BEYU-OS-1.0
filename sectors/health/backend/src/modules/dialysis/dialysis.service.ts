/**
 * Dialysis domain service (foundations; no fabricated prescriptions).
 *
 * - Machines must be `available` and within maintenance/water-quality windows.
 * - Sessions have full audit provenance; status transitions follow a strict
 *   state machine and never auto-complete.
 * - Adverse events are captured as structured JSON and never silently dropped.
 */
import { Inject, Injectable } from "@nestjs/common";
import { DbConnection, DB_CONNECTION } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { withIsolation, atomicWrite } from "../identity/db-utils";
import { AuditService } from "../audit/audit.service";
import { DomainError } from "../../common/errors/domain.error";

export type SessionStatus = "scheduled" | "in_progress" | "completed" | "interrupted" | "cancelled";

const VALID_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["completed", "interrupted"],
  completed: [],
  interrupted: [],
  cancelled: [],
};

export interface DialysisSessionInput {
  patient_id: string;
  encounter_id?: string;
  machine_id?: string;
  facility_id?: string;
  session_type?: "hemodialysis" | "peritoneal" | "crrt";
  start_time?: string;
  access_type?: string;
  anticoagulant?: string;
  notes?: string;
}

@Injectable()
export class DialysisService {
  constructor(
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly tenantCtx: TenantContext,
    private readonly audit: AuditService,
  ) {}

  /** Register a dialysis machine. */
  async registerMachine(input: {
    asset_tag: string;
    facility_id?: string;
    model?: string;
    serial_number?: string;
    next_maintenance?: string;
    water_quality_last_test?: string;
  }): Promise<{ machine_id: string }> {
    return atomicWrite(this.db, this.tenantCtx, this.audit, {
      resourceType: "dialysis_machine",
      operation: "dialysis_machine.register",
      work: async (tx) => {
        const rows = await tx.query<{ machine_id: string }>(
          `INSERT INTO health.dialysis_machines
             (tenant_id, facility_id, asset_tag, model, serial_number,
              next_maintenance, water_quality_last_test)
           VALUES (current_setting('app.tenant_id', true)::uuid, $1, $2, $3, $4, $5, $6)
           RETURNING machine_id`,
          [input.facility_id ?? null, input.asset_tag, input.model ?? null,
           input.serial_number ?? null, input.next_maintenance ?? null,
           input.water_quality_last_test ?? null],
        );
        return rows[0];
      },
    });
  }

  /** Create a dialysis session. Machine must be available; water-quality must be recent if specified. */
  async schedule(input: DialysisSessionInput): Promise<{ session_id: string }> {
    return atomicWrite(this.db, this.tenantCtx, this.audit, {
      resourceType: "dialysis_session",
      operation: "dialysis_session.schedule",
      work: async (tx) => {
        if (input.machine_id) {
          const m = await tx.query<{ status: string; next_maintenance: Date | null; water_quality_last_test: Date | null }>(
            `SELECT status, next_maintenance, water_quality_last_test
               FROM health.dialysis_machines WHERE machine_id=$1 AND tenant_id=current_setting('app.tenant_id', true)::uuid`,
            [input.machine_id],
          );
          if (!m.length) throw DomainError.validation("machine not found");
          if (m[0].status !== "available") throw DomainError.requiresHumanDecision("machine not available; resolve maintenance first");
          if (m[0].next_maintenance && new Date(m[0].next_maintenance) < new Date()) {
            throw DomainError.requiresHumanDecision("machine maintenance overdue");
          }
          if (m[0].water_quality_last_test) {
            const ageDays = (Date.now() - new Date(m[0].water_quality_last_test).getTime()) / 86400000;
            if (ageDays > 30) throw DomainError.requiresHumanDecision("water quality test older than 30 days");
          }
        }
        const rows = await tx.query<{ session_id: string }>(
          `INSERT INTO health.dialysis_sessions
             (tenant_id, entity_code, country_code, patient_id, encounter_id,
              machine_id, facility_id, session_type, start_time, access_type,
              anticoagulant, notes, status, created_by)
           SELECT current_setting('app.tenant_id', true)::uuid,
                  current_setting('app.entity_code', true),
                  current_setting('app.country_code', true),
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled',
                  current_setting('app.actor_id', true)::uuid
             WHERE EXISTS (SELECT 1 FROM health.patients WHERE patient_id=$1
                            AND tenant_id=current_setting('app.tenant_id', true)::uuid)
           RETURNING session_id`,
          [input.patient_id, input.encounter_id ?? null, input.machine_id ?? null,
           input.facility_id ?? null, input.session_type ?? "hemodialysis",
           input.start_time ?? null, input.access_type ?? null,
           input.anticoagulant ?? null, input.notes ?? null],
        );
        if (!rows.length) throw DomainError.validation("patient not found in tenant");
        return rows[0];
      },
    });
  }

  async transition(sessionId: string, to: SessionStatus, patch: Record<string, unknown> = {}): Promise<void> {
    return atomicWrite(this.db, this.tenantCtx, this.audit, {
      resourceType: "dialysis_session",
      resourceId: sessionId,
      operation: `dialysis_session.transition.${to}`,
      work: async (tx) => {
        const rows = await tx.query<{ status: SessionStatus; machine_id: string | null }>(
          `SELECT status, machine_id FROM health.dialysis_sessions
            WHERE session_id=$1 AND tenant_id=current_setting('app.tenant_id', true)::uuid`,
          [sessionId],
        );
        if (!rows.length) throw DomainError.notFound("dialysis session");
        const cur = rows[0].status;
        if (!VALID_TRANSITIONS[cur]?.includes(to)) {
          throw DomainError.invalidState(`dialysis_session cannot transition ${cur} -> ${to}`);
        }
        const sets: string[] = ["status=$1"];
        const params: unknown[] = [to];
        let p = 2;
        if (to === "in_progress") { sets.push(`start_time=COALESCE(start_time, now())`); if (rows[0].machine_id) sets.push("updated_by=current_setting('app.actor_id', true)::uuid"); }
        if (to === "completed") { sets.push("end_time=now()"); sets.push(`duration_min=EXTRACT(EPOCH FROM (now() - start_time))::int / 60`); }
        if (to === "interrupted" || to === "completed") {
          if (patch.adverse_events) { sets.push(`adverse_events=$${p}::jsonb`); params.push(JSON.stringify(patch.adverse_events)); p++; }
          if (patch.notes) { sets.push(`notes=$${p}`); params.push(patch.notes); p++; }
        }
        params.push(sessionId);
        await tx.query(
          `UPDATE health.dialysis_sessions SET ${sets.join(",")}
            WHERE session_id=$${p} AND tenant_id=current_setting('app.tenant_id', true)::uuid`,
          params,
        );
        // Release machine if applicable.
        if (rows[0].machine_id && (to === "completed" || to === "interrupted" || to === "cancelled")) {
          await tx.query(
            `UPDATE health.dialysis_machines SET status='available', updated_at=now() WHERE machine_id=$1`,
            [rows[0].machine_id],
          );
        }
        if (to === "in_progress" && rows[0].machine_id) {
          await tx.query(
            `UPDATE health.dialysis_machines SET status='in_use', updated_at=now() WHERE machine_id=$1`,
            [rows[0].machine_id],
          );
        }
      },
    });
  }

  async get(sessionId: string) {
    return withIsolation(this.db, this.tenantCtx, "dialysis_session", async (tx) => {
      const rows = await tx.query(
        `SELECT * FROM health.dialysis_sessions
          WHERE session_id=$1 AND tenant_id=current_setting('app.tenant_id', true)::uuid`,
        [sessionId],
      );
      if (!rows.length) throw DomainError.notFound("dialysis session");
      return rows[0];
    });
  }
}
