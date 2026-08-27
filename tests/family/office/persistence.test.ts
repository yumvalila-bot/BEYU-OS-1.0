/**
 * Family Office — persistence contract + migration abstraction tests.
 *
 * Requirement covered: R32 (NOT_MATERIALIZED; migrations gated on
 * ratified FIRs + first ratification; deterministic; no unratified
 * values persisted; no financial fields in family tables).
 */

import { describe, expect, it } from "vitest";
import {
  OFFICE_DOMAIN_TABLE_DESIGN,
  OFFICE_NEUTRAL_TABLES,
  OFFICE_PERSISTENCE_STATE,
  assertNoFinancialFields,
  assertNoUnratifiedValues,
  isMigrationStepExecutable,
  migrationPlan,
} from "../../../src/lib/family/office/persistence";
import { FamilyError } from "../../../src/lib/family/phase3/errors";

describe("R32 — the Family Office persistence layer is inert until ratification", () => {
  it("declares NOT_MATERIALIZED and zero materialized domain tables", () => {
    expect(OFFICE_PERSISTENCE_STATE).toBe("NOT_MATERIALIZED");
    expect(OFFICE_DOMAIN_TABLE_DESIGN.length).toBe(8);
    for (const design of OFFICE_DOMAIN_TABLE_DESIGN) {
      expect(design.materialized, design.table).toBe(false);
      expect(design.blockingFirs.length, design.table).toBeGreaterThan(0);
    }
  });

  it("the neutral mechanism tables are exactly the policy/ratification registry", () => {
    expect([...OFFICE_NEUTRAL_TABLES].sort()).toEqual(["family_policy_definitions", "family_policy_ratifications", "family_policy_versions"]);
  });

  it("with no ratified FIR, the migration plan is empty (nothing materializes)", () => {
    expect(migrationPlan([])).toEqual([]);
  });

  it("the first registered ratification opens the neutral tables (and only tables whose FIRs are all ratified)", () => {
    // The gate for the neutral tables is "first ratification exists",
    // modelled here as any ratified FIR reference.
    const plan = migrationPlan(["FIR-027"]);
    const tables = plan.map((s) => s.table);
    for (const t of OFFICE_NEUTRAL_TABLES) expect(tables).toContain(t);
    // FIR-027 is the sole gate for the policy-decision-records table → it
    // materializes exactly when FIR-027 is ratified.
    expect(tables).toContain("family_policy_decision_records");
    // Family governance tables stay gated (FIR-008/FIR-021 not ratified).
    expect(tables).not.toContain("family_governance_bodies");
    expect(tables).not.toContain("family_governance_memberships");
    expect(tables).not.toContain("family_beneficiary_records");
  });

  it("domain tables materialize only when EVERY blocking FIR is ratified", () => {
    const governancePlan = migrationPlan(["FIR-008", "FIR-021"]);
    expect(governancePlan.map((s) => s.table)).toContain("family_governance_bodies");
    expect(governancePlan.map((s) => s.table)).toContain("family_governance_memberships");
    // One of the two missing:
    const partial = migrationPlan(["FIR-008"]);
    expect(partial.map((s) => s.table)).not.toContain("family_governance_bodies");
    // All gating FIRs: every table, in a deterministic order.
    const allFirs = [...new Set(OFFICE_DOMAIN_TABLE_DESIGN.flatMap((d) => d.blockingFirs))];
    const full = migrationPlan(allFirs);
    expect(full.length).toBe(3 + OFFICE_DOMAIN_TABLE_DESIGN.length);
    const orders = full.map((s) => s.order);
    expect(orders).toEqual(orders.slice().sort((a, b) => a - b));
  });

  it("the plan is deterministic: identical input → identical output", () => {
    const a = JSON.stringify(migrationPlan(["FIR-008", "FIR-021", "FIR-027"]));
    const b = JSON.stringify(migrationPlan(["FIR-027", "FIR-008", "FIR-021"]));
    expect(a).toBe(b);
  });

  it("isMigrationStepExecutable enforces the gate per step", () => {
    const plan = migrationPlan(["FIR-008", "FIR-021", "FIR-027"]);
    const neutral = plan.find((s) => s.table === "family_policy_versions")!;
    expect(isMigrationStepExecutable(neutral, ["FIR-027"])).toBe(true);
    expect(isMigrationStepExecutable(neutral, [])).toBe(false);
    const gov = plan.find((s) => s.table === "family_governance_bodies")!;
    expect(isMigrationStepExecutable(gov, ["FIR-008", "FIR-021"])).toBe(true);
    expect(isMigrationStepExecutable(gov, ["FIR-008"])).toBe(false);
  });

  it("a family table design can never carry financial-state fields (FIR-018)", () => {
    expect(() => assertNoFinancialFields({ id: "x", tenantId: "T", balance: 1 }, "family table design")).toThrowError(FamilyError);
    expect(() => assertNoFinancialFields({ id: "x", tenantId: "T", ledgerRef: "L" }, "family table design")).toThrowError();
    expect(() => assertNoFinancialFields({ id: "x", tenantId: "T", status: "ACTIVE" }, "family table design")).not.toThrow();
  });

  it("an unratified record may not persist policy values (policy invention)", () => {
    expect(() => assertNoUnratifiedValues({ status: "UNRESOLVED", policyValues: { quorum: 3 } })).toThrowError(FamilyError);
    expect(() => assertNoUnratifiedValues({ status: "PROPOSED", policyValues: { quorum: 3 } })).toThrowError();
    expect(() => assertNoUnratifiedValues({ status: "UNRESOLVED", policyValues: null })).not.toThrow();
    // A ratified record must persist its ratified values.
    expect(() => assertNoUnratifiedValues({ status: "RATIFIED", policyValues: null })).toThrowError();
    expect(() => assertNoUnratifiedValues({ status: "RATIFIED", policyValues: { quorum: 3 } })).not.toThrow();
  });
});
