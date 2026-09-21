import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { appointmentFixture, cleanupAppointments } from "../helpers/appointments";
import {
  analyzeBoardComposition,
  evaluateCandidateCompetencyFit,
} from "@/lib/governance/competency-service";
import type { MemberCompetencyEvidence } from "@/lib/governance/competency-contract";

describe("Governed Seats, Competency Matrix & Succession Analysis", () => {
  let f: Awaited<ReturnType<typeof appointmentFixture>>;

  beforeAll(async () => {
    f = await appointmentFixture("COMP_TEST");
  });

  afterAll(async () => {
    await cleanupAppointments("COMP_TEST");
  });

  it("analyzes board composition, domain coverage, and succession readiness", async () => {
    const analysis = await analyzeBoardComposition(f.chair, f.bodyId);

    expect(analysis.bodyId).toBe(f.bodyId);
    expect(analysis.totalSeats).toBeGreaterThan(0);
    expect(analysis.activeMembers).toBeGreaterThan(0);
    expect(analysis.domainCoverage.GOVERNANCE_LEADERSHIP).toBeGreaterThan(0);
    expect(analysis.successionReadiness.length).toBeGreaterThan(0);
    expect(analysis.compositionSatisfied).toBe(true);
  });

  it("evaluates candidate competency fit and provides training recommendations for gaps", () => {
    const candidateEvidence: MemberCompetencyEvidence[] = [
      {
        domain: "FINANCIAL_AUDIT",
        proficiencyLevel: "EXPERT",
        documentId: "DOC_CPA_CERT_2026",
        documentVersion: "1.0",
        verifiedOn: "2026-01-15",
        verifiedByUserId: "USR_TEST_CHAIR",
      },
      {
        domain: "RISK_INTERNAL_CONTROLS",
        proficiencyLevel: "PROFICIENT",
        documentId: "DOC_CRISC_CERT_2025",
        documentVersion: "1.0",
        verifiedOn: "2026-02-01",
        verifiedByUserId: "USR_TEST_CHAIR",
      },
    ];

    const fit = evaluateCandidateCompetencyFit(candidateEvidence, [
      "FINANCIAL_AUDIT",
      "RISK_INTERNAL_CONTROLS",
      "LEGAL_REGULATORY",
    ]);

    expect(fit.fitScore).toBe(0.67);
    expect(fit.matchedDomains).toEqual(["FINANCIAL_AUDIT", "RISK_INTERNAL_CONTROLS"]);
    expect(fit.missingDomains).toEqual(["LEGAL_REGULATORY"]);
    expect(fit.suitable).toBe(true);
    expect(fit.recommendedTraining).toHaveLength(1);
  });

  it("informs presiders without automatically appointing or granting permissions", async () => {
    const before = await analyzeBoardComposition(f.chair, f.bodyId);
    // Competency evaluation is nonmutating
    const fit = evaluateCandidateCompetencyFit([], ["GOVERNANCE_LEADERSHIP"]);
    expect(fit.suitable).toBe(false);
    const after = await analyzeBoardComposition(f.chair, f.bodyId);
    expect(after.activeMembers).toBe(before.activeMembers);
  });
});
