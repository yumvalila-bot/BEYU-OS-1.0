/**
 * Non-boolean consent engine.
 *
 * Consent is purpose/scope/data-category/recipient/legal-basis scoped and has
 * non-binary statuses: active, withdrawn, expired, refused.  Methods exist
 * only to query and assert consent — no silent-granted default.
 */
import { Inject, Injectable } from "@nestjs/common";
import { DbConnection, DB_CONNECTION } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { withIsolation, atomicWrite } from "../identity/db-utils";
import { AuditService } from "../audit/audit.service";
import { DomainError } from "../../common/errors/domain.error";

export type ConsentStatus = "active" | "withdrawn" | "expired" | "refused";
export type LegalBasis =
  | "consent"
  | "contract"
  | "legal_obligation"
  | "vital_interest"
  | "public_task"
  | "legitimate_interest";

export interface ConsentInput {
  patient_id: string;
  purpose: string;
  scope?: string[];
  data_categories?: string[];
  recipient?: string;
  legal_basis?: LegalBasis;
  effective_from?: string;
  effective_until?: string;
  evidence?: Record<string, unknown>;
}

@Injectable()
export class ConsentService {
  constructor(
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly tenantCtx: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async grant(input: ConsentInput): Promise<{ consent_id: string }> {
    return atomicWrite(this.db, this.tenantCtx, this.audit, {
      resourceType: "consent",
      operation: "consent.grant",
      work: async (tx) => this.insert(tx, { ...input, status: "active" }),
    });
  }

  async withdraw(consentId: string): Promise<void> {
    return atomicWrite(this.db, this.tenantCtx, this.audit, {
      resourceType: "consent",
      resourceId: consentId,
      operation: "consent.withdraw",
      work: async (tx) => {
        await tx.query(
          `UPDATE health.consents SET status='withdrawn', updated_at=now()
            WHERE consent_id=$1 AND tenant_id=current_setting('app.tenant_id', true)::uuid`,
          [consentId],
        );
      },
    });
  }

  async refuse(input: ConsentInput): Promise<{ consent_id: string }> {
    return atomicWrite(this.db, this.tenantCtx, this.audit, {
      resourceType: "consent",
      operation: "consent.refuse",
      work: async (tx) => this.insert(tx, { ...input, status: "refused" }),
    });
  }

  /**
   * Assert that an active consent exists for the given purpose/data/recipient.
   * Fail-closed: returns false if no consent, or if withdrawn/refused/expired.
   * `legal_basis=legal_obligation|vital_interest|public_task` bypasses consent
   * requirement (these bases are lawful without consent under GDPR-style
   * frameworks) but still require an entry in the consent table so the
   * decision is audited.
   */
  async assert(
    patientId: string,
    purpose: string,
    dataCategory: string,
    recipient?: string,
  ): Promise<boolean> {
    return withIsolation(this.db, this.tenantCtx, "consent", async (tx) => {
      const rows = await tx.query<{
        status: ConsentStatus;
        legal_basis: LegalBasis;
        effective_until: Date | null;
        data_categories: string[];
      }>(
        `SELECT status, legal_basis, effective_until, data_categories
           FROM health.consents
          WHERE patient_id=$1 AND purpose=$2 AND tenant_id=current_setting('app.tenant_id', true)::uuid
            AND ($3::text IS NULL OR recipient=$3)
          ORDER BY created_at DESC LIMIT 1`,
        [patientId, purpose, recipient ?? null],
      );
      if (!rows.length) return false;
      const r = rows[0];
      if (r.effective_until && new Date(r.effective_until) < new Date())
        return false;
      if (r.status !== "active") return false;
      if (
        r.data_categories?.length &&
        !r.data_categories.includes(dataCategory)
      )
        return false;
      // Legal bases that bypass consent still must be explicitly recorded as 'active' with the matching legal_basis.
      return true;
    });
  }

  async requireConsent(
    patientId: string,
    purpose: string,
    dataCategory: string,
    recipient?: string,
  ): Promise<void> {
    const ok = await this.assert(patientId, purpose, dataCategory, recipient);
    if (!ok) {
      throw DomainError.forbidden(
        `No active consent for purpose=${purpose} data=${dataCategory} recipient=${recipient ?? "*"}`,
      );
    }
  }

  private async insert(
    tx: DbConnection,
    input: ConsentInput & { status: ConsentStatus },
  ): Promise<{ consent_id: string }> {
    const actor = this.tenantCtx.require();
    const rows = await tx.query<{ consent_id: string }>(
      `INSERT INTO health.consents
         (tenant_id, entity_code, country_code, patient_id, purpose, scope,
          data_categories, recipient, legal_basis, status, effective_from,
          effective_until, captured_by, evidence)
       VALUES (current_setting('app.tenant_id', true)::uuid,
               current_setting('app.entity_code', true),
               current_setting('app.country_code', true),
               $1,$2,$3::text[],$4::text[],$5,$6,$7,COALESCE($8,now()),$9,$10,$11::jsonb)
       RETURNING consent_id`,
      [
        input.patient_id,
        input.purpose,
        input.scope ?? [],
        input.data_categories ?? [],
        input.recipient ?? null,
        input.legal_basis ?? "consent",
        input.status,
        input.effective_from ?? null,
        input.effective_until ?? null,
        actor.userId,
        JSON.stringify(input.evidence ?? {}),
      ],
    );
    return rows[0];
  }
}
