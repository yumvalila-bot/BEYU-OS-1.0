/**
 * BEYU OS — GOVERNED BLOCKCHAIN SERVICE (evidence + execution infrastructure).
 *
 * Same canonical governed-mutation pattern as every other BEYU domain service
 * (SCOPE → RBAC → ABAC → POLICY(DENY-final) → BUSINESS RULES → MUTATE → AUDIT →
 * EVENT → ATOMIC COMMIT), with the decisions taken by the pure engines:
 * `src/lib/blockchain/model.ts` (anchor verification, oracle evaluation, event
 * validation, reconciliation, registry progression) and `./eip712.ts` (typed
 * commitments).
 *
 * ============================== HARD BOUNDARIES ================================
 *
 * 1. NO KEYS, EVER. Nothing in this module reads a private key, derives an
 *    address, signs a digest or broadcasts a transaction. There is no such
 *    capability here to remove later — the imports do not include a signer and
 *    the schema has no credential column. `signerRef` names an external custody
 *    arrangement.
 * 2. NO MONEY PATH. This module never calls the Finance posting engine and
 *    never marks a payment as settled. An on-chain payment confirmation is an
 *    INPUT to a governed verification of a PAYMENT obligation, and Finance OS
 *    remains the only accounting authority.
 * 3. NO CANONICAL OVERWRITE. Reconciliation reports findings; it never updates a
 *    cap table, a contract record or an obligation state. On-chain state cannot
 *    become authoritative in BEYU by observation alone.
 * 4. NO AUTHORITY FROM CHAIN DATA. A verified anchor proves a commitment existed
 *    at a height. An oracle reading is an input. An indexed event is a record.
 *    The engines return `createsAuthority: false` / `grantsAuthority: false`
 *    structurally, and those columns default false with no write path to true.
 * 5. LEGAL EFFECT IS NEVER IMPLIED. `enforceabilityNote` and
 *    `legalReviewStatus` stay REQUIRES_LEGAL_REVIEW until a human closes it.
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  blockchainAnchors,
  blockchainEvents,
  blockchainOracleReadings,
  blockchainOracleSources,
  blockchainReconciliationRuns,
  blockchainTokenPositions,
  contractDisputes,
  contractObligations,
  contractParties,
  contractRecords,
  equityPositions,
  shareClasses,
  smartContractRegistry,
} from "@/db/schema";
import { can, type Principal } from "../authz";
import { evaluatePolicy, type PolicyEvaluation } from "../policy";
import { withAuditTransaction } from "../audit";
import { assertWithinScope, tenantScopeIds, TenantIsolationError } from "../tenant-scope";
import { classificationRank, type Classification, type PermissionCode } from "../constants";
import { ID_PREFIX, newId } from "../ids";
import { ContractError, type ContractErrorCode } from "../contracts/errors";
import { assertHash32, assertIsoDate, assertRef, sha256Hex, stableStringify } from "../contracts/pure";
import { CONTRACT_LIFECYCLE_STATES, type ContractLifecycleState } from "../contracts/vocabulary";
import { anchorTypedDigest, idToBytes32, obligationTypedDigest } from "./eip712";
import {
  evaluateOracleReading,
  ORACLE_DEVIATION_BPS_LIMIT,
  ORACLE_MAX_AGE_SECONDS,
  type OracleSourceKind,
  ANCHOR_STATUSES,
  ORACLE_FEEDS,
  ORACLE_SOURCE_KINDS,
  type AnchorStatus,
  assertAddress,
  evaluateAnchor,
  evaluateExecutionGates,
  eventKey,
  networkByKey,
  obligationPackageDigest,
  reconcileOwnership,
  validateIndexedEvent,
  validateRegistryRecord,
  evaluateRegistryTransition,
  type CanonicalPosition,
  type EventKind,
  type OnChainPosition,
  type OracleFeed,
  type AnchorMethod,
  ANCHOR_METHODS,
  CONTRACT_OPERATIONAL_STATUSES,
  type ContractOperationalStatus,
  EVENT_KINDS,
} from "./model";
import { ContractModelError } from "../contracts/pure";

export type MutationContext = {
  traceId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

const EVENT_SOURCE = "beyu-os/blockchain";
const EVENT_DOMAIN = "BLOCKCHAIN";

function policyVersionOf(policy: PolicyEvaluation): string | null {
  return policy.appliedPolicies.map((p) => `${p.code}@${p.version}`).join(",") || null;
}

async function authorizeMutation(
  principal: Principal,
  permission: PermissionCode,
  context: { classification: Classification; tenantId: string; entityId?: string | null },
): Promise<PolicyEvaluation> {
  const decision = can(principal, permission, {
    classification: context.classification,
    tenantId: context.tenantId,
    entityId: context.entityId ?? undefined,
  });
  if (!decision.allowed) {
    const code =
      classificationRank(context.classification) > classificationRank(principal.clearance)
        ? "CLASSIFICATION_DENIED"
        : "FORBIDDEN";
    throw new ContractError(code, decision.reason);
  }
  const policy = await evaluatePolicy({
    action: permission,
    tenantId: context.tenantId,
    roles: principal.roles,
    classification: context.classification,
    riskScore: principal.riskScore,
    aiInitiated: false,
  });
  if (policy.effect === "DENY") {
    throw new ContractError(
      "POLICY_DENIED",
      policy.denials.map((d) => d.message).join(" ") || "Denied by governance policy.",
      { denials: policy.denials },
    );
  }
  return policy;
}

function wrapTenantScope(fn: () => Promise<void>): Promise<void> {
  return fn().catch((err) => {
    if (err instanceof TenantIsolationError) throw new ContractError("TENANT_SCOPE_DENIED", err.message);
    throw err;
  });
}

/**
 * Network resolution for the service layer. The engine's `networkByKey` throws a
 * `ContractModelError`, which would escape a direct service caller as an
 * unclassified failure; every service entry point converts it into the domain's
 * own refusal so the error mapping stays uniform (422 RULE_VIOLATION) whether the
 * caller came over HTTP or in-process.
 */
function resolveNetwork(key: string) {
  try {
    return networkByKey(key);
  } catch (err) {
    if (err instanceof ContractModelError) {
      throw new ContractError("RULE_VIOLATION", err.message, err.detail ?? { key });
    }
    throw err;
  }
}

function wrapModel<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof ContractModelError) {
      const code: ContractErrorCode =
        err.code === "INVALID_TRANSITION" || err.code === "TERMINAL_STATE" || err.code === "UNKNOWN_STATE"
          ? "INVALID_STATE"
          : err.code === "INVALID_REFERENCE"
            ? "RULE_VIOLATION"
            : "MODEL_ERROR";
      throw new ContractError(code, err.message, { code: err.code, ...(err.detail ?? {}) });
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  const codeOf = (e: unknown): string | undefined =>
    typeof e === "object" && e !== null && "code" in e ? (e as { code?: string }).code : undefined;
  const cause = typeof err === "object" && err !== null && "cause" in err ? (err as { cause?: unknown }).cause : undefined;
  return codeOf(err) === "23505" || codeOf(cause) === "23505";
}

/** EIP-55 addresses are stored lower-case-normalized; comparisons are exact. */
function normalizeAddress(value: string, field: string): string {
  try {
    assertAddress(value, field);
  } catch {
    throw new ContractError("RULE_VIOLATION", `${field} must be a 20-byte hex address.`);
  }
  return value.toLowerCase();
}

async function anchorInScope(anchorId: string, scope: string[]) {
  const [row] = await db
    .select()
    .from(blockchainAnchors)
    .where(and(eq(blockchainAnchors.id, anchorId), inArray(blockchainAnchors.tenantId, scope)))
    .limit(1);
  if (!row) throw new ContractError("NOT_FOUND", "Anchor not found within your authorised scope.");
  return row;
}

/* ------------------------------------------------------------------ */
/* §37 — Anchor records                                                 */
/* ------------------------------------------------------------------ */

export type CreateAnchorInput = {
  anchorType: "CONTRACT" | "OBLIGATION" | "LEGAL_DOCUMENT" | "CAP_TABLE_SNAPSHOT" | "POLICY_SET" | "DECISION_LOG";
  subjectId?: string | null;
  contractId?: string | null;
  obligationId?: string | null;
  /** Canonical payload BEYU hashes. Confidential text belongs in `documents`, not here. */
  content: Record<string, unknown>;
  contentVersion?: string;
  method: AnchorMethod;
  networkKey?: string | null;
  anchorContractAddress?: string | null;
  signerRef?: string | null;
  txHash?: string | null;
  blockNumber?: number | null;
  note?: string | null;
  classification?: Classification;
};

/**
 * Record an anchor. The service computes `contentHash` (SHA-256 over the
 * canonical, stable-stringified payload) and — for EVM methods — the EIP-712
 * typed commitment. Callers never supply a hash they computed elsewhere: what is
 * stored is exactly what BEYU can reproduce and a contract can re-verify.
 */
export async function createAnchor(principal: Principal, input: CreateAnchorInput, context: MutationContext) {
  const scope = await tenantScopeIds(principal);
  const classification = input.classification ?? "CONFIDENTIAL";
  if (!(ANCHOR_METHODS as readonly string[]).includes(input.method)) {
    throw new ContractError("RULE_VIOLATION", `Unknown anchor method ${input.method}.`);
  }
  const contract = input.contractId ? await contractInScope(input.contractId, scope) : null;
  if (input.obligationId) {
    const [obl] = await db
      .select({ id: contractObligations.id })
      .from(contractObligations)
      .where(and(eq(contractObligations.id, input.obligationId), inArray(contractObligations.tenantId, scope)))
      .limit(1);
    if (!obl) throw new ContractError("NOT_FOUND", "Obligation not found within your authorised scope.");
  }
  const policy = await authorizeMutation(principal, "blockchain:manage", {
    classification,
    tenantId: principal.tenantId,
    entityId: contract?.beyuEntityId ?? null,
  });
  const network = input.networkKey ? resolveNetwork(input.networkKey) : null;
  if (input.method !== "BEYU_HASH_CHAIN_ONLY" && !network) {
    throw new ContractError("RULE_VIOLATION", "An EVM anchor method requires a supported networkKey.");
  }
  if (input.anchorContractAddress && !network) {
    throw new ContractError("RULE_VIOLATION", "An anchor contract address requires a network.");
  }
  const anchorContractAddress = input.anchorContractAddress ? normalizeAddress(input.anchorContractAddress, "anchorContractAddress") : null;
  // `sha256Hex` is already 0x-prefixed: wrapping it again produced an invalid
  // hash literal that no on-chain or off-chain comparison could ever match.
  const contentHash = sha256Hex(stableStringify(input.content));
  wrapModel(() => assertHash32(contentHash, "contentHash"));
  const id = newId(ID_PREFIX.blockchainAnchor);
  const executedAt = Math.floor(Date.now() / 1000);
  const commitment =
    network && anchorContractAddress
      ? anchorTypedDigest({
          anchorId: id,
          documentId: input.subjectId ?? `BEYU:ANCHOR:${id}`,
          contractId: contract?.id ?? null,
          contentHash,
          chainId: network.chainId,
          executedAt: BigInt(executedAt),
          revoked: false,
          verifyingContract: anchorContractAddress,
        })
      : null;
  const claimedTxHash = input.txHash ?? null;
  if (claimedTxHash) wrapModel(() => assertHash32(claimedTxHash, "txHash"));
  if (input.blockNumber !== undefined && input.blockNumber !== null && (!Number.isInteger(input.blockNumber) || input.blockNumber < 0)) {
    throw new ContractError("RULE_VIOLATION", "blockNumber must be a non-negative integer.");
  }
  await wrapTenantScope(() => assertWithinScope(principal, principal.tenantId));

  try {
    return await withAuditTransaction(
      async (tx) => {
        const [row] = await tx
          .insert(blockchainAnchors)
          .values({
            id,
            tenantId: principal.tenantId,
            anchorType: input.anchorType,
            subjectId: input.subjectId ?? null,
            contractId: contract?.id ?? null,
            obligationId: input.obligationId ?? null,
            contentHash,
            contentVersion: input.contentVersion ?? "BEYU_STABLE_V1",
            commitment,
            commitmentVersion: commitment ? "EIP712_V1" : "BEYU_HASH_CHAIN_ONLY",
            method: input.method,
            networkKey: network?.key ?? null,
            chainId: network?.chainId ?? null,
            txHash: input.txHash ? input.txHash.toLowerCase() : null,
            blockNumber: input.blockNumber ?? null,
            anchorContractAddress,
            requiredConfirmations: network?.requiredConfirmations ?? 0,
            status: input.txHash ? "RECORDED" : "PENDING",
            // The payload hash is stored; the payload itself is NOT persisted
            // here (documents/registers own content) so an anchor cannot become a
            // side channel for confidential data.
            verification: { contentHashInput: "BEYU_STABLE_V1", executedAt, engine: "blockchain-anchor/1" },
            signerRef: input.signerRef ?? null,
            note: input.note ?? null,
            recordedBy: principal.userId,
            classification,
          })
          .returning();
        return {
          id: row.id,
          contentHash,
          commitment,
          status: row.status,
          tenantId: row.tenantId,
          classification: row.classification as Classification,
        };
      },
      (r) => ({
        tenantId: r.tenantId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        action: "blockchain.anchor.create",
        objectType: "BLOCKCHAIN_ANCHOR",
        objectId: r.id,
        outcome: "SUCCESS" as const,
        reason: `Anchor recorded (${input.method}) over ${r.contentHash.slice(0, 12)}…${commitment ? `; commitment ${r.commitment?.slice(0, 12)}…` : ""}`,
        authority: "blockchain:manage",
        policyVersion: policyVersionOf(policy) ?? undefined,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        traceId: context.traceId,
      }),
      (r) => ({
        type: "BLOCKCHAIN_ANCHOR_CREATED",
        source: EVENT_SOURCE,
        domain: EVENT_DOMAIN,
        operation: "CREATE_ANCHOR",
        destinationDomain: "LEGAL",
        tenantId: r.tenantId,
        legalEntityId: contract?.beyuEntityId ?? null,
        subjectType: "BLOCKCHAIN_ANCHOR",
        subjectId: r.id,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        classification: r.classification,
        payload: {
          anchorType: input.anchorType,
          contentHash: r.contentHash,
          commitment: r.commitment,
          networkKey: network?.key ?? null,
          method: input.method,
          createsAuthority: false,
        },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: {
          authorityId: null,
          decisionId: null,
          capabilityCode: null,
          permissionCode: "blockchain:manage",
          policyVersion: policyVersionOf(policy),
        },
        policyVersion: policyVersionOf(policy),
      }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ContractError("CONFLICT", "An anchor for that transaction already exists in your tenant (replay refused).");
    }
    throw err;
  }
}

async function contractInScope(contractId: string, scope: string[]) {
  const [row] = await db
    .select()
    .from(contractRecords)
    .where(and(eq(contractRecords.id, contractId), inArray(contractRecords.tenantId, scope)))
    .limit(1);
  if (!row) throw new ContractError("NOT_FOUND", "Contract not found within your authorised scope.");
  return row;
}

export type VerifyAnchorInput = {
  anchorId: string;
  latestBlock?: number | null;
  blockHashMatchesChain?: boolean | null;
  /** Registry check performed by the caller's chain read; null = unknown (fail-closed). */
  blockHash?: string | null;
};

/**
 * Re-verify an anchor against observation data and, critically, against the
 * commitment BEYU can recompute. Verification never approves anything: it either
 * supports the evidence or it does not, and a mismatch is recorded as a finding
 * for a human rather than repaired.
 */
export async function verifyAnchor(principal: Principal, input: VerifyAnchorInput, context: MutationContext) {
  const scope = await tenantScopeIds(principal);
  const anchor = await anchorInScope(input.anchorId, scope);
  const policy = await authorizeMutation(principal, "blockchain:manage", {
    classification: anchor.classification as Classification,
    tenantId: anchor.tenantId,
    entityId: null,
  });
  const listed = anchor.anchorContractAddress
    ? await db
        .select({ id: smartContractRegistry.id })
        .from(smartContractRegistry)
        .where(
          and(
            eq(smartContractRegistry.tenantId, anchor.tenantId),
            sql`lower(${smartContractRegistry.address}) = ${anchor.anchorContractAddress}`,
          ),
        )
        .limit(1)
    : [];
  const recomputed =
    anchor.commitmentVersion === "EIP712_V1" && anchor.networkKey && anchor.anchorContractAddress
      ? anchorTypedDigest({
          anchorId: anchor.id,
          documentId: anchor.subjectId ?? `BEYU:ANCHOR:${anchor.id}`,
          contractId: anchor.contractId,
          contentHash: anchor.contentHash,
          chainId: anchor.chainId ?? resolveNetwork(anchor.networkKey ?? "").chainId,
          executedAt: BigInt((anchor.verification as { executedAt?: number })?.executedAt ?? 0),
          revoked: anchor.status === "REVOKED",
          verifyingContract: anchor.anchorContractAddress,
        })
      : null;
  const evaluation = wrapModel(() =>
    evaluateAnchor({
      networkKey: anchor.networkKey ?? "local-anvil",
      chainId: anchor.chainId ?? 31337,
      txHash: anchor.txHash,
      blockNumber: anchor.blockNumber,
      latestBlock: input.latestBlock ?? null,
      blockHashMatchesChain: input.blockHashMatchesChain ?? null,
      contentHash: anchor.contentHash,
      expectedCommitment: recomputed,
      recordedCommitment: anchor.commitment,
      status: anchor.status as AnchorStatus,
      contractAddress: anchor.anchorContractAddress,
      registryListed: anchor.anchorContractAddress ? listed.length > 0 : undefined,
    }),
  );
  // Verification only ever PROMOTES (something → VERIFIED). A verification that no
  // longer holds does not rewrite the status: it records the findings and the
  // contradiction on the row, because "the evidence I checked today no longer
  // supports this" is not the same statement as "someone revoked this commitment".
  // Consumers must therefore read the contradiction, not the status alone —
  // `readExecutionPosture` treats a contradicted anchor as no evidence at all.
  const to = evaluation.verified ? "VERIFIED" : anchor.status;
  if (to !== anchor.status) wrapModel(() => {
    if (ANCHOR_STATUSES.includes(anchor.status as AnchorStatus)) return evaluateAnchorStatusMove(anchor.status as AnchorStatus, to as AnchorStatus);
    return true;
  });

  // A re-check may restate the block hash it observed; validate that claim before
  // it reaches the row, so a malformed hash cannot be persisted as evidence.
  const claimedBlockHash = input.blockHash ?? null;
  const verifiedBlockHash = claimedBlockHash ? wrapModel(() => assertHash32(claimedBlockHash, "blockHash")) : anchor.blockHash;

  return withAuditTransaction(
    async (tx) => {
      const [row] = await tx
        .update(blockchainAnchors)
        .set({
          status: to,
          confirmations: evaluation.confirmations,
          requiredConfirmations: evaluation.requiredConfirmations,
          blockHashMatchesChain: input.blockHashMatchesChain ?? anchor.blockHashMatchesChain,
          blockHash: verifiedBlockHash,
          verification: {
            ...(anchor.verification as Record<string, unknown>),
            engine: "blockchain-anchor/1",
            findings: evaluation.findings,
            commitmentMatches: evaluation.commitmentMatches,
            verifiedAt: new Date().toISOString(),
            verifiedBy: principal.userId,
          },
          updatedAt: new Date(),
        })
        .where(eq(blockchainAnchors.id, anchor.id))
        .returning();
      return {
        id: row.id,
        status: row.status,
        verified: evaluation.verified,
        findings: evaluation.findings,
        confirmations: evaluation.confirmations,
        tenantId: row.tenantId,
        classification: row.classification as Classification,
      };
    },
    (r) => ({
      tenantId: r.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "blockchain.anchor.verify",
      objectType: "BLOCKCHAIN_ANCHOR",
      objectId: r.id,
      outcome: r.verified ? ("SUCCESS" as const) : ("DENIED" as const),
      reason: r.verified
        ? `Anchor verified with ${r.confirmations} confirmation(s).`
        : `Anchor not verified: ${r.findings.join(" ") || "unmet conditions"}`,
      authority: "blockchain:manage",
      policyVersion: policyVersionOf(policy) ?? undefined,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (r) => ({
      type: "BLOCKCHAIN_ANCHOR_VERIFIED",
      source: EVENT_SOURCE,
      domain: EVENT_DOMAIN,
      operation: "VERIFY_ANCHOR",
      destinationDomain: "LEGAL",
      tenantId: r.tenantId,
      legalEntityId: null,
      subjectType: "BLOCKCHAIN_ANCHOR",
      subjectId: r.id,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      classification: r.classification,
      payload: {
        verified: r.verified,
        confirmations: r.confirmations,
        findings: r.findings,
        evidencesAuthority: false,
      },
      traceId: context.traceId,
      correlationId: context.traceId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "blockchain:manage",
        policyVersion: policyVersionOf(policy),
      },
      policyVersion: policyVersionOf(policy),
    }),
  );
}

function evaluateAnchorStatusMove(from: AnchorStatus, to: AnchorStatus): true {
  if (from === to) return true;
  const allowed: Record<AnchorStatus, AnchorStatus[]> = {
    PENDING: ["RECORDED", "FAILED", "BLOCKED"],
    RECORDED: ["VERIFIED", "REVOKED", "SUPERSEDED", "FAILED"],
    VERIFIED: ["REVOKED", "SUPERSEDED"],
    SUPERSEDED: [],
    REVOKED: [],
    FAILED: ["PENDING"],
    BLOCKED: ["PENDING"],
  };
  if (!allowed[from]?.includes(to)) {
    throw new ContractError("INVALID_STATE", `Anchor status cannot move ${from} → ${to} as a result of verification.`, { from, to });
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* §40/§43 — Smart-contract registry                                    */
/* ------------------------------------------------------------------ */

export type RegistryUpsertInput = {
  name: string;
  networkKey: string;
  address?: string | null;
  compilerVersion: string;
  optimizerRuns?: number | null;
  repositoryRef?: string | null;
  sourceCommit: string;
  abiHash?: string | null;
  bytecodeHash?: string | null;
  verifiedOnExplorer?: boolean;
  proxyKind?: "NONE" | "TRANSPARENT" | "UUPS" | "BEACON";
  implementationAddress?: string | null;
  upgradeAuthority?: string | null;
  multisigAddress?: string | null;
  timelockAddress?: string | null;
  timelockDelaySeconds?: number | null;
  auditStatus?: string | null;
  auditReportDocumentRef?: string | null;
  legalReviewStatus?: string;
  purpose?: string | null;
  oracleDependencies?: readonly string[];
  governanceBodyRef?: string | null;
  riskClassificationCode?: string | null;
  externalRef?: string | null;
  note?: string | null;
};

/**
 * Register (or amend) a smart-contract record. `validateRegistryRecord` decides
 * what a production record must prove — pinned compiler, full source commit,
 * ABI/bytecode digests, audit closure, multisig and timelock, and an upgrade
 * authority that is an address and not the proxy itself. Errors are returned as
 * refusals with the full list; warnings are stored for the reviewer's view.
 */
export async function upsertRegistryRecord(
  principal: Principal,
  input: RegistryUpsertInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const classification: Classification = "CONFIDENTIAL";
  const policy = await authorizeMutation(principal, "blockchain:manage", {
    classification,
    tenantId: principal.tenantId,
    entityId: null,
  });
  const network = resolveNetwork(input.networkKey);
  const address = input.address ? normalizeAddress(input.address, "address") : null;
  const implementationAddress = input.implementationAddress ? normalizeAddress(input.implementationAddress, "implementationAddress") : null;
  const validation = validateRegistryRecord({
    name: input.name,
    networkKey: network.key,
    chainId: network.chainId,
    address,
    compilerVersion: input.compilerVersion,
    abiHash: input.abiHash ?? null,
    bytecodeHash: input.bytecodeHash ?? null,
    sourceCommit: input.sourceCommit,
    implementationAddress,
    upgradeAuthority: input.upgradeAuthority ? input.upgradeAuthority.toLowerCase() : null,
    multisigAddress: input.multisigAddress ? input.multisigAddress.toLowerCase() : null,
    timelockAddress: input.timelockAddress ? input.timelockAddress.toLowerCase() : null,
    proxyKind: input.proxyKind ?? "NONE",
    auditStatus: input.auditStatus ?? undefined,
    legalReviewStatus: input.legalReviewStatus ?? "REVIEW_OPEN",
    riskClassification: (["LOW","MEDIUM","HIGH","CRITICAL"] as readonly string[]).includes(input.riskClassificationCode ?? "")
      ? (input.riskClassificationCode as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL")
      : network.production
        ? "HIGH"
        : "MEDIUM",
    oracleDependencies: (input.oracleDependencies ?? []) as OracleFeed[],
  });
  if (validation.errors.length > 0) {
    throw new ContractError(
      "RULE_VIOLATION",
      `Registry record refused: ${validation.errors.join(" ")}`,
      { errors: validation.errors, warnings: validation.warnings, networkProduction: validation.networkProduction },
    );
  }
  try {
    return await withAuditTransaction(
      async (tx) => {
        const [existing] = address
          ? await tx
              .select({ id: smartContractRegistry.id, status: smartContractRegistry.status })
              .from(smartContractRegistry)
              .where(
                and(
                  eq(smartContractRegistry.tenantId, principal.tenantId),
                  eq(smartContractRegistry.chainId, network.chainId),
                  sql`lower(${smartContractRegistry.address}) = ${address}`,
                ),
              )
              .limit(1)
          : [];
        const values = {
          tenantId: principal.tenantId,
          name: assertRef(input.name, "name"),
          networkKey: network.key,
          chainId: network.chainId,
          address,
          compilerVersion: input.compilerVersion.trim(),
          optimizerRuns: input.optimizerRuns ?? null,
          repositoryRef: input.repositoryRef ?? null,
          sourceCommit: input.sourceCommit.trim().toLowerCase(),
          abiHash: input.abiHash ?? null,
          bytecodeHash: input.bytecodeHash ?? null,
          verifiedOnExplorer: input.verifiedOnExplorer ?? false,
          proxyKind: input.proxyKind ?? "NONE",
          implementationAddress,
          upgradeAuthority: input.upgradeAuthority?.toLowerCase() ?? null,
          multisigAddress: input.multisigAddress?.toLowerCase() ?? null,
          timelockAddress: input.timelockAddress?.toLowerCase() ?? null,
          timelockDelaySeconds: input.timelockDelaySeconds ?? null,
          auditStatus: input.auditStatus ?? undefined,
          auditReportDocumentRef: input.auditReportDocumentRef ?? null,
          legalReviewStatus: input.legalReviewStatus ?? "REVIEW_OPEN",
          enforceabilityNote: "Registration is engineering evidence about code; it is not a legal clearance.",
          purpose: input.purpose ?? null,
          oracleDependencies: (input.oracleDependencies ?? []) as string[],
          governanceBodyRef: input.governanceBodyRef ?? null,
          riskClassificationCode: input.riskClassificationCode ?? (network.production ? "HIGH" : "MEDIUM"),
          networkProduction: network.production,
          externalRef: input.externalRef ?? null,
          note: input.note ?? null,
          status: existing?.status ?? "DRAFT",
          recordedBy: principal.userId,
          classification,
          updatedAt: new Date(),
        };
        const rows = existing
          ? await tx
              .update(smartContractRegistry)
              .set(values)
              .where(eq(smartContractRegistry.id, existing.id))
              .returning()
          : await tx
              .insert(smartContractRegistry)
              .values({ id: newId(ID_PREFIX.smartContractRegistry), ...values })
              .returning();
        const [row] = rows;
        return {
          id: row.id,
          status: row.status,
          address: row.address,
          networkKey: row.networkKey,
          warnings: validation.warnings,
          tenantId: row.tenantId,
          classification: row.classification as Classification,
        };
      },
      (r) => ({
        tenantId: r.tenantId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        action: "blockchain.registry.upsert",
        objectType: "SMART_CONTRACT_REGISTRY",
        objectId: r.id,
        outcome: "SUCCESS" as const,
        reason: `Registry record ${r.address ?? "(unassigned)"} on ${r.networkKey} saved (${r.status}); ${r.warnings.length} warning(s).`,
        authority: "blockchain:manage",
        policyVersion: policyVersionOf(policy) ?? undefined,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        traceId: context.traceId,
      }),
      (r) => ({
        type: "SMART_CONTRACT_REGISTRY_UPDATED",
        source: EVENT_SOURCE,
        domain: EVENT_DOMAIN,
        operation: "UPSERT_REGISTRY_RECORD",
        destinationDomain: "GOVERNANCE",
        tenantId: r.tenantId,
        legalEntityId: null,
        subjectType: "SMART_CONTRACT_REGISTRY",
        subjectId: r.id,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        classification: r.classification,
        payload: { address: r.address, networkKey: r.networkKey, status: r.status, warnings: r.warnings },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: {
          authorityId: null,
          decisionId: null,
          capabilityCode: null,
          permissionCode: "blockchain:manage",
          policyVersion: policyVersionOf(policy),
        },
        policyVersion: policyVersionOf(policy),
      }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw new ContractError("CONFLICT", "A registry record already exists for that chain and address.");
    throw err;
  }
}

/**
 * Move a registry record along the testnet-first ladder. Production approval is
 * refused unless the record carries a closed audit, and a deployed or
 * compromised record can never be revived — the ladder is the engine's, not a
 * client-settable field.
 */
export async function transitionRegistryRecord(
  principal: Principal,
  input: { registryId: string; to: ContractOperationalStatus; evidenceRef?: string | null; note?: string | null },
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const [row] = await db
    .select()
    .from(smartContractRegistry)
    .where(and(eq(smartContractRegistry.id, input.registryId), inArray(smartContractRegistry.tenantId, scope)))
    .limit(1);
  if (!row) throw new ContractError("NOT_FOUND", "Registry record not found within your authorised scope.");
  const policy = await authorizeMutation(principal, "blockchain:manage", {
    classification: row.classification as Classification,
    tenantId: row.tenantId,
    entityId: null,
  });
  if (!(CONTRACT_OPERATIONAL_STATUSES as readonly string[]).includes(input.to)) {
    throw new ContractError("RULE_VIOLATION", `Unknown registry status ${input.to}.`);
  }
  wrapModel(() => evaluateRegistryTransition(row.status as ContractOperationalStatus, input.to));
  if (input.to === "APPROVED_MAINNET" || input.to === "DEPLOYED_MAINNET") {
    if (!/CLOSED|PASSED/i.test(row.auditStatus ?? "")) {
      throw new ContractError("GOVERNANCE_NOT_SATISFIED", "Mainnet progression requires a completed audit recorded on the registry row.", {
        auditStatus: row.auditStatus,
      });
    }
    if (!row.legalReviewStatus.startsWith("LEGAL_REVIEW_CLOSED") && row.legalReviewStatus !== "REVIEW_CLOSED") {
      throw new ContractError("LEGAL_REVIEW_REQUIRED", "Legal review must be closed before mainnet progression.");
    }
    if (!row.multisigAddress || !row.timelockAddress) {
      throw new ContractError("AUTHORITY_BLOCKED", "A mainnet record must name both a multisig and a timelock.");
    }
  }
  if (!input.evidenceRef) {
    throw new ContractError("EVIDENCE_REQUIRED", "A registry status change must cite evidence (audit report, deployment tx, or governance decision).");
  }
  return withAuditTransaction(
    async (tx) => {
      const [updated] = await tx
        .update(smartContractRegistry)
        .set({ status: input.to, statusAt: new Date(), note: input.note ?? row.note, updatedAt: new Date() })
        .where(eq(smartContractRegistry.id, row.id))
        .returning();
      return { id: updated.id, from: row.status, to: updated.status, tenantId: updated.tenantId, classification: updated.classification as Classification };
    },
    (r) => ({
      tenantId: r.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "blockchain.registry.transition",
      objectType: "SMART_CONTRACT_REGISTRY",
      objectId: r.id,
      outcome: "SUCCESS" as const,
      reason: `Registry record ${r.from} → ${r.to} (evidence: ${input.evidenceRef}).`,
      authority: "blockchain:manage",
      policyVersion: policyVersionOf(policy) ?? undefined,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (r) => ({
      type: "SMART_CONTRACT_REGISTRY_TRANSITIONED",
      source: EVENT_SOURCE,
      domain: EVENT_DOMAIN,
      operation: `REGISTRY_${r.to}`,
      destinationDomain: "GOVERNANCE",
      tenantId: r.tenantId,
      legalEntityId: null,
      subjectType: "SMART_CONTRACT_REGISTRY",
      subjectId: r.id,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      classification: r.classification,
      payload: { from: r.from, to: r.to, evidenceRef: input.evidenceRef ?? null },
      traceId: context.traceId,
      correlationId: context.traceId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "blockchain:manage",
        policyVersion: policyVersionOf(policy),
      },
      policyVersion: policyVersionOf(policy),
    }),
  );
}

/* ------------------------------------------------------------------ */
/* §33 — Event ingestion (from an indexer)                              */
/* ------------------------------------------------------------------ */

export type IngestEventInput = {
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
  anchorId?: string | null;
  contractId?: string | null;
  obligationId?: string | null;
  correlationId?: string | null;
};

/**
 * Ingest a batch of indexed logs. Validation is per event and non-repairing:
 * anomalies become stored findings on a QUARANTINED row (auditable), a duplicate
 * is recognised by its deterministic key and never re-applied, and an event from
 * an unregistered contract is quarantined rather than attributed. Accepted rows
 * are inserted; nothing here changes a contract, an obligation or a register.
 */
export async function ingestEvents(
  principal: Principal,
  events: readonly IngestEventInput[],
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const classification: Classification = "INTERNAL";
  const policy = await authorizeMutation(principal, "blockchain:manage", {
    classification,
    tenantId: principal.tenantId,
    entityId: null,
  });
  if (!Array.isArray(events) || events.length === 0) {
    throw new ContractError("RULE_VIOLATION", "At least one event is required.");
  }
  if (events.length > 500) throw new ContractError("RULE_VIOLATION", "Batches are limited to 500 events per request.");

  const chainIds = [...new Set(events.map((e) => e.chainId))];
  const lastBlockRows = await db
    .select({
      chainId: blockchainEvents.chainId,
      blockNumber: sql<number>`max(${blockchainEvents.blockNumber})::int`.as("block_number"),
      blockHash: sql<string>``.as("block_hash"),
    })
    .from(blockchainEvents)
    .where(and(eq(blockchainEvents.tenantId, principal.tenantId), inArray(blockchainEvents.chainId, chainIds)))
    .groupBy(blockchainEvents.chainId);
  const heads = new Map<number, { blockNumber: number; blockHash: string }>();
  for (const row of lastBlockRows as unknown as Array<{ chainId: number; block_number: number; block_hash: string | null }>) {
    heads.set(row.chainId, { blockNumber: Number(row.block_number), blockHash: row.block_hash ?? "" });
  }

  const registryRows = await db
    .select({ address: smartContractRegistry.address, id: smartContractRegistry.id })
    .from(smartContractRegistry)
    .where(eq(smartContractRegistry.tenantId, principal.tenantId));
  const known = new Set(registryRows.map((r) => (r.address ?? "").toLowerCase()));
  const seenKeys = (
    await db
      .select({ key: blockchainEvents.dedupeKey })
      .from(blockchainEvents)
      .where(eq(blockchainEvents.tenantId, principal.tenantId))
  ).map((r) => r.key);

  const results: Array<{ accepted: boolean; deduplicated: boolean; findings: string[]; key: string }> = [];
  const workingHeads = new Map(heads);
  const workingSeen = [...seenKeys];

  for (const event of events) {
    const prior = workingHeads.get(event.chainId);
    const validation = validateIndexedEvent(
      {
        chainId: event.chainId,
        contractAddress: event.contractAddress,
        blockNumber: event.blockNumber,
        blockHash: event.blockHash,
        transactionHash: event.transactionHash,
        logIndex: event.logIndex,
        eventKind: event.eventKind,
        emittedAt: event.emittedAt,
        actorAddress: event.actorAddress ?? null,
        funcSelector: event.funcSelector ?? null,
        payload: event.payload,
        contractId: event.contractId ?? null,
        correlationId: event.correlationId ?? null,
        registryKnown: known.has(event.contractAddress.toLowerCase()),
        actorAuthorized: undefined,
      },
      { lastBlockByChain: Object.fromEntries(workingHeads), seenLogKeys: workingSeen },
    );
    const key = eventKey(event.chainId, event.transactionHash, event.logIndex);
    results.push({ ...validation, key });
    if (!validation.deduplicated) workingSeen.push(key);
    if (prior === undefined || event.blockNumber > prior.blockNumber) {
      workingHeads.set(event.chainId, { blockNumber: event.blockNumber, blockHash: event.blockHash });
    }
    void prior;
  }

  // Quarantined rows ARE persisted (see below) so an anomaly is reviewable rather
  // than lost: a rejected event that leaves no trace is the failure mode this
  // domain exists to prevent.
  const inserted = await withAuditTransaction<{
    id: string;
    ingestState: string;
    findings: string[];
  }[]>(
    async (tx) => {
      const rows: Array<{ id: string; ingestState: string; findings: string[] }> = [];
      for (let i = 0; i < events.length; i += 1) {
        const event = events[i]!;
        const outcome = results[i]!;
        if (outcome.deduplicated) continue;
        const [existing] = await tx
          .select({ id: blockchainEvents.id })
          .from(blockchainEvents)
          .where(
            and(
              eq(blockchainEvents.tenantId, principal.tenantId),
              eq(blockchainEvents.chainId, event.chainId),
              eq(blockchainEvents.txHash, event.transactionHash.toLowerCase()),
              eq(blockchainEvents.logIndex, event.logIndex),
            ),
          )
          .limit(1);
        if (existing) continue;
        const values = {
          tenantId: principal.tenantId,
          dedupeKey: outcome.key,
          chainId: event.chainId,
          contractAddress: event.contractAddress.toLowerCase(),
          blockNumber: event.blockNumber,
          blockHash: event.blockHash.toLowerCase(),
          txHash: event.transactionHash.toLowerCase(),
          logIndex: event.logIndex,
          eventKind: (EVENT_KINDS as readonly string[]).includes(event.eventKind) ? event.eventKind : "REGISTRY_RECORDED",
          emittedAt: new Date(event.emittedAt),
          actorAddress: event.actorAddress?.toLowerCase() ?? null,
          funcSelector: event.funcSelector ?? null,
          payload: event.payload ?? {},
          contractId: event.contractId ?? null,
          anchorId: event.anchorId ?? null,
          obligationId: event.obligationId ?? null,
          correlationId: event.correlationId ?? context.traceId,
          ingestState: outcome.accepted ? "ACCEPTED" : "QUARANTINED",
          findings: outcome.findings,
          createsAuthority: false,
          recordedBy: principal.userId,
          classification,
        };
        const [row] = await tx
          .insert(blockchainEvents)
          .values({ id: newId(ID_PREFIX.blockchainEvent), ...values })
          .onConflictDoNothing()
          .returning();
        if (row) {
          rows.push({ id: row.id, ingestState: row.ingestState, findings: row.findings as string[] });
          continue;
        }
        // A second indexer wrote the same log entry between the read above and
        // this insert. That is a duplicate, not a failure: record what is stored
        // and keep the batch going rather than aborting an entire page of events.
        const [race] = await tx
          .select({ id: blockchainEvents.id, ingestState: blockchainEvents.ingestState, findings: blockchainEvents.findings })
          .from(blockchainEvents)
          .where(and(eq(blockchainEvents.tenantId, principal.tenantId), eq(blockchainEvents.dedupeKey, outcome.key)))
          .limit(1);
        if (race) rows.push({ id: race.id, ingestState: race.ingestState, findings: race.findings as string[] });
      }
      return rows;
    },
    (r) => ({
      tenantId: principal.tenantId,
      actorUserId: principal.userId,
      actorType: "SERVICE" as const,
      action: "blockchain.events.ingest",
      objectType: "BLOCKCHAIN_EVENT",
      objectId: r[0]?.id ?? "EMPTY_BATCH",
      outcome: r.length === 0 ? ("FAILURE" as const) : r.every((x) => x.ingestState === "ACCEPTED") ? ("SUCCESS" as const) : ("FAILURE" as const),
      reason: `Ingested ${r.length} event(s) from ${results.length} submitted; ${results.filter((x) => !x.accepted && !x.deduplicated).length} quarantined, ${results.filter((x) => x.deduplicated).length} duplicate(s).`,
      authority: "blockchain:manage",
      policyVersion: policyVersionOf(policy) ?? undefined,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (r) => ({
      type: "BLOCKCHAIN_EVENTS_INGESTED",
      source: EVENT_SOURCE,
      domain: EVENT_DOMAIN,
      operation: "INGEST_EVENTS",
      destinationDomain: null,
      tenantId: principal.tenantId,
      legalEntityId: null,
      subjectType: "BLOCKCHAIN_EVENT",
      subjectId: r[0]?.id ?? "EMPTY_BATCH",
      actorUserId: principal.userId,
      actorType: "SERVICE" as const,
      classification,
      payload: {
        submitted: results.length,
        persisted: r.length,
        quarantined: results.filter((x) => !x.accepted && !x.deduplicated).length,
        duplicates: results.filter((x) => x.deduplicated).length,
        createsAuthority: false,
      },
      traceId: context.traceId,
      correlationId: context.traceId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "blockchain:manage",
        policyVersion: policyVersionOf(policy),
      },
      policyVersion: policyVersionOf(policy),
    }),
  );

  return {
    submitted: results.length,
    persisted: inserted.length,
    results: results.map((r, i) => ({
      accepted: r.accepted,
      deduplicated: r.deduplicated,
      findings: r.findings,
      persisted: i < inserted.length ? (inserted[i] as { ingestState: string }).ingestState : "SKIPPED",
    })),
  };
}

/* ------------------------------------------------------------------ */
/* §32 — Governed oracles                                               */
/* ------------------------------------------------------------------ */

/**
 * Record a reading for a governed source. The evaluation (freshness against the
 * feed's max age, deviation against its limit, source-kind requirements, dispute
 * coverage) is computed by the engine at `asOf` and stored verbatim, so an
 * executor can consume `usable` without re-deriving it and a reviewer can replay
 * the same verdict. A missing or rejected reading is a refusal to execute, not a
 * default.
 */
export async function recordOracleReading(
  principal: Principal,
  input: {
    sourceId: string;
    subjectCode: string;
    valueBps?: number | null;
    valueText?: string | null;
    decimals?: number;
    rawValue?: string | null;
    observedAt: string;
    asOf?: string | null;
    roundId?: string | null;
    anchorId?: string | null;
    disputeRef?: string | null;
    note?: string | null;
  },
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const [source] = await db
    .select()
    .from(blockchainOracleSources)
    .where(and(eq(blockchainOracleSources.id, input.sourceId), inArray(blockchainOracleSources.tenantId, scope)))
    .limit(1);
  if (!source) throw new ContractError("NOT_FOUND", "Oracle source not found within your authorised scope.");
  const policy = await authorizeMutation(principal, "blockchain:manage", {
    classification: source.classification as Classification,
    tenantId: source.tenantId,
    entityId: null,
  });
  if (source.state !== "ACTIVE") {
    throw new ContractError("INVALID_STATE", `Oracle source is ${source.state}; readings from a non-active source are not recorded.`, {
      state: source.state,
    });
  }
  if (Number.isNaN(Date.parse(input.observedAt))) {
    throw new ContractError("RULE_VIOLATION", "observedAt must be a parseable timestamp.");
  }
  const asOf = input.asOf ?? new Date().toISOString();
  const previous = await db
    .select({
      id: blockchainOracleReadings.id,
      valueBps: blockchainOracleReadings.valueBps,
      observedAt: blockchainOracleReadings.observedAt,
    })
    .from(blockchainOracleReadings)
    .where(
      and(
        eq(blockchainOracleReadings.tenantId, source.tenantId),
        eq(blockchainOracleReadings.sourceId, source.id),
        eq(blockchainOracleReadings.subjectCode, input.subjectCode),
      ),
    )
    .orderBy(desc(blockchainOracleReadings.observedAt))
    .limit(1);
  const evaluation = await wrapModel(() =>
    evaluateReading({
      feed: source.feed as OracleFeed,
      valueBps: input.valueBps ?? null,
      valueText: input.valueText ?? null,
      decimals: input.decimals ?? 0,
      rawValue: input.rawValue ?? null,
      sourceKind: source.sourceKind as OracleSourceKind,
      authorityRef: source.authorityRef ?? undefined,
      observedAt: input.observedAt,
      asOf,
      fallbackOrder: source.fallbackOrder,
      disputeOpen: Boolean(input.disputeRef),
      previousValueBps: previous[0]?.valueBps ?? null,
      deviationLimitBps: source.deviationLimitBps,
      maxAgeSeconds: source.maxAgeSeconds,
    }),
  );
  if (input.anchorId) {
    await anchorInScope(input.anchorId, scope);
  }

  const readingValues = {
          id: newId(ID_PREFIX.blockchainOracleReading),
          tenantId: source.tenantId,
          sourceId: source.id,
          subjectCode: assertRef(input.subjectCode, "subjectCode"),
          feed: source.feed,
          valueBps: input.valueBps ?? null,
          valueText: input.valueText ?? null,
          decimals: input.decimals ?? 0,
          rawValue: input.rawValue ?? null,
          observedAt: new Date(input.observedAt),
          asOf: new Date(asOf),
          ageSeconds: evaluation.ageSeconds,
          deviationBps: evaluation.deviationBps,
          state: evaluation.status,
          usable: evaluation.usable,
          grantsAuthority: false,
          policyVersion: policyVersionOf(policy) ?? null,
          // The tolerances in force are stored with the verdict so a reviewer can
          // reproduce why a reading was adopted or quarantined even after the
          // source is re-tuned (the source row is the live config, not history).
          evaluation: {
            findings: evaluation.findings,
            note: evaluation.note,
            engine: "blockchain-oracle/1",
            sourceCode: source.code,
            deviationLimitBps: source.deviationLimitBps,
            maxAgeSeconds: source.maxAgeSeconds,
          },
          roundId: input.roundId ?? null,
          anchorId: input.anchorId ?? null,
          previousReadingId: previous[0]?.id ?? null,
          disputeRef: input.disputeRef ?? null,
          note: input.note ?? null,
          recordedBy: principal.userId,
          classification: source.classification as Classification,
  };

  return withAuditTransaction(
    async (tx) => {
      let row: typeof blockchainOracleReadings.$inferSelect | undefined;
      try {
        const inserted = await tx.insert(blockchainOracleReadings).values(readingValues).returning();
        row = inserted[0];
      } catch (err) {
        // (tenant, source, subject, observedAt) is unique: the same instant from
        // the same source is a duplicate submission, not a second data point.
        if (isUniqueViolation(err)) {
          throw new ContractError(
            "CONFLICT",
            "That source already recorded a reading for this subject at this instant. Submit a new observedAt; never overwrite an oracle data point.",
          );
        }
        throw err;
      }
      return { id: row.id, usable: row.usable, state: row.state, tenantId: row.tenantId, classification: row.classification as Classification };
    },
    (r) => ({
      tenantId: r.tenantId,
      actorUserId: principal.userId,
      actorType: "SERVICE" as const,
      action: "blockchain.oracle.reading",
      objectType: "BLOCKCHAIN_ORACLE_READING",
      objectId: r.id,
      outcome: r.usable ? ("SUCCESS" as const) : ("DENIED" as const),
      reason: `Oracle reading ${input.subjectCode} (${source.feed}) evaluated ${r.state}; usable=${r.usable}.`,
      authority: "blockchain:manage",
      policyVersion: policyVersionOf(policy) ?? undefined,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (r) => ({
      type: "BLOCKCHAIN_ORACLE_READING_RECORDED",
      source: EVENT_SOURCE,
      domain: EVENT_DOMAIN,
      operation: "RECORD_ORACLE_READING",
      destinationDomain: "FINANCE",
      tenantId: r.tenantId,
      legalEntityId: null,
      subjectType: "BLOCKCHAIN_ORACLE_READING",
      subjectId: r.id,
      actorUserId: principal.userId,
      actorType: "SERVICE" as const,
      classification: r.classification,
      payload: {
        feed: source.feed,
        subjectCode: input.subjectCode,
        state: r.state,
        usable: r.usable,
        grantsAuthority: false,
      },
      traceId: context.traceId,
      correlationId: context.traceId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "blockchain:manage",
        policyVersion: policyVersionOf(policy),
      },
      policyVersion: policyVersionOf(policy),
    }),
  );
}

/**
 * Oracle evaluation with the source's OWN configured limits applied on top of
 * the feed defaults. A source may be STRICTER than its family floor, never
 * looser: the family limit in `model.ts` is the governance floor, so a
 * misconfigured (relaxed) source cannot widen what an executor may accept.
 */
async function evaluateReading(input: {
  feed: OracleFeed;
  valueBps: number | null;
  valueText: string | null | undefined;
  decimals: number;
  rawValue: string | null | undefined;
  sourceKind: "AUTHORITATIVE_PRIMARY" | "SISTER_SOURCE" | "OPEN_DATA" | "MANUAL_EVIDENCE" | "ONCHAIN_PUSH";
  authorityRef: string | null | undefined;
  observedAt: string;
  asOf: string;
  fallbackOrder: number;
  disputeOpen: boolean;
  previousValueBps: number | null;

  deviationLimitBps: number;
  maxAgeSeconds: number;
}) {
  const base = evaluateOracleReading({
    feed: input.feed,
    valueBps: input.valueBps,
    valueText: input.valueText ?? null,
    decimals: input.decimals,
    rawValue: input.rawValue ?? null,
    sourceKind: input.sourceKind,
    authorityRef: input.authorityRef,
    observedAt: input.observedAt,
    asOf: input.asOf,
    fallbackOrder: input.fallbackOrder,
    disputeOpen: input.disputeOpen,
    previousValueBps: input.previousValueBps,
  });
  const effectiveDeviationLimit = Math.min(input.deviationLimitBps, ORACLE_DEVIATION_BPS_LIMIT[input.feed]);
  const findings = [...base.findings];
  let usable = base.usable;
  if (base.deviationBps !== null && Math.abs(base.deviationBps) > effectiveDeviationLimit) {
    usable = false;
    if (!findings.some((f) => f.includes("exceeds the"))) {
      findings.push(`Source-level deviation limit ${effectiveDeviationLimit} bps exceeded for ${input.feed}.`);
    }
  }
  const maxAge = Math.min(input.maxAgeSeconds, ORACLE_MAX_AGE_SECONDS[input.feed]);
  if (base.ageSeconds !== null && base.ageSeconds > maxAge) {
    usable = false;
    if (!findings.some((f) => f.includes("stale"))) findings.push(`Reading is ${base.ageSeconds}s old; source max age ${maxAge}s for ${input.feed}.`);
  }
  return { ...base, usable, findings };
}

/* ------------------------------------------------------------------ */
/* §34 — Reconciliation                                                 */
/* ------------------------------------------------------------------ */

/**
 * Run a read-only reconciliation between the canonical capitalization records
 * and the approved on-chain representation. Canonical inputs are read from
 * `share_classes`/`equity_positions` plus the party register's approved
 * addresses; the on-chain side from `blockchain_token_positions`. Findings are
 * persisted as a run; NO row on either side is modified, and the run records
 * `mutates_state = false` explicitly.
 */
export async function runReconciliation(
  principal: Principal,
  input: {
    code: string;
    networkKey: string;
    registryId?: string | null;
    tokenSymbol?: string | null;
    asOfDate: string;
    toleranceUnits?: number;
    staleBlockTolerance?: number;
    note?: string | null;
  },
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const network = resolveNetwork(input.networkKey);
  const classification: Classification = "RESTRICTED";
  const policy = await authorizeMutation(principal, "blockchain:manage", {
    classification,
    tenantId: principal.tenantId,
    entityId: null,
  });
  const positions = await db
    .select({
      holderPartyId: equityPositions.holderPartyId,
      shares: equityPositions.totalShares,
      vested: equityPositions.vestedShares,
      classCode: shareClasses.code,
    })
    .from(equityPositions)
    .innerJoin(shareClasses, eq(equityPositions.shareClassId, shareClasses.id))
    .where(and(eq(equityPositions.tenantId, principal.tenantId), inArray(equityPositions.tenantId, scope)));
  const approved = await db
    .select({
      partyId: contractParties.partyId,
      address: contractParties.approvedBlockchainAddress,
      evidenceRef: contractParties.blockchainAddressEvidenceRef,
    })
    .from(contractParties)
    .where(eq(contractParties.tenantId, principal.tenantId));
  const addressByParty = new Map(approved.filter((a) => a.address).map((a) => [a.partyId, a.address!.toLowerCase()]));
  const canonical: CanonicalPosition[] = positions.map((p) => ({
    holderPartyId: p.holderPartyId ?? "UNASSIGNED",
    shareClassCode: p.classCode,
    shares: Number(p.shares ?? 0),
    vestedShares: Number(p.vested ?? 0),
    approvedAddress: p.holderPartyId ? (addressByParty.get(p.holderPartyId) ?? null) : null,
  }));
  const observed = await db
    .select()
    .from(blockchainTokenPositions)
    .where(
      and(
        eq(blockchainTokenPositions.tenantId, principal.tenantId),
        eq(blockchainTokenPositions.chainId, network.chainId),
        input.tokenSymbol ? eq(blockchainTokenPositions.tokenSymbol, input.tokenSymbol) : sql`true`,
      ),
    );
  const onChain: OnChainPosition[] = observed.map((o) => ({
    holderAddress: o.holderAddress,
    tokenSymbol: o.tokenSymbol,
    balanceUnits: Number(o.balanceUnits),
    lastSyncedBlock: Number(o.lastSyncedBlock),
    chainHeadBlock: Number(o.chainHeadBlock),
    sourceRegistryId: o.registryId,
  }));
  const sharesPerUnit = Number(observed[0]?.sharesPerUnit ?? 1);
  const result = reconcileOwnership({
    canonical,
    onChain,
    sharesPerUnit,
    toleranceUnits: input.toleranceUnits ?? 0,
    staleBlockTolerance: input.staleBlockTolerance ?? 25,
    knownHolderAddresses: [...addressByParty.values()],
    transferEvents: [],
  });
  wrapModel(() => assertIsoDate(input.asOfDate, "asOfDate"));

  // A run code is unique per tenant: a re-run under the same code is a collision,
  // never an update. The observation an index made stays on the record so the
  // history of what was compared, when, and with what tolerance stays reviewable.
  try {
    return await withAuditTransaction(
      async (tx) => {
        const [row] = await tx
          .insert(blockchainReconciliationRuns)
          .values({
            id: newId(ID_PREFIX.blockchainReconciliation),
            tenantId: principal.tenantId,
            code: assertRef(input.code, "code"),
            networkKey: network.key,
            chainId: network.chainId,
            registryId: input.registryId ?? null,
            tokenSymbol: input.tokenSymbol ?? null,
            asOfDate: input.asOfDate,
            sharesPerUnit: String(sharesPerUnit),
            toleranceUnits: input.toleranceUnits ?? 0,
            staleBlockTolerance: input.staleBlockTolerance ?? 25,
            canonicalSnapshot: canonical as unknown as Record<string, unknown>[],
            onchainSnapshot: onChain as unknown as Record<string, unknown>[],
            status: result.status,
            findings: result.findings as unknown as Record<string, unknown>[],
            findingCount: result.findings.length,
            highSeverityCount: result.findings.filter((f) => f.severity === "HIGH").length,
            totals: result.totals as unknown as Record<string, unknown>,
            mutatesState: false,
            note: input.note ?? null,
            ranBy: principal.userId,
            recordedBy: principal.userId,
            classification,
          })
          .returning();
        if (observed.length > 0) {
          await tx
            .update(blockchainTokenPositions)
            .set({ lastReconciliationRunId: row.id, updatedAt: new Date() })
            .where(eq(blockchainTokenPositions.tenantId, principal.tenantId));
        }
        return {
          id: row.id,
          status: row.status,
          findingCount: row.findingCount,
          highSeverityCount: row.highSeverityCount,
          tenantId: row.tenantId,
          classification: row.classification as Classification,
        };
      },
      (r) => ({
        tenantId: r.tenantId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        action: "blockchain.reconciliation.run",
        objectType: "BLOCKCHAIN_RECONCILIATION_RUN",
        objectId: r.id,
        // A reconciliation with findings is still a SUCCESSFUL run: its output is
        // the finding list. "Failure" would wrongly imply the comparison did not happen.
        outcome: "SUCCESS" as const,
        reason: `Reconciliation ${input.code}: ${r.status} (${r.findingCount} finding(s), ${r.highSeverityCount} high). Nothing was overwritten.`,
        authority: "blockchain:manage",
        policyVersion: policyVersionOf(policy) ?? undefined,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        traceId: context.traceId,
      }),
      (r) => ({
        type: "BLOCKCHAIN_RECONCILIATION_RUN",
        source: EVENT_SOURCE,
        domain: EVENT_DOMAIN,
        operation: "RUN_RECONCILIATION",
        destinationDomain: "CAPITAL",
        tenantId: r.tenantId,
        legalEntityId: null,
        subjectType: "BLOCKCHAIN_RECONCILIATION_RUN",
        subjectId: r.id,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        classification: r.classification,
        payload: { status: r.status, findings: r.findingCount, highSeverity: r.highSeverityCount, mutatesState: false },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: {
          authorityId: null,
          decisionId: null,
          capabilityCode: null,
          permissionCode: "blockchain:manage",
          policyVersion: policyVersionOf(policy),
        },
        policyVersion: policyVersionOf(policy),
      }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ContractError(
        "CONFLICT",
        "A reconciliation run with this code already exists in your tenant. Record the new observation under a new code: a run is never overwritten.",
      );
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Execution gate read model (used by the execution package routes)     */
/* ------------------------------------------------------------------ */

/**
 * The full execution gate set for an on-chain package, assembled ONLY from
 * recorded state: contract lifecycle, open disputes, registry verification,
 * the latest usable oracle reading, evidence presence, and the network's
 * production flag. Advisory numbers never enter this decision.
 */
export async function readExecutionPosture(principal: Principal, input: {
  contractId: string;
  obligationId?: string | null;
  networkKey: string;
  packageState: "DRAFT" | "READY" | "PROPOSED" | "TIMELOCKED" | "EXECUTABLE" | "EXECUTED" | "PAUSED" | "VOIDED" | "FAILED";
  multisigApproved?: boolean;
  timelockReady?: boolean;
  contractAddress?: string | null;
  feed?: OracleFeed | null;
  subjectCode?: string | null;
}) {
  const scope = await tenantScopeIds(principal);
  const contract = await contractInScope(input.contractId, scope);
  const network = resolveNetwork(input.networkKey);
  const registry = input.contractAddress
    ? await db
        .select({ status: smartContractRegistry.status, production: smartContractRegistry.networkProduction })
        .from(smartContractRegistry)
        .where(
          and(
            eq(smartContractRegistry.tenantId, principal.tenantId),
            eq(smartContractRegistry.chainId, network.chainId),
            sql`lower(${smartContractRegistry.address}) = ${input.contractAddress.toLowerCase()}`,
          ),
        )
        .limit(1)
    : [];
  const anchors = await db
    .select({ status: blockchainAnchors.status, blockHashMatchesChain: blockchainAnchors.blockHashMatchesChain })
    .from(blockchainAnchors)
    .where(and(eq(blockchainAnchors.tenantId, principal.tenantId), eq(blockchainAnchors.contractId, contract.id)));
  // `VERIFIED` is what a governed verification ACT recorded; it is not a promise
  // that the evidence still holds. An anchor whose latest check contradicted the
  // chain (block hash mismatch, commitment drift) stops counting as evidence for
  // execution, while remaining on the record as a finding for a human.
  const liveEvidence = anchors.filter((a) => a.status === "VERIFIED" && a.blockHashMatchesChain !== false);
  const contradicted = anchors.filter((a) => a.status === "VERIFIED" && a.blockHashMatchesChain === false).length;
  const oracleUsable = input.feed && input.subjectCode ? await hasUsableReading(principal.tenantId, input.feed, input.subjectCode) : false;
  const gate = evaluateExecutionGates({
    contractLifecycleAllows: CONTRACT_LIFECYCLE_STATES.includes(contract.state as ContractLifecycleState)
      ? ["ACTIVE", "PERFORMANCE_MONITORING", "AMENDED", "RENEWED"].includes(contract.state)
      : false,
    state: input.packageState,
    registryVerified: registry[0]?.status === "VERIFIED_TESTNET" || registry[0]?.status === "APPROVED_MAINNET" || registry[0]?.status === "DEPLOYED_MAINNET",
    oracleUsable: input.feed ? oracleUsable : true,
    disputePauses: await disputePausesForContract(principal.tenantId, contract.id),
    multisigApproved: input.multisigApproved === true,
    timelockReady: input.timelockReady === true,
    evidenceRecorded: liveEvidence.length > 0,
    productionNetwork: network.production,
  });
  return {
    ...gate,
    network: { key: network.key, chainId: network.chainId, production: network.production, requiredConfirmations: network.requiredConfirmations },
    contractState: contract.state,
    registryStatus: registry[0]?.status ?? null,
    verifiedAnchors: liveEvidence.length,
    contradictedAnchors: contradicted,
  };
}

async function disputePausesForContract(tenantId: string, contractId: string): Promise<boolean> {
  const rows = await db
    .select({ pausesExecution: contractDisputes.pausesExecution, state: contractDisputes.state })
    .from(contractDisputes)
    .where(and(eq(contractDisputes.tenantId, tenantId), eq(contractDisputes.contractId, contractId)));
  // Fail-closed: an open dispute whose recorded posture pauses execution blocks
  // every downstream on-chain act until a human resolves it.
  return rows.some((r) => r.pausesExecution === true && !["CLOSED", "WITHDRAWN", "SETTLED"].includes(r.state));
}

/**
 * The oracle gate for execution: the NEWEST reading for the subject must be
 * usable, from a source that is still ACTIVE. Filtering on `usable = true` first
 * would let a quarantined newest reading be silently bypassed in favour of an
 * older one — and a feed that disagrees with itself is a reason to stop, never a
 * reason to shop for a friendlier number.
 */
async function hasUsableReading(tenantId: string, feed: OracleFeed, subjectCode: string): Promise<boolean> {
  const [row] = await db
    .select({ usable: blockchainOracleReadings.usable, sourceState: blockchainOracleSources.state })
    .from(blockchainOracleReadings)
    .innerJoin(blockchainOracleSources, eq(blockchainOracleReadings.sourceId, blockchainOracleSources.id))
    .where(
      and(
        eq(blockchainOracleReadings.tenantId, tenantId),
        eq(blockchainOracleReadings.feed, feed),
        eq(blockchainOracleReadings.subjectCode, subjectCode),
      ),
    )
    .orderBy(desc(blockchainOracleReadings.asOf))
    .limit(1);
  return row?.usable === true && row.sourceState === "ACTIVE";
}

/** Commitment used when an obligation is executed deterministically on-chain. */
export function obligationPackageCommitment(input: {
  obligationId: string;
  contractId: string;
  kind: string;
  deliverableHash: string;
  amountMajor: number;
  dueBlock: number;
  oracleRound: number;
  paused: boolean;
  chainId: number;
  verifyingContract: string;
}) {
  return obligationPackageDigest(input);
}

export { idToBytes32, obligationTypedDigest };

/* ------------------------------------------------------------------ */
/* §32 — Oracle source governance                                       */
/* ------------------------------------------------------------------ */

export type UpsertOracleSourceInput = {
  code: string;
  displayName: string;
  feed: OracleFeed;
  sourceKind: "AUTHORITATIVE_PRIMARY" | "SISTER_SOURCE" | "OPEN_DATA" | "MANUAL_EVIDENCE" | "ONCHAIN_PUSH";
  networkKey?: string | null;
  contractAddress?: string | null;
  authorityRef?: string | null;
  /** Source-specific tolerance. May be STRICTER than the family floor, never looser. */
  deviationLimitBps?: number | null;
  maxAgeSeconds?: number | null;
  fallbackOrder?: number;
  manualSubmitterRoleCode?: string | null;
  state?: "ACTIVE" | "SUSPENDED" | "DISQUALIFIED";
  legalReviewStatus?: string;
  governanceNote?: string | null;
  note?: string | null;
};

/**
 * Register or amend a governed oracle source. Two rules make this the control it
 * has to be: (a) a source may only TIGHTEN its feed's deviation limit and max
 * age — the family floor in the engine is the governance minimum, so a
 * misconfigured or captured source cannot widen what an executor accepts; and
 * (b) an AUTHORITATIVE_PRIMARY or ONCHAIN_PUSH source must name the record that
 * qualifies it (`authorityRef`). OPEN_DATA is admitted for monitoring and
 * permanently marked non-triggering by the evaluator.
 */
export async function upsertOracleSource(
  principal: Principal,
  input: UpsertOracleSourceInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const classification: Classification = "INTERNAL";
  const policy = await authorizeMutation(principal, "blockchain:manage", {
    classification,
    tenantId: principal.tenantId,
    entityId: null,
  });
  if (!(ORACLE_FEEDS as readonly string[]).includes(input.feed)) {
    throw new ContractError("RULE_VIOLATION", `Unknown oracle feed ${String(input.feed)}.`);
  }
  if (!(ORACLE_SOURCE_KINDS as readonly string[]).includes(input.sourceKind)) {
    throw new ContractError("RULE_VIOLATION", `Unknown oracle source kind ${String(input.sourceKind)}.`);
  }
  const floorDeviation = ORACLE_DEVIATION_BPS_LIMIT[input.feed];
  const floorAge = ORACLE_MAX_AGE_SECONDS[input.feed];
  const deviationLimitBps = Math.min(input.deviationLimitBps ?? floorDeviation, floorDeviation);
  const maxAgeSeconds = Math.min(input.maxAgeSeconds ?? floorAge, floorAge);
  if (input.deviationLimitBps !== null && input.deviationLimitBps !== undefined && input.deviationLimitBps > floorDeviation) {
    throw new ContractError(
      "RULE_VIOLATION",
      `${input.feed} sources may not widen the family deviation limit (${floorDeviation} bps floor). Configure a stricter limit or use another feed family.`,
      { requestedBps: input.deviationLimitBps, floorBps: floorDeviation },
    );
  }
  if (input.maxAgeSeconds !== null && input.maxAgeSeconds !== undefined && input.maxAgeSeconds > floorAge) {
    throw new ContractError(
      "RULE_VIOLATION",
      `${input.feed} sources may not widen the family freshness bound (${floorAge}s floor).`,
      { requestedSeconds: input.maxAgeSeconds, floorSeconds: floorAge },
    );
  }
  if ((input.sourceKind === "AUTHORITATIVE_PRIMARY" || input.sourceKind === "ONCHAIN_PUSH") && !input.authorityRef) {
    throw new ContractError(
      "EVIDENCE_REQUIRED",
      "An authoritative or on-chain-push source must cite the record that qualifies it (authorityRef).",
    );
  }
  if (input.sourceKind === "MANUAL_EVIDENCE" && !input.manualSubmitterRoleCode) {
    throw new ContractError(
      "RULE_VIOLATION",
      "A manual-evidence source must name the role allowed to submit readings: an unattributed human input is not governed data.",
    );
  }
  const network = input.networkKey ? resolveNetwork(input.networkKey) : null;
  const contractAddress = input.contractAddress ? normalizeAddress(input.contractAddress, "contractAddress") : null;
  try {
    return await withAuditTransaction(
      async (tx) => {
        const [existing] = await tx
          .select({ id: blockchainOracleSources.id, state: blockchainOracleSources.state })
          .from(blockchainOracleSources)
          .where(
            and(
              eq(blockchainOracleSources.tenantId, principal.tenantId),
              eq(blockchainOracleSources.code, assertRef(input.code, "code")),
            ),
          )
          .limit(1);
        const values = {
          tenantId: principal.tenantId,
          code: assertRef(input.code, "code"),
          displayName: assertRef(input.displayName, "displayName"),
          feed: input.feed,
          sourceKind: input.sourceKind,
          networkKey: network?.key ?? null,
          chainId: network?.chainId ?? null,
          contractAddress,
          authorityRef: input.authorityRef ?? null,
          deviationLimitBps,
          maxAgeSeconds,
          fallbackOrder: input.fallbackOrder ?? 1,
          state: input.state ?? "ACTIVE",
          legalReviewStatus: input.legalReviewStatus ?? "REQUIRES_LEGAL_REVIEW",
          governanceNote: input.governanceNote ?? null,
          manualSubmitterRoleCode: input.manualSubmitterRoleCode ?? null,
          note: input.note ?? null,
          recordedBy: principal.userId,
          classification,
          updatedAt: new Date(),
        };
        void scope;
        const [row] = existing
          ? await tx
              .update(blockchainOracleSources)
              .set(values)
              .where(eq(blockchainOracleSources.id, existing.id))
              .returning()
          : await tx
              .insert(blockchainOracleSources)
              .values({ id: newId(ID_PREFIX.blockchainOracleSource), ...values })
              .returning();
        return {
          id: row.id,
          code: row.code,
          state: row.state,
          deviationLimitBps: row.deviationLimitBps,
          maxAgeSeconds: row.maxAgeSeconds,
          tenantId: row.tenantId,
          classification: row.classification as Classification,
        };
      },
      (r) => ({
        tenantId: r.tenantId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        action: "blockchain.oracle.upsert-source",
        objectType: "BLOCKCHAIN_ORACLE_SOURCE",
        objectId: r.id,
        outcome: "SUCCESS" as const,
        reason: `Oracle source ${r.code} (${input.feed}) recorded at ${r.deviationLimitBps} bps / ${r.maxAgeSeconds}s, state ${r.state}.`,
        authority: "blockchain:manage",
        policyVersion: policyVersionOf(policy) ?? undefined,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        traceId: context.traceId,
      }),
      (r) => ({
        type: "BLOCKCHAIN_ORACLE_SOURCE_UPDATED",
        source: EVENT_SOURCE,
        domain: EVENT_DOMAIN,
        operation: "UPSERT_ORACLE_SOURCE",
        destinationDomain: null,
        tenantId: r.tenantId,
        legalEntityId: null,
        subjectType: "BLOCKCHAIN_ORACLE_SOURCE",
        subjectId: r.id,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        classification: r.classification,
        payload: {
          code: r.code,
          feed: input.feed,
          sourceKind: input.sourceKind,
          deviationLimitBps: r.deviationLimitBps,
          maxAgeSeconds: r.maxAgeSeconds,
          state: r.state,
        },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: {
          authorityId: null,
          decisionId: null,
          capabilityCode: null,
          permissionCode: "blockchain:manage",
          policyVersion: policyVersionOf(policy),
        },
        policyVersion: policyVersionOf(policy),
      }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw new ContractError("CONFLICT", "An oracle source with this code already exists in your tenant.");
    throw err;
  }
}

/** The latest reading for one subject, re-evaluated at `asOf` (never trusted raw). */
export async function readOraclePosture(
  principal: Principal,
  input: { feed: OracleFeed; subjectCode: string; asOf: string; sourceId?: string | null },
) {
  const scope = await tenantScopeIds(principal);
  const asOf = input.asOf;
  if (Number.isNaN(Date.parse(asOf))) throw new ContractError("RULE_VIOLATION", "asOf must be a parseable instant.");
  const clauses = [
    inArray(blockchainOracleSources.tenantId, scope),
    eq(blockchainOracleSources.feed, input.feed),
    eq(blockchainOracleReadings.subjectCode, input.subjectCode),
  ];
  if (input.sourceId) clauses.push(eq(blockchainOracleReadings.sourceId, input.sourceId));
  const rows = await db
    .select({
      readingId: blockchainOracleReadings.id,
      sourceId: blockchainOracleReadings.sourceId,
      code: blockchainOracleSources.code,
      sourceKind: blockchainOracleSources.sourceKind,
      state: blockchainOracleSources.state,
      deviationLimitBps: blockchainOracleSources.deviationLimitBps,
      maxAgeSeconds: blockchainOracleSources.maxAgeSeconds,
      authorityRef: blockchainOracleSources.authorityRef,
      fallbackOrder: blockchainOracleSources.fallbackOrder,
      valueBps: blockchainOracleReadings.valueBps,
      valueText: blockchainOracleReadings.valueText,
      decimals: blockchainOracleReadings.decimals,
      observedAt: blockchainOracleReadings.observedAt,
      deviationBps: blockchainOracleReadings.deviationBps,
      recordedUsable: blockchainOracleReadings.usable,
      evaluation: blockchainOracleReadings.evaluation,
      disputeRef: blockchainOracleReadings.disputeRef,
    })
    .from(blockchainOracleReadings)
    .innerJoin(blockchainOracleSources, eq(blockchainOracleReadings.sourceId, blockchainOracleSources.id))
    .where(and(...clauses))
    .orderBy(desc(blockchainOracleReadings.observedAt))
    .limit(10);
  const evaluated = rows.map((r) => {
    const verdict = evaluateOracleReading({
      feed: input.feed,
      valueBps: r.valueBps,
      valueText: r.valueText,
      decimals: r.decimals,
      sourceKind: r.sourceKind as OracleSourceKind,
      authorityRef: r.authorityRef,
      observedAt: r.observedAt.toISOString(),
      asOf,
      fallbackOrder: r.fallbackOrder,
      disputeOpen: Boolean(r.disputeRef),
    });
    const limit = Math.min(r.deviationLimitBps, ORACLE_DEVIATION_BPS_LIMIT[input.feed]);
    const maxAge = Math.min(r.maxAgeSeconds, ORACLE_MAX_AGE_SECONDS[input.feed]);
    // Posture is re-evaluated for freshness against `asOf`, but it can only ever
    // be STRICTER than the verdict recorded at the time: the reading had no
    // predecessor in this isolated recomputation, so its recorded deviation is the
    // authority for that axis. A row that was quarantined stays quarantined — no
    // read model gets to promote evidence after the fact.
    const deviationBps = verdict.deviationBps ?? r.deviationBps;
    const storedFindings = Array.isArray((r.evaluation as { findings?: unknown } | null)?.findings)
      ? ((r.evaluation as { findings: string[] }).findings ?? [])
      : [];
    const usable =
      verdict.usable &&
      r.recordedUsable &&
      r.state === "ACTIVE" &&
      (verdict.ageSeconds === null || verdict.ageSeconds <= maxAge) &&
      (deviationBps === null || Math.abs(deviationBps) <= limit);
    return {
      readingId: r.readingId,
      sourceCode: r.code,
      sourceState: r.state,
      observedAt: r.observedAt.toISOString(),
      valueBps: r.valueBps,
      status: r.state === "ACTIVE" ? verdict.status : "MISSING",
      usable,
      findings: [
        ...(r.state === "ACTIVE" ? verdict.findings : [`Source is ${r.state}; its readings are not usable.`]),
        ...(r.recordedUsable ? [] : storedFindings),
      ],
      grantsAuthority: false as const,
    };
  });
  return {
    feed: input.feed,
    subjectCode: input.subjectCode,
    asOf,
    candidates: evaluated,
    /** True only when at least one ACTIVE source produced a usable reading. */
    anyUsable: evaluated.some((e) => e.usable),
    /**
     * The newest reading — what an executor would actually consume — usable?
     * `anyUsable` with `bestIsUsable: false` means the feed's latest word is
     * quarantined while an older reading survives: a fallback is a policy
     * decision for a human, never a default of this read model.
     */
    bestIsUsable: evaluated[0]?.usable ?? false,
    note: "The best reading is the one an executor may consume; a missing or disputed reading is a refusal to execute, never a zero.",
  };
}

/* ------------------------------------------------------------------ */
/* §34 — Observed on-chain positions (non-authoritative by construction)*/
/* ------------------------------------------------------------------ */

/**
 * Record observed token balances for reconciliation. `authoritative` is pinned
 * false and there is no parameter that can set it: the canonical register lives
 * in the cap-table domain, and this table exists only so a comparison has an
 * input. An unattributed address is stored as-is and surfaces as UNKNOWN_HOLDER
 * in the next run rather than being invented into a party.
 */
export async function recordTokenPositions(
  principal: Principal,
  input: {
    chainId: number;
    tokenSymbol: string;
    registryId?: string | null;
    decimals?: number;
    sharesPerUnit?: string;
    positions: ReadonlyArray<{ holderAddress: string; balanceUnits: number; lastSyncedBlock?: number; chainHeadBlock?: number }>;
    note?: string | null;
  },
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const classification: Classification = "CONFIDENTIAL";
  const policy = await authorizeMutation(principal, "blockchain:manage", {
    classification,
    tenantId: principal.tenantId,
    entityId: null,
  });
  if (input.positions.length === 0) throw new ContractError("RULE_VIOLATION", "At least one position is required.");
  if (input.positions.length > 1000) throw new ContractError("RULE_VIOLATION", "Batches are limited to 1000 positions.");
  const addresses = input.positions.map((p) => normalizeAddress(p.holderAddress, "holderAddress"));
  const approved = await db
    .select({ partyId: contractParties.partyId, address: contractParties.approvedBlockchainAddress })
    .from(contractParties)
    .where(eq(contractParties.tenantId, principal.tenantId));
  const byAddress = new Map(approved.filter((a) => a.address).map((a) => [a.address!.toLowerCase(), a.partyId]));
  void scope;

  return withAuditTransaction(
    async (tx) => {
      const written: Array<{ holderAddress: string; holderPartyId: string | null }> = [];
      for (let i = 0; i < input.positions.length; i += 1) {
        const p = input.positions[i]!;
        const holderAddress = addresses[i]!;
        if (!Number.isInteger(p.balanceUnits) || p.balanceUnits < 0) {
          throw new ContractError("RULE_VIOLATION", "balanceUnits must be a non-negative integer (raw token units).");
        }
        const holderPartyId = byAddress.get(holderAddress) ?? null;
        const values = {
          tenantId: principal.tenantId,
          holderAddress,
          holderPartyId,
          registryId: input.registryId ?? null,
          tokenSymbol: assertRef(input.tokenSymbol, "tokenSymbol").toUpperCase(),
          balanceUnits: p.balanceUnits,
          decimals: input.decimals ?? 0,
          sharesPerUnit: input.sharesPerUnit ?? "1",
          chainId: input.chainId,
          lastSyncedBlock: p.lastSyncedBlock ?? p.chainHeadBlock ?? 0,
          chainHeadBlock: p.chainHeadBlock ?? p.lastSyncedBlock ?? 0,
          authoritative: false,
          state: holderPartyId ? "ACTIVE" : "UNKNOWN_HOLDER",
          note: input.note ?? null,
          recordedBy: principal.userId,
          classification,
          updatedAt: new Date(),
        };
        // One atomic upsert on the (tenant, chain, holder, token) key rather than
        // select-then-insert: two indexers observing the same block must not race
        // into a unique violation, and the newest observation of a position is
        // simply the current one — it is a snapshot, not an append-only ledger.
        await tx
          .insert(blockchainTokenPositions)
          .values({ id: newId(ID_PREFIX.blockchainTokenPosition), ...values })
          .onConflictDoUpdate({
            target: [
              blockchainTokenPositions.tenantId,
              blockchainTokenPositions.chainId,
              blockchainTokenPositions.holderAddress,
              blockchainTokenPositions.tokenSymbol,
            ],
            set: values,
          });
        written.push({ holderAddress, holderPartyId });
      }
      return { count: written.length, unknownHolders: written.filter((w) => !w.holderPartyId).length, classification };
    },
    (r) => ({
      tenantId: principal.tenantId,
      actorUserId: principal.userId,
      actorType: "SERVICE" as const,
      action: "blockchain.positions.record",
      objectType: "BLOCKCHAIN_TOKEN_POSITION",
      objectId: `${input.chainId}:${input.tokenSymbol}`,
      outcome: "SUCCESS" as const,
      reason: `Recorded ${r.count} observed position(s) on chain ${input.chainId} (${r.unknownHolders} unattributed); positions stay non-authoritative.`,
      authority: "blockchain:manage",
      policyVersion: policyVersionOf(policy) ?? undefined,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (r) => ({
      type: "BLOCKCHAIN_TOKEN_POSITIONS_RECORDED",
      source: EVENT_SOURCE,
      domain: EVENT_DOMAIN,
      operation: "RECORD_TOKEN_POSITIONS",
      destinationDomain: "CAPITAL",
      tenantId: principal.tenantId,
      legalEntityId: null,
      subjectType: "BLOCKCHAIN_TOKEN_POSITION",
      subjectId: `${input.chainId}:${input.tokenSymbol}`,
      actorUserId: principal.userId,
      actorType: "SERVICE" as const,
      classification,
      payload: {
        chainId: input.chainId,
        tokenSymbol: input.tokenSymbol,
        count: r.count,
        unknownHolders: r.unknownHolders,
        authoritative: false,
      },
      traceId: context.traceId,
      correlationId: context.traceId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "blockchain:manage",
        policyVersion: policyVersionOf(policy),
      },
      policyVersion: policyVersionOf(policy),
    }),
  );
}
