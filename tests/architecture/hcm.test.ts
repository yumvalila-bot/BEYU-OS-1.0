/**
 * Phase 12 — HCM completeness matrix honesty.
 *
 * The matrix is derived from live evidence. It must not call HCM COMPLETE
 * because a table exists, and must not call it incomplete because payroll
 * or an ATS is absent.
 */
import { describe, expect, it } from "vitest";
import { hcmCompletenessMatrix, hcmCompletenessSummary, hcmEvidence } from "@/lib/architecture/hcm";

describe("HCM completeness matrix", () => {
  it("lists every required capability", () => {
    const names = hcmCompletenessMatrix().map((r) => r.capability);
    for (const n of [
      "GlobalUserID integration",
      "Employee master",
      "Employment lifecycle",
      "Organization structure",
      "Position management",
      "Job architecture",
      "Manager hierarchy",
      "Workforce data governance",
      "Tenant isolation",
      "Entity isolation",
      "RBAC",
      "ABAC",
      "Compensation boundary",
      "Audit",
      "Events",
      "Temporal history",
      "Sector-OS consumption",
      "Reporting",
      "Data integrity",
      "API layer",
    ]) {
      expect(names).toContain(n);
    }
  });

  it("uses only the Phase-12 status vocabulary", () => {
    for (const r of hcmCompletenessMatrix()) {
      expect(["COMPLETE", "PARTIAL", "REQUIRES_AUTHORITY", "DATA_NOT_AVAILABLE", "NOT_AVAILABLE"]).toContain(
        r.status,
      );
    }
  });

  it("cannot flatter a second employee master or a journal writer", () => {
    const e = hcmEvidence();
    expect(e.employeeTables).toEqual(["src/db/schema/people.ts"]);
    expect(e.employeeInserts).toEqual([]);
    expect(e.journalFromHcm).toBe(false);
    expect(e.consumptionApi).toBe(true);
    expect(e.identityGraph).toBe(true);
    expect(e.entityScopeOnRead).toBe(true);
    expect(e.unknownClearanceClosed).toBe(true);
    expect(e.uiUsesService).toBe(true);
    expect(e.noeliaUsesService).toBe(true);
  });

  it("lifecycle writes are REQUIRES_AUTHORITY, not COMPLETE", () => {
    const row = hcmCompletenessMatrix().find((r) => r.capability === "Employment lifecycle")!;
    expect(row.status).toBe("REQUIRES_AUTHORITY");
    expect(row.status).not.toBe("COMPLETE");
  });

  it("kernel identity / master / isolation / compensation can be COMPLETE", () => {
    const s = hcmCompletenessSummary();
    for (const n of [
      "GlobalUserID integration",
      "Employee master",
      "Workforce data governance",
      "Tenant isolation",
      "Entity isolation",
      "RBAC",
      "ABAC",
      "Compensation boundary",
      "API layer",
    ]) {
      expect(s.complete).toContain(n);
    }
  });

  it("the summary accounts for every row", () => {
    const s = hcmCompletenessSummary();
    const m = hcmCompletenessMatrix();
    expect(
      s.complete.length +
        s.partial.length +
        s.requiresAuthority.length +
        s.dataNotAvailable.length +
        s.notAvailable.length,
    ).toBe(s.total);
    expect(s.total).toBe(m.length);
  });

  it("does not invent payroll or a Sector OS as missing kernel work", () => {
    const names = hcmCompletenessMatrix().map((r) => r.capability);
    expect(names).not.toContain("Payroll");
    expect(names).not.toContain("Recruitment ATS");
    expect(hcmCompletenessMatrix().find((r) => r.capability === "Compensation boundary")?.status).toBe("COMPLETE");
  });
});
