/**
 * Governed blockchain capability — service integration tests.
 *
 * Real services, real PostgreSQL, real RBAC/ABAC/tenant-scope/audit: no mocks.
 * The pure engines are covered in `model.test.ts`; what has to be proven HERE is
 * that the governed write paths refuse to be talked out of their verdicts:
 *
 *   - an oracle source may only TIGHTEN its feed's tolerance, so a captured or
 *     misconfigured source cannot widen what executors accept, and an
 *     authoritative/manual source without its qualifying reference is refused;
 *   - a reading is stored with the verdict computed at the decision instant, is
 *     never overwritten (a same-instant resubmission is a 409-class conflict), and
 *     `grantsAuthority` is structurally false;
 *   - posture is RE-EVALUATED at read time: suspending a source invalidates its
 *     previously-usable readings without rewriting a single row;
 *   - token positions are non-authoritative by construction — `authoritative`
 *     cannot be set, unattributed addresses are reported, not invented;
 *   - reconciliation writes a run and findings and mutates nothing on either side;
 *   - an anchor can only become VERIFIED from real chain evidence; a re-check that
 *     no longer holds records the contradiction and its findings but never
 *     rewrites the status (demotion is a separate governed act), and the
 *     execution posture refuses to count a contradicted anchor as evidence;
 *   - every execution gate in the posture read model responds to governed
 *     evidence, and DENY is final (wrong permission, wrong tenant);
 *   - the audit chain still verifies afterwards.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import {
  blockchainAnchors,
  blockchainOracleReadings,
  blockchainOracleSources,
  blockchainReconciliationRuns,
  blockchainTokenPositions,
  contractParties,
  contractRecords,
  smartContractRegistry,
  tenants,
  users,
} from "../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import { clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "../../src/lib/authz";
import { verifyAuditChain } from "../../src/lib/audit";
import { ContractError } from "../../src/lib/contracts/errors";
import { sha256Hex, stableStringify } from "../../src/lib/contracts/pure";
import {
  createAnchor,
  readExecutionPosture,
  readOraclePosture,
  recordOracleReading,
  recordTokenPositions,
  runReconciliation,
  upsertOracleSource,
  upsertRegistryRecord,
  transitionRegistryRecord,
  verifyAnchor,
} from "../../src/lib/blockchain/service";
import { createContractRecord, upsertContractParty } from "../../src/lib/contracts/service";

const RUN = Math.random().toString(36).slice(2, 8).toUpperCase();
const CTX = { traceId: `BC_TEST_${RUN}`, ipAddress: "127.0.0.1", userAgent: "vitest" };
const CODE = `BCX-${RUN}`;
const CONTRACT_CODE = `BCT-${RUN}`;
const ADDR = "0x1f9843a9748f189e1e0ce875be2a1a1a1a1a1a1a";
const OTHER = "0x2f9843a9748f189e1e0ce875be2a1a1a1a1a1a1a";
const H32 = (b: string) => `0x${b.repeat(32)}`;
const NOW = new Date();
const iso = (offsetSeconds = 0) => new Date(NOW.getTime() + offsetSeconds * 1000).toISOString();
const day = NOW.toISOString().slice(0, 10);

/** GROUP_CFO — full contracting + blockchain authority, MFA step-up satisfied. */
const CFO = "DAUDI_MOSHI";
/** GROUP_CEO — contracts:manage, but NO blockchain:manage. */
const CEO = "AMANI_BEYU";
/** SECTOR_OPERATOR in the health tenant — outside the group's scope entirely. */
const OUTSIDER = "SARA_LEMA";

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

async function expectRefused(code: string, fn: () => Promise<unknown>): Promise<ContractError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ContractError);
    expect((err as ContractError).code).toBe(code);
    return err as ContractError;
  }
  throw new Error(`expected ContractError(${code}) but the call succeeded`);
}

let cfo: Principal;
let ceo: Principal;
let outsider: Principal;
let contractId = "";
let sourceId = "";
let anchorId = "";
let runId = "";

beforeAll(async () => {
  cfo = await principalFor(CFO);
  ceo = await principalFor(CEO);
  outsider = await principalFor(OUTSIDER);
  expect(cfo.permissions.has("blockchain:manage")).toBe(true);
  expect(ceo.permissions.has("blockchain:manage")).toBe(false);
});

afterAll(async () => {
  // Leave no residue (FK order). Audit and event ledgers are append-only and stay.
  const contract = sql`select id from contract_records where code = ${CONTRACT_CODE}`;
  await db.execute(sql`delete from contract_execution_links where contract_id in (${contract})`);
  await db.execute(sql`delete from blockchain_oracle_readings where source_id in (select id from blockchain_oracle_sources where code = ${CODE})`);
  await db.execute(sql`delete from blockchain_oracle_sources where code = ${CODE}`);
  await db.execute(sql`delete from blockchain_token_positions where token_symbol = ${`BEYU-EQ-${RUN}`}`);
  await db.execute(sql`delete from blockchain_reconciliation_runs where code = ${CODE}`);
  await db.execute(sql`delete from blockchain_anchors where contract_id in (${contract}) or id in (${sql`select id from blockchain_anchors where note like ${`%${RUN}%`}`})`);
  await db.execute(sql`delete from smart_contract_registry where name = ${`Governor ${RUN}`}`);
  await db.execute(sql`delete from contract_parties where blockchain_address_evidence_ref = 'doc/kyc/address-1'`);
  await db.execute(sql`delete from contract_lifecycle_events where contract_id in (${contract})`);
  await db.execute(sql`delete from contract_records where code = ${CONTRACT_CODE}`);
});

describe("governed oracle sources", () => {
  it("refuses a source that would widen the family deviation floor", async () => {
    const err = await expectRefused("RULE_VIOLATION", () =>
      upsertOracleSource(
        cfo,
        { code: CODE, displayName: "Loose", feed: "FX_RATE", sourceKind: "AUTHORITATIVE_PRIMARY", deviationLimitBps: 5000, authorityRef: "gov/oracle/1" },
        CTX,
      ),
    );
    expect(err.detail).toMatchObject({ requestedBps: 5000, floorBps: 100 });
  });

  it("refuses an unqualified authoritative source and an unattributed manual one", async () => {
    await expectRefused("EVIDENCE_REQUIRED", () =>
      upsertOracleSource(cfo, { code: CODE, displayName: "No authority", feed: "FX_RATE", sourceKind: "AUTHORITATIVE_PRIMARY" }, CTX),
    );
    await expectRefused("RULE_VIOLATION", () =>
      upsertOracleSource(cfo, { code: `${CODE}-M`, displayName: "Manual", feed: "FX_RATE", sourceKind: "MANUAL_EVIDENCE" }, CTX),
    );
  });

  it("accepts a stricter source and keeps the tighter bound", async () => {
    const created = await upsertOracleSource(
      cfo,
      {
        code: CODE,
        displayName: "Governed FX primary",
        feed: "FX_RATE",
        sourceKind: "AUTHORITATIVE_PRIMARY",
        deviationLimitBps: 50,
        maxAgeSeconds: 600,
        authorityRef: "gov/oracle/fx-1",
      },
      CTX,
    );
    sourceId = created.id;
    expect(created).toMatchObject({ code: CODE, state: "ACTIVE", deviationLimitBps: 50, maxAgeSeconds: 600 });
    // Amending it looser is refused; the code is unique per tenant.
    await expectRefused("RULE_VIOLATION", () =>
      upsertOracleSource(cfo, { code: CODE, displayName: "Governed FX primary", feed: "FX_RATE", sourceKind: "AUTHORITATIVE_PRIMARY", deviationLimitBps: 900, maxAgeSeconds: 600, authorityRef: "gov/oracle/fx-1" }, CTX),
    );
    const [row] = await db.select().from(blockchainOracleSources).where(eq(blockchainOracleSources.id, sourceId));
    // A source is engineering configuration, never a legal clearance: the register
    // keeps it open until counsel closes review of what the feed may be used for.
    expect(row.legalReviewStatus).toBe("REQUIRES_LEGAL_REVIEW");
    expect(row.classification).toBe("INTERNAL");
  });

  it("records a reading with the verdict computed at the decision instant", async () => {
    const reading = await recordOracleReading(
      cfo,
      { sourceId, subjectCode: `USD-TZS-${RUN}`, valueBps: 2_600_000_000, decimals: 8, observedAt: iso(-10), asOf: iso(0) },
      CTX,
    );
    expect(reading).toMatchObject({ usable: true, state: "CURRENT" });
    const [row] = await db.select().from(blockchainOracleReadings).where(eq(blockchainOracleReadings.id, reading.id));
    expect(row.grantsAuthority).toBe(false);
    expect(row.previousReadingId).toBeNull();
    expect(row.evaluation).toMatchObject({ deviationLimitBps: 50, maxAgeSeconds: 600, engine: "blockchain-oracle/1" });

    // 400 bps against the previous reading: outside both the 100 bps family floor
    // and the 50 bps source bound — persisted, reported, and NOT usable.
    const deviating = await recordOracleReading(
      cfo,
      { sourceId, subjectCode: `USD-TZS-${RUN}`, valueBps: 2_704_000_000, decimals: 8, observedAt: iso(30), asOf: iso(30) },
      CTX,
    );
    expect(deviating.usable).toBe(false);
    const [devRow] = await db.select().from(blockchainOracleReadings).where(eq(blockchainOracleReadings.id, deviating.id));
    expect(devRow.deviationBps).toBe(400);
    expect(devRow.previousReadingId).toBe(reading.id);
    expect(devRow.usable).toBe(false);
  });

  it("refuses to overwrite an oracle data point (same source, subject, instant)", async () => {
    await expectRefused("CONFLICT", () =>
      recordOracleReading(cfo, { sourceId, subjectCode: `USD-TZS-${RUN}`, valueBps: 1, decimals: 8, observedAt: iso(30), asOf: iso(30) }, CTX),
    );
  });

  it("re-evaluates posture at read time, so suspending a source invalidates its history", async () => {
    const subject = `USD-TZS-${RUN}`;
    const before = await readOraclePosture(cfo, { feed: "FX_RATE", subjectCode: subject, asOf: iso(31) });
    expect(before.candidates).toHaveLength(2);
    // The newest reading is quarantined (400 bps against its own predecessor,
    // outside the 50 bps source bound); the older one is still recorded. The read
    // model reports both honestly and never silently promotes the older one:
    // `bestIsUsable` is what an executor consumes, and it is false.
    expect(before.bestIsUsable).toBe(false);
    expect(before.candidates[0].usable).toBe(false);
    expect(before.candidates[0].findings.join(" ")).toMatch(/quarantined, not adopted|deviation limit/);
    expect(before.candidates[1].usable).toBe(true);
    expect(before.candidates.every((c: { grantsAuthority: boolean }) => c.grantsAuthority)).toBe(false);

    const clean = await recordOracleReading(cfo, { sourceId, subjectCode: `CLEAN-${RUN}`, valueBps: 2_600_000_000, decimals: 8, observedAt: iso(-5), asOf: iso(0) }, CTX);
    expect(clean.usable).toBe(true);
    expect((await readOraclePosture(cfo, { feed: "FX_RATE", subjectCode: `CLEAN-${RUN}`, asOf: iso(0) })).anyUsable).toBe(true);

    await upsertOracleSource(
      cfo,
      { code: CODE, displayName: "Governed FX primary", feed: "FX_RATE", sourceKind: "AUTHORITATIVE_PRIMARY", deviationLimitBps: 50, maxAgeSeconds: 600, authorityRef: "gov/oracle/fx-1", state: "SUSPENDED" },
      CTX,
    );
    const after = await readOraclePosture(cfo, { feed: "FX_RATE", subjectCode: `CLEAN-${RUN}`, asOf: iso(0) });
    expect(after.anyUsable).toBe(false);
    expect(after.candidates[0].findings.join(" ")).toMatch(/Source is SUSPENDED/);
    // The stored row still says usable=true: the source state, not a rewrite, is
    // what refused it — history is never edited to match a present-day decision.
    const [row] = await db.select().from(blockchainOracleReadings).where(eq(blockchainOracleReadings.id, clean.id));
    expect(row.usable).toBe(true);

    await upsertOracleSource(
      cfo,
      { code: CODE, displayName: "Governed FX primary", feed: "FX_RATE", sourceKind: "AUTHORITATIVE_PRIMARY", deviationLimitBps: 50, maxAgeSeconds: 600, authorityRef: "gov/oracle/fx-1", state: "ACTIVE" },
      CTX,
    );
  });

  it("refuses readings from a non-active source and from outside the scope", async () => {
    await upsertOracleSource(
      cfo,
      { code: CODE, displayName: "Governed FX primary", feed: "FX_RATE", sourceKind: "AUTHORITATIVE_PRIMARY", deviationLimitBps: 50, maxAgeSeconds: 600, authorityRef: "gov/oracle/fx-1", state: "DISQUALIFIED" },
      CTX,
    );
    await expectRefused("INVALID_STATE", () =>
      recordOracleReading(cfo, { sourceId, subjectCode: `NOPE-${RUN}`, valueBps: 1, decimals: 8, observedAt: iso(0), asOf: iso(0) }, CTX),
    );
    await upsertOracleSource(
      cfo,
      { code: CODE, displayName: "Governed FX primary", feed: "FX_RATE", sourceKind: "AUTHORITATIVE_PRIMARY", deviationLimitBps: 50, maxAgeSeconds: 600, authorityRef: "gov/oracle/fx-1", state: "ACTIVE" },
      CTX,
    );
    await expectRefused("NOT_FOUND", () => recordOracleReading(outsider, { sourceId, subjectCode: "X", valueBps: 1, decimals: 8, observedAt: iso(0) }, CTX));
  });
});

describe("observed token positions and reconciliation", () => {
  it("attributes holders only from the approved party address, and never claims authority", async () => {
    const contract = await createContractRecord(
      cfo,
      {
        code: CONTRACT_CODE,
        title: "Blockchain service probe contract",
        typeCode: "SERVICE",
        contractValue: 25_000_000,
        currencyCode: "TZS",
        governingLawJurisdictionCode: "TZ",
        classification: "CONFIDENTIAL",
      },
      CTX,
    );
    contractId = contract.id;
    await upsertContractParty(
      cfo,
      {
        partyId: fixedId(ID_PREFIX.party, "DAUDI_MOSHI"),
        counterpartyKind: "SUPPLIER",
        approvedBlockchainAddress: ADDR,
        blockchainAddressEvidenceRef: "doc/kyc/address-1",
        sanctionsResult: "CLEAN",
        sanctionsScreenedOn: day,
        kycState: "VERIFIED",
        asOfDate: day,
      },
      CTX,
    );

    const recorded = await recordTokenPositions(
      cfo,
      {
        chainId: 11155111,
        tokenSymbol: `BEYU-EQ-${RUN}`,
        decimals: 0,
        sharesPerUnit: "1",
        positions: [
          { holderAddress: ADDR.toUpperCase().replace("0X", "0x"), balanceUnits: 1000, lastSyncedBlock: 100, chainHeadBlock: 101 },
          { holderAddress: OTHER, balanceUnits: 400, lastSyncedBlock: 100, chainHeadBlock: 101 },
        ],
        note: `probe ${RUN}`,
      },
      CTX,
    );
    expect(recorded).toMatchObject({ count: 2, unknownHolders: 1 });

    const rows = await db
      .select()
      .from(blockchainTokenPositions)
      .where(and(eq(blockchainTokenPositions.tenantId, cfo.tenantId), eq(blockchainTokenPositions.tokenSymbol, `BEYU-EQ-${RUN}`)));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.authoritative === false)).toBe(true);
    const attributed = rows.find((r) => r.holderAddress === ADDR);
    expect(attributed?.holderPartyId).toBeTruthy();
    expect(attributed?.state).toBe("ACTIVE");
    expect(rows.find((r) => r.holderAddress === OTHER)?.state).toBe("UNKNOWN_HOLDER");

    // Replay: positions are a snapshot, so a re-index is an update, not a second row.
    await recordTokenPositions(
      cfo,
      { chainId: 11155111, tokenSymbol: `BEYU-EQ-${RUN}`, positions: [{ holderAddress: ADDR, balanceUnits: 1200, lastSyncedBlock: 105, chainHeadBlock: 105 }] },
      CTX,
    );
    const after = await db
      .select()
      .from(blockchainTokenPositions)
      .where(and(eq(blockchainTokenPositions.tenantId, cfo.tenantId), eq(blockchainTokenPositions.tokenSymbol, `BEYU-EQ-${RUN}`)));
    expect(after).toHaveLength(2);
    expect(after.find((r) => r.holderAddress === ADDR)?.balanceUnits).toBe(1200);
  });

  it("writes a run with findings and mutates neither side", async () => {
    const run = await runReconciliation(cfo, { code: CODE, networkKey: "sepolia", tokenSymbol: `BEYU-EQ-${RUN}`, asOfDate: day, toleranceUnits: 0, staleBlockTolerance: 25, note: `probe ${RUN}` }, CTX);
    runId = run.id;
    expect(run.status).not.toBe("MATCHED");
    expect(run.findingCount).toBeGreaterThan(0);
    const [row] = await db.select().from(blockchainReconciliationRuns).where(eq(blockchainReconciliationRuns.id, runId));
    expect(row.mutatesState).toBe(false);
    const codes = (row.findings as Array<{ code: string }>).map((f) => f.code);
    expect(codes).toContain("UNKNOWN_HOLDER");
    // A run is a successful observation of a disagreement: no canonical row moved.
    const [party] = await db
      .select({ address: contractParties.approvedBlockchainAddress, evidence: contractParties.blockchainAddressEvidenceRef })
      .from(contractParties)
      .where(and(eq(contractParties.tenantId, cfo.tenantId), eq(contractParties.partyId, fixedId(ID_PREFIX.party, "DAUDI_MOSHI"))));
    expect(party.address).toBe(ADDR);
    expect(party.evidence).toBe("doc/kyc/address-1");
    await expectRefused("CONFLICT", () => runReconciliation(cfo, { code: CODE, networkKey: "sepolia", asOfDate: day }, CTX));
  });
});

describe("anchors: evidence is earned, and degrades honestly", () => {
  it("computes a 32-byte content hash and a matching EIP-712 commitment", async () => {
    const content = { contract: CONTRACT_CODE, party: "PTY_DAUDI_MOSHI", valueMajor: 25_000_000, currencyCode: "TZS" };
    const anchor = await createAnchor(
      cfo,
      {
        anchorType: "CONTRACT",
        contractId,
        content,
        method: "EVM_TRANSACTION_CALLDATA",
        networkKey: "sepolia",
        anchorContractAddress: ADDR,
        txHash: H32("11"),
        blockNumber: 100,
        signerRef: "custody/treasury-multisig",
        note: `probe ${RUN}`,
      },
      CTX,
    );
    anchorId = anchor.id;
    expect(anchor.contentHash).toBe(sha256Hex(stableStringify(content)));
    expect(anchor.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(anchor.commitment).toMatch(/^0x[0-9a-f]{64}$/);
    expect(anchor.status).toBe("RECORDED");
  });

  it("will not verify without registry listing, depth and a matching commitment", async () => {
    const shallow = await verifyAnchor(cfo, { anchorId, latestBlock: 101, blockHashMatchesChain: true }, CTX);
    expect(shallow.verified).toBe(false);
    expect(shallow.findings.join(" ")).toMatch(/Only 2 confirmation/);
    expect(shallow.findings.join(" ")).toMatch(/not present in the smart-contract registry/);
    const [stillRecorded] = await db.select({ status: blockchainAnchors.status }).from(blockchainAnchors).where(eq(blockchainAnchors.id, anchorId));
    expect(stillRecorded.status).toBe("RECORDED");
  });

  it("verifies once the contract is registered and the chain has finalised", async () => {
    const registry = await upsertRegistryRecord(
      cfo,
      {
        name: `Governor ${RUN}`,
        networkKey: "sepolia",
        address: ADDR,
        compilerVersion: "0.8.26",
        sourceCommit: "a".repeat(40),
        abiHash: H32("aa"),
        bytecodeHash: H32("bb"),
        legalReviewStatus: "REQUIRES_LEGAL_REVIEW",
        riskClassificationCode: "MEDIUM",
      },
      CTX,
    );
    expect(registry.status).toBe("DRAFT");
    for (const to of ["AUDIT_PENDING", "APPROVED_TESTNET", "DEPLOYED_TESTNET", "VERIFIED_TESTNET"] as const) {
      await transitionRegistryRecord(cfo, { registryId: registry.id, to, evidenceRef: `evidence/${to}` }, CTX);
    }
    const verified = await verifyAnchor(cfo, { anchorId, latestBlock: 110, blockHashMatchesChain: true, blockHash: H32("33") }, CTX);
    expect(verified).toMatchObject({ verified: true, status: "VERIFIED", confirmations: 11 });
    expect(verified.findings).toEqual([]);
  });

  it("records a contradicted anchor without inventing a revocation", async () => {
    const degraded = await verifyAnchor(cfo, { anchorId, latestBlock: 110, blockHashMatchesChain: false }, CTX);
    expect(degraded.verified).toBe(false);
    // Status is a governed act; verification only ever promotes. The contradiction
    // is recorded as evidence-state instead, and that is what consumers must read.
    expect(degraded.status).toBe("VERIFIED");
    const [row] = await db
      .select({ status: blockchainAnchors.status, matches: blockchainAnchors.blockHashMatchesChain, verification: blockchainAnchors.verification })
      .from(blockchainAnchors)
      .where(eq(blockchainAnchors.id, anchorId));
    expect(row.status).toBe("VERIFIED");
    expect(row.matches).toBe(false);
    expect(JSON.stringify(row.verification)).toMatch(/reorg/);
    // The execution gate closes again even though the row still says VERIFIED.
    const posture = await readExecutionPosture(cfo, {
      contractId,
      networkKey: "sepolia",
      packageState: "EXECUTABLE",
      multisigApproved: true,
      timelockReady: true,
      contractAddress: ADDR,
    });
    expect(posture.blockedBy).toContain("EVIDENCE_NOT_RECORDED");
    expect(posture.verifiedAnchors).toBe(0);
    expect(posture.contradictedAnchors).toBe(1);
  });

  it("refuses to anchor an unknown network or a foreign contract", async () => {
    await expectRefused("RULE_VIOLATION", () =>
      createAnchor(cfo, { anchorType: "CONTRACT", content: { a: 1 }, method: "EVM_LOG_INDEXED", networkKey: "unknownnet", note: `probe ${RUN}` }, CTX),
    );
    await expectRefused("NOT_FOUND", () =>
      createAnchor(outsider, { anchorType: "CONTRACT", contractId, content: { a: 1 }, method: "BEYU_HASH_CHAIN_ONLY", note: `probe ${RUN}` }, CTX),
    );
  });
});

describe("execution posture and authority", () => {
  it("lists precisely which governed gates are still closed", async () => {
    const posture = await readExecutionPosture(cfo, {
      contractId,
      networkKey: "sepolia",
      packageState: "EXECUTABLE",
      multisigApproved: true,
      timelockReady: true,
      contractAddress: ADDR,
    });
    expect(posture.permitted).toBe(false);
    // The contract lifecycle has not begun performance — that gate is the
    // contract's own, and no amount of chain evidence can open it. Everything the
    // blockchain side can satisfy IS satisfied here: registered and verified on
    // testnet, an anchor with matched evidence.
    // Two gates, for two different reasons, and the read model says so: the
    // contract's own lifecycle has not begun performance (no chain evidence can
    // open that), and the anchor row says VERIFIED while its last check
    // contradicted the chain, so it is not evidence right now.
    expect(posture.blockedBy).toEqual(["CONTRACT_LIFECYCLE_NOT_PERFORMING", "EVIDENCE_NOT_RECORDED"]);
    expect(posture.registryStatus).toBe("VERIFIED_TESTNET");
    expect(posture.blockedBy).not.toContain("SMART_CONTRACT_NOT_VERIFIED_IN_REGISTRY");
    expect(posture.verifiedAnchors).toBe(0);
    expect(posture.contradictedAnchors).toBe(1);
    expect(posture.network).toMatchObject({ key: "sepolia", production: false });
  });

  it("refuses a production package that lacks the multisig/timelock pair", async () => {
    const posture = await readExecutionPosture(cfo, { contractId, networkKey: "ethereum", packageState: "EXECUTABLE", multisigApproved: false, timelockReady: false });
    expect(posture.blockedBy).toContain("MULTISIG_APPROVAL_MISSING");
    expect(posture.blockedBy).toContain("TIMELOCK_NOT_READY");
    expect(posture.network).toMatchObject({ production: true, chainId: 1 });
  });

  it("DENIES without the permission and without the tenant scope", async () => {
    await expectRefused("FORBIDDEN", () =>
      upsertOracleSource(ceo, { code: `${CODE}-CEO`, displayName: "CEO attempt", feed: "FX_RATE", sourceKind: "OPEN_DATA" }, CTX),
    );
    // No contract reference means nothing to look up, so the permission check is
    // what refuses — and it refuses without confirming the caller could ever act.
    await expectRefused("FORBIDDEN", () => createAnchor(outsider, { anchorType: "POLICY_SET", content: { a: 1 }, method: "BEYU_HASH_CHAIN_ONLY" }, CTX));
    // A contract outside the caller's scope is not readable at all: the posture
    // read model would otherwise leak lifecycle state through gate names.
    // A contract outside the caller's scope is not readable at all (the posture
    // read model would otherwise leak lifecycle state through its gate names).
    // Any of these refusals is correct, and none of them enumerates the record.
    let postureCode = "NONE";
    try {
      await readExecutionPosture(outsider, { contractId, networkKey: "sepolia", packageState: "READY" });
    } catch (e) {
      postureCode = (e as ContractError).code;
    }
    expect(["NOT_FOUND", "FORBIDDEN", "TENANT_SCOPE_DENIED"]).toContain(postureCode);
  });

  it("keeps the audit chain intact across every governed mutation above", async () => {
    const rows = async (text: ReturnType<typeof sql>) =>
      ((await db.execute(text)) as unknown as { rows: Array<Record<string, number>> }).rows;
    expect(Number((await rows(sql`select count(*)::int as n from audit_log where trace_id = ${CTX.traceId}`))[0].n)).toBeGreaterThan(10);
    // Every governed mutation in this file audited under one trace, and the
    // append-only chain still verifies afterwards.
    expect(Number((await rows(sql`select count(*)::int as n from enterprise_events where correlation_id = ${CTX.traceId}`))[0].n)).toBeGreaterThan(10);
    await expect(verifyAuditChain()).resolves.toMatchObject({ verified: true });
  });
});
