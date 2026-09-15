/**
 * BEYU OS — GOVERNED CONTRACTING SERVICE (contracting domain).
 *
 * Every write follows the CANONICAL GOVERNED MUTATION PATTERN established by
 * `src/lib/governance.ts` and reused by the equity/trust services
 * (VALIDATE → AUTHENTICATE → SCOPE → RBAC → ABAC → POLICY(DENY-final) →
 * BUSINESS RULES → MUTATE → AUDIT → EVENT → ATOMIC COMMIT), and none of it is
 * reimplemented here:
 *
 *   - RBAC + ABAC ...................... lib/authz.ts `can`
 *   - tenant isolation ................. lib/tenant-scope.ts `tenantScopeIds` / `assertWithinScope`
 *   - policy hierarchy (DENY final) .... lib/policy.ts `evaluatePolicy`
 *   - hash-chained audit + events ...... lib/audit.ts `withAuditTransaction`
 *   - lifecycle / authority / obligation decisions
 *       ................................. lib/contracts/* pure engines (no DB, no clock, no I/O)
 *
 * ============================== WHAT THIS SERVICE IS NOT =======================
 *
 * - NOT a money mover. An obligation's amount is a governed REFERENCE:
 *   `authoritativeOwner` is pinned to FINANCE_OS by the intake guard and
 *   `financeRecordRef` links, never copies. Nothing here calls the posting
 *   engine; CAP_POSTING stays locked and fail-closed.
 * - NOT a legal authority. `legalReviewStatus`/`enforceabilityState` are recorded
 *   from a human closure act. A closed review gate here means "the approval
 *   record exists", never "this contract is enforceable in your jurisdiction".
 * - NOT a signature provider. `recordSignatureEvidence` stores the fact and
 *   evidence of a signature the provider already captured, and refuses a record
 *   whose content hash disagrees with the canonical document checksum.
 * - NOT an on-chain executor. `attachAnchorEvidence` links evidence produced by
 *   an externally governed signer. This module computes and verifies digests; it
 *   holds no keys and never broadcasts (see §23C and lib/blockchain).
 * - NOT an AI-approvable system. Human-only lifecycle actions are refused when
 *   the caller is an AI/service actor (`HUMAN_ACTOR_REQUIRED` semantics from the
 *   trust domain, enforced here by the lifecycle engine).
 *
 * DENY IS FINAL. Every negative path throws a typed ContractError; routes map it
 * through CONTRACT_ERROR_STATUS. Nothing here trusts a client-supplied state,
 * tenant, authority claim, computed deadline or "reviews closed" flag.
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  contractAuthorityChecks,
  contractDisputes,
  contractExecutionLinks,
  contractLifecycleEvents,
  contractObligationEvents,
  contractObligations,
  contractParties,
  contractRecords,
  contractSignatures,
  documents,
  legalEntities,
  parties,
  resolutions,
} from "@/db/schema";
import { can, type Principal } from "../authz";
import { evaluatePolicy, type PolicyEvaluation } from "../policy";
import { withAuditTransaction } from "../audit";
import { assertWithinScope, tenantScopeIds, TenantIsolationError } from "../tenant-scope";
import { classificationRank, type Classification, type PermissionCode } from "../constants";
import { ID_PREFIX, newId } from "../ids";
import { ContractError, type ContractErrorCode } from "./errors";
import {
  CONTRACT_ACTIONS,
  type AuthorityFacts,
  type ContractAction,
  computeContractHealth,
  evaluateAuthority,
  evaluateContractTransition,
  DEFAULT_AUTHORITY_THRESHOLDS,
  ContractModelError,
} from "./model";
import {
  DISPUTE_STATES,
  DISPUTE_TYPES,
  EXECUTION_METHODS,
  OBLIGATION_KINDS,
  OBLIGATION_RESPONSIBLE_PARTY_ROLES,
  OBLIGATION_RISK_SEVERITIES,
  type DisputeState,
  type DisputeType,
  type ObligationKind,
  type ObligationResponsiblePartyRole,
  type ObligationState,
} from "./vocabulary";
import {
  CONTRACT_LIFECYCLE_STATES,
  CONTRACT_REVIEW_GATES,
  CONTRACT_TYPES,
  CONTRACT_TYPE_FAMILIES,
  COUNTERPARTY_KINDS,
  FINANCE_OS_AUTHORITATIVE_OWNER,
  LEGAL_REVIEW_CLOSED,
  type ContractLifecycleState,
  type ContractReviewGate,
} from "./vocabulary";
import {
  assertObligationIntake,
  assertObligationVerificationEvidence,
  computeObligationTiming,
  evaluateObligationTransition,
  isObligationEscalationDue,
  isObligationOverdue,
  obligationDependencyOpen,
} from "./obligations";
import { evaluatePartyPosture, PARTY_KINDS, type PartyFacts, type PartyKind } from "./parties";
import {
  SIGNATURE_METHODS,
  assertSignatureRecordable,
  evaluateSigningPosture,
  type SignatureMethod,
  type SignatureSlot,
} from "./signing";
import { assertDisputeIntake, disputeEscalation, disputePausesExecution, evaluateDisputeTransition } from "./disputes";
import { assertHash32, assertIsoDate, assertRef, sha256Hex, stableStringify } from "./pure";
import { anchorTypedDigest, idToBytes32 } from "../blockchain/eip712";
import { assertAddress, networkByKey } from "../blockchain/model";

export type MutationContext = {
  traceId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/* ------------------------------------------------------------------ */
/* Shared governed-mutation scaffolding                                 */
/* ------------------------------------------------------------------ */

const EVENT_SOURCE = "beyu-os/contracts";
const EVENT_DOMAIN = "LEGAL";

/** AI/service actors may propose; they may never close an authority-bearing gate. */
const HUMAN_ONLY_ACTIONS: readonly ContractAction[] = [
  "GRANT_COMMERCIAL_APPROVAL",
  "VERIFY_AUTHORITY",
  "EXECUTE",
  "ACTIVATE",
  "TERMINATE",
  "RECORD_AMENDMENT",
  "RECORD_RENEWAL",
  "RESOLVE_DISPUTE",
];

function policyVersionOf(policy: PolicyEvaluation): string | null {
  return policy.appliedPolicies.map((p) => `${p.code}@${p.version}`).join(",") || null;
}

/** SCOPE → RBAC → ABAC → POLICY. DENY is final at every step. */
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

/** Engine errors are domain refusals; they surface as MODEL_ERROR with the code. */
function wrapModel<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof ContractModelError) {
      const code: ContractErrorCode =
        err.code === "EVIDENCE_REQUIRED"
          ? "EVIDENCE_REQUIRED"
          : err.code === "REVIEW_NOT_CLOSED"
            ? "GOVERNANCE_NOT_SATISFIED"
            : err.code === "AUTHORITY_BLOCKED"
              ? "AUTHORITY_BLOCKED"
              : err.code === "RULE_VIOLATION" || err.code === "INVALID_DATE" || err.code === "INVALID_AMOUNT" || err.code === "INVALID_REFERENCE"
                ? "RULE_VIOLATION"
                : err.code === "UNKNOWN_TYPE" || err.code === "UNKNOWN_STATE" || err.code === "OUT_OF_RANGE"
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

/** Locate a contract strictly inside the principal's scope. Non-enumerating: a
 *  foreign id and a missing id are the same 404. */
async function contractInScope(contractId: string, scope: string[]) {
  const [row] = await db
    .select()
    .from(contractRecords)
    .where(and(eq(contractRecords.id, contractId), inArray(contractRecords.tenantId, scope)))
    .limit(1);
  if (!row) throw new ContractError("NOT_FOUND", "Contract not found within your authorised scope.");
  return row;
}

/**
 * The closed review gates, derived from recorded governance artifacts — never
 * from the request body. A gate counts as closed only while its stored status is
 * the canonical closed token.
 */
function closedGatesOf(contract: typeof contractRecords.$inferSelect): ContractReviewGate[] {
  const closed: ContractReviewGate[] = [];
  if (contract.commercialReviewStatus === LEGAL_REVIEW_CLOSED) closed.push("INTERNAL_REVIEW", "COUNTERPARTY_REVIEW");
  if (contract.legalReviewStatus === LEGAL_REVIEW_CLOSED) closed.push("LEGAL_REVIEW");
  if (contract.riskReviewStatus === LEGAL_REVIEW_CLOSED) closed.push("RISK_REVIEW");
  if (contract.commercialReviewStatus === LEGAL_REVIEW_CLOSED && contract.authoritySnapshot?.approved === true) {
    closed.push("COMMERCIAL_APPROVAL");
  }
  if ((contract.authoritySnapshot as { canExecute?: boolean } | null)?.canExecute === true) closed.push("AUTHORITY_VERIFICATION");
  return CONTRACT_REVIEW_GATES.filter((g) => closed.includes(g));
}

/**
 * Resolve an evidence reference into something that actually exists. A document
 * id is checked against the canonical registry in scope; any other reference is
 * stored as an opaque citation. Fabricated evidence is refused, not trusted.
 */
async function resolveEvidence(ref: string | null | undefined, scope: string[]) {
  const value = ref ? ref.trim() : "";
  if (!value) return { evidenceRef: null as string | null, documentId: null as string | null };
  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, value), inArray(documents.tenantId, scope)))
    .limit(1);
  if (doc) return { evidenceRef: `document:${doc.id}`, documentId: doc.id };
  return { evidenceRef: assertRef(value, "evidenceRef"), documentId: null };
}

/* ------------------------------------------------------------------ */
/* §16 — Counterparty posture                                           */
/* ------------------------------------------------------------------ */

export type UpsertContractPartyInput = {
  partyId: string;
  counterpartyKind: string;
  legalEntityId?: string | null;
  signatoryRoleCode?: string | null;
  sanctionsResult?: "CLEAN" | "HIT" | "PENDING" | "STALE";
  sanctionsScreenedOn?: string | null;
  kycState?: PartyFacts["kycKybStatus"];
  legalNameSnapshot?: string | null;
  taxIdReference?: string | null;
  defaultCurrencyCode?: string | null;
  payoutProfileRef?: string | null;
  /**
   * The party's approved on-chain representation address. Validated here (shape
   * only — no key, no custody) and stored for reconciliation attribution; a
   * position at any other address is reported as an unknown holder.
   */
  approvedBlockchainAddress?: string | null;
  blockchainAddressEvidenceRef?: string | null;
  riskOverride?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  openDisputes?: number;
  priorDisputes?: number;
  asOfDate: string;
  note?: string | null;
};

/**
 * Record the contract-role posture of a party. The posture is COMPUTED by the
 * parties engine from recorded verification facts; the caller can supply facts,
 * never a verdict. `posture` stores the engine's blocking outcome so reporting
 * and the contract gate can both read the same determination.
 */
export async function upsertContractParty(
  principal: Principal,
  input: UpsertContractPartyInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const classification: Classification = "RESTRICTED";
  if (!(PARTY_KINDS as readonly string[]).includes(input.counterpartyKind)) {
    throw new ContractError("RULE_VIOLATION", `Unknown counterparty kind ${input.counterpartyKind}.`);
  }
  if (!(COUNTERPARTY_KINDS as readonly string[]).includes(input.counterpartyKind)) {
    throw new ContractError("RULE_VIOLATION", `Counterparty kind ${input.counterpartyKind} is outside the register vocabulary.`);
  }
  // `parties` is the group-wide canonical register (identity.ts): it carries no
  // tenant column, so existence is checked by id and the CONTRACT relationship
  // is what the tenant-scoped `contract_parties` row establishes. The BEYU-side
  // entity, when named, must be inside the caller's scope.
  if (input.legalEntityId) await entityInScope(input.legalEntityId, scope);
  const [party] = await db
    .select({ id: parties.id, status: parties.status })
    .from(parties)
    .where(eq(parties.id, input.partyId))
    .limit(1);
  if (!party) throw new ContractError("NOT_FOUND", "Party not found in the canonical identity register.");
  if (party.status !== "ACTIVE") {
    throw new ContractError("RULE_VIOLATION", `Party is ${party.status}; a non-ACTIVE party cannot be onboarded for contracting.`);
  }
  const policy = await authorizeMutation(principal, "contracts:manage", {
    classification,
    tenantId: principal.tenantId,
    entityId: input.legalEntityId ?? null,
  });
  const facts: PartyFacts = {
    kind: input.counterpartyKind as PartyKind,
    legalIdentityVerified: Boolean(input.legalNameSnapshot && input.taxIdReference),
    registrationRef: input.taxIdReference ?? null,
    authorizedRepresentativeVerified: Boolean(input.signatoryRoleCode),
    signingAuthorityVerified: Boolean(input.signatoryRoleCode),
    taxMetadataRecorded: Boolean(input.taxIdReference),
    kycKybStatus: input.kycState ?? "PENDING",
    complianceStatus:
      input.sanctionsResult === "CLEAN"
        ? "CLEAR"
        : input.sanctionsResult === "HIT"
          ? "SANCTIONED"
          : input.sanctionsResult === "STALE"
            ? "UNDER_REVIEW"
            : "UNKNOWN",
    lastScreenedOn: input.sanctionsScreenedOn ?? null,
    asOfDate: wrapModel(() => assertIsoDate(input.asOfDate, "asOfDate")),
    openDisputes: input.openDisputes ?? 0,
    priorDisputes: input.priorDisputes ?? 0,
    riskOverride: input.riskOverride ?? null,
  };
  const posture = wrapModel(() => evaluatePartyPosture(facts));

  try {
    return await withAuditTransaction(
      async (tx) => {
        const [existing] = await tx
          .select({ id: contractParties.id })
          .from(contractParties)
          .where(
            and(
              eq(contractParties.tenantId, principal.tenantId),
              eq(contractParties.partyId, input.partyId),
              eq(contractParties.counterpartyKind, facts.kind),
            ),
          )
          .limit(1);
        const values = {
          tenantId: principal.tenantId,
          partyId: input.partyId,
          legalEntityId: input.legalEntityId ?? null,
          counterpartyKind: facts.kind,
          signatoryRoleCode: input.signatoryRoleCode ?? null,
          posture: posture.canContract ? (posture.blockingFindings.length ? "CONDITIONAL" : "CLEAR") : posture.blockingFindings.length ? "BLOCKED" : "HIGH_RISK",
          sanctionsResult: input.sanctionsResult ?? "PENDING",
          kycState: facts.kycKybStatus,
          legalNameSnapshot: input.legalNameSnapshot ?? null,
          taxIdReference: input.taxIdReference ?? null,
          defaultCurrencyCode: input.defaultCurrencyCode ?? null,
          payoutProfileRef: input.payoutProfileRef ?? null,
          approvedBlockchainAddress: input.approvedBlockchainAddress
            // Stored lowercase: every downstream comparison (position attribution,
            // reconciliation, registry listing) is exact, so the register must not
            // keep a mixed-case rendering of the same address.
            ? assertAddress(input.approvedBlockchainAddress, "approvedBlockchainAddress").toLowerCase()
            : null,
          blockchainAddressEvidenceRef: input.blockchainAddressEvidenceRef ?? null,
          riskTier: posture.riskRating,
          blockedReason: posture.blockingFindings[0] ?? null,
          postureDetail: posture as unknown as Record<string, unknown>,
          note: input.note ?? null,
          status: "ACTIVE",
          recordedBy: principal.userId,
          classification,
          updatedAt: new Date(),
        };
        const row = existing
          ? await tx
              .update(contractParties)
              .set(values)
              .where(eq(contractParties.id, existing.id))
              .returning()
          : await tx
              .insert(contractParties)
              .values({ id: newId(ID_PREFIX.contractParty), ...values })
              .returning();
        const [created] = row;
        return { id: created.id, posture: created.posture, engine: posture };
      },
      (result) => ({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        action: "contracts.party.upsert",
        objectType: "CONTRACT_PARTY",
        objectId: result.id,
        outcome: "SUCCESS" as const,
        reason: `Counterparty posture recorded (${result.posture}) for party ${input.partyId}`,
        authority: "contracts:manage",
        policyVersion: policyVersionOf(policy) ?? undefined,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        traceId: context.traceId,
      }),
      (result) => ({
        type: "CONTRACT_PARTY_POSTURE_RECORDED",
        source: EVENT_SOURCE,
        domain: EVENT_DOMAIN,
        operation: "UPSERT_CONTRACT_PARTY",
        destinationDomain: null,
        tenantId: principal.tenantId,
        legalEntityId: input.legalEntityId ?? null,
        subjectType: "CONTRACT_PARTY",
        subjectId: result.id,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        classification,
        payload: {
          partyId: input.partyId,
          posture: result.posture,
          canContract: posture.canContract,
          blockingFindings: posture.blockingFindings.length,
        },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: {
          authorityId: null,
          decisionId: null,
          capabilityCode: null,
          permissionCode: "contracts:manage",
          policyVersion: policyVersionOf(policy),
        },
        policyVersion: policyVersionOf(policy),
      }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw new ContractError("CONFLICT", "This party posture already exists for that counterparty kind.");
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* §17 — Contract register + lifecycle                                  */
/* ------------------------------------------------------------------ */

export type CreateContractRecordInput = {
  code: string;
  title: string;
  typeCode: (typeof CONTRACT_TYPES)[number];
  counterpartyPartyId?: string | null;
  beyuEntityId?: string | null;
  contractValue?: number | null;
  currencyCode?: string | null;
  governingLawJurisdictionCode?: string | null;
  ownerUserId?: string | null;
  criticality?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  classification?: Classification;
  note?: string | null;
};

/** Register a contract in DRAFT. Registration is inert: no gate is closed by it. */
export async function createContractRecord(
  principal: Principal,
  input: CreateContractRecordInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const classification = input.classification ?? "RESTRICTED";
  if (!(CONTRACT_TYPES as readonly string[]).includes(input.typeCode)) {
    throw new ContractError("RULE_VIOLATION", `Unknown contract type code ${input.typeCode}.`);
  }
  const entity = input.beyuEntityId ? await entityInScope(input.beyuEntityId, scope) : null;
  const policy = await authorizeMutation(principal, "contracts:manage", {
    classification,
    tenantId: principal.tenantId,
    entityId: entity?.id ?? null,
  });
  if (entity) await wrapTenantScope(() => assertWithinScope(principal, entity.tenantId));
  try {
    return await withAuditTransaction(
      async (tx) => {
        const [row] = await tx
          .insert(contractRecords)
          .values({
            id: newId(ID_PREFIX.contractRecord),
            tenantId: principal.tenantId,
            code: assertRef(input.code, "code"),
            title: assertRef(input.title, "title"),
            typeCode: input.typeCode,
            typeFamily: CONTRACT_TYPE_FAMILIES[input.typeCode],
            state: "DRAFTING",
            criticality: input.criticality ?? "MEDIUM",
            counterpartyPartyId: input.counterpartyPartyId ?? null,
            beyuEntityId: entity?.id ?? null,
            ownerUserId: input.ownerUserId ?? principal.userId,
            contractValue: input.contractValue == null ? null : input.contractValue.toFixed(2),
            currencyCode: input.currencyCode ?? null,
            governingLawJurisdictionCode: input.governingLawJurisdictionCode ?? null,
            currentStateAt: new Date(),
            note: input.note ?? null,
            recordedBy: principal.userId,
            classification,
          })
          .returning();
        await tx.insert(contractLifecycleEvents).values({
          id: newId(ID_PREFIX.contractLifecycleEvent),
          tenantId: principal.tenantId,
          contractId: row.id,
          actionCode: "BEGIN_DRAFTING",
          fromState: "REQUESTED",
          toState: "DRAFTING",
          actorUserId: principal.userId,
          aiInitiated: false,
          note: "Contract registered in the governed register.",
          resultDetail: { registered: true, typeFamily: row.typeFamily },
          classification,
        });
        return { id: row.id, code: row.code, state: row.state, typeFamily: row.typeFamily, classification };
      },
      (result) => ({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        action: "contracts.record.create",
        objectType: "CONTRACT_RECORD",
        objectId: result.id,
        outcome: "SUCCESS" as const,
        reason: `Contract ${result.code} registered (${result.typeFamily})`,
        authority: "contracts:manage",
        policyVersion: policyVersionOf(policy) ?? undefined,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        traceId: context.traceId,
      }),
      (result) => ({
        type: "CONTRACT_REGISTERED",
        source: EVENT_SOURCE,
        domain: EVENT_DOMAIN,
        operation: "CREATE_CONTRACT",
        destinationDomain: "FINANCE",
        tenantId: principal.tenantId,
        legalEntityId: entity?.id ?? null,
        subjectType: "CONTRACT_RECORD",
        subjectId: result.id,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        classification: result.classification,
        payload: { code: result.code, state: result.state, typeFamily: result.typeFamily },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: {
          authorityId: null,
          decisionId: null,
          capabilityCode: null,
          permissionCode: "contracts:manage",
          policyVersion: policyVersionOf(policy),
        },
        policyVersion: policyVersionOf(policy),
      }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw new ContractError("CONFLICT", "A contract with this code already exists in your tenant.");
    throw err;
  }
}

async function entityInScope(entityId: string, scope: string[]) {
  const [entity] = await db
    .select()
    .from(legalEntities)
    .where(and(eq(legalEntities.id, entityId), inArray(legalEntities.tenantId, scope)))
    .limit(1);
  if (!entity) throw new ContractError("NOT_FOUND", "Legal entity not found within your authorised scope.");
  return entity;
}

export type ContractTransitionInput = {
  contractId: string;
  action: ContractAction;
  evidenceRef?: string | null;
  resolutionRef?: string | null;
  disputeRef?: string | null;
  note?: string | null;
  /** Only an internal caller that has ALREADY established an AI actor may set this. */
  aiInitiated?: boolean;
};

/**
 * Apply one governed lifecycle action. The engine decides legality from
 * server-derived inputs:
 *   - closed review gates come from the contract row, never from the request;
 *   - `resolutionRef` must resolve to an APPROVED resolution in scope;
 *   - `evidenceRef` must resolve to a document in scope or a bounded citation;
 *   - an AI/service actor is refused on the human-only action set.
 * The transition, its ledger row and the audit/event append commit atomically.
 */
export async function transitionContract(
  principal: Principal,
  input: ContractTransitionInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const contract = await contractInScope(input.contractId, scope);
  const classification = contract.classification as Classification;
  const permission: PermissionCode =
    input.action === "GRANT_COMMERCIAL_APPROVAL" ||
    input.action === "VERIFY_AUTHORITY" ||
    input.action === "TERMINATE" ||
    input.action === "RESOLVE_DISPUTE"
      ? "contracts:authority"
      : "contracts:manage";
  const policy = await authorizeMutation(principal, permission, {
    classification,
    tenantId: contract.tenantId,
    entityId: contract.beyuEntityId,
  });
  if (!(CONTRACT_ACTIONS as readonly string[]).includes(input.action)) {
    throw new ContractError("RULE_VIOLATION", `Unknown contract action ${String(input.action)}.`);
  }
  if (!(CONTRACT_LIFECYCLE_STATES as readonly string[]).includes(contract.state)) {
    throw new ContractError("INVALID_STATE", `Contract is in an unrecognized state; refusing to act.`);
  }
  if (input.aiInitiated === true && HUMAN_ONLY_ACTIONS.includes(input.action)) {
    throw new ContractError(
      "GOVERNANCE_NOT_SATISFIED",
      "AI is advisory only: it may never grant commercial approval, verify authority, execute, activate, terminate, amend, renew or resolve a dispute.",
      { action: input.action },
    );
  }
  const evidence = await resolveEvidence(input.evidenceRef, scope);
  const resolution = input.resolutionRef ? await requireApprovedResolution(input.resolutionRef, scope) : null;
  const dispute = input.disputeRef ? await disputeInScope(input.disputeRef, scope) : null;
  const openDisputeBlocking = (await openDisputesFor(contract.id, contract.tenantId)).filter(
    (d) => d.state !== "CLOSED" && d.state !== "WITHDRAWN" && d.state !== "SETTLED",
  );
  const result = wrapModel(() =>
    evaluateContractTransition({
      state: contract.state as ContractLifecycleState,
      action: input.action,
      closedReviews: closedGatesOf(contract),
      evidenceRef: evidence.evidenceRef,
      resolutionRef: resolution ? `resolution:${resolution.id}` : null,
      disputeRef: dispute ? `dispute:${dispute.id}` : null,
      aiInitiated: input.aiInitiated === true,
      note: input.note ?? null,
    }),
  );

  return withAuditTransaction(
    async (tx) => {
      const [row] = await tx
        .update(contractRecords)
        .set({
          state: result.to,
          currentStateAt: new Date(),
          amendmentCount:
            input.action === "RECORD_AMENDMENT" ? contract.amendmentCount + 1 : contract.amendmentCount,
          renewalCount: input.action === "RECORD_RENEWAL" ? contract.renewalCount + 1 : contract.renewalCount,
          updatedAt: new Date(),
        })
        .where(eq(contractRecords.id, contract.id))
        .returning();
      await tx.insert(contractLifecycleEvents).values({
        id: newId(ID_PREFIX.contractLifecycleEvent),
        tenantId: contract.tenantId,
        contractId: contract.id,
        actionCode: result.action,
        fromState: result.from,
        toState: result.to,
        actorUserId: principal.userId,
        aiInitiated: input.aiInitiated === true,
        evidenceDocumentId: evidence.documentId,
        evidenceRef: evidence.evidenceRef,
        resolutionRef: resolution ? `resolution:${resolution.id}` : null,
        disputeRef: dispute ? `dispute:${dispute.id}` : null,
        note: result.note,
        resultDetail: {
          engine: "contract-lifecycle/1",
          openDisputes: openDisputeBlocking.length,
          closedReviews: closedGatesOf(contract),
        },
        classification,
      });
      if (input.action === "ARCHIVE") {
        // A contract that leaves the active register still owes nothing to anyone:
        // unmet obligations are terminated with it, never silently dropped.
        await tx
          .update(contractObligations)
          .set({ state: "TERMINATED_WITH_CONTRACT", lastStateAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(contractObligations.contractId, contract.id),
              inArray(contractObligations.state, ["PENDING", "IN_PROGRESS", "DELIVERED", "OVERDUE", "DISPUTED"]),
            ),
          );
      }
      return {
        contractId: row.id,
        from: result.from,
        to: result.to,
        action: result.action,
        tenantId: contract.tenantId,
        classification,
      };
    },
    (r) => ({
      tenantId: r.tenantId,
      actorUserId: principal.userId,
      actorType: input.aiInitiated === true ? ("AI" as const) : ("HUMAN" as const),
      action: `contracts.lifecycle.${r.action.toLowerCase()}`,
      objectType: "CONTRACT_RECORD",
      objectId: r.contractId,
      outcome: "SUCCESS" as const,
      reason: `Contract ${r.contractId}: ${r.from} → ${r.to} via ${r.action}`,
      authority: permission,
      policyVersion: policyVersionOf(policy) ?? undefined,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (r) => ({
      type: "CONTRACT_LIFECYCLE_TRANSITIONED",
      source: EVENT_SOURCE,
      domain: EVENT_DOMAIN,
      operation: r.action,
      destinationDomain: r.to === "ACTIVE" ? "FINANCE" : null,
      tenantId: r.tenantId,
      legalEntityId: contract.beyuEntityId,
      subjectType: "CONTRACT_RECORD",
      subjectId: r.contractId,
      actorUserId: principal.userId,
      actorType: input.aiInitiated === true ? ("AI" as const) : ("HUMAN" as const),
      classification: r.classification,
      payload: { from: r.from, to: r.to, action: r.action, evidenceRef: evidence.evidenceRef },
      traceId: context.traceId,
      correlationId: context.traceId,
      causationId: null,
      authorityContext: {
        authorityId: resolution ? `resolution:${resolution.id}` : null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: permission,
        policyVersion: policyVersionOf(policy),
      },
      policyVersion: policyVersionOf(policy),
    }),
  );
}

async function requireApprovedResolution(resolutionId: string, scope: string[]) {
  const [resolution] = await db
    .select({ id: resolutions.id, status: resolutions.status, tenantId: resolutions.tenantId })
    .from(resolutions)
    .where(and(eq(resolutions.id, resolutionId), inArray(resolutions.tenantId, scope)))
    .limit(1);
  if (!resolution) throw new ContractError("NOT_FOUND", "Cited resolution not found within your authorised scope.");
  if (resolution.status !== "APPROVED") {
    throw new ContractError("GOVERNANCE_NOT_SATISFIED", `Cited resolution is ${resolution.status}; an APPROVED resolution is required.`, {
      resolutionStatus: resolution.status,
    });
  }
  return resolution;
}

async function disputeInScope(disputeId: string, scope: string[]) {
  const [row] = await db
    .select()
    .from(contractDisputes)
    .where(and(eq(contractDisputes.id, disputeId), inArray(contractDisputes.tenantId, scope)))
    .limit(1);
  if (!row) throw new ContractError("NOT_FOUND", "Cited dispute not found within your authorised scope.");
  return row;
}

async function openDisputesFor(contractId: string, tenantId: string) {
  return db
    .select()
    .from(contractDisputes)
    .where(and(eq(contractDisputes.contractId, contractId), eq(contractDisputes.tenantId, tenantId)));
}

/* ------------------------------------------------------------------ */
/* §17 — Authority determination                                        */
/* ------------------------------------------------------------------ */

/** Client-supplied facts for an authority evaluation. `contractType` and
 * `contractValue` are NOT here: the type comes from the register row and the
 * value from the recorded amount, so a caller cannot shop for a cheaper
 * authority tier. */
export type AuthorityFactsInput = Omit<AuthorityFacts, "asOfDate" | "contractType" | "contractValue"> & {
  asOfDate?: string;
};

export type EvaluateAuthorityInput = {
  contractId: string;
  /** Facts about the deal the human recorded; the engine decides what is required. */
  facts: AuthorityFactsInput;
};

/**
 * Compute and record an authority determination. This does not approve
 * anything: it evaluates the recorded facts against the threshold policy,
 * persists each check with the policy version that produced it, and returns
 * `canExecute`. Only the resulting rows feed the lifecycle gate.
 */
export async function evaluateContractAuthority(
  principal: Principal,
  input: EvaluateAuthorityInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const contract = await contractInScope(input.contractId, scope);
  const policy = await authorizeMutation(principal, "contracts:authority", {
    classification: contract.classification as Classification,
    tenantId: contract.tenantId,
    entityId: contract.beyuEntityId,
  });
  const facts: AuthorityFacts = {
    ...input.facts,
    asOfDate: wrapModel(() => assertIsoDate(input.facts.asOfDate ?? new Date().toISOString().slice(0, 10), "asOfDate")),
    contractType: contract.typeCode as AuthorityFacts["contractType"],
    // The committed value is the register row's, in integer major units. A
    // caller-supplied value could otherwise re-tier the whole determination.
    contractValue: contract.contractValue === null ? 0 : Math.round(Number(contract.contractValue)),
  };
  const determination = wrapModel(() => evaluateAuthority(facts, DEFAULT_AUTHORITY_THRESHOLDS));
  if (determination.missing.length > 0 || determination.blocked.length > 0) {
    // Refusal is recorded (so the next reviewer sees why) before it is returned.
    await withAuditTransaction(
      async (tx) => {
        await tx.insert(contractAuthorityChecks).values(
          determination.checks.map((c) => ({
            id: newId(ID_PREFIX.contractAuthorityCheck),
            tenantId: contract.tenantId,
            contractId: contract.id,
            checkKind: c.kind,
            outcome: c.result,
            requiredValue: { required: c.required },
            observedValue: { basis: c.basis },
            thresholdVersion: determination.policyVersion,
            evaluatedByUserId: principal.userId,
            satisfied: c.result === "SATISFIED" || c.result === "NOT_REQUIRED",
            note: c.basis,
            classification: contract.classification as Classification,
          })),
        );
        return { id: contract.id };
      },
      () => ({
        tenantId: contract.tenantId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        action: "contracts.authority.evaluate",
        objectType: "CONTRACT_RECORD",
        objectId: contract.id,
        outcome: "DENIED" as const,
        reason: `Authority determination refused: missing ${determination.missing.join(", ") || "none"}; blocked ${determination.blocked.join(", ") || "none"}.`,
        authority: "contracts:authority",
        policyVersion: policyVersionOf(policy) ?? undefined,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        traceId: context.traceId,
      }),
    );
    throw new ContractError(
      determination.blocked.length > 0 ? "AUTHORITY_BLOCKED" : "GOVERNANCE_NOT_SATISFIED",
      `Authority is not established for this contract: ${[...determination.missing, ...determination.blocked].join(", ")}.`,
      { missing: determination.missing, blocked: determination.blocked, policyVersion: determination.policyVersion },
    );
  }
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(contractAuthorityChecks).values(
        determination.checks.map((c) => ({
          id: newId(ID_PREFIX.contractAuthorityCheck),
          tenantId: contract.tenantId,
          contractId: contract.id,
          checkKind: c.kind,
          outcome: c.result,
          requiredValue: { required: c.required },
          observedValue: { basis: c.basis },
          thresholdVersion: determination.policyVersion,
          evaluatedByUserId: principal.userId,
          satisfied: c.result === "SATISFIED" || c.result === "NOT_REQUIRED",
          note: c.basis,
          classification: contract.classification as Classification,
        })),
      );
      const [row] = await tx
        .update(contractRecords)
        .set({
          authoritySnapshot: { ...(determination as unknown as Record<string, unknown>), approved: true },
          legalReviewStatus: facts.legalReviewStatus === LEGAL_REVIEW_CLOSED ? LEGAL_REVIEW_CLOSED : contract.legalReviewStatus,
          updatedAt: new Date(),
        })
        .where(eq(contractRecords.id, contract.id))
        .returning({ id: contractRecords.id, state: contractRecords.state });
      return { contractId: row.id, determination, state: row.state, tenantId: contract.tenantId, classification: contract.classification as Classification };
    },
    (r) => ({
      tenantId: r.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "contracts.authority.evaluate",
      objectType: "CONTRACT_RECORD",
      objectId: r.contractId,
      outcome: "SUCCESS" as const,
      reason: `Authority determination recorded: canExecute=${r.determination.canExecute} (policy ${r.determination.policyVersion}).`,
      authority: "contracts:authority",
      policyVersion: policyVersionOf(policy) ?? undefined,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (r) => ({
      type: "CONTRACT_AUTHORITY_DETERMINED",
      source: EVENT_SOURCE,
      domain: EVENT_DOMAIN,
      operation: "EVALUATE_AUTHORITY",
      destinationDomain: "GOVERNANCE",
      tenantId: r.tenantId,
      legalEntityId: contract.beyuEntityId,
      subjectType: "CONTRACT_RECORD",
      subjectId: r.contractId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      classification: r.classification,
      payload: {
        canExecute: r.determination.canExecute,
        checks: r.determination.checks.map((c) => `${c.kind}:${c.result}`),
        enforceability: r.determination.enforceability,
      },
      traceId: context.traceId,
      correlationId: context.traceId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "contracts:authority",
        policyVersion: policyVersionOf(policy),
      },
      policyVersion: policyVersionOf(policy),
    }),
  );
}

/* ------------------------------------------------------------------ */
/* §18 — Obligations                                                    */
/* ------------------------------------------------------------------ */

export type CreateObligationInput = {
  contractId: string;
  code: string;
  kind: string;
  responsiblePartyRole: string;
  ownerRole: string;
  deliverable: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  triggerDate?: string | null;
  deadlineOffsetDays?: number | null;
  explicitDueDate?: string | null;
  amountMajor?: number | null;
  currencyCode?: string | null;
  financeRecordRef?: string | null;
  dependencyObligationId?: string | null;
  verificationRequired?: boolean;
  evidenceRequired?: boolean;
  note?: string | null;
};

/**
 * Record an obligation with engine-computed timing. `dueDate`,
 * `leadTimeDays`, `escalationDueDate` and `verificationDeadline` are never
 * accepted from the caller; an amount-carrying obligation is pinned to
 * FINANCE_OS as authoritative owner, so this row can never become a ledger.
 */
export async function createObligation(
  principal: Principal,
  input: CreateObligationInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const contract = await contractInScope(input.contractId, scope);
  const classification = contract.classification as Classification;
  const policy = await authorizeMutation(principal, "contracts:manage", {
    classification,
    tenantId: contract.tenantId,
    entityId: contract.beyuEntityId,
  });
  if (!(OBLIGATION_KINDS as readonly string[]).includes(input.kind)) {
    throw new ContractError("RULE_VIOLATION", `Unknown obligation kind ${input.kind}.`);
  }
  if (!(OBLIGATION_RESPONSIBLE_PARTY_ROLES as readonly string[]).includes(input.responsiblePartyRole)) {
    throw new ContractError("RULE_VIOLATION", `Unknown responsible-party role ${input.responsiblePartyRole}.`);
  }
  if (!(OBLIGATION_RISK_SEVERITIES as readonly string[]).includes(input.severity)) {
    throw new ContractError("RULE_VIOLATION", `Unknown obligation severity ${input.severity}.`);
  }
  const intake = wrapModel(() =>
    assertObligationIntake({
      kind: input.kind as ObligationKind,
      responsiblePartyRole: input.responsiblePartyRole as ObligationResponsiblePartyRole,
      ownerRole: input.ownerRole,
      deliverable: input.deliverable,
      severity: input.severity,
      dependencyObligationId: input.dependencyObligationId ?? null,
      amountMajor: input.amountMajor ?? null,
      currency: input.currencyCode ?? null,
      verificationRequired: input.verificationRequired ?? true,
      evidenceRequired: input.evidenceRequired ?? true,
    }),
  );

  const timing = wrapModel(() =>
    computeObligationTiming({
      triggerDate: input.triggerDate ?? null,
      startFromContractDate: contract.effectiveDate ?? contract.signedDate ?? null,
      deadlineOffsetDays: input.deadlineOffsetDays ?? null,
      explicitDueDate: input.explicitDueDate ?? null,
      severity: input.severity,
    }),
  );
  if (input.dependencyObligationId) {
    const [dep] = await db
      .select({ state: contractObligations.state })
      .from(contractObligations)
      .where(
        and(
          eq(contractObligations.id, input.dependencyObligationId),
          eq(contractObligations.tenantId, contract.tenantId),
        ),
      )
      .limit(1);
    if (!dep) throw new ContractError("NOT_FOUND", "Dependency obligation not found in this contract's tenant.");
  }
  try {
    return await withAuditTransaction(
      async (tx) => {
        const [row] = await tx
          .insert(contractObligations)
          .values({
            id: newId(ID_PREFIX.contractObligation),
            tenantId: contract.tenantId,
            contractId: contract.id,
            code: assertRef(input.code, "code"),
            kind: intake.kind,
            responsiblePartyRole: input.responsiblePartyRole,
            ownerRole: intake.ownerRole,
            description: intake.deliverable,
            criticality: input.severity,
            state: "PENDING",
            dueBasis: timing.basis,
            dueReferenceDate: input.triggerDate ?? contract.effectiveDate ?? contract.signedDate ?? null,
            dueDate: timing.dueDate,
            leadTimeDays: timing.leadDays,
            escalationDueDate: timing.escalationDate,
            verificationDeadline: timing.verificationDeadline,
            amount: intake.amountMajor === null ? null : intake.amountMajor.toFixed(2),
            currencyCode: input.currencyCode ?? null,
            authoritativeOwner: intake.authoritativeOwner ?? FINANCE_OS_AUTHORITATIVE_OWNER,
            financeRecordRef: input.financeRecordRef ?? null,
            dependencyObligationId: input.dependencyObligationId ?? null,
            evidenceRequired: input.evidenceRequired ?? true,
            lastStateAt: new Date(),
            note: input.note ?? null,
            recordedBy: principal.userId,
            classification,
          })
          .returning();
        await tx.insert(contractObligationEvents).values({
          id: newId(ID_PREFIX.contractObligationEvent),
          tenantId: contract.tenantId,
          obligationId: row.id,
          actionCode: "RECORD",
          fromState: "PENDING",
          toState: "PENDING",
          actorUserId: principal.userId,
          note: `Timing basis ${timing.basis} (lead ${timing.leadDays}d).`,
          classification,
        });
        return { id: row.id, dueDate: row.dueDate, state: row.state, code: row.code, classification };
      },
      (r) => ({
        tenantId: contract.tenantId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        action: "contracts.obligation.create",
        objectType: "CONTRACT_OBLIGATION",
        objectId: r.id,
        outcome: "SUCCESS" as const,
        reason: `Obligation ${r.code} due ${r.dueDate} recorded on contract ${contract.code}.`,
        authority: "contracts:manage",
        policyVersion: policyVersionOf(policy) ?? undefined,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        traceId: context.traceId,
      }),
      (r) => ({
        type: "CONTRACT_OBLIGATION_RECORDED",
        source: EVENT_SOURCE,
        domain: EVENT_DOMAIN,
        operation: "RECORD_OBLIGATION",
        destinationDomain: intake.amountMajor === null ? null : "FINANCE",
        tenantId: contract.tenantId,
        legalEntityId: contract.beyuEntityId,
        subjectType: "CONTRACT_OBLIGATION",
        subjectId: r.id,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        classification: r.classification,
        payload: {
          code: r.code,
          kind: intake.kind,
          dueDate: r.dueDate,
          amount: intake.amountMajor,
          authoritativeOwner: intake.authoritativeOwner,
        },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: {
          authorityId: null,
          decisionId: null,
          capabilityCode: null,
          permissionCode: "contracts:manage",
          policyVersion: policyVersionOf(policy),
        },
        policyVersion: policyVersionOf(policy),
      }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw new ContractError("CONFLICT", "This contract already has an obligation with that code.");
    throw err;
  }
}

export type TransitionObligationInput = {
  obligationId: string;
  to: ObligationState;
  actionCode?: string;
  evidenceRefs?: readonly string[];
  waiverApprovalRef?: string | null;
  note?: string | null;
};

/**
 * Move an obligation. Verification is refused without evidence, a dependency
 * that is not satisfied blocks delivery/verification, and a WAIVE requires the
 * governed approval reference (waivers are decisions, not deletions).
 */
export async function transitionObligation(
  principal: Principal,
  input: TransitionObligationInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const [obligation] = await db
    .select()
    .from(contractObligations)
    .where(and(eq(contractObligations.id, input.obligationId), inArray(contractObligations.tenantId, scope)))
    .limit(1);
  if (!obligation) throw new ContractError("NOT_FOUND", "Obligation not found within your authorised scope.");
  const contract = await contractInScope(obligation.contractId, scope);
  const policy = await authorizeMutation(principal, "contracts:manage", {
    classification: obligation.classification as Classification,
    tenantId: obligation.tenantId,
    entityId: contract.beyuEntityId,
  });
  const evidenceRefs = (input.evidenceRefs ?? []).filter((r) => typeof r === "string" && r.trim().length > 0);
  if (input.to === "VERIFIED") {
    wrapModel(() =>
      assertObligationVerificationEvidence({
        verificationRequired: obligation.evidenceRequired,
        evidenceRefs,
      }),
    );
  }
  if (input.to === "WAIVED" && !input.waiverApprovalRef) {
    throw new ContractError(
      "GOVERNANCE_NOT_SATISFIED",
      "Waiving an obligation requires a governed approval reference (who decided, under what authority).",
    );
  }
  if (obligation.dependencyObligationId) {
    const [dep] = await db
      .select({ state: contractObligations.state })
      .from(contractObligations)
      .where(
        and(
          eq(contractObligations.id, obligation.dependencyObligationId),
          eq(contractObligations.tenantId, obligation.tenantId),
        ),
      )
      .limit(1);
    const open = wrapModel(() => obligationDependencyOpen(dep ? { state: dep.state as ObligationState } : null));
    if (!open.satisfied && (input.to === "DELIVERED" || input.to === "VERIFIED" || input.to === "CLOSED")) {
      throw new ContractError("INVALID_STATE", `Obligation cannot advance: ${open.reason}.`, {
        dependencyState: dep?.state ?? "MISSING",
      });
    }
  }
  wrapModel(() => evaluateObligationTransition(obligation.state as ObligationState, input.to));

  return withAuditTransaction(
    async (tx) => {
      const [row] = await tx
        .update(contractObligations)
        .set({
          state: input.to,
          lastStateAt: new Date(),
          verifiedByUserId: input.to === "VERIFIED" ? principal.userId : obligation.verifiedByUserId,
          verifiedAt: input.to === "VERIFIED" ? new Date() : obligation.verifiedAt,
          verificationEvidenceRef: evidenceRefs[0] ?? obligation.verificationEvidenceRef,
          waiverApprovalRef: input.to === "WAIVED" ? assertRef(input.waiverApprovalRef, "waiverApprovalRef") : obligation.waiverApprovalRef,
          waiverNote: input.to === "WAIVED" ? (input.note ?? null) : obligation.waiverNote,
          updatedAt: new Date(),
        })
        .where(eq(contractObligations.id, obligation.id))
        .returning();
      await tx.insert(contractObligationEvents).values({
        id: newId(ID_PREFIX.contractObligationEvent),
        tenantId: obligation.tenantId,
        obligationId: obligation.id,
        actionCode: input.actionCode ?? `MOVE_${input.to}`,
        fromState: obligation.state,
        toState: input.to,
        actorUserId: principal.userId,
        evidenceRef: evidenceRefs[0] ?? null,
        note: input.note ?? null,
        classification: obligation.classification as Classification,
      });
      return { id: row.id, from: obligation.state, to: row.state, contractId: obligation.contractId, tenantId: obligation.tenantId, classification: row.classification as Classification };
    },
    (r) => ({
      tenantId: r.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "contracts.obligation.transition",
      objectType: "CONTRACT_OBLIGATION",
      objectId: r.id,
      outcome: "SUCCESS" as const,
      reason: `Obligation ${r.id}: ${r.from} → ${r.to}`,
      authority: "contracts:manage",
      policyVersion: policyVersionOf(policy) ?? undefined,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (r) => ({
      type: "CONTRACT_OBLIGATION_TRANSITIONED",
      source: EVENT_SOURCE,
      domain: EVENT_DOMAIN,
      operation: `MOVE_${r.to}`,
      destinationDomain: r.to === "VERIFIED" || r.to === "CLOSED" ? "FINANCE" : null,
      tenantId: r.tenantId,
      legalEntityId: contract.beyuEntityId,
      subjectType: "CONTRACT_OBLIGATION",
      subjectId: r.id,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      classification: r.classification,
      payload: { from: r.from, to: r.to, evidenceCount: evidenceRefs.length, contractId: r.contractId },
      traceId: context.traceId,
      correlationId: context.traceId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "contracts:manage",
        policyVersion: policyVersionOf(policy),
      },
      policyVersion: policyVersionOf(policy),
    }),
  );
}

/* ------------------------------------------------------------------ */
/* §19 — Signature evidence                                              */
/* ------------------------------------------------------------------ */

/**
 * Record that a signature exists. The signing engine checks the slot sequence
 * and hash agreement; this function additionally refuses a record whose
 * `documentHash` does not equal the canonical checksum of the cited document —
 * a signed document may not silently change underneath its own evidence.
 */
export async function recordSignatureEvidence(
  principal: Principal,
  input: {
    contractId: string;
    partyId?: string | null;
    signatoryName: string;
    signatoryTitle?: string | null;
    authorityBasis?: "INSTRUMENT" | "RESOLUTION" | "DELEGATION" | "UNVERIFIED";
    authorityEvidenceRef?: string | null;
    method?: string;
    contentHash: string;
    documentId?: string | null;
    providerRef?: string | null;
    ceremonyRef?: string | null;
    evidenceRefs?: readonly string[];
    signedAt?: string | null;
    note?: string | null;
  },
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const contract = await contractInScope(input.contractId, scope);
  const policy = await authorizeMutation(principal, "contracts:manage", {
    classification: contract.classification as Classification,
    tenantId: contract.tenantId,
    entityId: contract.beyuEntityId,
  });
  const contentHash = wrapModel(() => assertHash32(input.contentHash, "contentHash"));
  const evidenceRefs = [...(input.evidenceRefs ?? []), ...(input.authorityEvidenceRef ? [input.authorityEvidenceRef] : [])];
  const signedAt = input.signedAt ? new Date(input.signedAt) : new Date();
  if (Number.isNaN(signedAt.getTime())) {
    throw new ContractError("RULE_VIOLATION", "signedAt must be an ISO-8601 timestamp.");
  }
  if (Number.isNaN(signedAt.getTime())) throw new ContractError("RULE_VIOLATION", "signedAt is not a valid timestamp.");
  if (input.documentId) {
    const [doc] = await db
      .select({ id: documents.id, checksum: documents.checksum })
      .from(documents)
      .where(and(eq(documents.id, input.documentId), inArray(documents.tenantId, scope)))
      .limit(1);
    if (!doc) throw new ContractError("NOT_FOUND", "Cited document not found within your authorised scope.");
    if (doc.checksum && doc.checksum !== contentHash && doc.checksum !== `sha256:${contentHash}`) {
      throw new ContractError(
        "EVIDENCE_REQUIRED",
        "The content hash signed does not match the canonical checksum of the cited document: re-execute the signature over the current version.",
        { documentId: doc.id },
      );
    }
  }
  if (input.method && !(SIGNATURE_METHODS as readonly string[]).includes(input.method)) {
    throw new ContractError("RULE_VIOLATION", `Unknown signature method ${input.method}.`);
  }
  const signatureMethod = (input.method ?? "SIMPLE_ELECTRONIC") as SignatureMethod;
  wrapModel(() =>
    assertSignatureRecordable({
      method: signatureMethod,
      documentHash: contentHash,
      evidenceRefs,
      signedAtIso: signedAt.toISOString(),
    }),
  );
  const slots: SignatureSlot[] = [
    {
      sequence: 1,
      partyId: input.partyId ?? "BEYU",
      state: "SIGNED",
      method: signatureMethod,
      documentHash: contentHash,
      evidenceRefs,
      signedAt: signedAt.toISOString(),
    },
  ];
  const posture = wrapModel(() => evaluateSigningPosture(slots));

  return withAuditTransaction(
    async (tx) => {
      const [row] = await tx
        .insert(contractSignatures)
        .values({
          id: newId(ID_PREFIX.contractSignature),
          tenantId: contract.tenantId,
          contractId: contract.id,
          partyId: input.partyId ?? null,
          signatoryName: assertRef(input.signatoryName, "signatoryName"),
          signatoryTitle: input.signatoryTitle ?? null,
          authorityBasis: input.authorityBasis ?? "UNVERIFIED",
          authorityEvidenceRef: input.authorityEvidenceRef ?? null,
          state: "SIGNED",
          method: signatureMethod,
          signedAt,
          contentHash,
          documentId: input.documentId ?? null,
          providerRef: input.providerRef ?? null,
          ceremonyRef: input.ceremonyRef ?? null,
          note: input.note ?? null,
          recordedBy: principal.userId,
          classification: contract.classification as Classification,
        })
        .returning();
      return {
        id: row.id,
        contractId: contract.id,
        tenantId: contract.tenantId,
        bindingHash: posture.bindingDocumentHash,
        classification: row.classification as Classification,
      };
    },
    (r) => ({
      tenantId: r.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "contracts.signature.record",
      objectType: "CONTRACT_SIGNATURE",
      objectId: r.id,
      outcome: "SUCCESS" as const,
      reason: `Signature evidence recorded for ${input.signatoryName} over ${contentHash.slice(0, 12)}…`,
      authority: "contracts:manage",
      policyVersion: policyVersionOf(policy) ?? undefined,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (r) => ({
      type: "CONTRACT_SIGNATURE_RECORDED",
      source: EVENT_SOURCE,
      domain: EVENT_DOMAIN,
      operation: "RECORD_SIGNATURE",
      destinationDomain: null,
      tenantId: r.tenantId,
      legalEntityId: contract.beyuEntityId,
      subjectType: "CONTRACT_SIGNATURE",
      subjectId: r.id,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      classification: r.classification,
      payload: { contractId: r.contractId, contentHash, method: input.method ?? null, enforceability: "REQUIRES_LEGAL_REVIEW" },
      traceId: context.traceId,
      correlationId: context.traceId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "contracts:manage",
        policyVersion: policyVersionOf(policy),
      },
      policyVersion: policyVersionOf(policy),
    }),
  );
}

/* ------------------------------------------------------------------ */
/* §20 — Disputes                                                       */
/* ------------------------------------------------------------------ */

export type OpenDisputeInput = {
  contractId: string;
  code: string;
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  summary: string;
  openedOn: string;
  evidenceRefs: readonly string[];
  counterpartyPosition?: string | null;
  beyuPosition?: string | null;
  financialExposure?: number | null;
  currencyCode?: string | null;
  legalCaseRef?: string | null;
  counselRef?: string | null;
  pauseExecutionOverride?: boolean | null;
  note?: string | null;
};

/**
 * Open a governed dispute. Intake requires evidence and a specific type; the
 * pause decision is the engine's (a recorded override can only narrow a pause
 * the engine did not require, never widen a decision into a false pause-free
 * state for a HIGH/CRITICAL dispute), and the escalation clock is computed.
 */
export async function openDispute(principal: Principal, input: OpenDisputeInput, context: MutationContext) {
  const scope = await tenantScopeIds(principal);
  const contract = await contractInScope(input.contractId, scope);
  const policy = await authorizeMutation(principal, "contracts:manage", {
    classification: contract.classification as Classification,
    tenantId: contract.tenantId,
    entityId: contract.beyuEntityId,
  });
  if (!(DISPUTE_TYPES as readonly string[]).includes(input.type)) {
    throw new ContractError("RULE_VIOLATION", `Unknown dispute type ${input.type}.`);
  }
  const intake = wrapModel(() =>
    assertDisputeIntake({
      type: input.type as DisputeType,
      severity: input.severity,
      summary: input.summary,
      evidenceRefs: input.evidenceRefs,
      contractId: contract.id,
    }),
  );
  const pause = wrapModel(() =>
    disputePausesExecution({
      type: intake.type,
      severity: intake.severity,
      state: "OPEN",
      pausesExecutionFlag: input.pauseExecutionOverride ?? null,
    }),
  );
  const asOf = wrapModel(() => assertIsoDate(input.openedOn, "openedOn"));
  const escalation = wrapModel(() => disputeEscalation({ severity: intake.severity, openedOn: asOf, asOfDate: asOf }));

  try {
    return await withAuditTransaction(
      async (tx) => {
        if (pause.pausesExecution === false && (intake.severity === "HIGH" || intake.severity === "CRITICAL")) {
          throw new ContractError(
            "RULE_VIOLATION",
            "A HIGH or CRITICAL dispute cannot be recorded without pausing downstream execution: the pause override may only narrow a pause the engine did not require.",
          );
        }
        const [row] = await tx
          .insert(contractDisputes)
          .values({
            id: newId(ID_PREFIX.contractDispute),
            tenantId: contract.tenantId,
            contractId: contract.id,
            code: assertRef(input.code, "code"),
            disputeType: intake.type,
            state: "OPEN",
            severity: intake.severity,
            openedOn: asOf,
            reviewBy: escalation.reviewBy,
            escalateBy: escalation.escalateBy,
            counterpartyPosition: input.counterpartyPosition ?? null,
            beyuPosition: input.beyuPosition ?? null,
            financialExposure: input.financialExposure == null ? null : input.financialExposure.toFixed(2),
            currencyCode: input.currencyCode ?? null,
            legalCaseRef: input.legalCaseRef ?? null,
            counselRef: input.counselRef ?? null,
            pausesExecution: pause.pausesExecution,
            pauseScope: pause.pausesExecution ? ["ONCHAIN_EXECUTION", "PAYMENT_AUTHORIZATION"] : [],
            evidenceRefs: intake.evidenceRefs,
            escalationDueAt: new Date(`${escalation.escalateBy}T00:00:00.000Z`),
            note: input.note ?? null,
            recordedBy: principal.userId,
            classification: contract.classification as Classification,
          })
          .returning();
        /*
         * The dispute does NOT mutate the contract's lifecycle state here: a pause
         * is enforced at the execution gates (blockchain/execution), and moving a
         * contract to DISPUTED is a separate governed act (OPEN_DISPUTE) so that
         * "a dispute exists" and "the register reflects it" stay distinguishable.
         */
        return {
          id: row.id,
          contractId: contract.id,
          tenantId: contract.tenantId,
          pausesExecution: pause.pausesExecution,
          escalateBy: escalation.escalateBy,
          classification: row.classification as Classification,
        };
      },
      (r) => ({
        tenantId: r.tenantId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        action: "contracts.dispute.open",
        objectType: "CONTRACT_DISPUTE",
        objectId: r.id,
        outcome: "SUCCESS" as const,
        reason: `Dispute ${input.code} (${intake.type}, ${intake.severity}) opened against contract ${contract.code}; execution pause=${r.pausesExecution}.`,
        authority: "contracts:manage",
        policyVersion: policyVersionOf(policy) ?? undefined,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        traceId: context.traceId,
      }),
      (r) => ({
        type: "CONTRACT_DISPUTE_OPENED",
        source: EVENT_SOURCE,
        domain: EVENT_DOMAIN,
        operation: "OPEN_DISPUTE",
        destinationDomain: "RISK",
        tenantId: r.tenantId,
        legalEntityId: contract.beyuEntityId,
        subjectType: "CONTRACT_DISPUTE",
        subjectId: r.id,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        classification: r.classification,
        payload: {
          contractId: r.contractId,
          disputeType: intake.type,
          severity: intake.severity,
          pausesExecution: r.pausesExecution,
          escalateBy: r.escalateBy,
        },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: {
          authorityId: null,
          decisionId: null,
          capabilityCode: null,
          permissionCode: "contracts:manage",
          policyVersion: policyVersionOf(policy),
        },
        policyVersion: policyVersionOf(policy),
      }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw new ContractError("CONFLICT", "A dispute with this code already exists in your tenant.");
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* §23C — Anchor evidence attachment                                    */
/* ------------------------------------------------------------------ */

/**
 * Attach an on-chain anchor to a contract (or one obligation) as an execution
 * link plus the EIP-712 commitment BEYU computed. The link records the digest
 * the governed signer was asked to publish and the network it landed on — it
 * does not prove anything until `blockchain/service.ts` verifies the anchor.
 * Nothing in this function signs, broadcasts or holds a key.
 */
export async function attachAnchorEvidence(
  principal: Principal,
  input: {
    contractId: string;
    obligationId?: string | null;
    anchorId: string;
    networkKey: string;
    anchorContractAddress: string;
    documentId?: string | null;
    contentHash: string;
    executedAt: string;
    method?: string;
    note?: string | null;
  },
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const contract = await contractInScope(input.contractId, scope);
  const policy = await authorizeMutation(principal, "contracts:manage", {
    classification: contract.classification as Classification,
    tenantId: contract.tenantId,
    entityId: contract.beyuEntityId,
  });
  const network = (() => {
    try {
      return networkByKey(input.networkKey);
    } catch {
      throw new ContractError("RULE_VIOLATION", `Unsupported network ${input.networkKey}.`);
    }
  })();
  const contentHash = wrapModel(() => assertHash32(input.contentHash, "contentHash"));
  const executedAtMs = Date.parse(input.executedAt);
  if (Number.isNaN(executedAtMs)) throw new ContractError("RULE_VIOLATION", "executedAt must be an ISO-8601 timestamp.");
  const commitment = anchorTypedDigest({
    anchorId: input.anchorId,
    documentId: input.documentId ?? `BEYU:CONTRACT:${contract.id}`,
    contractId: contract.id,
    contentHash,
    chainId: network.chainId,
    executedAt: BigInt(Math.floor(executedAtMs / 1000)),
    revoked: false,
    verifyingContract: input.anchorContractAddress,
  });

  try {
    return await withAuditTransaction(
      async (tx) => {
        const [row] = await tx
          .insert(contractExecutionLinks)
          .values({
            id: newId(ID_PREFIX.contractAnchorLink),
            tenantId: contract.tenantId,
            contractId: contract.id,
            obligationId: input.obligationId ?? null,
            method: input.method ?? "ONCHAIN_ATTESTED",
            state: "READY",
            networkKey: network.key,
            chainId: network.chainId,
            contractAddress: input.anchorContractAddress,
            anchorId: input.anchorId,
            commitment,
            commitmentVersion: "EIP712_V1",
            referenceDocumentId: input.documentId ?? null,
            note: input.note ?? null,
            recordedBy: principal.userId,
            classification: contract.classification as Classification,
          })
          .returning();
        return { id: row.id, commitment, anchorId: input.anchorId, tenantId: contract.tenantId, classification: row.classification as Classification };
      },
      (r) => ({
        tenantId: r.tenantId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        action: "contracts.anchor.attach",
        objectType: "CONTRACT_EXECUTION_LINK",
        objectId: r.id,
        outcome: "SUCCESS" as const,
        reason: `EIP-712 commitment ${r.commitment.slice(0, 12)}… linked to anchor ${r.anchorId} on ${network.key}.`,
        authority: "contracts:manage",
        policyVersion: policyVersionOf(policy) ?? undefined,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        traceId: context.traceId,
      }),
      (r) => ({
        type: "CONTRACT_ANCHOR_LINKED",
        source: EVENT_SOURCE,
        domain: EVENT_DOMAIN,
        operation: "ATTACH_ANCHOR",
        destinationDomain: "BLOCKCHAIN",
        tenantId: r.tenantId,
        legalEntityId: contract.beyuEntityId,
        subjectType: "CONTRACT_EXECUTION_LINK",
        subjectId: r.id,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        classification: r.classification,
        payload: { contractId: contract.id, anchorId: r.anchorId, networkKey: network.key, commitment: r.commitment, subjectDigest: idToBytes32(contract.id) },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: {
          authorityId: null,
          decisionId: null,
          capabilityCode: null,
          permissionCode: "contracts:manage",
          policyVersion: policyVersionOf(policy),
        },
        policyVersion: policyVersionOf(policy),
      }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw new ContractError("CONFLICT", "This anchor is already linked to that contract.");
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Read models (visibility only, never authority)                       */
/* ------------------------------------------------------------------ */

/** Obligation register for one contract, with overdue/escalation flags computed. */
export async function readObligations(principal: Principal, contractId: string, asOfDate: string) {
  const scope = await tenantScopeIds(principal);
  const contract = await contractInScope(contractId, scope);
  const rows = await db
    .select()
    .from(contractObligations)
    .where(and(eq(contractObligations.tenantId, contract.tenantId), eq(contractObligations.contractId, contract.id)))
    .orderBy(asc(contractObligations.dueDate));
  const asOf = wrapModel(() => assertIsoDate(asOfDate, "asOfDate"));
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    kind: row.kind,
    state: row.state,
    criticality: row.criticality,
    dueDate: row.dueDate,
    escalationDueDate: row.escalationDueDate,
    amount: row.amount,
    currencyCode: row.currencyCode,
    authoritativeOwner: row.authoritativeOwner,
    financeRecordRef: row.financeRecordRef,
    overdue: wrapModel(() => isObligationOverdue({ state: row.state as ObligationState, dueDate: row.dueDate ?? asOf, asOfDate: asOf })),
    escalationDue: wrapModel(() =>
      isObligationEscalationDue({
        state: row.state as ObligationState,
        escalationDate: row.escalationDueDate ?? row.dueDate ?? asOf,
        asOfDate: asOf,
      }),
    ),
  }));
}

/** Lifecycle history for one contract (append-only ledger, oldest first). */
export async function readLifecycleHistory(principal: Principal, contractId: string) {
  const scope = await tenantScopeIds(principal);
  const contract = await contractInScope(contractId, scope);
  return db
    .select({
      id: contractLifecycleEvents.id,
      actionCode: contractLifecycleEvents.actionCode,
      fromState: contractLifecycleEvents.fromState,
      toState: contractLifecycleEvents.toState,
      actorUserId: contractLifecycleEvents.actorUserId,
      aiInitiated: contractLifecycleEvents.aiInitiated,
      evidenceRef: contractLifecycleEvents.evidenceRef,
      resolutionRef: contractLifecycleEvents.resolutionRef,
      recordedAt: contractLifecycleEvents.recordedAt,
    })
    .from(contractLifecycleEvents)
    .where(and(eq(contractLifecycleEvents.tenantId, contract.tenantId), eq(contractLifecycleEvents.contractId, contract.id)))
    .orderBy(asc(contractLifecycleEvents.recordedAt));
}

/** Signing readiness view: slot sequence + hash agreement over recorded rows. */
export async function readSigningStatus(principal: Principal, contractId: string) {
  const scope = await tenantScopeIds(principal);
  const contract = await contractInScope(contractId, scope);
  const rows = await db
    .select()
    .from(contractSignatures)
    .where(and(eq(contractSignatures.tenantId, contract.tenantId), eq(contractSignatures.contractId, contract.id)))
    .orderBy(asc(contractSignatures.createdAt));
  const slots: SignatureSlot[] = rows.map((r, i) => ({
    sequence: i + 1,
    partyId: r.partyId ?? "UNKNOWN",
    state: r.state as SignatureSlot["state"],
    method: (r.method ?? null) as SignatureSlot["method"],
    documentHash: r.contentHash,
    signedAt: r.signedAt ? r.signedAt.toISOString() : null,
  }));
  return { slots, posture: evaluateSigningPosture(slots) };
}

/** Disputes open against a contract, with their pause posture (advisory view). */
export async function readDisputes(principal: Principal, contractId: string) {
  const scope = await tenantScopeIds(principal);
  const contract = await contractInScope(contractId, scope);
  const rows = await db
    .select()
    .from(contractDisputes)
    .where(and(eq(contractDisputes.tenantId, contract.tenantId), eq(contractDisputes.contractId, contract.id)));
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    disputeType: r.disputeType,
    state: r.state,
    severity: r.severity,
    pausesExecution: r.pausesExecution,
    escalateBy: r.escalateBy,
    financialExposure: r.financialExposure,
  }));
}

/**
 * Deterministic health posture for the register/dashboard. ADVISORY ONLY: the
 * numbers never gate anything; the lifecycle and authority engines do.
 */
export async function readContractHealth(principal: Principal, contractId: string, asOfDate: string) {
  const scope = await tenantScopeIds(principal);
  const contract = await contractInScope(contractId, scope);
  const obligations = await db
    .select({
      state: contractObligations.state,
      dueDate: contractObligations.dueDate,
      escalationDueDate: contractObligations.escalationDueDate,
      criticality: contractObligations.criticality,
    })
    .from(contractObligations)
    .where(and(eq(contractObligations.tenantId, contract.tenantId), eq(contractObligations.contractId, contract.id)));
  const disputes = await db
    .select({ state: contractDisputes.state, severity: contractDisputes.severity, pausesExecution: contractDisputes.pausesExecution })
    .from(contractDisputes)
    .where(and(eq(contractDisputes.tenantId, contract.tenantId), eq(contractDisputes.contractId, contract.id)));
  const asOf = wrapModel(() => assertIsoDate(asOfDate, "asOfDate"));
  const disputeRows = disputes.map((d) => ({
    state: (DISPUTE_STATES as readonly string[]).includes(d.state) ? (d.state as DisputeState) : "OPEN",
    pausesExecution: d.pausesExecution,
  }));
  const anchors = await db
    .select({ state: contractExecutionLinks.state, anchorId: contractExecutionLinks.anchorId })
    .from(contractExecutionLinks)
    .where(and(eq(contractExecutionLinks.tenantId, contract.tenantId), eq(contractExecutionLinks.contractId, contract.id)));
  return computeContractHealth({
    state: contract.state as ContractLifecycleState,
    asOfDate: asOf,
    obligations: obligations.map((o) => ({
      state: o.state as ObligationState,
      dueDate: o.dueDate ?? asOf,
      severity: o.criticality as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    })),
    disputeStates: disputeRows.map((d) => d.state),
    openDisputes: disputeRows.filter((d) => d.state !== "CLOSED" && d.state !== "SETTLED" && d.state !== "WITHDRAWN").length,
    disputePausesExecution: disputeRows.some((d) => d.pausesExecution === true),
    anchorRequired: contract.executionMethod === "ONCHAIN_ATTESTED",
    anchorVerified: anchors.some((a) => a.state === "EXECUTED"),
  });
}

/** Canonical payload BEYU hashes for an anchor: stable, versioned, reproducible. */
export function contractAnchorPayload(contract: typeof contractRecords.$inferSelect) {
  return {
    version: "BEYU_CONTRACT_ANCHOR/v1",
    contractId: contract.id,
    code: contract.code,
    state: contract.state,
    typeCode: contract.typeCode,
    counterpartyPartyId: contract.counterpartyPartyId,
    signedDate: contract.signedDate,
    effectiveDate: contract.effectiveDate,
    expiryDate: contract.expiryDate,
    amendmentCount: contract.amendmentCount,
    renewalCount: contract.renewalCount,
    signatureBlock: contract.signatureBlock,
  };
}

export function contractContentHashOf(contract: typeof contractRecords.$inferSelect): string {
  return sha256Hex(stableStringify(contractAnchorPayload(contract)));
}

/**
 * Due-soon register across the caller's scope (scheduler/dashboard read model).
 * Filtering by horizon happens on engine-computed dates, and nothing here can
 * mutate state: a view that could "clear" an obligation would be a second
 * authority over contract performance.
 */
export async function readDueSoonObligations(principal: Principal, input: { asOf: string; withinDays: number }) {
  const scope = await tenantScopeIds(principal);
  const asOf = wrapModel(() => assertIsoDate(input.asOf, "asOfDate"));
  if (!Number.isInteger(input.withinDays) || input.withinDays < 0 || input.withinDays > 365) {
    throw new ContractError("RULE_VIOLATION", "withinDays must be an integer in 0..365.");
  }
  const rows = await db
    .select({
      id: contractObligations.id,
      contractId: contractObligations.contractId,
      code: contractObligations.code,
      kind: contractObligations.kind,
      state: contractObligations.state,
      criticality: contractObligations.criticality,
      dueDate: contractObligations.dueDate,
      escalationDueDate: contractObligations.escalationDueDate,
      tenantId: contractObligations.tenantId,
    })
    .from(contractObligations)
    .where(
      and(
        inArray(contractObligations.tenantId, scope),
        inArray(contractObligations.state, ["PENDING", "IN_PROGRESS", "DELIVERED", "OVERDUE"]),
      ),
    )
    .orderBy(asc(contractObligations.dueDate))
    .limit(500);
  const horizon = Date.parse(`${asOf}T00:00:00.000Z`) + input.withinDays * 86_400_000;
  return rows
    .filter((r) => (r.dueDate ? Date.parse(`${r.dueDate}T00:00:00.000Z`) <= horizon : false))
    .map((r) => ({
      id: r.id,
      contractId: r.contractId,
      code: r.code,
      kind: r.kind,
      state: r.state,
      criticality: r.criticality,
      dueDate: r.dueDate,
      escalationDueDate: r.escalationDueDate,
      overdue: wrapModel(() => isObligationOverdue({ state: r.state as ObligationState, dueDate: r.dueDate ?? asOf, asOfDate: asOf })),
      escalationDue: wrapModel(() =>
        isObligationEscalationDue({
          state: r.state as ObligationState,
          escalationDate: r.escalationDueDate ?? r.dueDate ?? asOf,
          asOfDate: asOf,
        }),
      ),
      tenantId: r.tenantId,
    }));
}
