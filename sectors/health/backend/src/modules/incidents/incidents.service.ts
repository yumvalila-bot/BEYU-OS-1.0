/**
 * Incident & CAPA (Corrective/Preventive Action) module.
 *
 * All incidents are append-only once reported; transitions require explicit
 * actor provenance; CAPA updates are audited. Sentinel events surface via the
 * compliance engine.
 */
import { Inject, Injectable } from "@nestjs/common";
import { DbConnection, DB_CONNECTION } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { withIsolation, atomicWrite } from "../identity/db-utils";
import { AuditService } from "../audit/audit.service";
import { DomainError } from "../../common/errors/domain.error";

export type IncidentCategory =
  | "patient_safety" | "medication" | "infection_control" | "fall"
  | "needle_stick" | "data_breach" | "near_miss" | "security" | "equipment" | "other";
export type IncidentSeverity = "low" | "moderate" | "severe" | "sentinel";
export type IncidentStatus = "reported" | "triaged" | "investigating" | "resolved" | "closed";

const TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  reported: ["triaged"],
  triaged: ["investigating"],
  investigating: ["resolved"],
  resolved: ["closed"],
  closed: [],
};

export interface ReportIncidentInput {
  category: IncidentCategory;
  severity: IncidentSeverity;
  description: string;
  patient_id?: string;
  encounter_id?: string;
  facility_id?: string;
  location?: string;
}

@Injectable()
export class IncidentsService {
  constructor(
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly tenantCtx: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async report(input: ReportIncidentInput): Promise<{ incident_id: string; incident_no: string }> {
    return atomicWrite(this.db, this.tenantCtx, this.audit, {
      resourceType: "incident",
      operation: "incident.report",
      work: async (tx) => {
        const actor = this.tenantCtx.require();
        const rows = await tx.query<{ incident_id: string; incident_no: string }>(
          `INSERT INTO health.incidents
             (tenant_id, entity_code, country_code, incident_no, category, severity,
              description, patient_id, encounter_id, facility_id, location,
              reported_by, created_by)
           VALUES (current_setting('app.tenant_id', true)::uuid,
                   current_setting('app.entity_code', true),
                   current_setting('app.country_code', true),
                   concat('INC-',to_char(now(),'YYYYMMDD'),'-',lpad(nextval('health.incidents_no_seq')::text,4,'0')),
                   $1,$2,$3,$4,$5,$6,$7,$8,$8)
           RETURNING incident_id, incident_no`,
          [input.category, input.severity, input.description,
           input.patient_id ?? null, input.encounter_id ?? null,
           input.facility_id ?? null, input.location ?? null, actor.userId],
        );
        return rows[0];
      },
    });
  }

  async transition(id: string, to: IncidentStatus, patch: { rca_summary?: string; capa?: Record<string, unknown> } = {}): Promise<void> {
    return atomicWrite(this.db, this.tenantCtx, this.audit, {
      resourceType: "incident",
      resourceId: id,
      operation: `incident.transition.${to}`,
      work: async (tx) => {
        const rows = await tx.query<{ status: IncidentStatus }>(
          `SELECT status FROM health.incidents WHERE incident_id=$1
            AND tenant_id=current_setting('app.tenant_id', true)::uuid`,
          [id],
        );
        if (!rows.length) throw DomainError.notFound("incident");
        const ok = TRANSITIONS[rows[0].status]?.includes(to);
        if (!ok) throw DomainError.invalidState(`incident cannot transition ${rows[0].status} -> ${to}`);
        const sets = ["status=$1"];
        const params: unknown[] = [to];
        let p = 2;
        if (patch.rca_summary) { sets.push(`rca_summary=$${p}`); params.push(patch.rca_summary); p++; }
        if (patch.capa) { sets.push(`capa=$${p}::jsonb`); params.push(JSON.stringify(patch.capa)); p++; }
        params.push(id);
        await tx.query(
          `UPDATE health.incidents SET ${sets.join(",")}, updated_at=now()
            WHERE incident_id=$${p} AND tenant_id=current_setting('app.tenant_id', true)::uuid`,
          params,
        );
      },
    });
  }

  async listOpen(): Promise<any[]> {
    return withIsolation(this.db, this.tenantCtx, "incident", async (tx) =>
      tx.query(
        `SELECT * FROM health.incidents
          WHERE tenant_id=current_setting('app.tenant_id', true)::uuid AND status <> 'closed'
          ORDER BY (severity='sentinel') DESC, reported_at DESC`,
      ),
    );
  }
}
