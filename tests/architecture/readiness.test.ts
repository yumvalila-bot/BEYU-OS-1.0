/**
 * Phase 11 — production readiness matrix honesty.
 */
import { describe, expect, it } from "vitest";
import { productionReadinessMatrix, productionReadinessSummary } from "@/lib/architecture/readiness";

describe("production readiness cannot flatter itself", () => {
  it("lists every required capability", () => {
    const names = productionReadinessMatrix().map((r) => r.capability);
    for (const n of [
      "Identity",
      "Governance",
      "Authority",
      "Audit",
      "Events",
      "Lineage",
      "Workflow",
      "HCM",
      "Finance",
      "Treasury",
      "FX",
      "Capital",
      "Intercompany",
      "Reporting",
      "Forecasting",
      "Tax",
      "Legal",
      "Compliance",
      "Risk",
    ]) {
      expect(names).toContain(n);
    }
  });

  it("Finance / Capital / Tax / Authority are not production READY", () => {
    const m = productionReadinessMatrix();
    for (const cap of ["Finance", "Capital", "Tax", "Authority"]) {
      expect(m.find((r) => r.capability === cap)?.production).toBe("REQUIRES_AUTHORITY");
    }
  });

  it("Identity, HCM, Audit, Events, Lineage, Workflow can be READY", () => {
    const s = productionReadinessSummary();
    for (const cap of ["Identity", "HCM", "Audit", "Events", "Lineage", "Workflow"]) {
      expect(s.productionReady).toContain(cap);
    }
  });

  it("production is never READY while any dimension is not READY", () => {
    for (const r of productionReadinessMatrix()) {
      if (r.production === "READY") {
        expect(r.architecture).toBe("READY");
        expect(r.engineering).toBe("READY");
        expect(r.security).toBe("READY");
        expect(r.authority).toBe("READY");
      }
    }
  });

  it("the summary accounts for every row", () => {
    const s = productionReadinessSummary();
    const m = productionReadinessMatrix();
    expect(
      s.productionReady.length +
        s.requiresAuthority.length +
        s.dataNotAvailable.length +
        s.partial.length +
        s.blocked.length,
    ).toBe(s.total);
    expect(s.total).toBe(m.length);
  });
});
