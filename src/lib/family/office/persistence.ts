/**
 * BEYU OS — Family Office persistence contracts and migration abstraction.
 *
 * Database-READY, not database-ACTIVE.
 *
 * Two classes of persistence:
 *
 *   1. NEUTRAL MECHANISM TABLES — the policy/ratification registry itself.
 *      They store references, statuses, periods and ratified values; they
 *      encode no family policy. Their drizzle definitions exist in
 *      `src/db/schema/family-office.ts` (NOT exported from the schema
 *      barrel — hence not materialized, not queryable, inert). Materializing
 *      them (barrel export + drizzle-kit migration) is the first migration
 *      run, and only when the first ratification is registered.
 *
 *   2. POLICY-DEPENDENT DOMAIN TABLES — governance bodies, beneficiaries,
 *      trusts, capital/loan instructions, etc. Their persistence SEMANTICS
 *      require unresolved legal/policy decisions (FIR-001…027). For these we
 *      engineer the CONTRACT (typed record shapes) and the MIGRATION
 *      ABSTRACTION (the declared plan: which table materializes when, gated
 *      by which ratification) — and we do NOT activate the policy. No SQL,
 *      no table, no index exists for any of them.
 *
 * Invariants enforced here (and by tests):
 *   - no domain shape may carry financial-state fields (FIR-018);
 *   - a persistence record in an unratified state may not carry policy
 *     values (unratified values are never persisted);
 *   - the migration plan is deterministic.
 */

import { FINANCIAL_STATE_FORBIDDEN_KEYS, LOAN_TERMS_FORBIDDEN_KEYS } from "../phase3/contracts";
import { isFamilyErrorCode } from "../phase3/errors";
import { familyError } from "../phase3/errors";

export const OFFICE_PERSISTENCE_STATE = "NOT_MATERIALIZED" as const;

/** The neutral mechanism tables (definitions in db/schema/family-office.ts). */
export const OFFICE_NEUTRAL_TABLES = ["family_policy_definitions", "family_policy_versions", "family_policy_ratifications"] as const;
export type OfficeNeutralTable = (typeof OFFICE_NEUTRAL_TABLES)[number];

export interface DomainTableDesign {
  /** Intended table name (NOT created — design only). */
  table: string;
  domain: string;
  /** The FIRs whose ratification gates materialization of this table. */
  blockingFirs: readonly string[];
  /** Intended columns (names only; types live in the domain contract). */
  columns: readonly string[];
  materialized: false;
}

/**
 * The declared (unmaterialized) domain table plan. Every entry is gated on
 * at least one ratification; `materialized` is structurally `false`.
 */
export const OFFICE_DOMAIN_TABLE_DESIGN: readonly DomainTableDesign[] = [
  { table: "family_policy_decision_records", domain: "FAMILY_INSTITUTION", blockingFirs: ["FIR-027"], columns: ["id", "tenantId", "policyKey", "status", "decisionRef", "auditRef"], materialized: false },
  { table: "family_governance_bodies", domain: "FAMILY_GOVERNANCE", blockingFirs: ["FIR-008", "FIR-021"], columns: ["id", "tenantId", "bodyRef", "mandateRef", "jurisdictionRef", "status"], materialized: false },
  { table: "family_governance_memberships", domain: "FAMILY_GOVERNANCE", blockingFirs: ["FIR-008", "FIR-021"], columns: ["id", "bodyRef", "memberRef", "seatRef", "effectiveFrom", "effectiveTo"], materialized: false },
  { table: "family_beneficiary_records", domain: "FAMILY_INSTITUTION", blockingFirs: ["FIR-009", "FIR-010"], columns: ["id", "tenantId", "beneficiaryRef", "trustRef", "status", "statusBasisRef", "effectiveFrom", "effectiveTo"], materialized: false },
  { table: "family_trust_records", domain: "FAMILY_INSTITUTION", blockingFirs: ["FIR-015", "FIR-024"], columns: ["id", "tenantId", "trustRef", "instrumentRef", "jurisdictionRef", "status"], materialized: false },
  { table: "family_capital_instructions", domain: "FAMILY_CAPITAL", blockingFirs: ["FIR-012", "FIR-025", "FIR-016"], columns: ["id", "tenantId", "instructionId", "purpose", "requesterRef", "targetEntityRef", "familyStatus", "financeRef", "auditRef"], materialized: false },
  { table: "family_loan_instructions", domain: "FAMILY_LOAN", blockingFirs: ["FIR-013", "FIR-026", "FIR-016"], columns: ["id", "tenantId", "instructionId", "purpose", "borrowerRef", "lenderEntityRef", "familyStatus", "financeRef", "legalRef", "auditRef"], materialized: false },
  { table: "family_constitution_versions", domain: "FAMILY_GOVERNANCE", blockingFirs: ["FIR-006", "FIR-007", "FIR-022"], columns: ["id", "tenantId", "constitutionRef", "version", "status", "effectiveFrom", "effectiveTo", "supersededByRef"], materialized: false },
];

/**
 * Lint a domain table design or record shape: no financial-state fields.
 * FIR-018: a family table can never be a shadow ledger.
 */
export function assertNoFinancialFields(shape: Record<string, unknown>, label: string): void {
  const keys = new Set(Object.keys(shape).map((k) => k.toLowerCase()));
  const found = [...new Set([...FINANCIAL_STATE_FORBIDDEN_KEYS, ...LOAN_TERMS_FORBIDDEN_KEYS])]
    .map((k) => k.toLowerCase())
    .filter((k) => keys.has(k));
  if (found.length > 0) {
    throw familyError("FINANCE_BOUNDARY_VIOLATION", `${label} must not carry financial state (FIR-018). Forbidden fields: ${found.join(", ")}.`, ["FIR-018"], { fields: found });
  }
}

/**
 * Lint an unratified persistence record: it must not carry policy values.
 * A record whose status is UNRESOLVED/PROPOSED must have `policyValues`
 * null; a RATIFIED/ACTIVE record must have them present.
 */
export function assertNoUnratifiedValues(record: { status: string; policyValues: unknown }): void {
  const unratified = record.status === "UNRESOLVED" || record.status === "PROPOSED" || record.status === "DRAFT";
  if (unratified && record.policyValues !== null && record.policyValues !== undefined) {
    throw familyError(
      "POLICY_INVENTION_REFUSED",
      `A ${record.status} record must not persist policy values. Persisting a value before ratification is policy invention.`,
      [],
      { status: record.status },
    );
  }
  if (!unratified && (record.status === "RATIFIED" || record.status === "ACTIVE") && (record.policyValues === null || record.policyValues === undefined)) {
    throw new Error(`A ${record.status} record must persist its ratified policy values (they arrive with the ratification).`);
  }
}

export interface MigrationStep {
  order: number;
  table: string;
  gatedByFirs: readonly string[];
  description: string;
}

/**
 * The deterministic migration plan. A step executes only when EVERY gating
 * FIR is ratified; neutral mechanism tables gate on the first registered
 * ratification. Pure function — identical output for identical input.
 */
export function migrationPlan(ratifiedFirs: readonly string[]): readonly MigrationStep[] {
  const ratified = new Set(ratifiedFirs);
  const neutralGate = ratified.size > 0;
  const steps: MigrationStep[] = [];
  if (neutralGate) {
    steps.push(
      ...OFFICE_NEUTRAL_TABLES.map((table, i) => ({
        order: i + 1,
        table,
        gatedByFirs: [] as readonly string[],
        description: `Neutral mechanism table (policy/ratification registry). Gated only on the first registered ratification.`,
      })),
    );
  }
  let order = steps.length;
  for (const design of OFFICE_DOMAIN_TABLE_DESIGN) {
    const gateMet = design.blockingFirs.every((fir) => ratified.has(fir));
    if (gateMet) {
      order += 1;
      steps.push({ order, table: design.table, gatedByFirs: design.blockingFirs, description: `Domain table materialized; all gating FIRs ratified: ${design.blockingFirs.join(", ")}.` });
    }
  }
  return steps;
}

export function isMigrationStepExecutable(step: MigrationStep, ratifiedFirs: readonly string[]): boolean {
  const ratified = new Set(ratifiedFirs);
  if (step.gatedByFirs.length === 0) return ratified.size > 0;
  return step.gatedByFirs.every((fir) => ratified.has(fir));
}

export { isFamilyErrorCode };
