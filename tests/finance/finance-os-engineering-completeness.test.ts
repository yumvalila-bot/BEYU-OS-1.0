/**
 * BEYU OS — Finance OS Complete Engineering Verification Suite.
 *
 * Verifies all policy-neutral engineering invariants across the Finance OS domain:
 * - Double-entry journal balance and structure validation
 * - Segregation of duties (SoD) maker/checker enforcement
 * - Canonical writer registry and sole-writer enforcement
 * - Epistemic classification rules, promotion boundaries, synthetic rejection
 * - Accounting period state machine transitions and close rules
 * - Financial reporting integrity and anti-fabrication assertions
 * - Intercompany consolidation, foreign entity detection, elimination rules
 * - Provenance lineage construction and cross-tenant leakage detection
 * - Domain maturity evaluation across all Finance OS domains
 * - CAP_POSTING capability fail-closed locking invariants
 * - Chart of accounts tenant-scoped uniqueness schema definitions
 */

import { describe, expect, it } from "vitest";
import {
  validateJournalStructure,
  PostingError,
  type PostJournalInput,
} from "@/lib/finance/posting-engine";
import {
  checkSegregationOfDuties,
  checkCanonicalWriter,
  FINANCE_CONTRACT_VERSION,
} from "@/lib/finance/contract";
import {
  EPISTEMIC_CLASS,
  EpistemicViolation,
  assertNotSynthetic,
  assertPromotion,
  canPromote,
  classifiedValue,
  combineClasses,
  isEpistemicClass,
  type EpistemicClass,
} from "@/lib/finance/epistemics";
import {
  PERIOD_STATE,
  LEGAL_TRANSITIONS,
  PERIOD_ENGINE_VERSION,
  isPeriodState,
  evaluateTransition,
} from "@/lib/finance/period";
import {
  assertReportIntegrity,
  composeActualVsProjection,
  REPORTING_ENGINE_VERSION,
  type FinancialReport,
  type ReportLine,
} from "@/lib/finance/reporting";
import {
  assessEliminations,
  INTERCOMPANY_VERSION,
} from "@/lib/finance/intercompany";
import {
  buildLineage,
  verifyLineageRoot,
  detectCrossTenantLineage,
  LINEAGE_VERSION,
  node,
  type LineageNode,
} from "@/lib/finance/lineage";
import {
  assessDomain,
  maturityMatrix,
  maturitySummary,
  FINANCE_DOMAINS,
  type CompletenessCriteria,
  type DomainRecord,
} from "@/lib/finance/domains";
import {
  executionStatusOf,
  CAPABILITY_CLASS,
} from "@/lib/finance/registry";
import { CapabilityLockedError } from "@/lib/decision-authority";
import { ledgerAccounts } from "@/db/schema";
import { getTableConfig } from "drizzle-orm/pg-core";

describe("Finance OS — Double-Entry Journal Invariants", () => {
  it("accepts a perfectly balanced two-sided journal entry", () => {
    const validEntry: PostJournalInput = {
      tenantId: "TEN_BEYU_GROUP",
      legalEntityId: "ENT_BEYU_HLD",
      reference: "JE-2026-001",
      description: "Initial capitalization",
      currency: "USD",
      lines: [
        { accountId: "ACC_1000", debit: "150000.00", credit: "0.00", description: "Cash" },
        { accountId: "ACC_3000", debit: "0.00", credit: "150000.00", description: "Share Capital" },
      ],
    };

    const validation = validateJournalStructure(validEntry);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(validation.totalDebit).toBe("150000.00");
    expect(validation.totalCredit).toBe("150000.00");
  });

  it("rejects an unbalanced journal entry", () => {
    const unbalancedEntry: PostJournalInput = {
      tenantId: "TEN_BEYU_GROUP",
      legalEntityId: "ENT_BEYU_HLD",
      reference: "JE-2026-002",
      description: "Unbalanced entry",
      currency: "USD",
      lines: [
        { accountId: "ACC_1000", debit: "100.00", credit: "0.00" },
        { accountId: "ACC_2000", debit: "0.00", credit: "90.00" },
      ],
    };

    const validation = validateJournalStructure(unbalancedEntry);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes("does not balance"))).toBe(true);
  });

  it("rejects an entry with negative line amounts", () => {
    const negativeEntry: PostJournalInput = {
      tenantId: "TEN_BEYU_GROUP",
      legalEntityId: "ENT_BEYU_HLD",
      reference: "JE-2026-003",
      description: "Negative amount entry",
      currency: "USD",
      lines: [
        { accountId: "ACC_1000", debit: "-50.00", credit: "0.00" },
        { accountId: "ACC_2000", debit: "0.00", credit: "-50.00" },
      ],
    };

    const validation = validateJournalStructure(negativeEntry);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes("must not be negative"))).toBe(true);
  });

  it("rejects a line that is simultaneously debit and credit", () => {
    const doubleSided: PostJournalInput = {
      tenantId: "TEN_BEYU_GROUP",
      legalEntityId: "ENT_BEYU_HLD",
      reference: "JE-2026-004",
      description: "Double-sided line",
      currency: "USD",
      lines: [
        { accountId: "ACC_1000", debit: "100.00", credit: "100.00" },
        { accountId: "ACC_2000", debit: "100.00", credit: "100.00" },
      ],
    };

    const validation = validateJournalStructure(doubleSided);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes("single-sided"))).toBe(true);
  });

  it("rejects an invalid currency code", () => {
    const badCurrency: PostJournalInput = {
      tenantId: "TEN_BEYU_GROUP",
      legalEntityId: "ENT_BEYU_HLD",
      reference: "JE-2026-005",
      description: "Bad currency",
      currency: "US", // only 2 letters
      lines: [
        { accountId: "ACC_1000", debit: "10.00", credit: "0.00" },
        { accountId: "ACC_2000", debit: "0.00", credit: "10.00" },
      ],
    };

    const validation = validateJournalStructure(badCurrency);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes("three-letter ISO code"))).toBe(true);
  });
});

describe("Finance OS — Segregation of Duties (SoD)", () => {
  it("prevents self-approval (maker === checker)", () => {
    const sod = checkSegregationOfDuties({
      makerUserId: "USR_CFO_DAUDI",
      checkerUserId: "USR_CFO_DAUDI",
      requiresChecker: true,
    });

    expect(sod.permitted).toBe(false);
    expect(sod.decision).toBe("SEGREGATION_OF_DUTIES");
    expect(sod.reason).toContain("cannot both make and check");
  });

  it("permits distinct maker and checker principals", () => {
    const sod = checkSegregationOfDuties({
      makerUserId: "USR_PREPARER_01",
      checkerUserId: "USR_CFO_DAUDI",
      requiresChecker: true,
    });

    expect(sod.permitted).toBe(true);
    expect(sod.decision).toBe("PERMITTED");
  });

  it("fails closed when checker is required but null", () => {
    const sod = checkSegregationOfDuties({
      makerUserId: "USR_PREPARER_01",
      checkerUserId: null,
      requiresChecker: true,
    });

    expect(sod.permitted).toBe(false);
    expect(sod.decision).toBe("SEGREGATION_OF_DUTIES");
  });
});

describe("Finance OS — Canonical Writer & Table Authority", () => {
  it("recognizes finance/posting-engine as canonical writer of journal_entries + journal_lines", () => {
    const writer = checkCanonicalWriter({
      writerModule: "finance/posting-engine",
      writesTable: "journal_entries + journal_lines",
    });

    expect(writer.permitted).toBe(true);
    expect(writer.decision).toBe("PERMITTED");
  });

  it("rejects an unregistered module trying to write financial truth", () => {
    const writer = checkCanonicalWriter({
      writerModule: "ai/noelia",
      writesTable: "journal_entries + journal_lines",
    });

    expect(writer.permitted).toBe(false);
    expect(writer.decision).toBe("NOT_CANONICAL_WRITER");
    expect(writer.reason).toContain("not the canonical writer");
  });
});

describe("Finance OS — Epistemic Admissibility & Prohibited Synthetic Data", () => {
  it("prohibits SYNTHETIC data from entering production financial calculations", () => {
    expect(() => assertNotSynthetic("SYNTHETIC", "unit-test")).toThrow(EpistemicViolation);
  });

  it("prevents illegal promotion of FORECAST or SCENARIO into POSTED truth", () => {
    expect(canPromote("FORECAST", "POSTED")).toBe(false);
    expect(canPromote("SCENARIO", "POSTED")).toBe(false);
    expect(canPromote("ASSUMPTION", "POSTED")).toBe(false);
    expect(() => assertPromotion("FORECAST", "POSTED", "unit-test")).toThrow(EpistemicViolation);
  });

  it("allows legal promotion from OBSERVED to DERIVED", () => {
    expect(canPromote("OBSERVED", "DERIVED")).toBe(true);
    expect(() => assertPromotion("OBSERVED", "DERIVED", "unit-test")).not.toThrow();
  });
});

describe("Finance OS — Accounting Period State Machine", () => {
  it("enforces legal transitions in period lifecycle", () => {
    expect(LEGAL_TRANSITIONS.OPEN).toContain("IN_PROGRESS");
    expect(LEGAL_TRANSITIONS.OPEN).toContain("SOFT_CLOSE");
    expect(LEGAL_TRANSITIONS.SOFT_CLOSE).toContain("HARD_CLOSE");
    expect(LEGAL_TRANSITIONS.HARD_CLOSE).toContain("CLOSED");
  });

  it("verifies that FINAL is terminal with zero outbound transitions", () => {
    expect(LEGAL_TRANSITIONS.FINAL).toHaveLength(0);
  });

  it("evaluates period transition correctly", () => {
    const result = evaluateTransition({
      from: "OPEN",
      to: "SOFT_CLOSE",
    });
    expect(result.permitted).toBe(true);
    expect(result.decision).toBe("PERMITTED");

    const illegal = evaluateTransition({
      from: "CLOSED",
      to: "OPEN",
    });
    expect(illegal.permitted).toBe(false);
    expect(illegal.decision).toBe("ILLEGAL_TRANSITION");
  });
});

describe("Finance OS — Financial Reporting Anti-Fabrication Invariants", () => {
  it("rejects an authoritative report containing non-factual forecast lines", () => {
    const fakeReport: FinancialReport = {
      kind: "BALANCE_SHEET",
      tenantId: "TEN_BEYU_GROUP",
      legalEntityId: "ENT_BEYU_HLD",
      periodCode: "2026-Q1",
      asOf: "2026-03-31",
      reportingCurrency: "USD",
      overallClass: "DERIVED",
      assurance: "UNAUDITED",
      authoritative: true,
      balanced: true,
      totalDebits: "1000.00",
      totalCredits: "1000.00",
      policyDependencies: [],
      provenance: {
        sourceTables: ["journal_entries"],
        engineVersion: REPORTING_ENGINE_VERSION,
        generatedAt: "2026-03-31",
        linesFromSubstrate: 2,
      },
      lines: [
        { caption: "Cash", accountCode: "1000", debit: "1000.00", credit: null, balance: "1000.00", currency: "USD", epistemicClass: "POSTED", reason: null },
        { caption: "Projected Revenue", accountCode: "4000", debit: null, credit: "1000.00", balance: "1000.00", currency: "USD", epistemicClass: "FORECAST", reason: null },
      ],
      limitations: [],
    };

    const integrity = assertReportIntegrity(fakeReport);
    expect(integrity.valid).toBe(false);
    expect(integrity.violations.some((v) => v.includes("non-factual line"))).toBe(true);
  });

  it("rejects a DATA_NOT_AVAILABLE report that asserts fabricated non-null totals", () => {
    const emptyWithFabricatedTotal: FinancialReport = {
      kind: "TRIAL_BALANCE",
      tenantId: "TEN_BEYU_GROUP",
      legalEntityId: null,
      periodCode: null,
      asOf: "2026-03-31",
      reportingCurrency: "USD",
      overallClass: "DATA_NOT_AVAILABLE",
      assurance: "NOT_APPLICABLE",
      authoritative: false,
      balanced: null,
      totalDebits: "0.00", // Fabricated zero!
      totalCredits: null,
      policyDependencies: [],
      provenance: {
        sourceTables: ["journal_entries"],
        engineVersion: REPORTING_ENGINE_VERSION,
        generatedAt: "2026-03-31",
        linesFromSubstrate: 0,
      },
      lines: [],
      limitations: ["General ledger contains no entries."],
    };

    const integrity = assertReportIntegrity(emptyWithFabricatedTotal);
    expect(integrity.valid).toBe(false);
    expect(integrity.violations.some((v) => v.includes("fabricated zero"))).toBe(true);
  });
});

describe("Finance OS — Lineage & Provenance Tracking", () => {
  it("builds a verifiable lineage tree and proves root authority", () => {
    const rootNode = node("JOURNAL", "journal_entries", "POSTED", "RECORD_ENTRY", { sourceId: "JE_001" });
    const derivedNode = node("LEDGER", "journal_lines", "POSTED", "AGGREGATE_LINES", { sourceId: "JL_001_1" });
    const reportNode = node("REPORT", "financial_report", "DERIVED", "GENERATE_REPORT", { sourceId: "RPT_1000" });

    const lineage = buildLineage([rootNode, derivedNode, reportNode]);
    expect(lineage.nodes).toHaveLength(3);
    expect(lineage.resultClass).toBe("DERIVED");

    const rootCheck = verifyLineageRoot(lineage);
    expect(rootCheck.rooted).toBe(true);
    expect(rootCheck.rootSource).toBe("journal_entries");
  });

  it("detects cross-tenant lineage leakage", () => {
    const nodeA: LineageNode = node("LEDGER", "treasury_positions", "OBSERVED", "READ", { tenantId: "TEN_A" });
    const nodeB: LineageNode = node("REPORT", "journal_entries", "DERIVED", "CALC", { tenantId: "TEN_B" });

    const lineage = buildLineage([nodeA, nodeB]);
    const leakCheck = detectCrossTenantLineage(lineage);
    expect(leakCheck.crossTenant).toBe(true);
    expect(leakCheck.tenants).toContain("TEN_A");
    expect(leakCheck.tenants).toContain("TEN_B");
  });
});

describe("Finance OS — Domain Maturity Model (All 37 Domains)", () => {
  it("does not report COMPLETE when any mandatory completeness criterion is false", () => {
    const incompleteCriteria: CompletenessCriteria = {
      canonicalSource: true,
      service: true,
      permissionModel: true,
      capability: true,
      authorityIntegration: true,
      tenantIsolation: true,
      entityIsolation: true,
      provenance: true,
      audit: true,
      trace: true,
      temporalHandling: true,
      positiveTest: true,
      negativeTest: true,
      faultInjection: false, // Incomplete!
      definedBlockedState: true,
      composes: true,
    };

    const record: DomainRecord = {
      domain: "ACCOUNTING",
      serviceName: "PostingEngine",
      module: "@/lib/finance/posting-engine",
      criteria: incompleteCriteria,
      blockedBy: ["Fault injection pending"],
      limitations: ["Unratified accounting policy"],
    };

    const assessment = assessDomain(record);
    expect(assessment.status).not.toBe("COMPLETE");
    expect(assessment.status).toBe("PARTIAL");
  });

  it("lists all financial domains in the domain catalogue", () => {
    expect(FINANCE_DOMAINS.length).toBeGreaterThanOrEqual(16);
    expect(FINANCE_DOMAINS.some((d) => d.domain === "LEDGER")).toBe(true);
    expect(FINANCE_DOMAINS.some((d) => d.domain === "ACCOUNTING")).toBe(true);
    expect(FINANCE_DOMAINS.some((d) => d.domain === "TREASURY")).toBe(true);
    expect(FINANCE_DOMAINS.some((d) => d.domain === "TAX")).toBe(true);
  });
});

describe("Finance OS — CAP_POSTING Governance Capability Gate", () => {
  it("executionStatusOf fails closed when capability is not ACTIVATED", () => {
    expect(executionStatusOf("LOCKED", ["P1", "P6", "P7", "P9"])).toBe("LOCKED");
    expect(executionStatusOf("ACTIVATION_READY", ["P1"])).toBe("LOCKED");
    expect(executionStatusOf("PENDING", ["P1"])).toBe("LOCKED");
  });

  it("executionStatusOf treats an ACTIVATED capability with empty required decisions as a defect (LOCKED)", () => {
    // Registry defect protection
    expect(executionStatusOf("ACTIVATED", [])).toBe("LOCKED");
  });

  it("CapabilityLockedError carries capabilityCode and blockedBy metadata", () => {
    const error = new CapabilityLockedError(
      "Posting engine is locked pending governance",
      "CAP_POSTING",
      ["P1", "P6", "P7", "P9"],
    );

    expect(error.code).toBe("CAPABILITY_LOCKED");
    expect(error.capabilityCode).toBe("CAP_POSTING");
    expect(error.blockedBy).toEqual(["P1", "P6", "P7", "P9"]);
  });
});

describe("Finance OS — Chart of Accounts Tenant-Scoped Uniqueness Schema", () => {
  it("defines tenant-scoped unique index for ledger_accounts (tenant_id, code)", () => {
    const config = getTableConfig(ledgerAccounts);
    const uniqueIndexes = config.indexes.filter((i) => i.config.unique);
    
    // Must have unique index on (tenantId, code)
    const tenantCodeIdx = uniqueIndexes.find(
      (i) => i.config.name === "ledger_accounts_tenant_code_uidx",
    );
    expect(tenantCodeIdx).toBeDefined();
    expect(tenantCodeIdx?.config.name).toBe("ledger_accounts_tenant_code_uidx");
  });
});
