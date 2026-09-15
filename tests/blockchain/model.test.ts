/**
 * Governed blockchain capability — pure engine rules (spec §31–§34, §39–§43).
 *
 * These engines are the ONLY place the domain's rules live: services may call
 * them, never re-implement them, and the HTTP layer may not supply a verdict. The
 * properties pinned here are the ones that make the capability safe to run at all:
 *
 *   - verification is earned, never asserted (an anchor needs chain evidence,
 *     confirmation depth and a matching commitment; a missing input is a refusal);
 *   - an oracle reading never grants authority, and every axis of doubt
 *     (staleness, deviation, future-dating, missing authority reference, open
 *     dispute, non-authoritative source kind) removes usability rather than
 *     "defaulting to acceptable";
 *   - indexed events are deduplicated and anomalies are findings — a reorg or a
 *     gap is reported, never auto-healed — and a payload carrying document text or
 *     key material is rejected outright;
 *   - reconciliation is read-only: `mutatesState` is structurally false, a
 *     discrepancy is a HIGH finding for a human, and a stale chain view refuses
 *     the comparison instead of trusting the older number;
 *   - testnet-first progression is structural for registry records, and
 *     production execution additionally requires the multisig/timelock pair.
 */

import { describe, expect, it } from "vitest";
import {
  evaluateAnchor,
  evaluateAnchorTransition,
  evaluateExecutionGates,
  evaluateExecutionPackageTransition,
  evaluateOracleReading,
  eventKey,
  networkByKey,
  reconcileOwnership,
  validateIndexedEvent,
  validateRegistryRecord,
  evaluateRegistryTransition,
  RECONCILIATION_FINDINGS,
  type IndexedEvent,
  type OracleReadingInput,
} from "../../src/lib/blockchain/model";
import { ContractModelError } from "../../src/lib/contracts/pure";

const H32 = (b: string) => `0x${b.repeat(32)}`;
const ADDR = "0x1f9843a9748f189e1e0ce875be2a1a1a1a1a1a1a";
const OTHER = "0x2f9843a9748f189e1e0ce875be2a1a1a1a1a1a1a";
const T0 = "2026-09-15T12:00:00Z";
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();

describe("network catalogue", () => {
  it("is the single source for chain id, production flag and finality depth", () => {
    expect(networkByKey("sepolia")).toMatchObject({ chainId: 11155111, production: false });
    expect(networkByKey("ethereum")).toMatchObject({ production: true });
    expect(networkByKey("ethereum").requiredConfirmations).toBeGreaterThan(networkByKey("sepolia").requiredConfirmations);
  });

  it("refuses an unknown network instead of defaulting to something safe-sounding", () => {
    expect(() => networkByKey("holesky")).toThrow();
  });
});

describe("anchor verification", () => {
  const anchor = {
    networkKey: "sepolia",
    chainId: 11155111,
    txHash: H32("11"),
    blockNumber: 100,
    latestBlock: 105,
    blockHashMatchesChain: true,
    contentHash: H32("ab"),
    expectedCommitment: H32("cd"),
    recordedCommitment: H32("cd"),
    status: "VERIFIED" as const,
    contractAddress: ADDR,
    registryListed: true,
  };

  it("verifies only with complete, deep-enough, matching evidence", () => {
    const r = evaluateAnchor(anchor);
    expect(r).toEqual({ verified: true, findings: [], confirmations: 6, requiredConfirmations: 3, commitmentMatches: true });
  });

  it("is reachable: a freshly recorded anchor verifies from its chain evidence", () => {
    // Regression: `verified` used to require the row to ALREADY be VERIFIED, so
    // no anchor could ever become one — which in turn made the execution gate
    // "EVIDENCE_NOT_RECORDED" unsatisfiable.
    const r = evaluateAnchor({ ...anchor, status: "RECORDED" });
    expect(r.verified).toBe(true);
    expect(evaluateAnchor({ ...anchor, status: "PENDING" }).verified).toBe(true);
  });

  it("refuses a closed commitment as live evidence", () => {
    for (const status of ["REVOKED", "SUPERSEDED"] as const) {
      const r = evaluateAnchor({ ...anchor, status });
      expect(r.verified, status).toBe(false);
      expect(r.findings.join(" ")).toMatch(/closed commitment is not live evidence/);
    }
  });

  it("keeps a contradicted anchor on the record instead of quietly rewriting it", () => {
    // Verification never DEMOTES: a reorg or commitment drift is recorded as
    // findings and a contradiction on the row (and consumed as such by the
    // execution posture), because "the evidence no longer supports this" is not
    // the same statement as "this commitment was revoked". Demotion is a separate
    // governed act — REVOKE or SUPERSEDE — and a closed commitment never reopens.
    expect(() => evaluateAnchorTransition("VERIFIED", "FAILED")).toThrowError(ContractModelError);
    expect(evaluateAnchorTransition("VERIFIED", "REVOKED")).toBe(true);
    expect(evaluateAnchorTransition("VERIFIED", "SUPERSEDED")).toBe(true);
    expect(evaluateAnchorTransition("PENDING", "FAILED")).toBe(true);
    expect(evaluateAnchorTransition("FAILED", "PENDING")).toBe(true);
    expect(() => evaluateAnchorTransition("REVOKED", "PENDING")).toThrowError(ContractModelError);
    expect(() => evaluateAnchorTransition("SUPERSEDED", "VERIFIED")).toThrowError(ContractModelError);
  });

  it("refuses a cross-chain mismatch", () => {
    const r = evaluateAnchor({ ...anchor, chainId: 1 });
    expect(r.verified).toBe(false);
    expect(r.findings.join(" ")).toMatch(/cross-chain mismatch/);
  });

  it("counts confirmations inclusively and refuses a shallow anchor", () => {
    expect(evaluateAnchor({ ...anchor, latestBlock: 102 }).confirmations).toBe(3);
    const shallow = evaluateAnchor({ ...anchor, latestBlock: 101 });
    expect(shallow.verified).toBe(false);
    expect(shallow.findings.join(" ")).toMatch(/Only 2 confirmation\(s\)/);
  });

  it("treats an unobserved chain head as unknown depth, not as final", () => {
    const r = evaluateAnchor({ ...anchor, latestBlock: null });
    expect(r.verified).toBe(false);
    expect(r.findings.join(" ")).toMatch(/Chain head not observed/);
  });

  it("reports a block-hash mismatch as a reorg candidate and never heals it", () => {
    const r = evaluateAnchor({ ...anchor, blockHashMatchesChain: false });
    expect(r.verified).toBe(false);
    expect(r.findings.join(" ")).toMatch(/reorg/i);
  });

  it("requires the recomputed commitment to match the stored one", () => {
    const r = evaluateAnchor({ ...anchor, expectedCommitment: H32("ee") });
    expect(r.commitmentMatches).toBe(false);
    expect(r.verified).toBe(false);
    expect(r.findings.join(" ")).toMatch(/Recomputed commitment does not match/);
  });

  it("refuses a malformed content hash before anything else", () => {
    const r = evaluateAnchor({ ...anchor, contentHash: "0xdeadbeef" });
    expect(r.findings).toEqual(["contentHash is not a 32-byte digest."]);
    expect(r.verified).toBe(false);
  });

  it("refuses evidence from a contract that is not registered", () => {
    const r = evaluateAnchor({ ...anchor, registryListed: false });
    expect(r.findings.join(" ")).toMatch(/not present in the smart-contract registry/);
  });

  it("refuses an unsupported network outright", () => {
    const r = evaluateAnchor({ ...anchor, networkKey: "unknown-chain" });
    expect(r.verified).toBe(false);
    expect(r.requiredConfirmations).toBe(0);
    expect(r.findings.join(" ")).toMatch(/anchoring is refused/i);
  });

  it("does not require a transaction reference on a local network, but says so", () => {
    const r = evaluateAnchor({
      ...anchor,
      networkKey: "local-anvil",
      chainId: 31337,
      txHash: null,
      blockNumber: 1,
      latestBlock: 2,
      status: "VERIFIED",
    });
    expect(r.findings.join(" ")).toMatch(/test\/fixture evidence only/);
    expect(r.verified).toBe(false);
  });
});

describe("oracle reading evaluation", () => {
  const reading = (over: Partial<OracleReadingInput> = {}): OracleReadingInput => ({
    feed: "FX_RATE",
    valueBps: 2_600_000_000,
    decimals: 8,
    sourceKind: "AUTHORITATIVE_PRIMARY",
    authorityRef: "gov/oracle/fx-1",
    observedAt: T0,
    asOf: T0,
    ...over,
  });

  it("accepts a fresh, sourced reading — and still grants no authority", () => {
    const r = evaluateOracleReading(reading());
    expect(r).toMatchObject({ status: "CURRENT", usable: true, grantsAuthority: false, ageSeconds: 0, deviationBps: null });
  });

  it("degrades on freshness: stale, then expired", () => {
    const stale = evaluateOracleReading(reading({ observedAt: at(-3_700), asOf: T0 }));
    expect(stale.status).toBe("STALE");
    expect(stale.usable).toBe(false);
    const expired = evaluateOracleReading(reading({ observedAt: at(-4 * 3_600 - 1), asOf: T0 }));
    expect(expired.status).toBe("EXPIRED");
    expect(expired.usable).toBe(false);
  });

  it("refuses a reading newer than the decision instant", () => {
    const r = evaluateOracleReading(reading({ observedAt: at(60), asOf: T0 }));
    expect(r.usable).toBe(false);
    expect(r.findings.join(" ")).toMatch(/future-dated/);
  });

  it("quarantines a deviating reading and adopts a drift inside the limit", () => {
    const jumped = evaluateOracleReading(reading({ previousValueBps: 2_500_000_000 }));
    expect(jumped.deviationBps).toBe(400);
    expect(jumped.usable).toBe(false);
    expect(jumped.findings.join(" ")).toMatch(/quarantined, not adopted/);
    const drifting = evaluateOracleReading(reading({ previousValueBps: 2_600_000_000, valueBps: 2_600_100_000 }));
    expect(drifting.deviationBps).toBe(0);
    expect(drifting.usable).toBe(true);
  });

  it("lets external disagreement outrank the feed", () => {
    const r = evaluateOracleReading(reading({ disputeOpen: true }));
    expect(r.status).toBe("DISPUTED");
    expect(r.usable).toBe(false);
  });

  it("requires an authority reference for every kind that must carry one", () => {
    for (const sourceKind of ["AUTHORITATIVE_PRIMARY", "ONCHAIN_PUSH", "MANUAL_EVIDENCE"] as const) {
      const r = evaluateOracleReading(reading({ sourceKind, authorityRef: null }));
      expect(r.usable, sourceKind).toBe(false);
    }
    // A manual reading WITH an evidence reference is admissible as evidence and
    // still not as authority.
    const manual = evaluateOracleReading(reading({ sourceKind: "MANUAL_EVIDENCE", authorityRef: "doc/verification/9" }));
    expect(manual.usable).toBe(true);
    expect(manual.grantsAuthority).toBe(false);
  });

  it("never lets an open-data source trigger a settlement", () => {
    const r = evaluateOracleReading(reading({ sourceKind: "OPEN_DATA" }));
    expect(r.usable).toBe(false);
    expect(r.findings.join(" ")).toMatch(/monitoring only/);
  });

  it("refuses a value it cannot interpret", () => {
    expect(evaluateOracleReading(reading({ valueBps: null })).findings.join(" ")).toMatch(/No numeric value/);
    expect(evaluateOracleReading(reading({ valueBps: -1 })).usable).toBe(false);
    expect(evaluateOracleReading(reading({ decimals: 40 })).usable).toBe(false);
    // A text feed needs no numeric value at all.
    const text = evaluateOracleReading(reading({ valueBps: null, valueText: "DELIVERED-OK", feed: "DELIVERY_ACCEPTANCE" }));
    expect(text.usable).toBe(true);
  });

  it("refuses unverifiable timestamps before evaluating anything", () => {
    const r = evaluateOracleReading(reading({ observedAt: "not-a-date" }));
    expect(r.status).toBe("INVALID");
    expect(r.usable).toBe(false);
    expect(r.ageSeconds).toBeNull();
    expect(r.findings.join(" ")).toMatch(/not valid instants/);
    expect(r.note).toMatch(/Rejected before evaluation/);
  });

  it("applies a zero-tolerance limit to boolean/attestation feeds", () => {
    // MILESTONE_COMPLETION has a 0 bps deviation limit: any numeric movement at
    // all is a contradiction, not a rounding question.
    const r = evaluateOracleReading(
      reading({ feed: "MILESTONE_COMPLETION", previousValueBps: 10_000, valueBps: 10_001 }),
    );
    expect(r.usable).toBe(false);
  });
});

describe("indexed event ingestion", () => {
  const event = (over: Partial<IndexedEvent> = {}): IndexedEvent => ({
    chainId: 11155111,
    contractAddress: ADDR,
    blockNumber: 101,
    blockHash: H32("33"),
    transactionHash: H32("44"),
    logIndex: 0,
    eventKind: "ANCHOR_COMMITTED",
    emittedAt: T0,
    actorAddress: OTHER,
    payload: { to: OTHER, valueUnits: 10 },
    registryKnown: true,
    actorAuthorized: true,
    ...over,
  });
  const empty = { lastBlockByChain: {}, seenLogKeys: [] as string[] };

  it("accepts a clean event without creating authority", () => {
    const r = validateIndexedEvent(event(), empty);
    expect(r).toEqual({ accepted: true, deduplicated: false, findings: [], createsAuthority: false });
  });

  it("deduplicates by (chain, tx, logIndex) using a deterministic key", () => {
    const key = eventKey(11155111, H32("44"), 0);
    expect(key).toBe(eventKey(11155111, `0x${"44".repeat(32).toUpperCase()}`, 0));
    expect(key).not.toBe(eventKey(11155111, H32("44"), 1));
    const r = validateIndexedEvent(event(), { ...empty, seenLogKeys: [key] });
    expect(r.deduplicated).toBe(true);
    expect(r.accepted).toBe(false);
    expect(r.findings.join(" ")).toMatch(/recorded as duplicate, not re-applied/);
  });

  it("reports gaps, out-of-order blocks and reorg candidates instead of repairing them", () => {
    const lastBlockByChain = { 11155111: { blockNumber: 100, blockHash: H32("33") } };
    expect(validateIndexedEvent(event({ blockNumber: 105 }), { ...empty, lastBlockByChain }).findings.join(" ")).toMatch(/Gap: 100 → 105/);
    expect(validateIndexedEvent(event({ blockNumber: 99 }), { ...empty, lastBlockByChain }).findings.join(" ")).toMatch(/reorg or out-of-order/);
    expect(
      validateIndexedEvent(event({ blockNumber: 100, blockHash: H32("34") }), { ...empty, lastBlockByChain }).findings.join(" "),
    ).toMatch(/reorg candidate/);
  });

  it("refuses an event that cannot be attributed to a governed contract or actor", () => {
    expect(validateIndexedEvent(event({ registryKnown: false }), empty).findings.join(" ")).toMatch(/not registered/);
    expect(validateIndexedEvent(event({ actorAuthorized: false }), empty).findings.join(" ")).toMatch(/outside the governed allowance/);
    expect(
      validateIndexedEvent(event({ allowedActorAddresses: [ADDR] }), empty).findings.join(" "),
    ).toMatch(/not in the allowance list/);
  });

  it("rejects malformed shapes and confidential payloads", () => {
    const r = validateIndexedEvent(
      event({ contractAddress: "0x123", transactionHash: "nope", blockNumber: -2, logIndex: 1.5, emittedAt: "yesterday", eventKind: "MYSTERY" as never }),
      empty,
    );
    const text = r.findings.join(" ");
    expect(text).toMatch(/Unknown event kind/);
    expect(text).toMatch(/Contract address is malformed/);
    expect(text).toMatch(/Transaction or block hash is malformed/);
    expect(text).toMatch(/Block number must be a non-negative integer/);
    expect(text).toMatch(/Log index must be a non-negative integer/);
    expect(text).toMatch(/emittedAt is not a valid instant/);
    expect(r.accepted).toBe(false);
    const leaky = validateIndexedEvent(event({ payload: { content: "the whole agreement", privateKey: "0x01" } }), empty);
    expect(leaky.findings.join(" ")).toMatch(/must never be indexed or published/);
    expect(leaky.findings).toHaveLength(2);
  });
});

describe("reconciliation (read-only by construction)", () => {
  const canonical = { holderPartyId: "PTY_HOLDER", shareClassCode: "ORD-A", shares: 1000, vestedShares: 600, approvedAddress: ADDR };
  const observed = { holderAddress: ADDR, tokenSymbol: "BEYU-EQ", balanceUnits: 1000, lastSyncedBlock: 100, chainHeadBlock: 101, sourceRegistryId: "SCR_1" };

  it("matches within tolerance and never mutates state", () => {
    const r = reconcileOwnership({ canonical: [canonical], onChain: [observed], sharesPerUnit: 1, toleranceUnits: 0 });
    expect(r.status).toBe("MATCHED");
    expect(r.findings).toEqual([]);
    expect(r.totals).toEqual({ canonical: 1000, onChain: 1000, delta: 0 });
    expect(r.mutatesState).toBe(false);
    expect(RECONCILIATION_FINDINGS).toContain("STALE_BLOCKCHAIN_STATE");
  });

  it("tolerates the configured unit noise and reports beyond it", () => {
    const within = reconcileOwnership({ canonical: [canonical], onChain: [{ ...observed, balanceUnits: 1005 }], sharesPerUnit: 1, toleranceUnits: 10 });
    expect(within.status).toBe("MATCHED");
    const beyond = reconcileOwnership({ canonical: [canonical], onChain: [{ ...observed, balanceUnits: 1500 }], sharesPerUnit: 1, toleranceUnits: 10 });
    expect(beyond.status).toBe("UNRECONCILED");
    expect(beyond.findings.map((f) => f.code)).toContain("TOKEN_BALANCE_MISMATCH");
    expect(beyond.findings.map((f) => f.code)).toContain("CAP_TABLE_MISMATCH");
    expect(beyond.perHolder[0]).toMatchObject({ delta: 500, findings: ["TOKEN_BALANCE_MISMATCH"] });
  });

  it("refuses to compare against a chain view that is not current", () => {
    const r = reconcileOwnership({
      canonical: [canonical],
      onChain: [{ ...observed, lastSyncedBlock: 50, chainHeadBlock: 101 }],
      sharesPerUnit: 1,
      staleBlockTolerance: 25,
    });
    expect(r.findings.map((f) => f.code)).toContain("STALE_BLOCKCHAIN_STATE");
    expect(r.findings.find((f) => f.code === "STALE_BLOCKCHAIN_STATE")?.detail).toMatch(/comparison refused as authoritative/);
  });

  it("reports a below-vested representation and a missing on-chain balance", () => {
    const vested = reconcileOwnership({ canonical: [canonical], onChain: [{ ...observed, balanceUnits: 500 }], sharesPerUnit: 1 });
    expect(vested.findings.map((f) => f.code)).toContain("VESTING_MISMATCH");
    const absent = reconcileOwnership({ canonical: [canonical], onChain: [], sharesPerUnit: 1 });
    expect(absent.findings.map((f) => f.code)).toContain("OWNERSHIP_MISMATCH");
  });

  it("names unattributable holders without inventing a party", () => {
    const r = reconcileOwnership({
      canonical: [],
      onChain: [{ ...observed, holderAddress: OTHER, sourceRegistryId: "SCR_1" }],
      sharesPerUnit: 1,
    });
    expect(r.status).toBe("RECONCILED_WITH_FINDINGS");
    expect(r.findings[0]).toMatchObject({ code: "UNKNOWN_HOLDER", severity: "MEDIUM" });
    expect(r.findings[0].detail).toContain(OTHER);
    expect(r.perHolder).toEqual([]);
  });

  it("treats an unauthorized transfer as a HIGH finding and merges case-insensitive addresses", () => {
    const r = reconcileOwnership({
      canonical: [],
      onChain: [
        { ...observed, holderAddress: OTHER, sourceRegistryId: "SCR_1", balanceUnits: 100 },
        { ...observed, holderAddress: OTHER.toUpperCase().replace("0X", "0x"), sourceRegistryId: "SCR_1", balanceUnits: 50 },
      ],
      sharesPerUnit: 1,
      transferEvents: [{ from: OTHER, to: ADDR, valueUnits: 75, blockNumber: 101, authorized: false }],
    });
    expect(r.findings.map((f) => f.code)).toContain("UNAUTHORIZED_TRANSFER");
    expect(r.findings.find((f) => f.code === "UNAUTHORIZED_TRANSFER")?.severity).toBe("HIGH");
    // Both observations are the same holder: totals merge, they are not two holders.
    expect(r.findings.filter((f) => f.code === "UNKNOWN_HOLDER")).toHaveLength(1);
  });

  it("flags an unattributable on-chain position even when the holder is known", () => {
    const r = reconcileOwnership({
      canonical: [canonical],
      onChain: [{ ...observed, sourceRegistryId: null }],
      sharesPerUnit: 1,
    });
    expect(r.findings.map((f) => f.code)).toContain("UNKNOWN_HOLDER");
    expect(r.status).toBe("UNRECONCILED");
  });
});

describe("smart-contract registry intake and progression", () => {
  const record = {
    name: "Settlement governor",
    networkKey: "sepolia",
    chainId: 11155111,
    address: ADDR,
    compilerVersion: "0.8.26",
    abiHash: H32("aa"),
    bytecodeHash: H32("bb"),
    sourceCommit: "f".repeat(40),
    legalReviewStatus: "REQUIRES_LEGAL_REVIEW",
    riskClassification: "MEDIUM" as const,
  };

  it("accepts a complete testnet record and warns about what is not yet closed", () => {
    const r = validateRegistryRecord(record);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/multisig/);
    expect(r.warnings.join(" ")).toMatch(/not a legal clearance/);
    expect(r.networkProduction).toBe(false);
  });

  it("demands the full control set for a production record", () => {
    const r = validateRegistryRecord({ ...record, networkKey: "ethereum", chainId: 1, abiHash: null, bytecodeHash: null });
    const text = r.errors.join(" ");
    expect(r.errors.length).toBeGreaterThanOrEqual(5);
    expect(text).toMatch(/abiHash is required/);
    expect(text).toMatch(/bytecodeHash is required/);
    expect(text).toMatch(/governing multisig/);
    expect(text).toMatch(/timelock/);
    expect(text).toMatch(/auditStatus is required/);
    expect(r.networkProduction).toBe(true);
  });

  it("pins build provenance: no floating pragma, no abbreviated commit", () => {
    expect(validateRegistryRecord({ ...record, compilerVersion: ">=0.8.0" }).errors.join(" ")).toMatch(/floating pragmas/);
    expect(validateRegistryRecord({ ...record, sourceCommit: "abc1234" }).errors.join(" ")).toMatch(/40-hex git commit SHA/);
    expect(validateRegistryRecord({ ...record, abiHash: "0x01" }).errors.join(" ")).toMatch(/32-byte digest/);
    expect(validateRegistryRecord({ ...record, chainId: 5 }).errors.join(" ")).toMatch(/does not match sepolia/);
  });

  it("binds a proxy to an implementation and an upgrade authority that is not itself", () => {
    const r = validateRegistryRecord({ ...record, proxyKind: "TRANSPARENT" });
    expect(r.errors.join(" ")).toMatch(/implementation address/);
    expect(r.errors.join(" ")).toMatch(/upgrade authority/);
    const self = validateRegistryRecord({ ...record, proxyKind: "UUPS", implementationAddress: OTHER, upgradeAuthority: ADDR });
    expect(self.errors.join(" ")).toMatch(/unrestricted self-upgrade/);
    const named = validateRegistryRecord({ ...record, proxyKind: "UUPS", implementationAddress: OTHER, upgradeAuthority: "board-timelock" });
    expect(named.errors.join(" ")).toMatch(/must be an address/);
  });

  it("enforces testnet-first progression with no shortcut and no revival", () => {
    expect(evaluateRegistryTransition("DRAFT", "AUDIT_PENDING")).toBe(true);
    expect(evaluateRegistryTransition("VERIFIED_TESTNET", "APPROVED_MAINNET")).toBe(true);
    expect(evaluateRegistryTransition("DEPLOYED_MAINNET", "DEPRECATED")).toBe(true);
    expect(evaluateRegistryTransition("DEPRECATED", "COMPROMISED")).toBe(true);
    for (const from of ["DRAFT", "AUDIT_PENDING", "APPROVED_TESTNET", "DEPLOYED_TESTNET"] as const) {
      const err = () => evaluateRegistryTransition(from, "APPROVED_MAINNET");
      expect(err).toThrowError(ContractModelError);
      expect(err).toThrow(/Testnet verification precedes mainnet approval/);
    }
    expect(() => evaluateRegistryTransition("COMPROMISED", "DRAFT")).toThrow(/cannot be revived/);
    expect(() => evaluateRegistryTransition("DEPLOYED_MAINNET", "VERIFIED_TESTNET")).toThrowError(ContractModelError);
  });
});

describe("execution gates for deterministic on-chain execution", () => {
  const gates = {
    contractLifecycleAllows: true,
    state: "EXECUTABLE" as const,
    registryVerified: true,
    oracleUsable: true,
    disputePauses: false,
    multisigApproved: true,
    timelockReady: true,
    evidenceRecorded: true,
    productionNetwork: false,
  };

  it("permits only when every gate is satisfied", () => {
    expect(evaluateExecutionGates(gates)).toEqual({ permitted: true, blockedBy: [], state: "EXECUTABLE" });
  });

  it("names every missing gate rather than a single reason", () => {
    const r = evaluateExecutionGates({
      ...gates,
      contractLifecycleAllows: false,
      registryVerified: false,
      oracleUsable: false,
      disputePauses: true,
      evidenceRecorded: false,
      state: "READY",
    });
    expect(r.permitted).toBe(false);
    expect(r.blockedBy).toEqual([
      "CONTRACT_LIFECYCLE_NOT_PERFORMING",
      "STATE_READY_NOT_EXECUTABLE",
      "SMART_CONTRACT_NOT_VERIFIED_IN_REGISTRY",
      "ORACLE_INPUT_UNUSABLE",
      "OPEN_DISPUTE_PAUSES_EXECUTION",
      "EVIDENCE_NOT_RECORDED",
    ]);
  });

  it("requires the multisig/timelock pair only on a production network", () => {
    const testnet = evaluateExecutionGates({ ...gates, multisigApproved: false, timelockReady: false, productionNetwork: false });
    expect(testnet.permitted).toBe(true);
    const mainnet = evaluateExecutionGates({ ...gates, multisigApproved: false, timelockReady: false, productionNetwork: true });
    expect(mainnet.permitted).toBe(false);
    expect(mainnet.blockedBy).toEqual(["MULTISIG_APPROVAL_MISSING", "TIMELOCK_NOT_READY"]);
  });

  it("has no path from a paused or voided package straight to execution", () => {
    expect(evaluateExecutionPackageTransition("TIMELOCKED", "EXECUTABLE")).toBe(true);
    expect(() => evaluateExecutionPackageTransition("PAUSED", "EXECUTABLE")).toThrowError(ContractModelError);
    expect(() => evaluateExecutionPackageTransition("DRAFT", "EXECUTABLE")).toThrowError(ContractModelError);
    expect(() => evaluateExecutionPackageTransition("EXECUTED", "VOIDED")).toThrow(/cannot move EXECUTED → VOIDED/);
    expect(() => evaluateExecutionPackageTransition("FAILED", "READY")).toThrowError(ContractModelError);
    expect(evaluateExecutionPackageTransition("FAILED", "DRAFT")).toBe(true);
  });
});
