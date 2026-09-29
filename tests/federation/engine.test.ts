/**
 * BEYU Federation & Trust — engine contract tests (deterministic, no DB).
 *
 * Covers the fail-closed invariants that the whole capability stands on:
 *   - lifecycle: no skips, no un-evidenced promotion, REVOKED is terminal
 *   - production activation: HUMAN + permission + approval + evidence only
 *   - service access: every missing governance row is a denial (SoD of facts)
 *   - consent: withdrawal propagation, most-recent-grant-wins
 *   - capability negotiation: origin capabilities never carry over
 *   - reconciliation: MATCH/NEW/MISSING determinism
 *   - coverage + monitoring: honest zero-claims
 */
import { describe, expect, it } from "vitest";
import {
  assertConsentMove,
  assertLifecycleMove,
  assertProductionActivation,
  assertTransitionShape,
  buildCoverageAudit,
  buildFederationMonitoringReport,
  canMoveConsent,
  canTransition,
  decideServiceAccess,
  effectiveConsent,
  FederationInvariantError,
  isTerminalLifecycle,
  minBeyuClearanceFor,
  negotiateCapabilities,
  reconcile,
  renderCoverageMarkdown,
  summarizeReconciliation,
  type AccessDecisionInput,
  type CoverageRow,
  type EvidenceRecord,
  type JurisdictionProfileView,
} from "../../src/lib/federation";

const NOW = new Date("2026-09-28T12:00:00.000Z");
const FUTURE = "2027-01-01T00:00:00.000Z";
const PAST = "2026-01-01T00:00:00.000Z";

const ev = (over: Partial<EvidenceRecord> = {}): EvidenceRecord => ({
  id: "FDEV_TEST",
  type: "PRODUCTION_TEST",
  subjectType: "AUTHORITY",
  subjectId: "FDA_AUTH1",
  status: "VALID",
  expiresAt: null,
  ...over,
});

/* ------------------------------------------------------------------ */
/* Lifecycle                                                            */
/* ------------------------------------------------------------------ */
describe("lifecycle (assertLifecycleMove)", () => {
  it("allows a plain forward move DISCOVERED → CLASSIFIED", () => {
    expect(() =>
      assertLifecycleMove({ recordId: "FDA_AUTH1", current: "DISCOVERED", to: "CLASSIFIED", productionEvidence: null, approvedBy: null, approvalReference: null, now: NOW }),
    ).not.toThrow();
  });

  it("rejects skipping to LIVE (no skip transitions)", () => {
    expect(() =>
      assertLifecycleMove({ recordId: "FDA_AUTH1", current: "DISCOVERED", to: "LIVE", productionEvidence: ev(), approvedBy: "USR1", approvalReference: "APR1", now: NOW }),
    ).toThrow(FederationInvariantError);
  });

  it("allows AUTHORITY_ACCEPTANCE → PRODUCTION_APPROVAL with linked production evidence", () => {
    expect(() =>
      assertLifecycleMove({
        recordId: "FDA_AUTH1",
        current: "AUTHORITY_ACCEPTANCE",
        to: "PRODUCTION_APPROVAL",
        productionEvidence: ev(),
        approvedBy: "USR1",
        approvalReference: "APR-1",
        now: NOW,
      }),
    ).not.toThrow();
  });

  it("rejects PRODUCTION_APPROVAL without production evidence", () => {
    expect(() =>
      assertLifecycleMove({ recordId: "FDA_AUTH1", current: "AUTHORITY_ACCEPTANCE", to: "PRODUCTION_APPROVAL", productionEvidence: null, approvedBy: "USR1", approvalReference: "APR-1", now: NOW }),
    ).toThrow(/production evidence/i);
  });

  it("rejects evidence linked to a different record", () => {
    expect(() =>
      assertLifecycleMove({
        recordId: "FDA_OTHER",
        current: "AUTHORITY_ACCEPTANCE",
        to: "PRODUCTION_APPROVAL",
        productionEvidence: ev(),
        approvedBy: "USR1",
        approvalReference: "APR-1",
        now: NOW,
      }),
    ).toThrow(/not to FDA_OTHER|linked to/i);
  });

  it("rejects non-production-grade evidence types", () => {
    expect(() =>
      assertLifecycleMove({
        recordId: "FDA_AUTH1",
        current: "AUTHORITY_ACCEPTANCE",
        to: "PRODUCTION_APPROVAL",
        productionEvidence: ev({ type: "SCREENSHOT" }),
        approvedBy: "USR1",
        approvalReference: "APR-1",
        now: NOW,
      }),
    ).toThrow(/not production-grade/i);
  });

  it("rejects non-VALID evidence", () => {
    expect(() =>
      assertLifecycleMove({
        recordId: "FDA_AUTH1",
        current: "AUTHORITY_ACCEPTANCE",
        to: "PRODUCTION_APPROVAL",
        productionEvidence: ev({ status: "INVALIDATED" }),
        approvedBy: "USR1",
        approvalReference: "APR-1",
        now: NOW,
      }),
    ).toThrow(/not VALID/i);
  });

  it("rejects expired evidence", () => {
    expect(() =>
      assertLifecycleMove({
        recordId: "FDA_AUTH1",
        current: "AUTHORITY_ACCEPTANCE",
        to: "PRODUCTION_APPROVAL",
        productionEvidence: ev({ expiresAt: PAST }),
        approvedBy: "USR1",
        approvalReference: "APR-1",
        now: NOW,
      }),
    ).toThrow(/expired/i);
  });

  it("rejects LIVE_VERIFIED without a named verifier/approver", () => {
    expect(() =>
      assertLifecycleMove({
        recordId: "FDA_AUTH1",
        current: "LIVE",
        to: "LIVE_VERIFIED",
        productionEvidence: ev(),
        approvedBy: null,
        approvalReference: "APR-1",
        now: NOW,
      }),
    ).toThrow(/named approver|named verifier/i);
  });

  it("treats REVOKED as terminal", () => {
    expect(isTerminalLifecycle("REVOKED")).toBe(true);
    expect(isTerminalLifecycle("LIVE")).toBe(false);
    expect(canTransition("REVOKED", "MONITORED")).toBe(false);
    expect(() =>
      assertLifecycleMove({ recordId: "FDA_AUTH1", current: "REVOKED", to: "MONITORED", productionEvidence: null, approvedBy: null, approvalReference: null, now: NOW }),
    ).toThrow(FederationInvariantError);
  });

  it("allows suspension from many states and resume only to MONITORED", () => {
    expect(canTransition("LIVE", "SUSPENDED")).toBe(true);
    expect(canTransition("SUSPENDED", "MONITORED")).toBe(true);
    expect(canTransition("SUSPENDED", "LIVE")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Production activation guard                                          */
/* ------------------------------------------------------------------ */
describe("assertProductionActivation", () => {
  const base = { actorUserId: "USR1", actorType: "HUMAN" as const, permissionHeld: true, approvalReference: "APR-1", productionEvidenceId: "FDEV_TEST" };

  it("passes for a fully-governed HUMAN activation", () => {
    expect(() => assertProductionActivation(base)).not.toThrow();
  });

  it("rejects AI actors", () => {
    expect(() => assertProductionActivation({ ...base, actorType: "AI" })).toThrow(/HUMAN actor/i);
  });

  it("rejects SERVICE actors", () => {
    expect(() => assertProductionActivation({ ...base, actorType: "SERVICE" })).toThrow(/HUMAN actor/i);
  });

  it("rejects a missing permission", () => {
    expect(() => assertProductionActivation({ ...base, permissionHeld: false })).toThrow(/permission/i);
  });

  it("rejects a missing approval reference or evidence", () => {
    expect(() => assertProductionActivation({ ...base, approvalReference: null })).toThrow(/approval/i);
    expect(() => assertProductionActivation({ ...base, productionEvidenceId: null })).toThrow(/evidence/i);
  });
});

/* ------------------------------------------------------------------ */
/* Service access decisions (fail-closed guards)                        */
/* ------------------------------------------------------------------ */
function accessInput(over: Partial<AccessDecisionInput> = {}): AccessDecisionInput {
  return {
    service: {
      id: "FDS_1",
      code: "NIDA_BASIC",
      dataClassification: "PUBLIC",
      consentRequired: "FALSE",
      agreementRequired: "FALSE",
      accessCostStatus: "PUBLIC_INFORMATION",
      accessLevel: "GRANTED",
      apiStatus: "UNVERIFIED",
      govesbStatus: "GOVESB_UNKNOWN",
      verificationStatus: "REGISTERED",
      credentialRequired: "FALSE",
    },
    authority: { code: "NIDA", lifecycleStatus: "LIVE", recordStatus: "REGISTERED" },
    principal: { tenantId: "TEN_A", entityId: "LE_A", clearance: "PUBLIC" },
    legalBasis: { id: "FDLB_1", status: "CONFIRMED", expiryDate: FUTURE },
    consent: null,
    agreement: null,
    accessRequest: { id: "FDAR_1", status: "APPROVED", expiresAt: FUTURE, tenantId: "TEN_A", legalEntityId: "LE_A" },
    credential: null,
    now: NOW,
    ...over,
  };
}

describe("decideServiceAccess", () => {
  it("allows a fully governed access", () => {
    const d = decideServiceAccess(accessInput());
    expect(d.allowed).toBe(true);
    expect(d.event).toBe("FEDERATION_DATA_ACCESSED");
  });

  it("denies when the service is not connected", () => {
    const d = decideServiceAccess(accessInput({ service: { ...accessInput().service, accessLevel: "NOT_CONNECTED" } }));
    expect(d.allowed).toBe(false);
    expect(d.event).toBe("FEDERATION_DATA_REJECTED");
  });

  it("denies when the approved request belongs to another tenant", () => {
    const d = decideServiceAccess(accessInput({ accessRequest: { id: "FDAR_1", status: "APPROVED", expiresAt: FUTURE, tenantId: "TEN_B", legalEntityId: "LE_A" } }));
    expect(d.allowed).toBe(false);
    expect(d.reasons.some((r) => r.includes("different tenant"))).toBe(true);
  });

  it("denies when the approved request belongs to another legal entity", () => {
    const d = decideServiceAccess(accessInput({ accessRequest: { id: "FDAR_1", status: "APPROVED", expiresAt: FUTURE, tenantId: "TEN_A", legalEntityId: "LE_B" } }));
    expect(d.allowed).toBe(false);
  });

  it("denies an expired approved request", () => {
    const d = decideServiceAccess(accessInput({ accessRequest: { id: "FDAR_1", status: "APPROVED", expiresAt: PAST, tenantId: "TEN_A", legalEntityId: "LE_A" } }));
    expect(d.allowed).toBe(false);
  });

  it("denies protected data with no legal basis", () => {
    const d = decideServiceAccess(
      accessInput({
        service: { ...accessInput().service, dataClassification: "PROTECTED" },
        principal: { tenantId: "TEN_A", entityId: "LE_A", clearance: "RESTRICTED" },
        legalBasis: null,
      }),
    );
    expect(d.allowed).toBe(false);
    expect(d.reasons.some((r) => r.includes("no legal basis"))).toBe(true);
  });

  it("denies when the legal basis is not CONFIRMED", () => {
    const d = decideServiceAccess(accessInput({ legalBasis: { id: "FDLB_1", status: "DRAFT", expiryDate: FUTURE } }));
    expect(d.allowed).toBe(false);
  });

  it("denies when consent is required but withdrawn (propagation)", () => {
    const d = decideServiceAccess(
      accessInput({
        service: { ...accessInput().service, consentRequired: "TRUE" },
        consent: { id: "FDCN_1", status: "WITHDRAWN", expiresAt: FUTURE, subjectMatches: true },
      }),
    );
    expect(d.allowed).toBe(false);
    expect(d.reasons.some((r) => r.includes("WITHDRAWN"))).toBe(true);
  });

  it("denies when consent is required but missing", () => {
    const d = decideServiceAccess(accessInput({ service: { ...accessInput().service, consentRequired: "TRUE" }, consent: null }));
    expect(d.allowed).toBe(false);
  });

  it("denies unknown consent requirement on protected data (fail-closed)", () => {
    const d = decideServiceAccess(
      accessInput({
        service: { ...accessInput().service, consentRequired: "UNKNOWN", dataClassification: "PROTECTED" },
        principal: { tenantId: "TEN_A", entityId: "LE_A", clearance: "RESTRICTED" },
        consent: { id: "FDCN_1", status: "GRANTED", expiresAt: FUTURE, subjectMatches: true },
      }),
    );
    expect(d.allowed).toBe(false);
    expect(d.reasons.some((r) => r.includes("unknown"))).toBe(true);
  });

  it("denies when the required agreement is not ACTIVE", () => {
    const d = decideServiceAccess(
      accessInput({
        service: { ...accessInput().service, agreementRequired: "TRUE" },
        agreement: { id: "FDAG_1", status: "EXPIRED", expiryDate: PAST },
      }),
    );
    expect(d.allowed).toBe(false);
  });

  it("denies when a required credential is revoked", () => {
    const d = decideServiceAccess(
      accessInput({
        service: { ...accessInput().service, credentialRequired: "TRUE" },
        credential: { id: "FDCR_1", status: "REVOKED", expiresAt: FUTURE, credentialClass: "PRODUCTION" },
      }),
    );
    expect(d.allowed).toBe(false);
  });

  it("enforces the classification ceiling", () => {
    const d = decideServiceAccess(
      accessInput({
        service: { ...accessInput().service, dataClassification: "RESTRICTED" },
        principal: { tenantId: "TEN_A", entityId: "LE_A", clearance: "CONFIDENTIAL" },
      }),
    );
    expect(d.allowed).toBe(false);
    expect(d.reasons.some((r) => r.includes("clearance"))).toBe(true);
  });

  it("denies an AUTHORIZED API claim on a REGISTERED (unverified) service", () => {
    const d = decideServiceAccess(accessInput({ service: { ...accessInput().service, apiStatus: "AUTHORIZED" } }));
    expect(d.allowed).toBe(false);
    expect(d.reasons.some((r) => r.includes("unverified"))).toBe(true);
  });

  it("denies a suspended authority", () => {
    const d = decideServiceAccess(accessInput({ authority: { code: "NIDA", lifecycleStatus: "SUSPENDED", recordStatus: "REGISTERED" } }));
    expect(d.allowed).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Consent                                                              */
/* ------------------------------------------------------------------ */
describe("consent", () => {
  it("enforces legal consent transitions", () => {
    expect(canMoveConsent("REQUESTED", "GRANTED")).toBe(true);
    expect(canMoveConsent("GRANTED", "WITHDRAWN")).toBe(true);
    expect(canMoveConsent("WITHDRAWN", "GRANTED")).toBe(false);
    expect(canMoveConsent("GRANTED", "REQUESTED")).toBe(false);
    expect(() => assertConsentMove("WITHDRAWN", "GRANTED")).toThrow(FederationInvariantError);
  });

  it("most-recent grant wins for a purpose", () => {
    const older = { id: "FDCN_OLD", status: "GRANTED" as const, purpose: "PAYROLL", grantedAt: "2026-01-01T00:00:00Z", withdrawnAt: null, expiresAt: FUTURE, supersededById: null };
    const newer = { id: "FDCN_NEW", status: "GRANTED" as const, purpose: "PAYROLL", grantedAt: "2026-06-01T00:00:00Z", withdrawnAt: null, expiresAt: FUTURE, supersededById: null };
    expect(effectiveConsent([older, newer], "PAYROLL", NOW)?.id).toBe("FDCN_NEW");
  });

  it("ignores an expired grant", () => {
    const expired = { id: "FDCN_X", status: "GRANTED" as const, purpose: "PAYROLL", grantedAt: "2026-01-01T00:00:00Z", withdrawnAt: null, expiresAt: PAST, supersededById: null };
    expect(effectiveConsent([expired], "PAYROLL", NOW)).toBeNull();
  });

  it("a withdrawn consent blocks the purpose outright", () => {
    const granted = { id: "FDCN_G", status: "GRANTED" as const, purpose: "PAYROLL", grantedAt: "2026-06-01T00:00:00Z", withdrawnAt: null, expiresAt: FUTURE, supersededById: null };
    const withdrawn = { id: "FDCN_W", status: "WITHDRAWN" as const, purpose: "PAYROLL", grantedAt: "2026-01-01T00:00:00Z", withdrawnAt: "2026-07-01T00:00:00Z", expiresAt: null, supersededById: null };
    expect(effectiveConsent([granted, withdrawn], "PAYROLL", NOW)).toBeNull();
  });

  it("no consent for the purpose → null", () => {
    const other = { id: "FDCN_O", status: "GRANTED" as const, purpose: "TAX", grantedAt: "2026-06-01T00:00:00Z", withdrawnAt: null, expiresAt: FUTURE, supersededById: null };
    expect(effectiveConsent([other], "PAYROLL", NOW)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Capability negotiation + transition shape                            */
/* ------------------------------------------------------------------ */
const profile = (code: string): JurisdictionProfileView => ({
  code,
  name: code,
  status: "ACTIVE",
  dataResidency: {},
  integrationRegime: {},
  crossBorderInterfaces: [],
});

describe("negotiateCapabilities", () => {
  it("origin capabilities never carry over (unknown destination capability)", () => {
    const plan = negotiateCapabilities({
      origin: profile("TZ"),
      destination: profile("KE"),
      capabilities: {},
      subjectType: "ORGANIZATION",
      capabilitiesWanted: ["TAX_SERVICE"],
    });
    const c = plan.capabilities[0];
    expect(c.availability).toBe("NOT_IMPLEMENTED");
    expect(c.blockers.some((b) => b.includes("do NOT carry over"))).toBe(true);
  });

  it("marks BLOCKED when a wanted capability is NOT_AVAILABLE", () => {
    const plan = negotiateCapabilities({
      origin: profile("TZ"),
      destination: profile("KE"),
      capabilities: { TAX_SERVICE: { capabilityCode: "TAX_SERVICE", availability: "NOT_AVAILABLE", legalBasisRef: null, connectorRef: null, dataResidency: null, costStatus: "UNKNOWN_COST", requiresHumanApproval: "UNKNOWN" } },
      subjectType: "ORGANIZATION",
      capabilitiesWanted: ["TAX_SERVICE"],
    });
    expect(plan.status).toBe("BLOCKED");
  });

  it("flags consent and agreement requirements", () => {
    const plan = negotiateCapabilities({
      origin: profile("TZ"),
      destination: profile("KE"),
      capabilities: {
        HEALTH_SERVICE: { capabilityCode: "HEALTH_SERVICE", availability: "REQUIRES_CONSENT", legalBasisRef: null, connectorRef: null, dataResidency: null, costStatus: "UNKNOWN_COST", requiresHumanApproval: "UNKNOWN" },
        LAND_SERVICE: { capabilityCode: "LAND_SERVICE", availability: "REQUIRES_AGREEMENT", legalBasisRef: null, connectorRef: null, dataResidency: null, costStatus: "UNKNOWN_COST", requiresHumanApproval: "TRUE" },
      },
      subjectType: "PERSON",
      capabilitiesWanted: ["HEALTH_SERVICE", "LAND_SERVICE"],
    });
    expect(plan.consentRequired).toBe(true);
    expect(plan.agreementRequired).toBe(true);
  });

  it("a local entity in the destination clears the local-entity blocker", () => {
    const without = negotiateCapabilities({
      origin: profile("TZ"),
      destination: profile("KE"),
      capabilities: { EMPLOYMENT_SERVICE: { capabilityCode: "EMPLOYMENT_SERVICE", availability: "REQUIRES_LOCAL_ENTITY", legalBasisRef: null, connectorRef: null, dataResidency: null, costStatus: "UNKNOWN_COST", requiresHumanApproval: "FALSE" } },
      subjectType: "ORGANIZATION",
      capabilitiesWanted: ["EMPLOYMENT_SERVICE"],
      hasLocalEntityInDestination: false,
    });
    const withLocal = negotiateCapabilities({
      origin: profile("TZ"),
      destination: profile("KE"),
      capabilities: { EMPLOYMENT_SERVICE: { capabilityCode: "EMPLOYMENT_SERVICE", availability: "REQUIRES_LOCAL_ENTITY", legalBasisRef: null, connectorRef: null, dataResidency: null, costStatus: "UNKNOWN_COST", requiresHumanApproval: "FALSE" } },
      subjectType: "ORGANIZATION",
      capabilitiesWanted: ["EMPLOYMENT_SERVICE"],
      hasLocalEntityInDestination: true,
    });
    expect(without.capabilities[0].blockers.length).toBeGreaterThan(0);
    expect(withLocal.capabilities[0].blockers.length).toBe(0);
  });

  it("assertTransitionShape rejects same-jurisdiction and unknown destinations", () => {
    expect(() => assertTransitionShape({ originJurisdiction: "TZ", destinationJurisdiction: "TZ", knownJurisdictions: ["TZ"] })).toThrow(/differ/i);
    expect(() => assertTransitionShape({ originJurisdiction: "TZ", destinationJurisdiction: "ZZ", knownJurisdictions: ["TZ"] })).toThrow(/unknown|not a known/i);
    expect(() => assertTransitionShape({ originJurisdiction: "TZ", destinationJurisdiction: "KE", knownJurisdictions: ["TZ", "KE"] })).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* Reconciliation                                                       */
/* ------------------------------------------------------------------ */
describe("reconcile", () => {
  it("matches by exact code", () => {
    const out = reconcile([{ code: "NIDA", name: "National Identity Authority", source: "test" }], [{ id: "1", code: "NIDA", officialName: "National Identity Authority", shortName: null, recordStatus: "REGISTERED", reconciliationState: "PENDING_RECONCILIATION" }]);
    expect(out[0].state).toBe("MATCH");
  });

  it("flags candidates absent from the registry as NEW", () => {
    const out = reconcile([{ code: "ZZZ", name: "Unknown Body", source: "test" }], []);
    expect(out[0].state).toBe("NEW");
  });

  it("flags registry rows absent from the source as MISSING", () => {
    const out = reconcile([], [{ id: "1", code: "NIDA", officialName: "National Identity Authority", shortName: null, recordStatus: "REGISTERED", reconciliationState: "PENDING_RECONCILIATION" }]);
    expect(out[0].state).toBe("MISSING");
  });

  it("summarizes states", () => {
    const results = reconcile(
      [
        { code: "A", name: "Alpha Authority", source: "s" },
        { code: "B", name: "Brand New Body", source: "s" },
      ],
      [
        { id: "1", code: "A", officialName: "Alpha Authority", shortName: null, recordStatus: "REGISTERED", reconciliationState: "PENDING_RECONCILIATION" },
        { id: "2", code: "C", officialName: "Charlie Commission", shortName: null, recordStatus: "REGISTERED", reconciliationState: "PENDING_RECONCILIATION" },
      ],
    );
    const sum = summarizeReconciliation(results);
    expect(sum.MATCH).toBe(1);
    expect(sum.NEW).toBe(1);
    expect(sum.MISSING).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* Coverage + monitoring (honest zero-claims)                           */
/* ------------------------------------------------------------------ */
const row = (over: Partial<CoverageRow> = {}): CoverageRow => ({
  code: "X",
  officialName: "X Authority",
  domainCode: "IDENTITY",
  authorityType: "AGENCY",
  jurisdictionScope: "NATIONAL",
  recordStatus: "REGISTERED",
  lifecycleStatus: "CLASSIFIED",
  verificationStatus: "REGISTERED",
  apiStatus: "UNVERIFIED",
  govesbStatus: "GOVESB_UNKNOWN",
  accessCostStatus: "UNKNOWN_COST",
  reconciliationState: "PENDING_RECONCILIATION",
  legacyAgencyCode: null,
  agreementRequired: "UNKNOWN",
  ...over,
});

describe("coverage audit", () => {
  const source = { mdasExpected: 325, regionsExpected: 26, lgasExpected: 126, sourceName: "test", sourceVersion: "v1", capturedAt: "2026-09-28", liveVerified: false };

  it("reports domain gaps and honest totals", () => {
    const audit = buildCoverageAudit("TZ", [row(), row({ code: "Y", domainCode: "HEALTH" })], source, ["IDENTITY", "HEALTH"], NOW);
    expect(audit.totals.authoritiesTotal).toBe(2);
    expect(audit.totals.live).toBe(0);
    expect(audit.totals.liveVerified).toBe(0);
    expect(audit.totals.unknownCosts).toBe(2);
    expect(audit.totals.missingDomains).toEqual([]);
    const withGap = buildCoverageAudit("TZ", [row()], source, ["IDENTITY", "LAND"], NOW);
    expect(withGap.totals.missingDomains).toContain("LAND");
  });

  it("renders markdown that states the live/verified counts", () => {
    const audit = buildCoverageAudit("TZ", [row()], source, ["IDENTITY"], NOW);
    const md = renderCoverageMarkdown(audit);
    expect(md).toContain("TZ");
    expect(md).toContain("0");
  });
});

describe("monitoring report", () => {
  it("finds critical issues and reports totals", () => {
    const report = buildFederationMonitoringReport({
      authorities: [
        { code: "A1", officialName: "A", lifecycleStatus: "FAILED_VERIFICATION", verificationStatus: "REGISTERED", accessCostStatus: "UNKNOWN_COST", govesbStatus: "GOVESB_UNKNOWN", nextReviewAt: PAST, recordStatus: "REGISTERED" },
        { code: "A2", officialName: "B", lifecycleStatus: "LIVE", verificationStatus: "LIVE", accessCostStatus: "UNKNOWN_COST", govesbStatus: "GOVESB_UNKNOWN", nextReviewAt: FUTURE, recordStatus: "REGISTERED" },
      ],
      connectors: [{ code: "C1", status: "ENABLED", health: "DOWN", lastFailureAt: PAST, lastErrorCode: "AUTH_401", authFailures: 7 }],
      agreements: [{ code: "G1", status: "ACTIVE", expiryDate: PAST }],
      credentials: [{ code: "CR1", status: "ISSUED", expiresAt: PAST }],
      evidence: [],
      incidents: [{ id: "I1", status: "DETECTED", category: "AUTHORITY_OUTAGE", title: "outage" }],
      now: NOW,
    });
    const kinds = report.findings.map((f) => f.kind);
    expect(kinds).toContain("FAILED_VERIFICATION");
    expect(kinds).toContain("REVIEW_OVERDUE");
    expect(kinds).toContain("CONNECTOR_DEGRADED");
    expect(kinds).toContain("REPEATED_AUTH_FAILURE");
    expect(kinds).toContain("AGREEMENT_EXPIRED");
    expect(kinds).toContain("CREDENTIAL_EXPIRED");
    expect(report.totals.openIncidents).toBe(1);
    expect(report.aiBoundary.length).toBeGreaterThan(0);
  });

  it("reports no findings for a clean registry", () => {
    const report = buildFederationMonitoringReport({
      authorities: [{ code: "A1", officialName: "A", lifecycleStatus: "CLASSIFIED", verificationStatus: "REGISTERED", accessCostStatus: "UNKNOWN_COST", govesbStatus: "GOVESB_UNKNOWN", nextReviewAt: FUTURE, recordStatus: "REGISTERED" }],
      connectors: [],
      agreements: [],
      credentials: [],
      evidence: [],
      incidents: [],
      now: NOW,
    });
    expect(report.findings.length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Catalog invariants                                                   */
/* ------------------------------------------------------------------ */
describe("catalog invariants", () => {
  it("maps external data classes to clearance floors", () => {
    expect(minBeyuClearanceFor("PUBLIC")).toBe("PUBLIC");
    expect(minBeyuClearanceFor("PROTECTED")).toBe("RESTRICTED");
    expect(minBeyuClearanceFor("HIGHLY_RESTRICTED")).toBe("HIGHLY_RESTRICTED");
  });
});
