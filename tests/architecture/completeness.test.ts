/**
 * Phase 9 — enterprise completeness matrix honesty tests.
 *
 * The matrix must not flatter itself: a false criterion cannot be COMPLETE,
 * INFRA blockers cannot become COMPLETE by wish, and every Phase-9 domain is
 * listed rather than omitted.
 */
import { describe, expect, it } from "vitest";
import {
  ENTERPRISE_DOMAINS,
  architectureMatrix,
  architectureSummary,
  assessArchitectureDomain,
} from "@/lib/architecture/completeness";

describe("enterprise completeness cannot inflate itself", () => {
  it("a domain with a false criterion cannot be COMPLETE", () => {
    const d = ENTERPRISE_DOMAINS.find((x) => x.domain === "Identity")!;
    expect(
      assessArchitectureDomain({ ...d, evidence: { ...d.evidence, tests: false } }).status,
    ).toBe("PARTIAL");
  });

  it("an INFRA blocker cannot be COMPLETE", () => {
    const d = ENTERPRISE_DOMAINS.find((x) => x.domain === "CI/CD")!;
    expect(assessArchitectureDomain(d).status).toBe("REQUIRES_EXTERNAL_INFRASTRUCTURE");
  });

  it("a missing module with no evidence is MISSING or INFRA, never COMPLETE", () => {
    const d = ENTERPRISE_DOMAINS.find((x) => x.domain === "Deployment")!;
    expect(d.module).toBeNull();
    expect(["MISSING", "REQUIRES_EXTERNAL_INFRASTRUCTURE"]).toContain(
      assessArchitectureDomain(d).status,
    );
  });

  it("lists every Phase-9 enterprise concern", () => {
    const names = ENTERPRISE_DOMAINS.map((d) => d.domain);
    for (const required of [
      "Identity",
      "Security",
      "HCM",
      "Noelia / HIVE",
      "Event system",
      "Trace system",
      "CI/CD",
      "Observability",
      "Cross-sector integration",
      "Disaster recovery readiness",
      "Backup / recovery readiness",
    ]) {
      expect(names).toContain(required);
    }
  });

  it("the roll-up accounts for every row", () => {
    const s = architectureSummary();
    const sum = Object.values(s.byStatus).reduce((a, b) => a + b, 0);
    expect(sum).toBe(s.total);
    expect(s.total).toBe(architectureMatrix().length);
  });

  it("no COMPLETE row has a blocker or failed criterion", () => {
    for (const row of architectureMatrix()) {
      if (row.status === "COMPLETE") {
        expect(row.missingComponent).toBe("—");
        expect(row.action).toBe("LEAVE UNCHANGED");
      }
    }
  });

  it("does not claim CI is operational", () => {
    const ci = architectureMatrix().find((x) => x.domain === "CI/CD")!;
    expect(ci.status).toBe("REQUIRES_EXTERNAL_INFRASTRUCTURE");
    expect(ci.evidence.toLowerCase()).not.toMatch(/operational/);
  });

  it("Identity, Security, HCM and Noelia are COMPLETE", () => {
    const s = architectureSummary();
    expect(s.complete).toContain("Identity");
    expect(s.complete).toContain("Security");
    expect(s.complete).toContain("HCM");
    expect(s.complete).toContain("Noelia / HIVE");
  });
});
