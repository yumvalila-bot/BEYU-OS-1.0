/**
 * MTUHA reporting engine (deterministic aggregates, no invented codes).
 *
 * The engine reads canonical Health OS data (patients, encounters, pharmacy,
 * lab, imaging, etc.) and produces deterministic period aggregates per
 * facility/tenant/entity/country. It never emits official national codes; if
 * the authoritative mapping table is unavailable, mapping_status = incomplete
 * and submission is BLOCKED.
 */

import { AuditService } from "../audit/audit.service";
import { TenantContext } from "../../common/security/tenant-context";
import { DomainError } from "../../common/errors/domain.error";
import { inTx } from "../../common/db/crud-factory";

export type MtuhaDomain =
  | "opd"
  | "ipd"
  | "laboratory"
  | "imaging"
  | "pharmacy"
  | "ambulance"
  | "public_health"
  | "mortality"
  | "maternal_perinatal"
  | "disease_surveillance";

export interface MtuhaPeriod {
  startInclusive: string; // ISO date
  endExclusive: string; // ISO date
}

export interface MtuhaAggregate {
  domain: MtuhaDomain;
  metric: string;
  value: number | Record<string, number>;
  /** Record IDs contributing to this aggregate (for audit). */
  sourceRecordIds: string[];
}

export interface MtuhaReport {
  reportId: string;
  facilityId: string | null;
  tenantId: string;
  entityCode: string | null;
  countryCode: string;
  period: MtuhaPeriod;
  generatedAt: string;
  aggregates: MtuhaAggregate[];
  mappingVersion: string | null;
  mappingStatus: "complete" | "incomplete";
  missingMappings: string[];
  submissionStatus: "DRAFT" | "READY" | "BLOCKED" | "SUBMITTED" | "FAILED";
  submissionBlockedReason?: string;
  auditRecordId: string | null;
}

export class MtuhaMappingRegistry {
  private mappings: Record<
    MtuhaDomain,
    Array<{
      internalMetric: string;
      nationalCode: string | null;
      description: string;
    }>
  > = {
    opd: [],
    ipd: [],
    laboratory: [],
    imaging: [],
    pharmacy: [],
    ambulance: [],
    public_health: [],
    mortality: [],
    maternal_perinatal: [],
    disease_surveillance: [],
  };

  registerMapping(
    domain: MtuhaDomain,
    internalMetric: string,
    nationalCode: string | null,
    description: string,
  ): void {
    this.mappings[domain].push({ internalMetric, nationalCode, description });
  }

  /** Returns codes mapped for a metric or null if the mapping is missing. */
  codeFor(domain: MtuhaDomain, internalMetric: string): string | null {
    return (
      this.mappings[domain].find((m) => m.internalMetric === internalMetric)
        ?.nationalCode ?? null
    );
  }

  missing(): Array<{ domain: MtuhaDomain; internalMetric: string }> {
    const out: Array<{ domain: MtuhaDomain; internalMetric: string }> = [];
    for (const d of Object.keys(this.mappings) as MtuhaDomain[]) {
      for (const m of this.mappings[d]) {
        if (!m.nationalCode)
          out.push({ domain: d, internalMetric: m.internalMetric });
      }
    }
    return out;
  }
}

/**
 * Build an MTUHA DRAFT report with deterministic aggregates sourced from Health tables.
 * If no mappings exist (the default), submission_status = BLOCKED with no invented codes.
 *
 * NOTE: This is a skeletal aggregation over available tables; extending per-domain
 * aggregates (OPD by age/sex, disease surveillance by ICD-10 bucket, etc.) is
 * a domain-data task but this engine enforces the code-invention prohibition
 * and audit envelope.
 */
export async function buildMtuhaReport(
  db: any,
  tenantId: string,
  entityCode: string | null,
  countryCode: string,
  facilityId: string | null,
  period: MtuhaPeriod,
  mappings: MtuhaMappingRegistry,
  actorGlobalUserId: string,
  audit: AuditService,
  tenantCtx: TenantContext,
): Promise<MtuhaReport> {
  // The audit ledger derives its actor from the ambient actor context — the
  // authenticated identity — not from this function's arguments. The caller
  // nonetheless names an actor explicitly, so if the two disagree we refuse
  // rather than quietly recording somebody else's action under the wrong
  // GlobalUserID.
  const ambient = tenantCtx.current();
  const ambientActorId = ambient?.globalUserId ?? ambient?.userId ?? null;
  if (
    ambientActorId &&
    actorGlobalUserId &&
    ambientActorId !== actorGlobalUserId
  ) {
    throw DomainError.unauthorized(
      `MTUHA actor mismatch: caller supplied ${actorGlobalUserId} but the ` +
        `authenticated actor is ${ambientActorId}`,
    );
  }
  const aggregates: MtuhaAggregate[] = [];

  // OPD: encounter count (no disease coding claimed; national code must come from mappings).
  try {
    const enc = await db.query(
      `SELECT count(*)::int AS n FROM health.encounters
        WHERE tenant_id=$1::uuid
          AND started_at >= $2 AND started_at < $3`,
      [tenantId, period.startInclusive, period.endExclusive],
    );
    aggregates.push({
      domain: "opd",
      metric: "opd_encounters_total",
      value: Number(enc[0]?.n ?? 0),
      sourceRecordIds: [], // detailed record IDs could be fetched for audit; aggregate count sufficient
    });
  } catch {
    aggregates.push({
      domain: "opd",
      metric: "opd_encounters_total",
      value: 0,
      sourceRecordIds: [],
    });
  }

  // Pharmacy dispenses.
  try {
    const ph = await db.query(
      `SELECT count(*)::int AS n FROM health.dispenses
        WHERE tenant_id=$1::uuid AND dispensed_at >= $2 AND dispensed_at < $3`,
      [tenantId, period.startInclusive, period.endExclusive],
    );
    aggregates.push({
      domain: "pharmacy",
      metric: "pharmacy_dispenses_total",
      value: Number(ph[0]?.n ?? 0),
      sourceRecordIds: [],
    });
  } catch {
    aggregates.push({
      domain: "pharmacy",
      metric: "pharmacy_dispenses_total",
      value: 0,
      sourceRecordIds: [],
    });
  }

  const missing = mappings.missing();
  const totalRegistrations = Object.values((mappings as any).mappings).reduce(
    (acc: number, arr: any) => acc + ((arr as any[])?.length ?? 0),
    0,
  );
  const mappingStatus: "complete" | "incomplete" =
    totalRegistrations > 0 && missing.length === 0 ? "complete" : "incomplete";
  // If no metrics are registered at all, treat as INCOMPLETE (engine cannot emit codes).
  const submissionStatus: MtuhaReport["submissionStatus"] =
    mappingStatus === "complete" ? "READY" : "BLOCKED";

  // Persist the audit record for this run through the canonical ledger.
  //
  // This used to be raw SQL naming `actor_type`, `actor_id`, `action` and
  // `RETURNING id`. None of `actor_type`, `actor_id` or `action` exists on
  // health.audit_log — its actor column is `actor_global_user_id`, its action
  // column is `operation`, and its key is `audit_id`, not `id`. The INSERT
  // therefore always failed and the empty catch discarded it, so
  // auditRecordId was permanently null and every MTUHA run was unaudited.
  //
  // The mapping applied here is exact rather than invented: `actor_type` was
  // the literal 'user' and `actor_id` was actorGlobalUserId, i.e. a
  // GlobalUserID, which is precisely what actor_global_user_id holds.
  //
  // The failure is deliberately NOT swallowed. The canonical MTUHA path
  // (ReportingService.generatePeriodReport) records its audit inside
  // withIsolation and lets a failure abort the report, and this function
  // performs no external side effect that throwing afterwards could not undo.
  // A report whose compliance-evidence reference is silently null is worse
  // than no report at all.
  const auditRecordId = await inTx(db, tenantCtx, (tx) =>
    audit.record(tx, {
      operation: "mtuha.report.generate",
      resourceType: "mtuha_report",
      resourceId: `${period.startInclusive}:${period.endExclusive}`,
      metadata: { period, mappingStatus, submissionStatus, facilityId },
      sourceService: "health-api",
    }),
  );

  return {
    reportId: `mtuha-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    facilityId,
    tenantId,
    entityCode,
    countryCode,
    period,
    generatedAt: new Date().toISOString(),
    aggregates,
    mappingVersion: null,
    mappingStatus,
    missingMappings: missing.map((m) => `${m.domain}:${m.internalMetric}`),
    submissionStatus,
    submissionBlockedReason:
      mappingStatus === "incomplete" ? "MTUHA_MAPPINGS_INCOMPLETE" : undefined,
    auditRecordId,
  };
}
