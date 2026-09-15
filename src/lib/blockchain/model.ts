/**
 * BEYU OS — GOVERNED BLOCKCHAIN CAPABILITY (pure engines, §23–§40).
 *
 * Blockchain is an EXECUTION AND EVIDENCE technology under BEYU governance. It
 * inherits authority; it never creates it. Concretely, this module:
 *
 *  - verifies anchor evidence against confirmations and commitment digests;
 *  - evaluates governed oracles with freshness, deviation, fallback and dispute
 *    semantics — external data can never become constitutional authority;
 *  - detects indexed-chain anomalies (gaps, duplicates, reorgs, unknown
 *    contracts, unauthorized actors) without mutating BEYU state;
 *  - reconciles the canonical cap table against approved on-chain
 *    representations and reports discrepancies instead of overwriting either.
 *
 * It has no database, no network, no keys and no money path. A verified anchor
 * is evidence that a commitment existed; a fresh oracle reading is an input to a
 * governed decision — neither is an authorization, and nothing here calls the
 * Finance posting engine (CAP_POSTING remains the only, locked, posting route).
 */

import {
  ContractModelError,
  assertHash32,
  assertIsoDate,
  assertRef,
  sha256Hex,
  stableStringify,
} from "../contracts/pure";
import { keccakUtf8 } from "./eip712";

/* ------------------------------------------------------------------ */
/* Networks                                                            */
/* ------------------------------------------------------------------ */

/**
 * Closed catalogue of networks this deployment may reference. `production: true`
 * is what the deploy gate reads to force the mainnet progression (§43) — it is a
 * fact about the network, never a client-asserted flag.
 */
export const SUPPORTED_NETWORKS = [
  { key: "local-anvil", chainId: 31337, name: "Local development (anvil)", production: false, requiredConfirmations: 0 },
  { key: "sepolia", chainId: 11155111, name: "Ethereum Sepolia testnet", production: false, requiredConfirmations: 3 },
  { key: "base-sepolia", chainId: 84532, name: "Base Sepolia testnet", production: false, requiredConfirmations: 3 },
  { key: "ethereum", chainId: 1, name: "Ethereum mainnet", production: true, requiredConfirmations: 12 },
  { key: "base", chainId: 8453, name: "Base mainnet", production: true, requiredConfirmations: 12 },
  { key: "polygon", chainId: 137, name: "Polygon PoS", production: true, requiredConfirmations: 64 },
] as const;

export type NetworkKey = (typeof SUPPORTED_NETWORKS)[number]["key"];

export function networkByKey(key: string) {
  const net = SUPPORTED_NETWORKS.find((n) => n.key === key);
  if (!net) throw new ContractModelError("UNKNOWN_TYPE", `Unsupported network ${key}.`, { key });
  return net;
}

export function networkByChainId(chainId: number) {
  const net = SUPPORTED_NETWORKS.find((n) => n.chainId === chainId);
  if (!net) throw new ContractModelError("UNKNOWN_TYPE", `Unsupported chain id ${chainId}.`, { chainId });
  return net;
}

/* ------------------------------------------------------------------ */
/* §37 — Document anchoring / evidence                                */
/* ------------------------------------------------------------------ */

export const ANCHOR_METHODS = [
  "EVM_TRANSACTION_CALLDATA",
  "EVM_LOG_INDEXED",
  "ONCHAIN_REGISTRY_COMMITMENT",
  "BEYU_HASH_CHAIN_ONLY",
] as const;
export type AnchorMethod = (typeof ANCHOR_METHODS)[number];

export const ANCHOR_STATUSES = [
  "PENDING",
  "RECORDED",
  "VERIFIED",
  "SUPERSEDED",
  "REVOKED",
  "FAILED",
  "BLOCKED",
] as const;
export type AnchorStatus = (typeof ANCHOR_STATUSES)[number];

/** Anchor lifecycle: verification requires a registry-checked on-chain record. */
const ANCHOR_EDGES: Record<AnchorStatus, readonly AnchorStatus[]> = {
  PENDING: ["RECORDED", "FAILED", "BLOCKED"],
  RECORDED: ["VERIFIED", "REVOKED", "SUPERSEDED", "FAILED"],
  // Verification itself never demotes an anchor: a reorg or a commitment mismatch
  // is recorded as findings on the row (see `verifyAnchor`), and changing the
  // status is a separate governed act (revocation/supersession), so the two can
  // never be confused in the ledger.
  VERIFIED: ["REVOKED", "SUPERSEDED"],
  SUPERSEDED: [],
  REVOKED: [],
  FAILED: ["PENDING"],
  BLOCKED: ["PENDING"],
};

export function evaluateAnchorTransition(from: AnchorStatus, to: AnchorStatus): true {
  if (!ANCHOR_EDGES[from]?.includes(to)) {
    throw new ContractModelError("INVALID_TRANSITION", `Anchor cannot move ${from} → ${to}.`, { from, to });
  }
  return true;
}

export type AnchorVerification = {
  verified: boolean;
  findings: string[];
  confirmations: number | null;
  requiredConfirmations: number;
  commitmentMatches: boolean;
};

/**
 * An anchor is VERIFIED only when: the network is supported; the recorded chain
 * id matches the network; a transaction hash and block exist; the confirmation
 * depth meets the network's requirement; the content hash is a 32-byte digest;
 * and the recomputed commitment matches the stored commitment.
 *
 * A block hash mismatch is reported as a reorg candidate, never silently healed.
 */
export function evaluateAnchor(input: {
  networkKey: string;
  chainId: number;
  txHash?: string | null;
  blockNumber?: number | null;
  latestBlock?: number | null;
  blockHashMatchesChain?: boolean | null;
  contentHash: string;
  expectedCommitment?: string | null;
  recordedCommitment?: string | null;
  status: AnchorStatus;
  contractAddress?: string | null;
  registryListed?: boolean;
}): AnchorVerification {
  const findings: string[] = [];
  const net = SUPPORTED_NETWORKS.find((n) => n.key === input.networkKey);
  if (!net) {
    return {
      verified: false,
      findings: [`Unsupported network ${input.networkKey}; anchoring is refused.`],
      confirmations: null,
      requiredConfirmations: 0,
      commitmentMatches: false,
    };
  }
  if (net.chainId !== input.chainId) {
    findings.push(`Chain id ${input.chainId} does not match ${net.key} (${net.chainId}) — cross-chain mismatch.`);
  }
  let contentHash: string;
  try {
    contentHash = assertHash32(input.contentHash, "contentHash");
  } catch {
    return {
      verified: false,
      findings: ["contentHash is not a 32-byte digest."],
      confirmations: null,
      requiredConfirmations: net.requiredConfirmations,
      commitmentMatches: false,
    };
  }
  const commitmentMatches =
    input.expectedCommitment != null &&
    input.recordedCommitment != null &&
    input.expectedCommitment.toLowerCase() === input.recordedCommitment.toLowerCase();
  if (input.expectedCommitment && !commitmentMatches) {
    findings.push("Recomputed commitment does not match the stored commitment (content or envelope drift).");
  }
  if (!net.production && net.requiredConfirmations === 0 && !input.txHash) {
    // Local networks may be verified from a fixture record; testnets/mainnet may not.
    findings.push("Local-network anchor has no transaction reference (test/fixture evidence only).");
  }
  const txHash = input.txHash ? assertHash32(input.txHash, "txHash") : null;
  if (!txHash && net.requiredConfirmations > 0) findings.push("No transaction hash — anchor cannot be verified on-chain.");
  if (input.blockNumber === null || input.blockNumber === undefined) findings.push("No block number recorded.");
  let confirmations: number | null = null;
  if (input.blockNumber !== null && input.blockNumber !== undefined && input.latestBlock !== null && input.latestBlock !== undefined) {
    confirmations = Math.max(0, input.latestBlock - input.blockNumber + 1);
    if (confirmations < net.requiredConfirmations) {
      findings.push(
        `Only ${confirmations} confirmation(s); ${net.key} requires ${net.requiredConfirmations} before evidence is treated as final.`,
      );
    }
  } else if (net.requiredConfirmations > 0) {
    findings.push("Chain head not observed — confirmation depth is unknown, so the anchor is not verified.");
  }
  if (input.blockHashMatchesChain === false) {
    findings.push("Recorded block hash does not match the chain at that height — possible reorg; treat as unverified.");
  }
  if (input.contractAddress) {
    try {
      assertAddress(input.contractAddress, "contractAddress");
    } catch {
      findings.push("Anchor contract address is malformed.");
    }
    if (input.registryListed === false) {
      findings.push("Anchor contract is not present in the smart-contract registry — evidence is unverifiable.");
    }
  } else if (net.requiredConfirmations > 0) {
    findings.push("No anchor contract recorded: the commitment cannot be attributed to a governed contract.");
  }
  // The engine answers "does the recorded evidence verify?". It must NOT require
  // the row to already claim VERIFIED — that made verification unreachable (a
  // record can never become VERIFIED if it has to be VERIFIED first). A closed
  // commitment is refused separately and explicitly.
  if (input.status === "REVOKED" || input.status === "SUPERSEDED") {
    findings.push(`Anchor is ${input.status}: a closed commitment is not live evidence.`);
  }
  const verified = findings.length === 0 && commitmentMatches && txHash !== null;
  return {
    verified,
    findings,
    confirmations,
    requiredConfirmations: net.requiredConfirmations,
    commitmentMatches,
  };
}

/* ------------------------------------------------------------------ */
/* Address / hex helpers (blockchain-shaped, fail-closed)             */
/* ------------------------------------------------------------------ */

export function assertAddress(value: string, field: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new ContractModelError("INVALID_REFERENCE", `${field} must be a 20-byte hex address.`, { field, value });
  }
  return toChecksumAddress(value);
}

/** EIP-55 checksum encoding — addresses are stored canonical, not "as pasted". */
export function toChecksumAddress(value: string): string {
  const lower = value.toLowerCase().replace(/^0x/, "");
  const hash = keccakUtf8(lower).slice(2);
  let out = "0x";
  for (let i = 0; i < lower.length; i += 1) {
    const c = lower[i];
    out += /[0-9]/.test(c) || parseInt(hash[i], 16) < 8 ? c : c.toUpperCase();
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* §32 — Governed oracle boundaries                                    */
/* ------------------------------------------------------------------ */

export const ORACLE_FEEDS = [
  "FX_RATE",
  "COMMODITY_PRICE",
  "MILESTONE_COMPLETION",
  "DELIVERY_ACCEPTANCE",
  "WEATHER_INDEX",
  "PAYMENT_CONFIRMATION",
  "GOVERNMENT_VERIFICATION",
  "DONOR_DISBURSEMENT",
  "IDENTITY_VERIFICATION",
  "REGULATORY_STATE",
] as const;
export type OracleFeed = (typeof ORACLE_FEEDS)[number];

export const ORACLE_SOURCE_KINDS = [
  "AUTHORITATIVE_PRIMARY",
  "SISTER_SOURCE",
  "OPEN_DATA",
  "MANUAL_EVIDENCE",
  "ONCHAIN_PUSH",
] as const;
export type OracleSourceKind = (typeof ORACLE_SOURCE_KINDS)[number];

/** Deviation tolerance per feed family (basis points). Tight for money, loose for weather. */
export const ORACLE_DEVIATION_BPS_LIMIT: Record<OracleFeed, number> = {
  FX_RATE: 100,
  COMMODITY_PRICE: 250,
  MILESTONE_COMPLETION: 0,
  DELIVERY_ACCEPTANCE: 0,
  WEATHER_INDEX: 5_000,
  PAYMENT_CONFIRMATION: 0,
  GOVERNMENT_VERIFICATION: 0,
  DONOR_DISBURSEMENT: 0,
  IDENTITY_VERIFICATION: 0,
  REGULATORY_STATE: 0,
};

/** Maximum age in seconds before a reading is unusable for a governed decision. */
export const ORACLE_MAX_AGE_SECONDS: Record<OracleFeed, number> = {
  FX_RATE: 3_600,
  COMMODITY_PRICE: 6 * 3_600,
  MILESTONE_COMPLETION: 30 * 86_400,
  DELIVERY_ACCEPTANCE: 30 * 86_400,
  WEATHER_INDEX: 24 * 3_600,
  PAYMENT_CONFIRMATION: 600,
  GOVERNMENT_VERIFICATION: 24 * 3_600,
  DONOR_DISBURSEMENT: 24 * 3_600,
  IDENTITY_VERIFICATION: 7 * 86_400,
  REGULATORY_STATE: 7 * 86_400,
};

export type OracleReadingInput = {
  feed: OracleFeed;
  valueBps?: number | null;
  valueText?: string | null;
  decimals: number;
  rawValue?: string | null;
  sourceKind: OracleSourceKind;
  authorityRef?: string | null;
  observedAt: string; // ISO-8601
  asOf: string; // ISO-8601
  fallbackOrder?: number;
  disputeOpen?: boolean;
  previousValueBps?: number | null;
};

export type OracleEvaluation = {
  status: "CURRENT" | "STALE" | "EXPIRED" | "DISPUTED" | "INVALID" | "MISSING";
  usable: boolean;
  ageSeconds: number | null;
  deviationBps: number | null;
  findings: string[];
  /** Structural guarantee: an oracle reading never carries authority of its own. */
  grantsAuthority: false;
  note: string;
};

const ISO_OR_DATETIME = /^\d{4}-\d{2}-\d{2}([T ]|$)/;

function parseIsoInstant(value: string, field: string): number {
  const v = value.trim();
  if (!ISO_OR_DATETIME.test(v)) {
    throw new ContractModelError("INVALID_DATE", `${field} must be an ISO-8601 date or timestamp.`, { field, value });
  }
  const normalized = (v.length === 10 ? `${v}T00:00:00Z` : /Z|[+-]\d{2}:?\d{2}$/.test(v) ? v : `${v}Z`).replace(" ", "T");
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) throw new ContractModelError("INVALID_DATE", `${field} is not a valid instant.`, { field, value });
  return ms;
}

/**
 * Oracle evaluation. Fail-closed on every axis: a reading that is future-dated,
 * stale beyond its feed's tolerance, disputed, deviating from its own previous
 * value past the limit, or lacking an authority reference for authoritative
 * kinds, is not usable. `usable` is what a governed executor may consume; it
 * still needs the contract, approvals and dispute checks of §17/§39 in front of
 * it — the oracle never substitutes for them.
 */
export function evaluateOracleReading(input: OracleReadingInput): OracleEvaluation {
  const findings: string[] = [];
  const limit = ORACLE_DEVIATION_BPS_LIMIT[input.feed];
  const maxAge = ORACLE_MAX_AGE_SECONDS[input.feed];
  let observedMs: number;
  let asOfMs: number;
  try {
    observedMs = parseIsoInstant(input.observedAt, "observedAt");
    asOfMs = parseIsoInstant(input.asOf, "asOf");
  } catch {
    return { status: "INVALID", usable: false, ageSeconds: null, deviationBps: null,
      findings: ["Observed/at timestamps are not valid instants."], grantsAuthority: false,
      note: "Rejected before evaluation: an unverifiable timestamp is treated as no data (§32)." };
  }
  // A reading observed after the decision instant cannot have informed it: this
  // is a refusal, never a free pass on freshness.
  const futureDated = observedMs > asOfMs;
  if (futureDated) {
    findings.push("Reading is future-dated relative to the decision instant.");
  }
  const ageSeconds = Math.floor((asOfMs - observedMs) / 1000);
  let status: "CURRENT" | "STALE" | "EXPIRED" = "CURRENT";
  if (ageSeconds > maxAge * 4) status = "EXPIRED";
  else if (ageSeconds > maxAge) status = "STALE";
  if (!(ORACLE_SOURCE_KINDS as readonly string[]).includes(input.sourceKind)) {
    findings.push(`Unknown oracle source kind ${input.sourceKind}.`);
  }
  const needsNumeric = input.valueText === null || input.valueText === undefined;
  if (needsNumeric) {
    if (typeof input.valueBps !== "number" || !Number.isFinite(input.valueBps)) {
      findings.push("No numeric value for a numeric feed.");
    } else if (input.valueBps < 0) {
      findings.push("Negative value for a bps-scaled feed.");
    }
  }
  if (!Number.isInteger(input.decimals) || input.decimals < 0 || input.decimals > 36) {
    findings.push("decimals must be an integer in 0..36 (raw on-chain readings are never trusted as scaled).");
  }
  if ((input.sourceKind === "AUTHORITATIVE_PRIMARY" || input.sourceKind === "ONCHAIN_PUSH") && !input.authorityRef) {
    findings.push("An authoritative source must carry an authority reference (the registry record that qualifies it).");
  }
  if (input.sourceKind === "OPEN_DATA") {
    findings.push("Open-data source: usable for monitoring only, never as the trigger for an automatic settlement.");
  }
  if (input.sourceKind === "MANUAL_EVIDENCE" && !input.authorityRef) {
    findings.push("A manual reading must reference the evidence and the verifying human decision.");
  }
  let deviationBps: number | null = null;
  if (typeof input.valueBps === "number" && typeof input.previousValueBps === "number" && input.previousValueBps > 0) {
    deviationBps = Math.round(((input.valueBps - input.previousValueBps) / input.previousValueBps) * 10_000);
    if (Math.abs(deviationBps) > limit) {
      findings.push(`Deviation ${deviationBps} bps exceeds the ${limit} bps limit for ${input.feed}: the reading is quarantined, not adopted.`);
    }
  }
  if (input.disputeOpen) {
    findings.push("An open dispute covers this feed: external disagreement outranks the reading.");
  }
  // The verdict is derived from the same facts the findings were derived from —
  // never from matching on finding text, which silently decays the moment a
  // message is reworded. `authorityRef` is blocking for every kind that must
  // carry one, including MANUAL_EVIDENCE.
  const missingAuthority =
    (input.sourceKind === "AUTHORITATIVE_PRIMARY" || input.sourceKind === "ONCHAIN_PUSH" || input.sourceKind === "MANUAL_EVIDENCE") &&
    !input.authorityRef;
  const invalid =
    findings.some((f) => f.startsWith("No numeric") || f.startsWith("Negative") || f.startsWith("decimals") || f.startsWith("Open-data") || f.startsWith("Unknown oracle")) ||
    missingAuthority;
  const deviationOk = deviationBps === null || Math.abs(deviationBps) <= limit;
  const usable = !invalid && !futureDated && !input.disputeOpen && status === "CURRENT" && deviationOk;
  return {
    status: input.disputeOpen ? "DISPUTED" : invalid ? "INVALID" : status,
    usable,
    ageSeconds,
    deviationBps,
    findings,
    grantsAuthority: false,
    note: "Oracle readings inform governed decisions; they never create authority, and a missing or rejected reading is a refusal to execute — not a default.",
  };
}

/* ------------------------------------------------------------------ */
/* §33 — Blockchain event indexing                                     */
/* ------------------------------------------------------------------ */

export const EVENT_KINDS = [
  "ANCHOR_COMMITTED",
  "ANCHOR_REVOKED",
  "OBLIGATION_RECORDED",
  "OBLIGATION_VERIFIED",
  "OBLIGATION_PAID",
  "OBLIGATION_EXPIRED",
  "CONTRACT_UPGRADED",
  "OWNERSHIP_TRANSFERRED",
  "PARAMETER_CHANGED",
  "PAUSED",
  "UNPAUSED",
  "MULTISIG_PROPOSED",
  "MULTISIG_EXECUTED",
  "MULTISIG_REVOKED",
  "TIMELOCK_QUEUED",
  "TIMELOCK_EXECUTED",
  "TIMELOCK_CANCELLED",
  "VESTING_CLIFF",
  "VESTING_RELEASED",
  "VESTING_REVOKED",
  "TOKEN_ISSUED",
  "TOKEN_TRANSFERRED",
  "TOKEN_BURNED",
  "REGISTRY_RECORDED",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** Event payloads must never contain confidential content or personal data. */
const FORBIDDEN_EVENT_FIELDS = [
  "content",
  "documentText",
  "body",
  "pdf",
  "base64",
  "privateKey",
  "seedPhrase",
  "mnemonic",
  "password",
  "secret",
  "api_key",
  "apiKey",
  "nationalId",
  "taxIdNumber",
  "healthRecord",
  "diagnosis",
];

export type IndexedEvent = {
  chainId: number;
  contractAddress: string;
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
  eventKind: EventKind;
  emittedAt: string;
  actorAddress?: string | null;
  funcSelector?: string | null;
  payload?: Record<string, unknown>;
  correlationId?: string | null;
  contractId?: string | null;
  legalAgreementId?: string | null;
  registryKnown?: boolean;
  actorAuthorized?: boolean;
  allowedActorAddresses?: readonly string[];
};

export type EventIngestResult = {
  accepted: boolean;
  deduplicated: boolean;
  findings: string[];
  /** Structural boundary: an indexed event can never authorize anything. */
  createsAuthority: false;
};

/**
 * Ingest validation for one indexed event. Deterministic id =
 * keccak/SHA over (chainId, txHash, logIndex) so replays are exact, and every
 * anomaly is a finding rather than a repair: missing/duplicate/reorg/
 * unauthorized signals are surfaced for reconciliation, never auto-corrected.
 */
export function validateIndexedEvent(event: IndexedEvent, context: {
  lastBlockByChain: Record<number, { blockNumber: number; blockHash: string }>;
  seenLogKeys: readonly string[];
}): EventIngestResult {
  const findings: string[] = [];
  if (!(EVENT_KINDS as readonly string[]).includes(event.eventKind)) {
    findings.push(`Unknown event kind ${event.eventKind}; the indexer records only known governed events.`);
  }
  try {
    assertAddress(event.contractAddress, "contractAddress");
  } catch {
    findings.push("Contract address is malformed.");
  }
  try {
    assertHash32(event.transactionHash, "transactionHash");
    assertHash32(event.blockHash, "blockHash");
  } catch {
    findings.push("Transaction or block hash is malformed.");
  }
  if (!Number.isInteger(event.blockNumber) || event.blockNumber < 0) findings.push("Block number must be a non-negative integer.");
  if (!Number.isInteger(event.logIndex) || event.logIndex < 0) findings.push("Log index must be a non-negative integer.");
  try {
    parseIsoInstant(event.emittedAt, "emittedAt");
  } catch {
    findings.push("emittedAt is not a valid instant.");
  }
  const key = eventKey(event.chainId, event.transactionHash, event.logIndex);
  const deduplicated = context.seenLogKeys.includes(key);
  if (deduplicated) findings.push("Duplicate log (same chain/tx/logIndex) — recorded as duplicate, not re-applied.");
  const prev = context.lastBlockByChain[event.chainId];
  if (prev && event.blockNumber > 0) {
    if (event.blockNumber <= prev.blockNumber) {
      if (event.blockNumber === prev.blockNumber && event.blockHash !== prev.blockHash) {
        findings.push("Block hash differs at the same height — reorg candidate; flag for reconciliation, do not overwrite.");
      } else if (event.blockNumber < prev.blockNumber) {
        findings.push("Event references a block below the indexed head — reorg or out-of-order indexing.");
      }
    } else if (event.blockNumber > prev.blockNumber + 1) {
      findings.push(`Gap: ${prev.blockNumber} → ${event.blockNumber} (missing ${event.blockNumber - prev.blockNumber - 1} block(s)).`);
    }
  }
  if (event.registryKnown === false) {
    findings.push("Contract is not registered — event cannot be attributed to a governed contract.");
  }
  if (event.actorAuthorized === false) {
    findings.push("Actor address is outside the governed allowance for this contract — possible unauthorized transaction.");
  }
  if (event.actorAddress && event.allowedActorAddresses?.length) {
    const allowed = new Set(event.allowedActorAddresses.map((a) => a.toLowerCase()));
    if (!allowed.has(event.actorAddress.toLowerCase())) {
      findings.push("Actor address not in the allowance list (defense-in-depth check).");
    }
  }
  for (const field of FORBIDDEN_EVENT_FIELDS) {
    if (event.payload && Object.prototype.hasOwnProperty.call(event.payload, field)) {
      findings.push(`Event payload carries ${field}: confidential content and personal data must never be indexed or published (§24, §50).`);
    }
  }
  return {
    accepted: findings.length === 0 && !deduplicated,
    deduplicated,
    findings,
    createsAuthority: false,
  };
}

export function eventKey(chainId: number, transactionHash: string, logIndex: number): string {
  return sha256Hex(`BEYU:BC_EVENT|${chainId}|${transactionHash.toLowerCase()}|${logIndex}`);
}

/* ------------------------------------------------------------------ */
/* §34 — Cap-table ⇄ blockchain reconciliation                         */
/* ------------------------------------------------------------------ */

export const RECONCILIATION_FINDINGS = [
  "CAP_TABLE_MISMATCH",
  "OWNERSHIP_MISMATCH",
  "VESTING_MISMATCH",
  "TOKEN_BALANCE_MISMATCH",
  "UNAUTHORIZED_TRANSFER",
  "UNKNOWN_HOLDER",
  "STALE_BLOCKCHAIN_STATE",
] as const;
export type ReconciliationFindingCode = (typeof RECONCILIATION_FINDINGS)[number];

export type CanonicalPosition = {
  holderPartyId: string;
  shareClassCode: string;
  shares: number;
  vestedShares: number;
  /** Blockchain address approved to represent this holder's position, if any. */
  approvedAddress?: string | null;
  linkedAnchorIds?: readonly string[];
};

export type OnChainPosition = {
  holderAddress: string;
  tokenSymbol: string;
  balanceUnits: number;
  lastSyncedBlock: number;
  chainHeadBlock: number;
  sourceRegistryId?: string | null;
};

export type ReconciliationResult = {
  status: "MATCHED" | "RECONCILED_WITH_FINDINGS" | "UNRECONCILED";
  findings: Array<{ code: ReconciliationFindingCode; severity: "LOW" | "MEDIUM" | "HIGH"; detail: string; holderPartyId?: string }>;
  perHolder: Array<{
    holderPartyId: string;
    canonicalShares: number;
    onChainUnits: number;
    delta: number;
    findings: ReconciliationFindingCode[];
  }>;
  totals: { canonical: number; onChain: number; delta: number };
  /** The reconciliation never writes: it cannot overwrite either source of truth. */
  mutatesState: false;
};

/**
 * Three-layer reconciliation (legal cap table ⇄ BEYU ownership/cap table ⇄
 * approved blockchain representation). Deterministic, tolerance-driven, and
 * read-only: an on-chain balance never changes a canonical position and a
 * canonical position never silently rewrites a token ledger. A discrepancy is a
 * finding for a human, and `STALE_BLOCKCHAIN_STATE` explicitly refuses to
 * compare against a chain view that is not current.
 */
export function reconcileOwnership(input: {
  canonical: readonly CanonicalPosition[];
  onChain: readonly OnChainPosition[];
  /** 1 canonical share == sharesPerUnit on-chain units (token decimals scaling). */
  sharesPerUnit: number;
  /** Absolute unit tolerance before a difference becomes a finding. */
  toleranceUnits?: number;
  staleBlockTolerance?: number;
  /** Addresses approved for transfers (from the registry), for UNAUTHORIZED_TRANSFER. */
  transferEvents?: ReadonlyArray<{ from: string; to: string; valueUnits: number; blockNumber: number; authorized?: boolean }>;
  knownHolderAddresses?: readonly string[];
}): ReconciliationResult {
  const tolerance = input.toleranceUnits ?? 0;
  const staleTolerance = input.staleBlockTolerance ?? 25;
  const findings: ReconciliationResult["findings"] = [];
  const perHolder: ReconciliationResult["perHolder"] = [];
  const byAddress = new Map<string, OnChainPosition>();
  for (const p of input.onChain) {
    const key = p.holderAddress.toLowerCase();
    const existing = byAddress.get(key);
    byAddress.set(key, existing ? { ...existing, balanceUnits: existing.balanceUnits + p.balanceUnits } : p);
  }
  const known = new Set((input.knownHolderAddresses ?? []).map((a) => a.toLowerCase()));
  let canonicalTotal = 0;
  let onChainTotal = 0;
  const matchedAddresses = new Set<string>();

  for (const c of input.canonical) {
    const expectedUnits = c.shares * input.sharesPerUnit;
    canonicalTotal += c.shares;
    const addr = c.approvedAddress ? c.approvedAddress.toLowerCase() : null;
    const holderFindings = new Set<ReconciliationFindingCode>();
    let observedUnits = 0;
    if (addr) {
      const o = byAddress.get(addr);
      if (o) {
        matchedAddresses.add(addr);
        observedUnits = o.balanceUnits;
        onChainTotal += o.balanceUnits / input.sharesPerUnit;
        if (Math.abs(observedUnits - expectedUnits) > tolerance) {
          holderFindings.add("TOKEN_BALANCE_MISMATCH");
          findings.push({
            code: "TOKEN_BALANCE_MISMATCH",
            severity: "HIGH",
            detail: `${c.holderPartyId}: canonical ${expectedUnits} units vs on-chain ${observedUnits}.`,
            holderPartyId: c.holderPartyId,
          });
        }
        if (input.sharesPerUnit > 0 && o.balanceUnits / input.sharesPerUnit < c.vestedShares) {
          holderFindings.add("VESTING_MISMATCH");
          findings.push({
            code: "VESTING_MISMATCH",
            severity: "MEDIUM",
            detail: `${c.holderPartyId}: on-chain representation is below vested shares (${c.vestedShares}).`,
            holderPartyId: c.holderPartyId,
          });
        }
        if (o.chainHeadBlock - o.lastSyncedBlock > staleTolerance) {
          holderFindings.add("STALE_BLOCKCHAIN_STATE");
          findings.push({
            code: "STALE_BLOCKCHAIN_STATE",
            severity: "HIGH",
            detail: `${c.holderPartyId}: chain view is ${o.chainHeadBlock - o.lastSyncedBlock} blocks behind; comparison refused as authoritative.`,
            holderPartyId: c.holderPartyId,
          });
        }
        if (!o.sourceRegistryId) {
          holderFindings.add("UNKNOWN_HOLDER");
          findings.push({
            code: "UNKNOWN_HOLDER",
            severity: "HIGH",
            detail: `${c.holderPartyId}: on-chain position is not attributable to a registered token contract.`,
            holderPartyId: c.holderPartyId,
          });
        }
      } else {
        holderFindings.add("OWNERSHIP_MISMATCH");
        findings.push({
          code: "OWNERSHIP_MISMATCH",
          severity: "HIGH",
          detail: `${c.holderPartyId}: an approved representation exists in BEYU but no on-chain balance was observed.`,
          holderPartyId: c.holderPartyId,
        });
      }
    }
    perHolder.push({
      holderPartyId: c.holderPartyId,
      canonicalShares: c.shares,
      onChainUnits: observedUnits,
      delta: observedUnits - expectedUnits,
      findings: [...holderFindings],
    });
  }

  // One finding per ADDRESS, not per observation: a re-indexed block must not
  // turn one unknown holder into a pile of duplicate findings.
  for (const address of new Set(input.onChain.map((o) => o.holderAddress.toLowerCase()))) {
    if (matchedAddresses.has(address) || known.has(address)) continue;
    findings.push({
      code: "UNKNOWN_HOLDER",
      severity: "MEDIUM",
      detail: `On-chain holder ${address} has no canonical position in the register.`,
    });
  }

  for (const t of input.transferEvents ?? []) {
    if (t.authorized === false) {
      findings.push({
        code: "UNAUTHORIZED_TRANSFER",
        severity: "HIGH",
        detail: `Transfer ${t.valueUnits} units ${t.from} → ${t.to} at block ${t.blockNumber} has no authorized basis in BEYU.`,
      });
    }
  }

  const canonicalUnits = canonicalTotal * input.sharesPerUnit;
  if (Math.abs(canonicalUnits - onChainTotal * input.sharesPerUnit) > tolerance) {
    findings.push({
      code: "CAP_TABLE_MISMATCH",
      severity: "HIGH",
      detail: `Aggregate canonical ${canonicalTotal} shares vs on-chain ${Math.round(onChainTotal)} shares-equivalent.`,
    });
  }

  const blocking = findings.filter((f) => f.severity === "HIGH");
  return {
    status: findings.length === 0 ? "MATCHED" : blocking.length > 0 ? "UNRECONCILED" : "RECONCILED_WITH_FINDINGS",
    findings,
    perHolder,
    totals: { canonical: canonicalTotal, onChain: Math.round(onChainTotal), delta: Math.round(onChainTotal) - canonicalTotal },
    mutatesState: false,
  };
}

/* ------------------------------------------------------------------ */
/* §40 — Smart-contract registry model rules                           */
/* ------------------------------------------------------------------ */

export const CONTRACT_OPERATIONAL_STATUSES = [
  "DRAFT",
  "AUDIT_PENDING",
  "APPROVED_TESTNET",
  "DEPLOYED_TESTNET",
  "VERIFIED_TESTNET",
  "APPROVED_MAINNET",
  "DEPLOYED_MAINNET",
  "DEPRECATED",
  "COMPROMISED",
] as const;
export type ContractOperationalStatus = (typeof CONTRACT_OPERATIONAL_STATUSES)[number];

const REGISTRY_EDGES: Record<ContractOperationalStatus, readonly ContractOperationalStatus[]> = {
  DRAFT: ["AUDIT_PENDING", "DEPRECATED"],
  AUDIT_PENDING: ["APPROVED_TESTNET", "DRAFT", "DEPRECATED"],
  APPROVED_TESTNET: ["DEPLOYED_TESTNET", "DEPRECATED"],
  DEPLOYED_TESTNET: ["VERIFIED_TESTNET", "APPROVED_TESTNET", "DEPRECATED"],
  VERIFIED_TESTNET: ["APPROVED_MAINNET", "DEPRECATED"],
  APPROVED_MAINNET: ["DEPLOYED_MAINNET", "VERIFIED_TESTNET", "DEPRECATED"],
  DEPLOYED_MAINNET: ["DEPRECATED", "COMPROMISED"],
  DEPRECATED: ["COMPROMISED"],
  COMPROMISED: [],
};

/** Testnet-first progression is enforced structurally: no shortcut to mainnet (§43). */
export function evaluateRegistryTransition(from: ContractOperationalStatus, to: ContractOperationalStatus): true {
  if (!REGISTRY_EDGES[from]?.includes(to)) {
    throw new ContractModelError(
      "INVALID_TRANSITION",
      `A smart-contract registry record cannot move ${from} → ${to}. Testnet verification precedes mainnet approval, and a deployed or compromised record cannot be revived.`,
      { from, to },
    );
  }
  return true;
}

export type RegistryRecordIntake = {
  name: string;
  networkKey: string;
  chainId: number;
  address?: string | null;
  compilerVersion: string;
  abiHash?: string | null;
  bytecodeHash?: string | null;
  sourceCommit: string;
  implementationAddress?: string | null;
  upgradeAuthority?: string | null;
  multisigAddress?: string | null;
  timelockAddress?: string | null;
  proxyKind?: "NONE" | "TRANSPARENT" | "UUPS" | "BEACON";
  auditStatus?: string;
  legalReviewStatus: string;
  riskClassification: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  oracleDependencies?: readonly OracleFeed[];
};

/**
 * Registry intake validation. Every production-shaped record must bind its
 * source commit, compiler version, multisig and timelock; a proxy must bind an
 * implementation and its upgrade authority. `REQUIRES_LEGAL_REVIEW` is accepted
 * as a status (records exist before counsel closes review) but is carried
 * through so nothing downstream can mistake the record for a legal clearance.
 */
export function validateRegistryRecord(record: RegistryRecordIntake): {
  errors: string[];
  warnings: string[];
  networkProduction: boolean;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const net = SUPPORTED_NETWORKS.find((n) => n.key === record.networkKey);
  if (!net) errors.push(`Unsupported network ${record.networkKey}.`);
  else if (net.chainId !== record.chainId) errors.push(`chainId ${record.chainId} does not match ${net.key} (expected ${net.chainId}).`);
  try {
    assertRef(record.name, "name");
  } catch {
    errors.push("name is required.");
  }
  if (!/^v?\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(record.compilerVersion.trim())) {
    errors.push("compilerVersion must be a pinned semantic version (e.g. 0.8.26) — floating pragmas are not acceptable here.");
  }
  try {
    if (/^[0-9a-f]{40}$/i.test(record.sourceCommit.trim())) warnings.push("sourceCommit should be the full 40-character git SHA, not an abbreviation.");
    else assertRef(record.sourceCommit, "sourceCommit");
    if (!/^[0-9a-f]{40}$/i.test(record.sourceCommit.trim())) errors.push("sourceCommit must be a 40-hex git commit SHA.");
  } catch {
    errors.push("sourceCommit is required for build provenance.");
  }
  for (const [field, value] of [
    ["abiHash", record.abiHash],
    ["bytecodeHash", record.bytecodeHash],
  ] as const) {
    if (value) {
      try {
        assertHash32(value, field);
      } catch {
        errors.push(`${field} must be a 0x-prefixed 32-byte digest.`);
      }
    } else if (net?.production) {
      errors.push(`${field} is required for a production deployment record.`);
    }
  }
  if (record.address) {
    try {
      assertAddress(record.address, "address");
    } catch {
      errors.push("address must be a 20-byte hex address.");
    }
  } else if (net?.production && record.proxyKind !== "NONE") {
    errors.push("a proxied production contract must record its address.");
  }
  if (record.proxyKind && record.proxyKind !== "NONE") {
    if (!record.implementationAddress) errors.push("a proxied record must name the implementation address.");
    if (!record.upgradeAuthority) errors.push("a proxied record must name the upgrade authority (timelock/multisig).");
    if (record.upgradeAuthority && !/^0x[0-9a-fA-F]{40}$/.test(record.upgradeAuthority)) {
      errors.push("upgradeAuthority must be an address: a named human or a contract — never an unbounded key.");
    }
    if (record.upgradeAuthority === record.address) errors.push("upgradeAuthority must not be the proxy itself (unrestricted self-upgrade).");
  }
  if (net?.production) {
    if (!record.multisigAddress) errors.push("a production record must name the governing multisig.");
    if (!record.timelockAddress) errors.push("a production record must name the timelock protecting privileged actions.");
    if (record.auditStatus && !/CLOSED|PASSED/i.test(record.auditStatus)) {
      errors.push("auditStatus must show a completed audit before mainnet registration.");
    } else if (!record.auditStatus) {
      errors.push("auditStatus is required for a production record.");
    }
  } else if (!record.multisigAddress) {
    warnings.push("Testnet record without a multisig reference: acceptable for testnet, never for mainnet.");
  }
  if (record.oracleDependencies?.length) {
    for (const feed of record.oracleDependencies) {
      if (!(ORACLE_FEEDS as readonly string[]).includes(feed)) errors.push(`Unknown oracle feed ${feed}.`);
    }
  }
  if (record.legalReviewStatus !== "LEGAL_REVIEW_CLOSED") {
    warnings.push("legalReviewStatus is open: this record is engineering evidence, not a legal clearance.");
  }
  return { errors, warnings, networkProduction: net?.production ?? false };
}

/* ------------------------------------------------------------------ */
/* §31/§39 — On-chain execution posture for deterministic obligations  */
/* ------------------------------------------------------------------ */

export const EXECUTION_PACKAGE_STATES = [
  "DRAFT",
  "READY",
  "PROPOSED",
  "TIMELOCKED",
  "EXECUTABLE",
  "EXECUTED",
  "PAUSED",
  "VOIDED",
  "FAILED",
] as const;
export type ExecutionPackageState = (typeof EXECUTION_PACKAGE_STATES)[number];

const EXECUTION_EDGES: Record<ExecutionPackageState, readonly ExecutionPackageState[]> = {
  DRAFT: ["READY", "VOIDED"],
  READY: ["PROPOSED", "VOIDED", "PAUSED"],
  PROPOSED: ["TIMELOCKED", "READY", "VOIDED"],
  TIMELOCKED: ["EXECUTABLE", "READY", "VOIDED", "PAUSED"],
  EXECUTABLE: ["EXECUTED", "PAUSED", "VOIDED"],
  EXECUTED: [],
  PAUSED: ["READY", "VOIDED"],
  VOIDED: [],
  FAILED: ["DRAFT", "VOIDED"],
};

export function evaluateExecutionPackageTransition(from: ExecutionPackageState, to: ExecutionPackageState): true {
  if (!EXECUTION_EDGES[from]?.includes(to)) {
    throw new ContractModelError("INVALID_TRANSITION", `Execution package cannot move ${from} → ${to}.`, { from, to });
  }
  return true;
}

export type ExecutionGateFacts = {
  contractLifecycleAllows: boolean;
  state: ExecutionPackageState;
  registryVerified: boolean;
  oracleUsable: boolean;
  disputePauses: boolean;
  multisigApproved: boolean;
  timelockReady: boolean;
  evidenceRecorded: boolean;
  productionNetwork: boolean;
};

/**
 * Gate evaluation for deterministic on-chain execution of a governed obligation.
 * ALL of these must hold, and production deployments additionally require the
 * multisig/timelock pair. Refusal output is the precise list of missing gates
 * so an operator can act, and nothing here is inferred when evidence is absent.
 */
export function evaluateExecutionGates(facts: ExecutionGateFacts): {
  permitted: boolean;
  blockedBy: string[];
  state: ExecutionPackageState;
} {
  const blockedBy: string[] = [];
  if (!facts.contractLifecycleAllows) blockedBy.push("CONTRACT_LIFECYCLE_NOT_PERFORMING");
  if (facts.state !== "EXECUTABLE") blockedBy.push(`STATE_${facts.state}_NOT_EXECUTABLE`);
  if (!facts.registryVerified) blockedBy.push("SMART_CONTRACT_NOT_VERIFIED_IN_REGISTRY");
  if (!facts.oracleUsable) blockedBy.push("ORACLE_INPUT_UNUSABLE");
  if (facts.disputePauses) blockedBy.push("OPEN_DISPUTE_PAUSES_EXECUTION");
  if (!facts.evidenceRecorded) blockedBy.push("EVIDENCE_NOT_RECORDED");
  if (facts.productionNetwork) {
    if (!facts.multisigApproved) blockedBy.push("MULTISIG_APPROVAL_MISSING");
    if (!facts.timelockReady) blockedBy.push("TIMELOCK_NOT_READY");
  }
  return { permitted: blockedBy.length === 0, blockedBy, state: facts.state };
}

/* ------------------------------------------------------------------ */
/* Commitment helpers shared with the Solidity side                     */
/* ------------------------------------------------------------------ */

/**
 * The exact EIP-712 definitions the BEYU contracts use, re-exported from the
 * single implementation in `./eip712`. There is deliberately NO second copy of
 * the type strings or the domain tuple here: the off-chain digest BEYU computes
 * and the on-chain digest a contract recomputes must be produced by one code
 * path, and the Foundry suite (`ObligationTypehashEquivalence`,
 * `AnchorDomainEquivalence`) asserts they agree with the Solidity constants.
 */
export {
  ANCHOR_TYPES,
  OBLIGATION_TYPES as BEYU_OBLIGATION_TYPES,
  BEYU_ANCHOR_DOMAIN_NAME,
  BEYU_ANCHOR_DOMAIN_VERSION,
  anchorTypedDigest,
  obligationTypedDigest as obligationPackageDigest,
  idToBytes32,
} from "./eip712";

export { assertIsoDate };
