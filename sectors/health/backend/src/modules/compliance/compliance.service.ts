/**
 * Compliance Control Engine.
 *
 * Machine-readable compliance control registry. NEVER reports a control as
 * "compliant" — statuses are implementation states only: not_implemented,
 * partially_implemented, implemented, external_dependency, requires_approval,
 * not_applicable, evidence_required. External verification / regulatory
 * accreditation is a separate artifact that only a human (with jurisdiction
 * evidence) can approve.
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { DbConnection, DB_CONNECTION } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { withIsolation, atomicWrite } from "../identity/db-utils";
import { AuditService } from "../audit/audit.service";
import { DomainError } from "../../common/errors/domain.error";

export interface ComplianceControlRecord {
  control_id: string;
  authority: string;
  jurisdiction: string;
  category: string;
  requirement: string;
  version?: string;
  effective_date?: string | null;
  review_date?: string | null;
  implementation_status:
    | "not_implemented"
    | "partially_implemented"
    | "implemented"
    | "external_dependency"
    | "requires_approval"
    | "not_applicable"
    | "evidence_required";
  evidence_reference?: string | null;
  owner_role?: string | null;
  risk_level: "low" | "medium" | "high" | "critical";
  applicability: string;
  verification_method?: string | null;
  external_dependency: boolean;
  approval_required: boolean;
  notes?: string | null;
}

export interface EvidenceRecord {
  control_id: string;
  evidence_type: "test" | "audit_log" | "migration" | "document" | "external_verification" | "approval" | "configuration";
  reference: string;
  valid_until?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly tenantCtx: TenantContext,
    private readonly audit: AuditService,
  ) {}

  /** Register or update a control (idempotent, tenant:admin only at controller layer). */
  async upsertControl(rec: ComplianceControlRecord): Promise<ComplianceControlRecord> {
    if (!rec.control_id) throw DomainError.validation("control_id required");
    return atomicWrite(this.db, this.tenantCtx, this.audit, {
      resourceType: "compliance_control",
      operation: "compliance_control.register",
      work: async (tx) => {
        await tx.query(
          `INSERT INTO health.compliance_controls
             (control_id, authority, jurisdiction, category, requirement, version,
              effective_date, review_date, implementation_status, evidence_reference,
              owner_role, risk_level, applicability, verification_method,
              external_dependency, approval_required, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           ON CONFLICT (control_id) DO UPDATE SET
             authority=EXCLUDED.authority, jurisdiction=EXCLUDED.jurisdiction,
             category=EXCLUDED.category, requirement=EXCLUDED.requirement,
             version=EXCLUDED.version, effective_date=EXCLUDED.effective_date,
             review_date=EXCLUDED.review_date,
             implementation_status=EXCLUDED.implementation_status,
             evidence_reference=EXCLUDED.evidence_reference,
             owner_role=EXCLUDED.owner_role, risk_level=EXCLUDED.risk_level,
             applicability=EXCLUDED.applicability,
             verification_method=EXCLUDED.verification_method,
             external_dependency=EXCLUDED.external_dependency,
             approval_required=EXCLUDED.approval_required, notes=EXCLUDED.notes,
             updated_at=now()`,
          [
            rec.control_id, rec.authority, rec.jurisdiction ?? "TZ", rec.category,
            rec.requirement, rec.version ?? "1.0", rec.effective_date ?? null,
            rec.review_date ?? null, rec.implementation_status,
            rec.evidence_reference ?? null, rec.owner_role ?? null, rec.risk_level ?? "medium",
            rec.applicability ?? "all", rec.verification_method ?? null,
            !!rec.external_dependency, !!rec.approval_required, rec.notes ?? null,
          ],
        );
        return rec;
      },
    });
  }

  async listControls(opts: { category?: string; authority?: string; riskLevel?: string } = {}): Promise<ComplianceControlRecord[]> {
    return withIsolation(this.db, this.tenantCtx, "compliance_control", async (tx) => {
      const where: string[] = [];
      const params: unknown[] = [];
      if (opts.category) { params.push(opts.category); where.push(`category=$${params.length}`); }
      if (opts.authority) { params.push(opts.authority); where.push(`authority=$${params.length}`); }
      if (opts.riskLevel) { params.push(opts.riskLevel); where.push(`risk_level=$${params.length}`); }
      const sql = `SELECT control_id, authority, jurisdiction, category, requirement, version,
                          effective_date, review_date, implementation_status, evidence_reference,
                          owner_role, risk_level, applicability, verification_method,
                          external_dependency, approval_required, notes
                     FROM health.compliance_controls
                    ${where.length ? "WHERE " + where.join(" AND ") : ""}
                    ORDER BY risk_level DESC, control_id`;
      const rows = await tx.query<ComplianceControlRecord & Record<string, unknown>>(sql, params);
      return rows;
    });
  }

  /** Attach evidence to a control. Fails closed if the control doesn't exist. */
  async addEvidence(e: EvidenceRecord): Promise<{ evidence_id: string }> {
    const actor = this.tenantCtx.current();
    if (!actor) throw new Error("AUTH_REQUIRED");
    return atomicWrite(this.db, this.tenantCtx, this.audit, {
      resourceType: "compliance_evidence",
      operation: "compliance_evidence.attach",
      work: async (tx) => {
        const ctrl = await tx.query<{ control_id: string }>(
          `SELECT control_id FROM health.compliance_controls WHERE control_id=$1`,
          [e.control_id],
        );
        if (!ctrl.length) throw DomainError.validation(`unknown control: ${e.control_id}`);
        const ins = await tx.query<{ evidence_id: string }>(
          `INSERT INTO health.compliance_evidence
             (tenant_id, control_id, evidence_type, reference, valid_until,
              metadata, collected_by)
           VALUES (current_setting('app.tenant_id', true)::uuid, $1, $2, $3, $4, $5::jsonb, $6)
           RETURNING evidence_id`,
          [e.control_id, e.evidence_type, e.reference, e.valid_until ?? null,
           JSON.stringify(e.metadata ?? {}), actor.userId],
        );
        return ins[0];
      },
    });
  }

  /** Compliance coverage snapshot (NOT a certification — coverage count only). */
  async coverageReport(): Promise<{
    total: number;
    by_status: Record<string, number>;
    by_risk: Record<string, number>;
    external_blocked: number;
    requires_human_approval: number;
  }> {
    return withIsolation(this.db, this.tenantCtx, "compliance_control", async (tx) => {
      const rows = await tx.query<{
        implementation_status: string;
        risk_level: string;
        external_dependency: boolean;
        approval_required: boolean;
        n: number;
      }>(`SELECT implementation_status, risk_level, external_dependency, approval_required,
                 count(*)::int AS n
            FROM health.compliance_controls
           GROUP BY 1,2,3,4`);
      const by_status: Record<string, number> = {};
      const by_risk: Record<string, number> = {};
      let total = 0;
      let blocked = 0;
      let needsApproval = 0;
      for (const r of rows) {
        total += Number(r.n);
        by_status[r.implementation_status] = (by_status[r.implementation_status] ?? 0) + Number(r.n);
        by_risk[r.risk_level] = (by_risk[r.risk_level] ?? 0) + Number(r.n);
        if (r.external_dependency && r.implementation_status !== "implemented") blocked += Number(r.n);
        if (r.approval_required && r.implementation_status !== "implemented") needsApproval += Number(r.n);
      }
      return { total, by_status, by_risk, external_blocked: blocked, requires_human_approval: needsApproval };
    });
  }
}
