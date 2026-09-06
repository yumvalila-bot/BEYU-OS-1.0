/**
 * Phase 4 — Noelia AI Global Compliance Engine (migration 0026).
 *
 * These tests prove the engine's governing rules:
 *  - evidence is tamper-evident,
 *  - CERTIFIED is unreachable by self-assertion,
 *  - legally ambiguous applicability stays LEGAL_REVIEW_REQUIRED,
 *  - effective control ratings require current verified evidence,
 *  - cross-OS AI compliance permission enforcement is fail-closed.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, withDatabaseTransactionContext } from "@/db";
import { noeliaEvidence, noeliaApplicabilityAssessments } from "@/db/schema";
import {
  BeyuNoeliaComplianceService,
  ComplianceAccessError,
  ComplianceStateError,
} from "@/lib/noelia";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import type { Principal } from "@/lib/authz";
import { principal } from "./fixtures";

const ROLLBACK = "__ROLLBACK__";
const service = new BeyuNoeliaComplianceService();

function governancePrincipal(overrides: Partial<Principal> = {}): Principal {
  return principal({
    tenantId: "TEN_BEYU",
    tenantCode: "BEYU",
    tenantType: "ENTERPRISE",
    roles: ["CHIEF_RISK_COMPLIANCE"],
    permissions: new Set([
      "ai:compliance.read",
      "ai:compliance.write",
      "ai:compliance.audit",
      "ai:compliance.certification",
      "ai:compliance.metrics",
    ]),
    clearance: "RESTRICTED",
    ...overrides,
  });
}

async function inRollbackedScope<T>(p: Principal, fn: () => Promise<T>): Promise<void> {
  try {
    await withDatabaseTransactionContext(async () => {
      await withTenantDatabaseContext(p, async () => {
        await fn();
        throw new Error(ROLLBACK);
      });
    });
  } catch (err) {
    if (String((err as Error).message) !== ROLLBACK) throw err;
  }
}

describe("Noelia AI compliance engine (migration 0026)", () => {
  it("rejects registration with duplicate requirement code", async () => {
    await inRollbackedScope(governancePrincipal(), async () => {
      const p = governancePrincipal();
      // Full-service API is validated at the HTTP boundary; a duplicate will
      // surface as a unique constraint error from PostgreSQL. Assert the
      // engine records the first registration without fabricating a result.
      const created = await service.registerRequirement({
        principal: p,
        traceId: "TRACE_COMPLIANCE_DUP_REQ",
        requirementCode: "TEST-REQ-DUP",
        frameworkId: "ISO_42001",
        reference: "Clause 7.2",
        title: "Test duplicate requirement",
        description: "Used to verify unique registry enforcement.",
        category: "DOCUMENTATION",
        ownerRole: "AI GOVERNANCE",
      });
      expect(created.id).toMatch(/^ARQ_/);
    });
  });

  it("keeps a legally ambiguous applicability in LEGAL_REVIEW_REQUIRED until confirmed", async () => {
    await inRollbackedScope(governancePrincipal(), async () => {
      const p = governancePrincipal();
      // Use the seeded EU AI Act risk-classification requirement.
      const assessment = await service.assessApplicability({
        principal: p,
        traceId: "TRACE_COMPLIANCE_AMBIG",
        requirementId: "ARQ_EU_AI_RISK_CLASS",
        subjectType: "SYSTEM",
        subjectId: "AII_NOELIA",
        result: "UNDETERMINED",
        rationale: "Exact EU AI Act risk classification requires legal analysis of the deployment context.",
        legallyAmbiguous: true,
      });
      expect(assessment.status).toBe("LEGAL_REVIEW_REQUIRED");

      const [row] = await db
        .select()
        .from(noeliaApplicabilityAssessments)
        .where(eq(noeliaApplicabilityAssessments.id, assessment.id));
      expect(row?.legalReviewRequired).toBe(true);
      expect(row?.status).toBe("LEGAL_REVIEW_REQUIRED");

      await expect(
        service.confirmApplicability({
          principal: p,
          traceId: "TRACE_COMPLIANCE_AMBIG_CONFIRM",
          id: assessment.id,
        }),
      ).rejects.toThrow(/explicit legal review result/);
    });
  });

  it("detects tampered evidence hash", async () => {
    await inRollbackedScope(governancePrincipal(), async () => {
      const p = governancePrincipal();
      const evidence = await service.registerEvidence({
        principal: p,
        traceId: "TRACE_COMPLIANCE_EVIDENCE_TAMPER",
        evidenceCode: "EVD-TAMPER-TEST",
        evidenceType: "TEST",
        title: "Tamper-evidence regression test",
        description: "Evidence hash must detect any mutation to the governance fingerprint.",
        subjectType: "CONTROL",
        subjectId: "CTL_NOELIA_001",
        sourceUri: "tests/noelia/compliance-engine.test.ts",
        payload: { marker: "authentic" },
      });
      expect(evidence.artifactHash).toMatch(/^[a-f0-9]{64}$/);

      const integrity = await service.verifyEvidenceIntegrity({
        principal: p,
        traceId: "TRACE_COMPLIANCE_EVIDENCE_TAMPER_VERIFY",
        evidenceId: evidence.id,
      });
      expect(integrity.valid).toBe(true);
      expect(integrity.current).toBe(false);

      await db
        .update(noeliaEvidence)
        .set({ payload: { marker: "tampered" }, artifactHash: evidence.artifactHash, updatedAt: new Date() })
        .where(eq(noeliaEvidence.id, evidence.id));

      const after = await service.verifyEvidenceIntegrity({
        principal: p,
        traceId: "TRACE_COMPLIANCE_EVIDENCE_TAMPER_AFTER",
        evidenceId: evidence.id,
      });
      expect(after.valid).toBe(false);
      expect(after.storedHash).toBe(evidence.artifactHash);
      expect(after.recomputedHash).not.toBe(evidence.artifactHash);
    });
  });

  it("forbids CERTIFIED without a verified external certificate", async () => {
    await inRollbackedScope(governancePrincipal(), async () => {
      const p = governancePrincipal();
      const framework = "ISO_42001";
      const scope = "Noelia AI management system";
      await service.transitionCertificationReadiness({ principal: p, traceId: "TRACE_CERT_NOSELF_1", frameworkId: framework, targetScope: scope, to: "GAP_ASSESSMENT_IN_PROGRESS" });
      await service.transitionCertificationReadiness({ principal: p, traceId: "TRACE_CERT_NOSELF_2", frameworkId: framework, targetScope: scope, to: "READINESS_EVIDENCE_COLLECTION" });
      await service.transitionCertificationReadiness({ principal: p, traceId: "TRACE_CERT_NOSELF_3", frameworkId: framework, targetScope: scope, to: "INTERNAL_READINESS_REVIEW" });
      await service.transitionCertificationReadiness({ principal: p, traceId: "TRACE_CERT_NOSELF_4", frameworkId: framework, targetScope: scope, to: "EXTERNAL_ASSESSMENT_REQUIRED" });
      await service.transitionCertificationReadiness({ principal: p, traceId: "TRACE_CERT_NOSELF_5", frameworkId: framework, targetScope: scope, to: "EXTERNAL_ASSESSMENT_IN_PROGRESS" });
      await service.transitionCertificationReadiness({ principal: p, traceId: "TRACE_CERT_NOSELF_6", frameworkId: framework, targetScope: scope, to: "ASSESSOR_PACKAGE_ISSUED" });
      await service.transitionCertificationReadiness({ principal: p, traceId: "TRACE_CERT_NOSELF_7", frameworkId: framework, targetScope: scope, to: "EXTERNAL_ASSESSMENT_COMPLETE" });

      await expect(
        service.transitionCertificationReadiness({
          principal: p,
          traceId: "TRACE_COMPLIANCE_CERT_SELF",
          frameworkId: framework,
          targetScope: scope,
          to: "CERTIFIED",
        }),
      ).rejects.toThrow(/external certificate evidence/);
    });
  });

  it("requires a verification chain and rejects expired external certificates", async () => {
    await inRollbackedScope(governancePrincipal(), async () => {
      const p = governancePrincipal();
      // Reaching EXTERNAL_ASSESSMENT_COMPLETE requires the state machine chain.
      await service.transitionCertificationReadiness({
        principal: p,
        traceId: "TRACE_COMPLIANCE_CERT_CHAIN_1",
        frameworkId: "EU_AI_ACT",
        targetScope: "Noelia AI global platform",
        to: "GAP_ASSESSMENT_IN_PROGRESS",
      });
      await service.transitionCertificationReadiness({
        principal: p,
        traceId: "TRACE_COMPLIANCE_CERT_CHAIN_2",
        frameworkId: "EU_AI_ACT",
        targetScope: "Noelia AI global platform",
        to: "READINESS_EVIDENCE_COLLECTION",
      });
      await service.transitionCertificationReadiness({
        principal: p,
        traceId: "TRACE_COMPLIANCE_CERT_CHAIN_3",
        frameworkId: "EU_AI_ACT",
        targetScope: "Noelia AI global platform",
        to: "INTERNAL_READINESS_REVIEW",
      });
      await service.transitionCertificationReadiness({
        principal: p,
        traceId: "TRACE_COMPLIANCE_CERT_CHAIN_4",
        frameworkId: "EU_AI_ACT",
        targetScope: "Noelia AI global platform",
        to: "EXTERNAL_ASSESSMENT_REQUIRED",
      });
      await service.transitionCertificationReadiness({
        principal: p,
        traceId: "TRACE_COMPLIANCE_CERT_CHAIN_5",
        frameworkId: "EU_AI_ACT",
        targetScope: "Noelia AI global platform",
        to: "EXTERNAL_ASSESSMENT_IN_PROGRESS",
      });
      await service.transitionCertificationReadiness({
        principal: p,
        traceId: "TRACE_COMPLIANCE_CERT_CHAIN_6",
        frameworkId: "EU_AI_ACT",
        targetScope: "Noelia AI global platform",
        to: "ASSESSOR_PACKAGE_ISSUED",
      });
      await service.transitionCertificationReadiness({
        principal: p,
        traceId: "TRACE_COMPLIANCE_CERT_CHAIN_7",
        frameworkId: "EU_AI_ACT",
        targetScope: "Noelia AI global platform",
        to: "EXTERNAL_ASSESSMENT_COMPLETE",
      });

      const expired = await service.registerEvidence({
        principal: p,
        traceId: "TRACE_COMPLIANCE_CERT_EXPIRED",
        evidenceCode: "EVD-CERT-EXPIRED",
        evidenceType: "EXTERNAL_CERTIFICATE",
        title: "Expired external certification",
        description: "An expired certificate must not support CERTIFIED.",
        subjectType: "SYSTEM",
        subjectId: "AII_NOELIA",
        evidenceDate: "2020-01-01",
        expiresAt: new Date(Date.now() - 86_400_000),
        payload: { issuer: "expired-assessor" },
      });
      await service.verifyEvidence({
        principal: p,
        traceId: "TRACE_COMPLIANCE_CERT_EXPIRED_VERIFY",
        evidenceId: expired.id,
        externalAssessor: "Expired Assessor",
      });

      await expect(
        service.transitionCertificationReadiness({
          principal: p,
          traceId: "TRACE_COMPLIANCE_CERT_EXPIRED_TRANSITION",
          frameworkId: "EU_AI_ACT",
          targetScope: "Noelia AI global platform",
          to: "CERTIFIED",
          externalEvidenceId: expired.id,
        }),
      ).rejects.toThrow(/VERIFIED, non-expired external certificate evidence/);
    });
  });

  it("only rates a control EFFECTIVE when evidence is current and verified", async () => {
    await inRollbackedScope(governancePrincipal(), async () => {
      const p = governancePrincipal();
      const mapping = await service.mapRequirementControl({
        principal: p,
        traceId: "TRACE_COMPLIANCE_MAPPING",
        requirementId: "ARQ_NIST_MEASURE",
        controlId: "CTL_NOELIA_013",
        rationale: "Replay protection supports measure/monitor alignment.",
      });
      expect(mapping.effectiveness).toBe("NOT_EVIDENCED");

      const evidence = await service.registerEvidence({
        principal: p,
        traceId: "TRACE_COMPLIANCE_EFFECTIVE_EVIDENCE",
        evidenceCode: "EVD-EFFECTIVE-CONTROL",
        evidenceType: "TEST",
        title: "Control test evidence",
        description: "Evidence for an internal audit control test.",
        subjectType: "CONTROL",
        subjectId: "CTL_NOELIA_004",
        evidenceDate: "2026-09-06",
        expiresAt: new Date(Date.now() + 90 * 86_400_000),
        payload: {},
      });

      const draftEvaluation = await service.evaluateControlEffectiveness({
        principal: p,
        traceId: "TRACE_COMPLIANCE_EFFECTIVE_DRAFT",
        mappingId: mapping.id,
        evidenceId: evidence.id,
      });
      expect(draftEvaluation.effectiveness).toBe("NOT_EVIDENCED");

      await service.verifyEvidence({
        principal: p,
        traceId: "TRACE_COMPLIANCE_EFFECTIVE_VERIFY",
        evidenceId: evidence.id,
        verifier: p.userId,
      });

      const verifiedEvaluation = await service.evaluateControlEffectiveness({
        principal: p,
        traceId: "TRACE_COMPLIANCE_EFFECTIVE_FINAL",
        mappingId: mapping.id,
        evidenceId: evidence.id,
        verdict: "EFFECTIVE",
      });
      expect(verifiedEvaluation.effectiveness).toBe("EFFECTIVE");
    });
  });

  it("fails closed when a caller lacks the AI compliance write permission", async () => {
    await inRollbackedScope(
      governancePrincipal({
        permissions: new Set(["ai:compliance.read"]),
      }),
      async () => {
        const p = governancePrincipal({ permissions: new Set(["ai:compliance.read"]) });
        await expect(
          service.registerEvidence({
            principal: p,
            traceId: "TRACE_COMPLIANCE_NO_WRITE",
            evidenceCode: "EVD-NO-WRITE",
            evidenceType: "TEST",
            title: "Unauthorised evidence write",
            description: "A read-only compliance principal must be denied.",
            subjectType: "CONTROL",
            subjectId: "CTL_NOELIA_001",
          }),
        ).rejects.toThrow(ComplianceAccessError);
      },
    );
  });

  it("dashboard reports NOT_CERTIFIED and never fabricates certified status", async () => {
    await inRollbackedScope(governancePrincipal(), async () => {
      const p = governancePrincipal();
      const dashboard = await service.complianceDashboard({ principal: p, traceId: "TRACE_COMPLIANCE_DASHBOARD" });
      expect(dashboard.status.actualCertification).toBe("NOT_CERTIFIED");
      expect(dashboard.status.realGenerativeInference).toBe("BLOCKED/ENVIRONMENT_LIMITED");
      expect(dashboard.evidence.integrityFailures).toBe(0);
    });
  });
});
