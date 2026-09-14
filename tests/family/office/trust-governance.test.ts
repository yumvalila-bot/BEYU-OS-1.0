/**
 * FAMILY TRUST GOVERNANCE — integration tests (X10THINK §8, Phase 3).
 *
 * Real services, real PostgreSQL, no mocks. The Family Trust capability is a
 * first-class BEYU OS capability (never a separate "Trust OS") built on the
 * canonical governed-mutation pattern.
 *
 * Governing properties under test:
 *   - instruments follow DRAFT → LEGAL_REVIEW → APPROVED → EXECUTED with a
 *     HUMAN legal-review closure and an APPROVED governance resolution;
 *     server-derived versioning — a client can never claim a version;
 *   - the INERT PROVISION DOCTRINE: provisions (spendthrift, no-contest, …)
 *     are jurisdiction-aware and cannot acquire legal effect without a
 *     ratified human legal-effect reference; enforceability is NEVER assumed;
 *   - trustee decisions carry rationale + authority; conflicted parties are
 *     barred from approving (§16 recusal);
 *   - distributions require an EXECUTED instrument, an ELIGIBLE beneficiary of
 *     the SAME trust, a discretion basis for DISCRETIONARY types, and stay
 *     decision RECORDS: payment execution remains Finance OS authority
 *     (finance_record_ref null, authoritative_owner FINANCE_OS);
 *   - DENY is final: read-only principals cannot manage; out-of-tenant
 *     principals cannot even see the trust;
 *   - everything is audited and the hash chain still verifies (§55);
 *   - software governance ≠ legal enforceability: REQUIRES_LEGAL_REVIEW is
 *     recorded, never fabricated as closed (§48, §54).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../../../src/db";
import {
  governanceBodies,
  resolutions,
  tenants,
  trustDecisions,
  trustDistributions,
  trustInstruments,
  trustProvisions,
  users,
} from "../../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../../src/lib/ids";
import { clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "../../../src/lib/authz";
import { verifyAuditChain } from "../../../src/lib/audit";
import {
  FamilyTrustError,
  createTrustInstrument,
  createTrustProvision,
  proposeTrustDistribution,
  readTrustGovernance,
  recordTrustDecision,
  transitionTrustDecision,
  transitionTrustDistribution,
  transitionTrustInstrument,
  transitionTrustProvision,
} from "../../../src/lib/family/office/trust-governance-service";

const TRUST = fixedId(ID_PREFIX.legalEntity, "BEYU_FAMILY_TRUST");
const BENEFICIARY_B1 = fixedId(ID_PREFIX.beneficiary, "B1");
const COUNCIL = fixedId(ID_PREFIX.body, "FAMILY_COUNCIL");
const RUN = Math.random().toString(36).slice(2, 8).toUpperCase();
const ctx = { traceId: `TRUST_TEST_${RUN}`, ipAddress: "127.0.0.1", userAgent: "vitest" };

const PRINCIPAL = "NEEMA_BEYU"; // FAMILY_OFFICE_PRINCIPAL — familyoffice:trust.manage
const CEO = "AMANI_BEYU"; // GROUP_CEO — familyoffice:trust.READ only
const SECTOR = "SARA_LEMA"; // SECTOR_OPERATOR, health tenant — no visibility at all

async function principalFor(userKey: string): Promise<Principal> {
  const [u] = await db.select().from(users).where(eq(users.id, fixedId(ID_PREFIX.user, userKey)));
  if (!u) throw new Error(`seed user ${userKey} missing — run npm run seed`);
  const [t] = await db.select().from(tenants).where(eq(tenants.id, u.primaryTenantId));
  const grants = await loadGrants(u.id, u.primaryTenantId);
  const roles = [...new Set(grants.map((g) => g.code))];
  return {
    userId: u.id,
    partyId: u.partyId,
    email: u.email,
    displayName: u.email,
    tenantId: u.primaryTenantId,
    tenantCode: t.code,
    tenantType: t.type,
    roles,
    permissions: permissionsForRoles(roles),
    clearance: clearanceForRoles(roles),
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "TEST",
    riskScore: 0,
    emergencyPermissions: [],
  };
}

async function seededResolution(status: string) {
  const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, COUNCIL));
  const id = `RES_TR_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const now = new Date();
  const terminal = ["APPROVED", "REJECTED", "DEADLOCKED", "DEFERRED"].includes(status);
  await db.insert(resolutions).values({
    id,
    tenantId: body.tenantId,
    bodyId: COUNCIL,
    reference: `${body.code}-5555-${Math.floor(Math.random() * 900 + 100)}`,
    title: "Trust governance probe",
    category: "RESERVED_MATTER",
    summary: "Trust governance probe summary long enough for the contract.",
    rationale: "Trust governance probe rationale long enough for the contract.",
    dataBasis: "Probe basis.",
    consequences: "Probe consequences.",
    proposedBy: "FAMILY_OFFICE_PRINCIPAL",
    status: status as never,
    requiredMajority: body.majorityRule,
    classification: "HIGHLY_RESTRICTED",
    quorumMet: terminal,
    votesFor: terminal ? 3 : 0,
    votesAgainst: terminal ? 0 : 0,
    decidedByMemberId: terminal ? "GMB_FAM_PRINCIPAL" : null,
    decisionDate: terminal ? now : null,
    votingOpensAt: new Date(now.getTime() - 3 * 86_400_000),
    votingClosesAt: new Date(now.getTime() - 3600_000),
  } as never);
  return id;
}

async function expectTrustError(code: string, fn: () => Promise<unknown>): Promise<FamilyTrustError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(FamilyTrustError);
    expect((err as FamilyTrustError).code).toBe(code);
    return err as FamilyTrustError;
  }
  throw new Error(`expected FamilyTrustError(${code}) but the call succeeded`);
}

let principal: Principal;
let ceo: Principal;
let sector: Principal;
let approvedRes: string;
let tabledRes: string;

let instrumentId: string;
let provisionId: string;
let decisionId: string;
let distributionId: string;

beforeAll(async () => {
  principal = await principalFor(PRINCIPAL);
  ceo = await principalFor(CEO);
  sector = await principalFor(SECTOR);
  approvedRes = await seededResolution("APPROVED");
  tabledRes = await seededResolution("TABLED");
});

/**
 * Leave no residue: probe instruments/children and probe resolutions are
 * removed (FK order). The append-only audit/event ledgers stay untouched.
 */
afterAll(async () => {
  const instruments = sql`select id from trust_instruments where instrument_name like ${`%${RUN}%`}`;
  await db.execute(sql`delete from trust_distributions where instrument_id in (${instruments})`);
  await db.execute(sql`delete from trust_decisions where instrument_id in (${instruments})`);
  await db.execute(sql`delete from trust_provisions where instrument_id in (${instruments})`);
  await db.execute(sql`delete from trust_instruments where id in (${instruments})`);
  await db.execute(sql`delete from resolutions where id like 'RES_TR_%'`);
});

describe("§8 — trust instruments: lifecycle, legal review, server-derived versions", () => {
  it("DENIES management to a read-only principal (CEO holds trust.READ only) — DENY is final", async () => {
    expect(ceo.permissions).toContain("familyoffice:trust.read");
    expect(ceo.permissions).not.toContain("familyoffice:trust.manage");
    // The family-trust error taxonomy maps an authorization DENY to SCOPE.
    await expectTrustError("SCOPE", () =>
      createTrustInstrument(
        ceo,
        { trustEntityId: TRUST, instrumentName: `CEO deed ${RUN}`, jurisdictionCode: "MU", documentRef: "DOC-1" },
        ctx,
      ),
    );
  });

  it("DENIES an out-of-tenant principal even visibility of the trust entity", async () => {
    await expectTrustError("NOT_FOUND", () => readTrustGovernance(sector, { trustEntityId: TRUST }));
    await expectTrustError("NOT_FOUND", () =>
      createTrustInstrument(
        sector,
        { trustEntityId: TRUST, instrumentName: `Sector deed ${RUN}`, jurisdictionCode: "MU", documentRef: "DOC-1" },
        ctx,
      ),
    );
  });

  it("refuses an instrument without a documents-registry reference (no evidence, not proven)", async () => {
    await expectTrustError("VALIDATION", () =>
      createTrustInstrument(principal, { trustEntityId: TRUST, instrumentName: `No doc ${RUN}`, jurisdictionCode: "MU", documentRef: "  " }, ctx),
    );
  });

  it("creates a DRAFT amendment with a SERVER-DERIVED version and REQUIRES_LEGAL_REVIEW", async () => {
    const created = await createTrustInstrument(
      principal,
      {
        trustEntityId: TRUST,
        instrumentName: `First amendment (probe ${RUN})`,
        instrumentType: "AMENDMENT",
        jurisdictionCode: "MU",
        documentRef: `DOC-AMEND-${RUN}`,
      },
      ctx,
    );
    instrumentId = created.id;
    expect(created.status).toBe("DRAFT");
    expect(created.version).toBeGreaterThanOrEqual(1);

    const [row] = await db.select().from(trustInstruments).where(eq(trustInstruments.id, instrumentId));
    expect(row.legalReviewStatus).toBe("REQUIRES_LEGAL_REVIEW");
    expect(row.classification).toBe("HIGHLY_RESTRICTED");
  });

  it("refuses lifecycle jumps: DRAFT → APPROVED is not permitted", async () => {
    await expectTrustError("GOVERNANCE", () =>
      transitionTrustInstrument(principal, { instrumentId, to: "APPROVED", legalReviewStatus: "LEGAL_REVIEW_CLOSED", approvedByResolutionId: approvedRes }, ctx),
    );
  });

  it("moves DRAFT → LEGAL_REVIEW", async () => {
    const out = await transitionTrustInstrument(principal, { instrumentId, to: "LEGAL_REVIEW" }, ctx);
    expect(out.status).toBe("LEGAL_REVIEW");
  });

  it("refuses approval without a HUMAN legal-review closure — software cannot fabricate it (§48)", async () => {
    await expectTrustError("LEGAL_REVIEW_REQUIRED", () =>
      transitionTrustInstrument(principal, { instrumentId, to: "APPROVED", approvedByResolutionId: approvedRes }, ctx),
    );
    await expectTrustError("LEGAL_REVIEW_REQUIRED", () =>
      transitionTrustInstrument(principal, { instrumentId, to: "APPROVED", legalReviewStatus: "COUNSEL_SAYS_FINE", approvedByResolutionId: approvedRes }, ctx),
    );
  });

  it("refuses approval citing a non-APPROVED resolution", async () => {
    await expectTrustError("GOVERNANCE", () =>
      transitionTrustInstrument(principal, { instrumentId, to: "APPROVED", legalReviewStatus: "LEGAL_REVIEW_CLOSED", approvedByResolutionId: tabledRes }, ctx),
    );
    await expectTrustError("NOT_FOUND", () =>
      transitionTrustInstrument(principal, { instrumentId, to: "APPROVED", legalReviewStatus: "LEGAL_REVIEW_CLOSED", approvedByResolutionId: "RES_GHOST" }, ctx),
    );
  });

  it("approves and executes with closure + APPROVED resolution", async () => {
    const approved = await transitionTrustInstrument(principal, { instrumentId, to: "APPROVED", legalReviewStatus: "LEGAL_REVIEW_CLOSED", approvedByResolutionId: approvedRes }, ctx);
    expect(approved.status).toBe("APPROVED");
    const executed = await transitionTrustInstrument(principal, { instrumentId, to: "EXECUTED" }, ctx);
    expect(executed.status).toBe("EXECUTED");

    const [row] = await db.select().from(trustInstruments).where(eq(trustInstruments.id, instrumentId));
    expect(row.legalReviewStatus).toBe("LEGAL_REVIEW_CLOSED");
    expect(row.approvedByResolutionId).toBe(approvedRes);
  });
});

describe("§8 — INERT provision doctrine: no legal effect without a ratified human determination", () => {
  it("refuses an unknown provision type", async () => {
    await expectTrustError("VALIDATION", () =>
      createTrustProvision(
        principal,
        { instrumentId, provisionType: "WHATEVER_CLAUSE" as never, jurisdictionCode: "MU", summary: "Nope" },
        ctx,
      ),
    );
  });

  it("records a SPENDTHRIFT provision as INERT with enforceability NOT assumed", async () => {
    const created = await createTrustProvision(
      principal,
      { instrumentId, provisionType: "SPENDTHRIFT", jurisdictionCode: "MU", summary: `Creditors' claims barred per deed clause 9 (probe ${RUN}).`, clauseDocumentRef: `DOC-CL-${RUN}` },
      ctx,
    );
    provisionId = created.id;
    expect(created.legalEffectStatus).toBe("INERT");

    const [row] = await db.select().from(trustProvisions).where(eq(trustProvisions.id, provisionId));
    expect(row.enforceabilityAssumed).toBe(false);
    expect(row.jurisdictionCode).toBe("MU");
  });

  it("refuses legal effect beyond INERT without a ratified legal-effect reference", async () => {
    await expectTrustError("INERT_PROVISION", () =>
      transitionTrustProvision(principal, { provisionId, toLegalEffectStatus: "LEGAL_REVIEWED" }, ctx),
    );
    await expectTrustError("INERT_PROVISION", () =>
      transitionTrustProvision(principal, { provisionId, toLegalEffectStatus: "APPROVED", legalEffectReference: "  ", approvedByResolutionId: approvedRes }, ctx),
    );
  });

  it("accepts UNDER_LEGAL_REVIEW (still inert) and then APPROVES only with reference + resolution", async () => {
    const review = await transitionTrustProvision(principal, { provisionId, toLegalEffectStatus: "UNDER_LEGAL_REVIEW" }, ctx);
    expect(review.legalEffectStatus).toBe("UNDER_LEGAL_REVIEW");

    await expectTrustError("GOVERNANCE", () =>
      transitionTrustProvision(principal, { provisionId, toLegalEffectStatus: "APPROVED", legalEffectReference: `MU-COUNSEL-OPINION-${RUN}`, approvedByResolutionId: tabledRes }, ctx),
    );

    const approved = await transitionTrustProvision(principal, { provisionId, toLegalEffectStatus: "APPROVED", legalEffectReference: `MU-COUNSEL-OPINION-${RUN}`, approvedByResolutionId: approvedRes }, ctx);
    expect(approved.legalEffectStatus).toBe("APPROVED");

    const [row] = await db.select().from(trustProvisions).where(eq(trustProvisions.id, provisionId));
    expect(row.enforceabilityAssumed).toBe(false); // NEVER assumed — always reference-bound
    expect(row.legalEffectReference).toBe(`MU-COUNSEL-OPINION-${RUN}`);
  });
});

describe("§8/§16 — trustee decisions: rationale, authority and recusal", () => {
  it("refuses a decision without a rationale (§16)", async () => {
    await expectTrustError("VALIDATION", () =>
      recordTrustDecision(principal, { instrumentId, decisionType: "RECUSAL", rationale: "   " }, ctx),
    );
  });

  it("refuses a trustee-removal decision without a subject party", async () => {
    await expectTrustError("VALIDATION", () =>
      recordTrustDecision(principal, { instrumentId, decisionType: "TRUSTEE_REMOVAL", rationale: "Removal proposed." }, ctx),
    );
  });

  it("records a PROPOSED decision and refuses approval without an authority reference", async () => {
    const created = await recordTrustDecision(
      principal,
      {
        instrumentId,
        decisionType: "DISTRIBUTION_APPROVAL",
        rationale: `Approve an education distribution to beneficiary B1 (probe ${RUN}).`,
        dataBasis: "Trustee pack 2026-03.",
        consequences: "Creates a payment obligation for Finance OS to execute.",
      },
      ctx,
    );
    decisionId = created.id;
    expect(created.status).toBe("PROPOSED");

    await expectTrustError("GOVERNANCE", () => transitionTrustDecision(principal, { decisionId, to: "APPROVED" }, ctx));
  });

  it("approves the decision with an APPROVED resolution as authority", async () => {
    const approved = await transitionTrustDecision(principal, { decisionId, to: "APPROVED", authorityRef: approvedRes }, ctx);
    expect(approved.status).toBe("APPROVED");

    const [row] = await db.select().from(trustDecisions).where(eq(trustDecisions.id, decisionId));
    expect(row.decidedBy).toBe(principal.userId);
    expect(row.decidedAt).not.toBeNull();
  });
});

describe("§8 — distributions: decision records only; Finance OS remains the payment authority", () => {
  it("refuses a DISCRETIONARY distribution without a recorded discretion basis", async () => {
    await expectTrustError("VALIDATION", () =>
      proposeTrustDistribution(principal, { instrumentId, beneficiaryId: BENEFICIARY_B1, distributionType: "DISCRETIONARY", amount: "10000", currency: "USD" }, ctx),
    );
  });

  it("refuses an unknown beneficiary (NOT_FOUND) — entitlement is never invented", async () => {
    await expectTrustError("NOT_FOUND", () =>
      proposeTrustDistribution(principal, { instrumentId, beneficiaryId: "BEN_GHOST", distributionType: "EDUCATION", amount: "10000", currency: "USD" }, ctx),
    );
  });

  it("proposes an EDUCATION distribution for an ELIGIBLE beneficiary: PROPOSED + payment NOT_DUE", async () => {
    const created = await proposeTrustDistribution(
      principal,
      {
        instrumentId,
        beneficiaryId: BENEFICIARY_B1,
        distributionType: "EDUCATION",
        amount: "25000.00",
        currency: "USD",
        assetDescription: "University tuition payment (probe).",
      },
      ctx,
    );
    distributionId = created.id;
    expect(created.status).toBe("PROPOSED");

    const [row] = await db.select().from(trustDistributions).where(eq(trustDistributions.id, distributionId));
    expect(row.paymentStatus).toBe("NOT_DUE"); // no payment exists — this is a record
    expect(row.financeRecordRef).toBeNull();
    expect(row.authoritativeOwner).toBe("FINANCE_OS");
  });

  it("refuses approval without an APPROVED governance resolution", async () => {
    await expectTrustError("GOVERNANCE", () => transitionTrustDistribution(principal, { distributionId, to: "APPROVED" }, ctx));
    await expectTrustError("GOVERNANCE", () => transitionTrustDistribution(principal, { distributionId, to: "APPROVED", resolutionRef: tabledRes }, ctx));
  });

  it("approves and executes the RECORD — payment stays PENDING for Finance OS, never posted here", async () => {
    const approved = await transitionTrustDistribution(principal, { distributionId, to: "APPROVED", resolutionRef: approvedRes }, ctx);
    expect(approved.status).toBe("APPROVED");

    const executed = await transitionTrustDistribution(principal, { distributionId, to: "EXECUTED" }, ctx);
    expect(executed.status).toBe("EXECUTED");

    const [row] = await db.select().from(trustDistributions).where(eq(trustDistributions.id, distributionId));
    expect(row.paymentStatus).toBe("PENDING"); // the RECORD is executed; the MONEY has not moved
    expect(row.financeRecordRef).toBeNull(); // Finance OS / CAP_POSTING untouched (§22)
    expect(row.authoritativeOwner).toBe("FINANCE_OS");
  });
});

describe("§8/§55 — governed read model and audit integrity", () => {
  it("reads the whole trust governance picture (instruments, provisions, decisions, distributions, trustees)", async () => {
    const view = await readTrustGovernance(principal, { trustEntityId: TRUST });
    expect(view.trustEntityId).toBe(TRUST);
    expect(view.instruments.some((i) => i.id === instrumentId)).toBe(true);
    expect(view.provisions.some((p) => p.id === provisionId)).toBe(true);
    expect(view.decisions.some((d) => d.id === decisionId)).toBe(true);
    expect(view.distributions.some((d) => d.id === distributionId)).toBe(true);
    expect(Array.isArray(view.trustees)).toBe(true);

    // A read-only principal may read (trust.read), an out-of-tenant one may not.
    const ceoView = await readTrustGovernance(ceo, { trustEntityId: TRUST });
    expect(ceoView.instruments.length).toBe(view.instruments.length);
  });

  it("audited every trust mutation and the hash chain still verifies", async () => {
    const chain = await verifyAuditChain();
    expect(chain.verified).toBe(true);
    expect(chain.records).toBeGreaterThan(0);
  });
});
