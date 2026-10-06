/**
 * BEYU OS — Compensation: one source of truth per money figure.
 *
 * This suite exists because of a specific question asked of the expansion: *does an existing canonical
 * table already own this data?* Contracted base pay is owned by the employee registry
 * (`employees.base_salary` / the employment relationship). The compensation entitlement register is a
 * governed PRESENTATION of that pay — it carries the approval chain, the payroll treatment and the
 * effective date — and it may therefore never be an unlinked second statement of the same money.
 *
 * It also pins the wider boundary rules of the register:
 *   · a base-compensation entitlement must cite the canonical employment record it mirrors;
 *   · awards, allowances and welfare are created by this engine and are a different kind of money;
 *   · an entitlement never becomes PAID without a final approval and a finance reference.
 *
 * Deterministic: no clock, no database, no randomness.
 */
import { describe, expect, it } from "vitest";
import {
  type EntitlementBase,
  type EntitlementKind,
  summariseCompensationCost,
  validateEntitlement,
} from "@/lib/compensation/entitlements";

const base = (overrides: Partial<EntitlementBase> = {}): EntitlementBase => ({
  id: "ENT_1",
  kind: "PERFORMANCE_BONUS",
  employeeId: "EMP_1",
  employeePrincipalId: "USR_1",
  employmentRelationshipId: "ER_1",
  legalEntityId: "ENT_BEYU",
  tenantId: "TEN_GROUP",
  countryCode: "TZ",
  currency: "TZS",
  amountMinor: 1_000_000,
  effectiveDate: "2026-01-01",
  eligibility: "Annual performance rating of 3 or above",
  reason: "FY2025 performance award per policy",
  policyRef: "POL_BONUS_2025",
  status: "DRAFT",
  financialTreatment: "PAYROLL",
  approvalChain: [],
  raisedBy: "USR_MANAGER",
  raisedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("base compensation mirrors the employee registry — it does not restate it", () => {
  it("raises a finding when a BASE_COMPENSATION entitlement cites no employment record", () => {
    const findings = validateEntitlement(
      base({ kind: "BASE_COMPENSATION" as EntitlementKind, employmentRelationshipId: null }),
    );
    expect(findings.join(" ")).toMatch(/second source of truth/i);
    expect(findings.join(" ")).toMatch(/employee registry/i);
  });

  it("accepts a BASE_COMPENSATION entitlement that cites the record it mirrors", () => {
    const findings = validateEntitlement(
      base({ kind: "BASE_COMPENSATION" as EntitlementKind, employmentRelationshipId: "ER_42" }),
    );
    expect(findings.filter((f) => /second source of truth/i.test(f))).toHaveLength(0);
  });

  it("does not apply the rule to money this engine genuinely creates", () => {
    for (const kind of ["PERFORMANCE_BONUS", "ALLOWANCE", "EMERGENCY_ASSISTANCE", "EMPLOYEE_CREDIT"] as const) {
      const findings = validateEntitlement(base({ kind, employmentRelationshipId: null }));
      expect(findings.join(" ")).not.toMatch(/second source of truth/i);
    }
  });
});

describe("the register cannot pay itself", () => {
  it("flags an entitlement that is APPROVED without a final approval stage", () => {
    const findings = validateEntitlement(base({ status: "APPROVED", approvalChain: [] }));
    expect(findings.join(" ")).toMatch(/FINAL_APPROVAL/i);
  });

  it("flags a PAID entitlement whose raiser cleared one of its own stages", () => {
    const findings = validateEntitlement(
      base({
        status: "PAID",
        approvalChain: [
          { stage: "FINAL_APPROVAL", actorPrincipalId: "USR_MANAGER", actedAt: "2026-01-02T00:00:00.000Z", note: "ok" },
        ],
      }),
    );
    expect(findings.join(" ")).toMatch(/segregation-of-duties breach/i);
  });

  it("throws on a structurally impossible entitlement rather than returning a finding", () => {
    expect(() => validateEntitlement(base({ amountMinor: -1 }))).toThrow();
    expect(() => validateEntitlement(base({ employeeId: "" }))).toThrow();
    expect(() => validateEntitlement(base({ effectiveDate: "01/01/2026" }))).toThrow();
    expect(() => validateEntitlement(base({ currency: "SHILLINGS" }))).toThrow();
  });
});

describe("cost summary counts only what has been approved and paid", () => {
  it("sums APPROVED and PAID entitlements and ignores the rest", () => {
    const rows: EntitlementBase[] = [
      base({ id: "E1", amountMinor: 1_000_000, status: "APPROVED" }),
      base({ id: "E2", amountMinor: 2_000_000, status: "PAID" }),
      base({ id: "E3", amountMinor: 9_000_000, status: "DRAFT" }),
      base({ id: "E4", amountMinor: 8_000_000, status: "REJECTED" }),
      base({ id: "E5", amountMinor: 7_000_000, status: "PENDING" }),
    ];
    const summary = summariseCompensationCost({ entitlements: rows });
    expect(summary.currency).toBe("TZS");
    expect(summary.costMinor).toBe(3_000_000);
    expect(summary.pending.map((p) => p.id)).toEqual(["E3", "E5"]);
    expect(summary.byKind.length).toBeGreaterThan(0);
    // A request is not a cost, and a refusal is not a saving.
    expect(summary.costMinor).not.toBe(27_000_000);
  });

  it("refuses to mix currencies in one cost figure", () => {
    const rows: EntitlementBase[] = [
      base({ id: "E1", currency: "TZS", status: "APPROVED" }),
      base({ id: "E2", currency: "USD", status: "APPROVED" }),
    ];
    expect(() => summariseCompensationCost({ entitlements: rows })).toThrow(/across currencies/i);
  });
});
