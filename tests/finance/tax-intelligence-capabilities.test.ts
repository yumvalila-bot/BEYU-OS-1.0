import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  authenticateTaxLegalSource,
  evaluateTaxOperationGate,
  prepareTaxComputation,
  selectEffectiveTaxAuthorities,
  validateCustomsAssessmentRequest,
  validateNoeliaTaxCitations,
  validateTaxAuditEvidence,
  validateTaxComplianceObligation,
  type TaxCapabilityActivation,
  type TaxLegalAuthorityRecord,
  type TaxSpecialistApproval,
} from "@/lib/finance/tax-intelligence-capabilities";

const OFFICIAL_HOSTS = ["oagmis.oag.go.tz"];
const validSource = (overrides: Partial<TaxLegalAuthorityRecord> = {}): TaxLegalAuthorityRecord => ({
  sourceCode: "TZ_ACT_TEST_2026",
  title: "Test Finance Act",
  jurisdictionCode: "TZ",
  instrumentKind: "FINANCE_ACT",
  sourceUri: "https://oagmis.oag.go.tz/portal/legislation/test",
  originalDocumentId: "DOC_TAX_ACT_2026",
  sourceSha256: "a".repeat(64),
  sourceAuthorityStatus: "AUTHORITATIVE",
  publishedOn: "2026-06-30",
  commencedOn: "2026-07-01",
  effectiveFrom: "2026-07-01",
  effectiveTo: null,
  officialSourceHost: "oagmis.oag.go.tz",
  textValidatedAt: "2026-07-02",
  textValidatedBy: "reviewer-1",
  specialistReviewedAt: "2026-07-03",
  specialistReviewerId: "tax-specialist-1",
  enablingProvision: null,
  amendsSourceCodes: [],
  repealsSourceCodes: [],
  supersedesSourceCodes: [],
  provisionReferences: ["section 25"],
  ...overrides,
});

const activation = (status: TaxCapabilityActivation["status"] = "ACTIVE"): TaxCapabilityActivation => ({
  capability: "TAX_COMPUTATION_ENGINE",
  status,
  activationApprovalRef: "GOV-APP-2026-001",
});

const approval = (overrides: Partial<TaxSpecialistApproval> = {}): TaxSpecialistApproval => ({
  approvalRef: "TAX-APP-2026-001",
  capability: "TAX_COMPUTATION_ENGINE",
  status: "APPROVED",
  approverId: "user-tax-1",
  approverRole: "TAX_SPECIALIST",
  approvedAt: "2026-07-04",
  expiresAt: "2027-07-04",
  sourceCodes: ["TZ_ACT_TEST_2026"],
  ...overrides,
});

const noeliaLegalService = readFileSync(new URL("../../src/lib/noelia/legal-service.ts", import.meta.url), "utf8");
const noeliaDefaultTools = readFileSync(new URL("../../src/lib/noelia/default-tools.ts", import.meta.url), "utf8");
const noeliaEnterpriseMemory = readFileSync(new URL("../../src/lib/noelia/enterprise-memory.ts", import.meta.url), "utf8");

describe("FINANCE_OS governed tax-intelligence capabilities", () => {
  it("routes the tax.knowledge.query tool through authenticated TAX_LEGAL_AUTHORITY retrieval", () => {
    const start = noeliaDefaultTools.indexOf('name: "tax.knowledge.query"');
    const end = noeliaDefaultTools.indexOf('name: "legal.knowledge.query"', start);
    const taxTool = noeliaDefaultTools.slice(start, end);
    expect(taxTool).toContain('jurisdictionCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,11}$/)');
    expect(taxTool).toContain('execute: (context, input) => legal.knowledge(context, { ...input, domain: "TAX" })');
    expect(taxTool).not.toContain("services.tax(context)");
  });

  it("exposes scoped tax calculation explanation without approval or submission authority", () => {
    expect(noeliaDefaultTools).toContain('name: "tax.computation.explain"');
    expect(noeliaDefaultTools).toContain("execute: (context, input) => legal.taxComputation(context, input)");
    expect(noeliaLegalService).toContain("async taxComputation(context: ToolInvocationContext, input: unknown)");
    expect(noeliaLegalService).toContain("taxReturnDrafts.tenantId");
    expect(noeliaLegalService).toContain("classificationsAtOrBelow(context.principal.clearance)");
    expect(noeliaDefaultTools).toContain('permission: "finance:tax.read"');
  });

  it("requires an explicit jurisdiction before NOELIA retrieves tax law", () => {
    expect(noeliaLegalService).toContain('parsed.domain === "TAX" && !parsed.jurisdictionCode');
    expect(noeliaLegalService).toContain("jurisdictionCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,11}$/).optional()");
    expect(noeliaLegalService).toContain("if (tanzaniaCustomsQuery) jurisdictionCodes.push(\"EAC\")");
    expect(noeliaLegalService).toContain('inArray(knowledgeSources.authorityStatus, ["AUTHORITATIVE", "SUPERSEDED"])');
    expect(noeliaEnterpriseMemory).toContain("jurisdictionCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,11}$/).optional()");
    expect(noeliaLegalService).toContain("asOf: z.string().optional()");
    expect(noeliaLegalService).toContain('inArray(knowledgeSources.authorityStatus, ["AUTHORITATIVE", "SUPERSEDED"])');
    expect(noeliaLegalService).not.toContain('parsed.jurisdictionCode ?? row.jurisdictionCode');
  });

  it("does not authenticate metadata-only or reproduced source records", () => {
    const result = authenticateTaxLegalSource(validSource({
      sourceAuthorityStatus: "OFFICIAL_METADATA_VERIFIED",
      sourceSha256: null,
      sourceUri: null,
      originalDocumentId: null,
      officialSourceHost: null,
    }), OFFICIAL_HOSTS);
    expect(result.authenticated).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("requires an approved official host and a checksum of the original document", () => {
    const result = authenticateTaxLegalSource(validSource({
      sourceUri: "https://example.com/reproduced-act.pdf",
      officialSourceHost: "example.com",
    }), OFFICIAL_HOSTS);
    expect(result.authenticated).toBe(false);
    expect(result.reasons).toContain("Source host is not in the approved official-source host register.");
  });

  it("requires enabling authority for regulations and orders", () => {
    const result = authenticateTaxLegalSource(validSource({
      instrumentKind: "REGULATION",
      enablingProvision: null,
    }), OFFICIAL_HOSTS);
    expect(result.authenticated).toBe(false);
    expect(result.reasons).toContain("Subsidiary legislation must identify its enabling statutory provision.");
  });

  it("retains authenticated superseded law for historical effective windows", () => {
    const superseded = validSource({
      sourceCode: "TZ_ACT_OLD",
      sourceAuthorityStatus: "SUPERSEDED",
      effectiveFrom: "2024-01-01",
      effectiveTo: "2025-12-31",
    });
    expect(authenticateTaxLegalSource(superseded, OFFICIAL_HOSTS).authenticated).toBe(true);
    expect(selectEffectiveTaxAuthorities([superseded], "TZ", "2025-06-30", OFFICIAL_HOSTS).map((item) => item.sourceCode))
      .toEqual(["TZ_ACT_OLD"]);
    expect(selectEffectiveTaxAuthorities([superseded], "TZ", "2026-01-01", OFFICIAL_HOSTS)).toEqual([]);
  });

  it("selects only authenticated sources within their effective date window", () => {
    const sources = [
      validSource(),
      validSource({ sourceCode: "TZ_ACT_FUTURE", effectiveFrom: "2027-01-01" }),
      validSource({ sourceCode: "TZ_ACT_EXPIRED", effectiveTo: "2026-06-30" }),
      validSource({ sourceCode: "TZ_ACT_UNVERIFIED", sourceAuthorityStatus: "OFFICIAL_METADATA_VERIFIED" }),
    ];
    expect(selectEffectiveTaxAuthorities(sources, "TZ", "2026-11-12", OFFICIAL_HOSTS).map((s) => s.sourceCode))
      .toEqual(["TZ_ACT_TEST_2026"]);
  });

  it("blocks operations when the capability is not active or specialist approval is absent", () => {
    const source = validSource();
    const blocked = evaluateTaxOperationGate({
      capability: "TAX_COMPUTATION_ENGINE",
      activation: activation("INACTIVE"),
      approval: null,
      sources: [source],
      jurisdictionCode: "TZ",
      asOf: "2026-11-12",
      approvedOfficialHosts: OFFICIAL_HOSTS,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.status).not.toBe("READY");
  });

  it("requires the correct specialist role and explicit source coverage", () => {
    const wrongRole = evaluateTaxOperationGate({
      capability: "TAX_COMPUTATION_ENGINE",
      activation: activation(),
      approval: approval({ approverRole: "CUSTOMS_SPECIALIST" }),
      sources: [validSource()],
      jurisdictionCode: "TZ",
      asOf: "2026-11-12",
      approvedOfficialHosts: OFFICIAL_HOSTS,
    });
    expect(wrongRole.allowed).toBe(false);
    expect(wrongRole.reasons).toContain("Approver role is not authorized for this tax capability.");

    const uncovered = evaluateTaxOperationGate({
      capability: "TAX_COMPUTATION_ENGINE",
      activation: activation(),
      approval: approval({ sourceCodes: ["OTHER_SOURCE"] }),
      sources: [validSource()],
      jurisdictionCode: "TZ",
      asOf: "2026-11-12",
      approvedOfficialHosts: OFFICIAL_HOSTS,
    });
    expect(uncovered.allowed).toBe(false);
    expect(uncovered.reasons).toContain("Approval must explicitly cover every source supplied for this operation, and only currently effective authenticated source codes.");
  });

  it("allows a gate only when activation, specialist and effective source evidence all agree", () => {
    const gate = evaluateTaxOperationGate({
      capability: "TAX_COMPUTATION_ENGINE",
      activation: activation(),
      approval: approval(),
      sources: [validSource()],
      jurisdictionCode: "TZ",
      asOf: "2026-11-12",
      approvedOfficialHosts: OFFICIAL_HOSTS,
    });
    expect(gate.allowed).toBe(true);
    expect(gate.status).toBe("READY");
    expect(gate.sourceCodes).toEqual(["TZ_ACT_TEST_2026"]);
  });

  it("never returns a tax liability, even when the operation gate is ready", () => {
    const gate = evaluateTaxOperationGate({
      capability: "TAX_COMPUTATION_ENGINE",
      activation: activation(),
      approval: approval(),
      sources: [validSource()],
      jurisdictionCode: "TZ",
      asOf: "2026-11-12",
      approvedOfficialHosts: OFFICIAL_HOSTS,
    });
    const result = prepareTaxComputation({
      request: {
        jurisdictionCode: "TZ",
        taxType: "VAT",
        asOf: "2026-11-12",
        currency: "TZS",
        taxPeriod: "2026-10",
        facts: { taxableValueMinor: 100000 },
      },
      gate,
    });
    expect(result.liability).toBeNull();
    expect(result.status).toBe("READY_FOR_SPECIALIST_EXECUTION");
  });

  it("does not leak NOELIA tax citations across jurisdictions when source order differs", () => {
    const kenyaSource = validSource({
      sourceCode: "KE_ACT_TEST_2026",
      jurisdictionCode: "KE",
      sourceUri: "https://oagmis.oag.go.tz/portal/legislation/test",
      officialSourceHost: "oagmis.oag.go.tz",
    });
    const result = validateNoeliaTaxCitations({
      jurisdictionCode: "TZ",
      asOf: "2026-11-12",
      sources: [kenyaSource, validSource()],
      citedSourceCodes: ["KE_ACT_TEST_2026"],
      approvedOfficialHosts: OFFICIAL_HOSTS,
    });
    expect(result.reliable).toBe(false);
    expect(result.citations).toEqual([]);
    expect(result.reasons.join(" ")).toContain("unauthenticated");
  });

  it("validates HS code shape without inferring a classification or tariff", () => {
    expect(validateCustomsAssessmentRequest({
      jurisdictionCode: "TZ",
      asOf: "2026-11-12",
      hsCode: "870899",
      originCountry: "CN",
      customsValueMinor: 500000,
      currency: "USD",
      procedureCode: "HOME_USE",
    })).toEqual([]);
    expect(validateCustomsAssessmentRequest({
      jurisdictionCode: "TZ",
      asOf: "2026-11-12",
      hsCode: "UNKNOWN",
      originCountry: "CN",
      customsValueMinor: 500000,
      currency: "USD",
      procedureCode: "HOME_USE",
    })).toContain("HS code must be a 6–10 digit code supplied or confirmed by a customs specialist.");
  });

  it("does not schedule compliance obligations without an authenticated source and cited provision", () => {
    const obligation = {
      code: "TZ-VAT-RETURN",
      title: "VAT return",
      jurisdictionCode: "TZ",
      period: "2026-10",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      dueDate: "2026-11-20",
      sourceCode: "TZ_ACT_TEST_2026",
      provisionReference: "section 99",
      status: "DRAFT" as const,
    };
    expect(validateTaxComplianceObligation(obligation, [validSource()], OFFICIAL_HOSTS))
      .toContain("Obligation provision reference is not present in the authenticated source record.");
  });

  it("requires checksummed and dated audit evidence", () => {
    expect(validateTaxAuditEvidence({
      evidenceId: "EVD-1",
      evidenceType: "RETURN",
      sourceUri: "https://example.com/return.pdf",
      checksum: "b".repeat(64),
      capturedAt: "2026-11-12",
      classification: "CONFIDENTIAL",
    })).toEqual([]);
    expect(validateTaxAuditEvidence({
      evidenceId: "EVD-2",
      evidenceType: "PAYMENT",
      sourceUri: "file:///tmp/payment.pdf",
      checksum: "bad",
      capturedAt: "not-a-date",
      classification: "CONFIDENTIAL",
    }).length).toBeGreaterThan(0);
  });

  it("blocks NOELIA citations to unauthenticated or out-of-window sources", () => {
    const result = validateNoeliaTaxCitations({
      jurisdictionCode: "TZ",
      asOf: "2026-11-12",
      sources: [validSource({ sourceAuthorityStatus: "OFFICIAL_METADATA_VERIFIED" })],
      citedSourceCodes: ["TZ_ACT_TEST_2026"],
      approvedOfficialHosts: OFFICIAL_HOSTS,
    });
    expect(result.reliable).toBe(false);
    expect(result.citations).toEqual([]);
  });
});
