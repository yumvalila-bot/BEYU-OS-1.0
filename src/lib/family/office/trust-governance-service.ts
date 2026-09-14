/**
 * BEYU OS — FAMILY TRUST GOVERNANCE SERVICE (X10THINK Phase 3, §8/§11/§48).
 *
 * The PERSISTENCE and governed-mutation layer for the trust rails engineered in
 * `./trust.ts`: trust instruments, jurisdiction-aware provisions, trustee
 * decisions and distribution decision records.
 *
 * Canonical kernel reuse (never reimplemented):
 *   - RBAC + ABAC ...................... lib/authz.ts `can`
 *   - tenant isolation ................. lib/tenant-scope.ts
 *   - policy hierarchy (DENY final) .... lib/policy.ts `evaluatePolicy`
 *   - hash-chained audit + events ...... lib/audit.ts `withAuditTransaction`
 *   - trustee identity ................. core `entity_appointments` (role TRUSTEE)
 *   - beneficiaries .................... people `beneficiaries` register
 *   - documents ........................ platform `documents` registry (by reference)
 *   - governance authority ............. `resolutions` (APPROVED) by reference
 *
 * Hard boundaries:
 *   - A provision is INERT without a ratified `legalEffectReference` — software
 *     never enacts legal effect (trust.ts doctrine, §48).
 *   - A distribution is a DECISION RECORD. Payment/accounting is Finance OS
 *     authority: `finance_record_ref` stays null here; nothing posts (§22/§29).
 *   - Trustee appointment/removal execution writes ONLY to the canonical
 *     `entity_appointments` registry — no parallel trustee store.
 *   - No transition skips its prerequisites: APPROVED requires an APPROVED
 *     resolution; EXECUTED requires APPROVED; legal-review closure is a human
 *     input the service validates but can never fabricate.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  beneficiaries,
  entityAppointments,
  legalEntities,
  resolutions,
  trustDecisions,
  trustDistributions,
  trustInstruments,
  trustProvisions,
} from "@/db/schema";
import { can, type Principal } from "@/lib/authz";
import { evaluatePolicy, type PolicyEvaluation } from "@/lib/policy";
import { withAuditTransaction } from "@/lib/audit";
import { assertWithinScope, tenantScopeIds, TenantIsolationError } from "@/lib/tenant-scope";
import { type Classification } from "@/lib/constants";
import { newId, ID_PREFIX } from "@/lib/ids";

/* ------------------------------------------------------------------ */
/* Error contract (mirrors the Family Office protection-service shape)   */
/* ------------------------------------------------------------------ */

export type FamilyTrustErrorCode =
  | "NOT_FOUND"
  | "SCOPE"
  | "VALIDATION"
  | "GOVERNANCE"
  | "LEGAL_REVIEW_REQUIRED"
  | "INERT_PROVISION";

export class FamilyTrustError extends Error {
  constructor(
    readonly code: FamilyTrustErrorCode,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "FamilyTrustError";
  }
}

export const FAMILY_TRUST_ERROR_STATUS: Record<FamilyTrustErrorCode, number> = {
  NOT_FOUND: 404,
  SCOPE: 403,
  VALIDATION: 422,
  GOVERNANCE: 409,
  LEGAL_REVIEW_REQUIRED: 422,
  INERT_PROVISION: 422,
};

export type MutationContext = {
  traceId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

const EVENT_SOURCE = "beyu-os/family-office/trust";
const EVENT_DOMAIN = "GOVERNANCE";
const LEGAL_REVIEW_CLOSED = "LEGAL_REVIEW_CLOSED";

/* ------------------------------------------------------------------ */
/* Controlled vocabularies (§8)                                         */
/* ------------------------------------------------------------------ */

export const INSTRUMENT_TYPES = [
  "DEED",
  "AMENDMENT",
  "RESTATEMENT",
  "SUPPLEMENTAL",
  "TRUSTEE_APPOINTMENT",
  "OTHER",
] as const;

export const INSTRUMENT_STATUSES = [
  "DRAFT",
  "LEGAL_REVIEW",
  "APPROVED",
  "EXECUTED",
  "SUPERSEDED",
  "EXPIRED",
  "DISPUTED",
] as const;

export const PROVISION_TYPES = [
  "SPENDTHRIFT",
  "NO_CONTEST",
  "DISCRETIONARY_DISTRIBUTION",
  "TRUSTEE_REMOVAL",
  "TRUSTEE_REPLACEMENT",
  "TRUSTEE_SUCCESSION",
  "BENEFICIARY_ELIGIBILITY",
  "DISTRIBUTION_STANDARD",
  "OTHER",
] as const;

export const PROVISION_LEGAL_EFFECT_STATUSES = [
  "INERT",
  "UNDER_LEGAL_REVIEW",
  "LEGAL_REVIEWED",
  "APPROVED",
  "EXECUTED",
  "DISPUTED",
  "UNENFORCEABLE_IN_JURISDICTION",
] as const;

export const DECISION_TYPES = [
  "TRUSTEE_APPOINTMENT",
  "TRUSTEE_REMOVAL",
  "TRUSTEE_REPLACEMENT",
  "TRUSTEE_SUCCESSION",
  "CONFLICT_DECLARED",
  "RECUSAL",
  "DISTRIBUTION_APPROVAL",
  "OTHER",
] as const;

export const DECISION_STATUSES = [
  "PROPOSED",
  "LEGAL_REVIEW",
  "APPROVED",
  "EXECUTED",
  "REJECTED",
  "DISPUTED",
  "WITHDRAWN",
] as const;

export const DISTRIBUTION_TYPES = [
  "DISCRETIONARY",
  "MANDATORY",
  "HARDSHIP",
  "EDUCATION",
  "MEDICAL",
  "OTHER",
] as const;

export const DISTRIBUTION_STATUSES = [
  "PROPOSED",
  "LEGAL_REVIEW",
  "APPROVED",
  "EXECUTED",
  "REJECTED",
  "REVERSED",
  "DISPUTED",
] as const;

/* ------------------------------------------------------------------ */
/* Shared scaffolding                                                   */
/* ------------------------------------------------------------------ */

function policyVersionOf(policy: PolicyEvaluation): string | null {
  return policy.appliedPolicies.map((p) => `${p.code}@${p.version}`).join(",") || null;
}

async function authorize(
  principal: Principal,
  context: { tenantId: string; classification: Classification; entityId?: string | null },
): Promise<PolicyEvaluation> {
  const decision = can(principal, "familyoffice:trust.manage", {
    classification: context.classification,
    tenantId: context.tenantId,
    entityId: context.entityId ?? undefined,
  });
  if (!decision.allowed) {
    // RBAC gap, tenant/entity isolation and classification ceilings are all
    // refusal paths; the message carries the exact reason (fail closed, named).
    throw new FamilyTrustError("SCOPE", decision.reason);
  }
  const policy = await evaluatePolicy({
    action: "familyoffice:trust.manage",
    tenantId: context.tenantId,
    roles: principal.roles,
    classification: context.classification,
    riskScore: principal.riskScore,
    aiInitiated: false,
  });
  if (policy.effect === "DENY") {
    throw new FamilyTrustError(
      "GOVERNANCE",
      policy.denials.map((d) => d.message).join(" ") || "Denied by governance policy.",
      { denials: policy.denials },
    );
  }
  return policy;
}

async function entityInScope(entityId: string, scope: string[]) {
  const [entity] = await db
    .select()
    .from(legalEntities)
    .where(and(eq(legalEntities.id, entityId), inArray(legalEntities.tenantId, scope)))
    .limit(1);
  if (!entity) {
    // Non-enumerating: out-of-scope and nonexistent are indistinguishable.
    throw new FamilyTrustError("NOT_FOUND", "Trust entity not found within your authorised scope.");
  }
  return entity;
}

async function instrumentInScope(instrumentId: string, scope: string[]) {
  const [instrument] = await db
    .select()
    .from(trustInstruments)
    .where(and(eq(trustInstruments.id, instrumentId), inArray(trustInstruments.tenantId, scope)))
    .limit(1);
  if (!instrument) {
    throw new FamilyTrustError("NOT_FOUND", "Trust instrument not found within your authorised scope.");
  }
  return instrument;
}

async function requireApprovedResolution(resolutionId: string, scope: string[]) {
  const [resolution] = await db
    .select({ id: resolutions.id, status: resolutions.status })
    .from(resolutions)
    .where(and(eq(resolutions.id, resolutionId), inArray(resolutions.tenantId, scope)))
    .limit(1);
  if (!resolution) {
    throw new FamilyTrustError("NOT_FOUND", "Cited resolution not found within your authorised scope.");
  }
  if (resolution.status !== "APPROVED") {
    throw new FamilyTrustError(
      "GOVERNANCE",
      `Cited resolution is ${resolution.status}; an APPROVED resolution is required.`,
      { resolutionStatus: resolution.status },
    );
  }
  return resolution;
}

async function assertScope(principal: Principal, tenantId: string) {
  try {
    await assertWithinScope(principal, tenantId);
  } catch (err) {
    if (err instanceof TenantIsolationError) {
      throw new FamilyTrustError("SCOPE", err.message);
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Instruments (§8)                                                     */
/* ------------------------------------------------------------------ */

export type CreateTrustInstrumentInput = {
  trustEntityId: string;
  instrumentName: string;
  instrumentType?: (typeof INSTRUMENT_TYPES)[number];
  jurisdictionCode: string;
  settlorPartyId?: string | null;
  documentRef: string;
  supersedesInstrumentId?: string | null;
  effectiveDate?: string | null;
  classification?: Classification;
};

/**
 * Record a trust instrument in DRAFT. Version numbering is server-derived per
 * (entity, type): a client can never claim a version. Supersession chains are
 * validated: you can only supersede an EXECUTED instrument of the same entity.
 */
export async function createTrustInstrument(
  principal: Principal,
  input: CreateTrustInstrumentInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const entity = await entityInScope(input.trustEntityId, scope);
  const classification = input.classification ?? "HIGHLY_RESTRICTED";
  const policy = await authorize(principal, {
    tenantId: entity.tenantId,
    classification,
    entityId: entity.id,
  });
  if (input.instrumentType && !(INSTRUMENT_TYPES as readonly string[]).includes(input.instrumentType)) {
    throw new FamilyTrustError("VALIDATION", `instrumentType must be one of ${INSTRUMENT_TYPES.join(", ")}.`);
  }
  if (!input.documentRef || input.documentRef.trim() === "") {
    // No evidence = not proven (§21): an instrument without its canonical
    // document reference is refused.
    throw new FamilyTrustError("VALIDATION", "A trust instrument requires a documents-registry reference.");
  }
  const instrumentType = input.instrumentType ?? "DEED";

  let supersedes: typeof trustInstruments.$inferSelect | null = null;
  if (input.supersedesInstrumentId) {
    supersedes = await instrumentInScope(input.supersedesInstrumentId, scope);
    if (supersedes.trustEntityId !== entity.id) {
      throw new FamilyTrustError("VALIDATION", "Supersession must reference an instrument of the SAME trust entity.");
    }
    if (supersedes.status !== "EXECUTED") {
      throw new FamilyTrustError("VALIDATION", `Only an EXECUTED instrument can be superseded (found ${supersedes.status}).`);
    }
  }

  const [versionRow] = await db
    .select({ nextVersion: sql<number>`coalesce(max(version), 0) + 1`.as("next_version") })
    .from(trustInstruments)
    .where(
      and(
        eq(trustInstruments.tenantId, entity.tenantId),
        eq(trustInstruments.trustEntityId, entity.id),
        eq(trustInstruments.instrumentType, instrumentType),
      ),
    );
  const version = Number(versionRow?.nextVersion ?? 1);

  await assertScope(principal, entity.tenantId);

  return withAuditTransaction(
    async (tx) => {
      const id = newId(ID_PREFIX.trustInstrument);
      const [row] = await tx
        .insert(trustInstruments)
        .values({
          id,
          tenantId: entity.tenantId,
          trustEntityId: entity.id,
          instrumentName: input.instrumentName,
          instrumentType,
          version,
          jurisdictionCode: input.jurisdictionCode,
          settlorPartyId: input.settlorPartyId ?? null,
          documentRef: input.documentRef,
          status: "DRAFT",
          legalReviewStatus: "REQUIRES_LEGAL_REVIEW",
          supersedesInstrumentId: supersedes?.id ?? null,
          effectiveDate: input.effectiveDate ?? null,
          recordedBy: principal.userId,
          classification,
        })
        .returning();
      return { id: row.id, tenantId: row.tenantId, version: row.version, status: row.status };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "family.trust.instrument.create",
      objectType: "TRUST_INSTRUMENT",
      objectId: result.id,
      outcome: "SUCCESS" as const,
      reason: `Trust instrument '${input.instrumentName}' v${result.version} drafted`,
      authority: "familyoffice:trust.manage",
      policyVersion: policyVersionOf(policy) ?? undefined,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (result) => ({
      type: "TRUST_INSTRUMENT_RECORDED",
      source: EVENT_SOURCE,
      domain: EVENT_DOMAIN,
      operation: "CREATE_TRUST_INSTRUMENT",
      destinationDomain: null,
      tenantId: result.tenantId,
      legalEntityId: entity.id,
      subjectType: "TRUST_INSTRUMENT",
      subjectId: result.id,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      classification,
      payload: { instrumentName: input.instrumentName, version: result.version, status: result.status, jurisdictionCode: input.jurisdictionCode },
      traceId: context.traceId,
      correlationId: context.traceId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "familyoffice:trust.manage",
        policyVersion: policyVersionOf(policy),
      },
      policyVersion: policyVersionOf(policy),
    }),
  );
}

export type InstrumentTransition = "LEGAL_REVIEW" | "APPROVED" | "EXECUTED" | "EXPIRED" | "DISPUTED";

const INSTRUMENT_TRANSITIONS: Record<string, InstrumentTransition[]> = {
  DRAFT: ["LEGAL_REVIEW"],
  LEGAL_REVIEW: ["APPROVED", "DISPUTED"],
  APPROVED: ["EXECUTED", "DISPUTED"],
  EXECUTED: ["SUPERSEDED", "EXPIRED", "DISPUTED"] as unknown as InstrumentTransition[],
  SUPERSEDED: [],
  EXPIRED: [],
  DISPUTED: ["LEGAL_REVIEW"],
};

/**
 * Governed instrument lifecycle (§8): DRAFT → LEGAL_REVIEW → APPROVED →
 * EXECUTED → SUPERSEDED | EXPIRED | DISPUTED.
 *   - leaving LEGAL_REVIEW requires a recorded human legal-review closure;
 *   - APPROVED requires an APPROVED governance resolution;
 *   - EXECUTED of a superseding instrument marks its predecessor SUPERSEDED in
 *     the same transaction — instrument history is never destroyed.
 */
export async function transitionTrustInstrument(
  principal: Principal,
  input: {
    instrumentId: string;
    to: InstrumentTransition;
    legalReviewStatus?: string;
    approvedByResolutionId?: string;
  },
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const instrument = await instrumentInScope(input.instrumentId, scope);
  const classification = instrument.classification as Classification;
  const policy = await authorize(principal, {
    tenantId: instrument.tenantId,
    classification,
    entityId: instrument.trustEntityId,
  });
  const allowed = INSTRUMENT_TRANSITIONS[instrument.status] ?? [];
  if (!(allowed as string[]).includes(input.to)) {
    throw new FamilyTrustError(
      "GOVERNANCE",
      `Transition ${instrument.status} → ${input.to} is not permitted by the instrument lifecycle (§8).`,
      { from: instrument.status, to: input.to, allowed },
    );
  }
  if (input.to === "APPROVED" || input.to === "EXECUTED") {
    if (instrument.legalReviewStatus !== LEGAL_REVIEW_CLOSED && input.legalReviewStatus !== LEGAL_REVIEW_CLOSED) {
      throw new FamilyTrustError(
        "LEGAL_REVIEW_REQUIRED",
        "Instruments require a recorded human legal-review closure before approval/execution.",
      );
    }
  }
  if (input.to === "APPROVED" || input.to === "EXECUTED") {
    if (!input.approvedByResolutionId && !instrument.approvedByResolutionId) {
      throw new FamilyTrustError(
        "GOVERNANCE",
        "An APPROVED governance resolution is required before instrument approval/execution.",
      );
    }
    await requireApprovedResolution(input.approvedByResolutionId ?? instrument.approvedByResolutionId!, scope);
  }
  await assertScope(principal, instrument.tenantId);

  return withAuditTransaction(
    async (tx) => {
      const [row] = await tx
        .update(trustInstruments)
        .set({
          status: input.to,
          legalReviewStatus:
            input.legalReviewStatus === LEGAL_REVIEW_CLOSED ? LEGAL_REVIEW_CLOSED : instrument.legalReviewStatus,
          approvedByResolutionId: input.approvedByResolutionId ?? instrument.approvedByResolutionId,
          updatedAt: new Date(),
        })
        .where(and(eq(trustInstruments.id, instrument.id), eq(trustInstruments.status, instrument.status)))
        .returning();
      if (!row) {
        throw new FamilyTrustError("GOVERNANCE", "Instrument was concurrently modified; re-read and retry.");
      }
      let supersededId: string | null = null;
      if (input.to === "EXECUTED" && instrument.supersedesInstrumentId) {
        await tx
          .update(trustInstruments)
          .set({ status: "SUPERSEDED", updatedAt: new Date() })
          .where(
            and(
              eq(trustInstruments.id, instrument.supersedesInstrumentId),
              eq(trustInstruments.status, "EXECUTED"),
            ),
          );
        supersededId = instrument.supersedesInstrumentId;
      }
      return { id: row.id, tenantId: row.tenantId, status: row.status, supersededId };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "family.trust.instrument.transition",
      objectType: "TRUST_INSTRUMENT",
      objectId: result.id,
      outcome: "SUCCESS" as const,
      reason: `Trust instrument transitioned to ${result.status}`,
      authority: "familyoffice:trust.manage",
      approvalRef: input.approvedByResolutionId ?? undefined,
      policyVersion: policyVersionOf(policy) ?? undefined,
      oldValue: { status: instrument.status },
      newValue: { status: result.status, supersededId: result.supersededId },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (result) => ({
      type: "TRUST_INSTRUMENT_TRANSITIONED",
      source: EVENT_SOURCE,
      domain: EVENT_DOMAIN,
      operation: "TRANSITION_TRUST_INSTRUMENT",
      destinationDomain: null,
      tenantId: result.tenantId,
      legalEntityId: instrument.trustEntityId,
      subjectType: "TRUST_INSTRUMENT",
      subjectId: result.id,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      classification,
      payload: { from: instrument.status, to: result.status, supersededId: result.supersededId },
      traceId: context.traceId,
      correlationId: context.traceId,
      causationId: null,
      authorityContext: {
        authorityId: input.approvedByResolutionId ?? null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "familyoffice:trust.manage",
        policyVersion: policyVersionOf(policy),
      },
      policyVersion: policyVersionOf(policy),
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Provisions (§8 — spendthrift / no-contest / discretionary / removal)  */
/* ------------------------------------------------------------------ */

export type CreateTrustProvisionInput = {
  instrumentId: string;
  provisionType: (typeof PROVISION_TYPES)[number];
  jurisdictionCode: string;
  summary: string;
  clauseDocumentRef?: string | null;
  classification?: Classification;
};

/**
 * Record a provision in DRAFT / INERT. The four governance-critical clause
 * families (SPENDTHRIFT, NO_CONTEST, DISCRETIONARY_DISTRIBUTION,
 * TRUSTEE_REMOVAL) are first-class types; every provision is jurisdiction-aware
 * and versioned per (instrument, type).
 */
export async function createTrustProvision(
  principal: Principal,
  input: CreateTrustProvisionInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const instrument = await instrumentInScope(input.instrumentId, scope);
  const classification = input.classification ?? (instrument.classification as Classification);
  const policy = await authorize(principal, {
    tenantId: instrument.tenantId,
    classification,
    entityId: instrument.trustEntityId,
  });
  if (!(PROVISION_TYPES as readonly string[]).includes(input.provisionType)) {
    throw new FamilyTrustError("VALIDATION", `provisionType must be one of ${PROVISION_TYPES.join(", ")}.`);
  }
  if (!["DRAFT", "LEGAL_REVIEW", "APPROVED", "EXECUTED"].includes(instrument.status)) {
    throw new FamilyTrustError(
      "GOVERNANCE",
      `Provisions may only be added to a live instrument (found ${instrument.status}).`,
    );
  }
  const [versionRow] = await db
    .select({ nextVersion: sql<number>`coalesce(max(version), 0) + 1`.as("next_version") })
    .from(trustProvisions)
    .where(
      and(
        eq(trustProvisions.instrumentId, instrument.id),
        eq(trustProvisions.provisionType, input.provisionType),
      ),
    );
  await assertScope(principal, instrument.tenantId);

  return withAuditTransaction(
    async (tx) => {
      const id = newId(ID_PREFIX.trustProvision);
      const [row] = await tx
        .insert(trustProvisions)
        .values({
          id,
          tenantId: instrument.tenantId,
          instrumentId: instrument.id,
          provisionType: input.provisionType,
          version: Number(versionRow?.nextVersion ?? 1),
          jurisdictionCode: input.jurisdictionCode,
          summary: input.summary,
          clauseDocumentRef: input.clauseDocumentRef ?? null,
          legalEffectStatus: "INERT",
          legalEffectReference: null,
          enforceabilityAssumed: false,
          status: "DRAFT",
          recordedBy: principal.userId,
          classification,
        })
        .returning();
      return { id: row.id, tenantId: row.tenantId, provisionType: row.provisionType, status: row.status, legalEffectStatus: row.legalEffectStatus };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "family.trust.provision.create",
      objectType: "TRUST_PROVISION",
      objectId: result.id,
      outcome: "SUCCESS" as const,
      reason: `Trust provision ${result.provisionType} recorded (INERT pending legal effect)`,
      authority: "familyoffice:trust.manage",
      policyVersion: policyVersionOf(policy) ?? undefined,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (result) => ({
      type: "TRUST_PROVISION_RECORDED",
      source: EVENT_SOURCE,
      domain: EVENT_DOMAIN,
      operation: "CREATE_TRUST_PROVISION",
      destinationDomain: null,
      tenantId: result.tenantId,
      legalEntityId: instrument.trustEntityId,
      subjectType: "TRUST_PROVISION",
      subjectId: result.id,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      classification,
      payload: {
        provisionType: result.provisionType,
        legalEffectStatus: result.legalEffectStatus,
        jurisdictionCode: input.jurisdictionCode,
      },
      traceId: context.traceId,
      correlationId: context.traceId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "familyoffice:trust.manage",
        policyVersion: policyVersionOf(policy),
      },
      policyVersion: policyVersionOf(policy),
    }),
  );
}

/**
 * Move a provision's LEGAL EFFECT state. The gate that matters: nothing leaves
 * INERT/UNDER_LEGAL_REVIEW without a ratified `legalEffectReference` (a human
 * legal determination — the software can record it, never invent it), and
 * APPROVED additionally requires an APPROVED governance resolution.
 */
export async function transitionTrustProvision(
  principal: Principal,
  input: {
    provisionId: string;
    toLegalEffectStatus: (typeof PROVISION_LEGAL_EFFECT_STATUSES)[number];
    legalEffectReference?: string | null;
    approvedByResolutionId?: string;
  },
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const [provision] = await db
    .select()
    .from(trustProvisions)
    .where(and(eq(trustProvisions.id, input.provisionId), inArray(trustProvisions.tenantId, scope)))
    .limit(1);
  if (!provision) {
    throw new FamilyTrustError("NOT_FOUND", "Trust provision not found within your authorised scope.");
  }
  const classification = provision.classification as Classification;
  const policy = await authorize(principal, { tenantId: provision.tenantId, classification });
  if (!(PROVISION_LEGAL_EFFECT_STATUSES as readonly string[]).includes(input.toLegalEffectStatus)) {
    throw new FamilyTrustError("VALIDATION", "Unknown legal-effect status.");
  }
  const beyondInert = !["INERT", "UNDER_LEGAL_REVIEW"].includes(input.toLegalEffectStatus);
  const reference = input.legalEffectReference ?? provision.legalEffectReference;
  if (beyondInert && (!reference || reference.trim() === "")) {
    // INERT doctrine: a clause whose legal effect is not determined by a
    // ratified reference structures the instrument; it does not enact it.
    throw new FamilyTrustError(
      "INERT_PROVISION",
      "A provision cannot acquire legal effect without a ratified legal-effect reference (human legal determination).",
    );
  }
  if (input.toLegalEffectStatus === "APPROVED" || input.toLegalEffectStatus === "EXECUTED") {
    if (!input.approvedByResolutionId && !provision.approvedByResolutionId) {
      throw new FamilyTrustError("GOVERNANCE", "An APPROVED governance resolution is required.");
    }
    await requireApprovedResolution(input.approvedByResolutionId ?? provision.approvedByResolutionId!, scope);
  }
  await assertScope(principal, provision.tenantId);

  return withAuditTransaction(
    async (tx) => {
      const [row] = await tx
        .update(trustProvisions)
        .set({
          legalEffectStatus: input.toLegalEffectStatus,
          legalEffectReference: reference ?? null,
          enforceabilityAssumed: false, // never assumed — always reference-bound
          status:
            input.toLegalEffectStatus === "APPROVED" || input.toLegalEffectStatus === "EXECUTED"
              ? input.toLegalEffectStatus
              : input.toLegalEffectStatus === "UNDER_LEGAL_REVIEW"
                ? "LEGAL_REVIEW"
                : provision.status,
          approvedByResolutionId: input.approvedByResolutionId ?? provision.approvedByResolutionId,
          updatedAt: new Date(),
        })
        .where(eq(trustProvisions.id, provision.id))
        .returning();
      return { id: row.id, tenantId: row.tenantId, legalEffectStatus: row.legalEffectStatus, status: row.status };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "family.trust.provision.legal-effect",
      objectType: "TRUST_PROVISION",
      objectId: result.id,
      outcome: "SUCCESS" as const,
      reason: `Provision legal-effect status → ${result.legalEffectStatus}`,
      authority: "familyoffice:trust.manage",
      approvalRef: input.approvedByResolutionId ?? undefined,
      policyVersion: policyVersionOf(policy) ?? undefined,
      oldValue: { legalEffectStatus: provision.legalEffectStatus },
      newValue: { legalEffectStatus: result.legalEffectStatus, legalEffectReference: reference ?? null },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Trustee decisions (§8/§16)                                           */
/* ------------------------------------------------------------------ */

export type RecordTrustDecisionInput = {
  instrumentId: string;
  decisionType: (typeof DECISION_TYPES)[number];
  subjectPartyId?: string | null;
  rationale: string;
  dataBasis?: string | null;
  consequences?: string | null;
  authorityKind?: "RESOLUTION" | "DELEGATION";
  authorityRef?: string | null;
  effectiveDate?: string | null;
  evidenceDocumentRefs?: string[];
  conflictOfInterest?: boolean;
  classification?: Classification;
};

export async function recordTrustDecision(
  principal: Principal,
  input: RecordTrustDecisionInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const instrument = await instrumentInScope(input.instrumentId, scope);
  const classification = input.classification ?? (instrument.classification as Classification);
  const policy = await authorize(principal, {
    tenantId: instrument.tenantId,
    classification,
    entityId: instrument.trustEntityId,
  });
  if (!(DECISION_TYPES as readonly string[]).includes(input.decisionType)) {
    throw new FamilyTrustError("VALIDATION", `decisionType must be one of ${DECISION_TYPES.join(", ")}.`);
  }
  const trusteeTypes = ["TRUSTEE_APPOINTMENT", "TRUSTEE_REMOVAL", "TRUSTEE_REPLACEMENT", "TRUSTEE_SUCCESSION"];
  if (trusteeTypes.includes(input.decisionType) && !input.subjectPartyId) {
    throw new FamilyTrustError("VALIDATION", `${input.decisionType} requires a subject party.`);
  }
  if (!input.rationale || input.rationale.trim() === "") {
    // §16: every decision records WHO / AUTHORITY / RATIONALE / …
    throw new FamilyTrustError("VALIDATION", "A decision without a rationale cannot be recorded (§16).");
  }
  await assertScope(principal, instrument.tenantId);

  return withAuditTransaction(
    async (tx) => {
      const id = newId(ID_PREFIX.trustDecision);
      const [row] = await tx
        .insert(trustDecisions)
        .values({
          id,
          tenantId: instrument.tenantId,
          instrumentId: instrument.id,
          decisionType: input.decisionType,
          subjectPartyId: input.subjectPartyId ?? null,
          rationale: input.rationale,
          dataBasis: input.dataBasis ?? null,
          consequences: input.consequences ?? null,
          authorityKind: input.authorityKind ?? "RESOLUTION",
          authorityRef: input.authorityRef ?? null,
          status: "PROPOSED",
          effectiveDate: input.effectiveDate ?? null,
          evidenceDocumentRefs: input.evidenceDocumentRefs ?? [],
          conflictOfInterest: input.conflictOfInterest ?? false,
          recordedBy: principal.userId,
          classification,
        })
        .returning();
      return { id: row.id, tenantId: row.tenantId, decisionType: row.decisionType, status: row.status };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "family.trust.decision.record",
      objectType: "TRUST_DECISION",
      objectId: result.id,
      outcome: "SUCCESS" as const,
      reason: `Trust decision ${result.decisionType} proposed`,
      authority: "familyoffice:trust.manage",
      policyVersion: policyVersionOf(policy) ?? undefined,
      newValue: { decisionType: result.decisionType, subjectPartyId: input.subjectPartyId ?? null },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
  );
}

/**
 * PROPOSED → APPROVED → EXECUTED (or REJECTED/DISPUTED/WITHDRAWN).
 *   - APPROVED requires an APPROVED governance resolution as `authorityRef`;
 *   - EXECUTED of a trustee appointment/removal/replacement writes the
 *     canonical `entity_appointments` registry in the SAME transaction, links
 *     the resulting appointment and emits TRUSTEE_CHANGED. No parallel store.
 *   - A declared conflict of interest blocks the conflicted party from being
 *     both subject and approver of record (recusal evidence, §16).
 */
export async function transitionTrustDecision(
  principal: Principal,
  input: { decisionId: string; to: "APPROVED" | "EXECUTED" | "REJECTED" | "DISPUTED" | "WITHDRAWN"; authorityRef?: string },
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const [decision] = await db
    .select()
    .from(trustDecisions)
    .where(and(eq(trustDecisions.id, input.decisionId), inArray(trustDecisions.tenantId, scope)))
    .limit(1);
  if (!decision) {
    throw new FamilyTrustError("NOT_FOUND", "Trust decision not found within your authorised scope.");
  }
  const classification = decision.classification as Classification;
  const policy = await authorize(principal, { tenantId: decision.tenantId, classification });
  const transitions: Record<string, string[]> = {
    PROPOSED: ["APPROVED", "REJECTED", "WITHDRAWN", "DISPUTED"],
    LEGAL_REVIEW: ["APPROVED", "REJECTED", "WITHDRAWN", "DISPUTED"],
    APPROVED: ["EXECUTED", "DISPUTED"],
    EXECUTED: [],
    REJECTED: [],
    DISPUTED: ["PROPOSED"],
    WITHDRAWN: [],
  };
  if (!(transitions[decision.status] ?? []).includes(input.to)) {
    throw new FamilyTrustError(
      "GOVERNANCE",
      `Transition ${decision.status} → ${input.to} is not permitted by the decision lifecycle.`,
    );
  }
  if (input.to === "APPROVED" || input.to === "EXECUTED") {
    const authorityRef = input.authorityRef ?? decision.authorityRef;
    if (!authorityRef) {
      throw new FamilyTrustError("GOVERNANCE", "Trustee decisions require an authority reference (RESOLUTION).");
    }
    await requireApprovedResolution(authorityRef, scope);
    if (decision.conflictOfInterest && decision.subjectPartyId === principal.partyId) {
      throw new FamilyTrustError(
        "GOVERNANCE",
        "A declared conflict of interest bars the conflicted party from approving this decision (§16 recusal).",
      );
    }
  }
  await assertScope(principal, decision.tenantId);

  const instrument = await db
    .select()
    .from(trustInstruments)
    .where(eq(trustInstruments.id, decision.instrumentId))
    .limit(1);

  return withAuditTransaction(
    async (tx) => {
      const [row] = await tx
        .update(trustDecisions)
        .set({
          status: input.to,
          authorityRef: input.authorityRef ?? decision.authorityRef,
          decidedBy: input.to === "APPROVED" ? principal.userId : decision.decidedBy,
          decidedAt: input.to === "APPROVED" ? new Date() : decision.decidedAt,
          updatedAt: new Date(),
        })
        .where(and(eq(trustDecisions.id, decision.id), eq(trustDecisions.status, decision.status)))
        .returning();
      if (!row) {
        throw new FamilyTrustError("GOVERNANCE", "Decision was concurrently modified; re-read and retry.");
      }

      let appointmentId: string | null = null;
      let trusteeChanged = false;
      if (input.to === "EXECUTED" && decision.subjectPartyId) {
        const entity = instrument[0]?.trustEntityId ?? null;
        if (!entity) {
          throw new FamilyTrustError("GOVERNANCE", "The decision's instrument has no trust entity; cannot execute.");
        }
        const effective = decision.effectiveDate ?? new Date().toISOString().slice(0, 10);
        if (decision.decisionType === "TRUSTEE_REMOVAL") {
          await tx
            .update(entityAppointments)
            .set({ resignedOn: effective })
            .where(
              and(
                eq(entityAppointments.tenantId, decision.tenantId),
                eq(entityAppointments.legalEntityId, entity),
                eq(entityAppointments.partyId, decision.subjectPartyId),
                eq(entityAppointments.role, "TRUSTEE"),
                sql`${entityAppointments.resignedOn} is null`,
              ),
            );
          trusteeChanged = true;
        }
        // REPLACEMENT is composed: the outgoing trustee is removed by an
        // executed TRUSTEE_REMOVAL decision (recorded separately, with its own
        // authority); this decision appoints the incoming trustee. A single
        // ambiguous "replace" write that guesses who is removed is refused by
        // design — removal is consequential and must be explicit (§8, §16).
        if (decision.decisionType === "TRUSTEE_APPOINTMENT" || decision.decisionType === "TRUSTEE_REPLACEMENT") {
          appointmentId = newId(ID_PREFIX.appointment);
          await tx.insert(entityAppointments).values({
            id: appointmentId,
            tenantId: decision.tenantId,
            legalEntityId: entity,
            partyId: decision.subjectPartyId,
            role: "TRUSTEE",
            appointedOn: effective,
            resolutionRef: decision.authorityRef,
          });
          await tx
            .update(trustDecisions)
            .set({ resultingAppointmentId: appointmentId })
            .where(eq(trustDecisions.id, decision.id));
          trusteeChanged = true;
        }
      }
      return {
        id: row.id,
        tenantId: row.tenantId,
        status: row.status,
        decisionType: row.decisionType,
        subjectPartyId: row.subjectPartyId,
        appointmentId,
        trusteeChanged,
      };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "family.trust.decision.transition",
      objectType: "TRUST_DECISION",
      objectId: result.id,
      outcome: "SUCCESS" as const,
      reason: `Trust decision ${result.decisionType} → ${result.status}`,
      authority: "familyoffice:trust.manage",
      approvalRef: decision.authorityRef ?? undefined,
      policyVersion: policyVersionOf(policy) ?? undefined,
      oldValue: { status: decision.status },
      newValue: { status: result.status, appointmentId: result.appointmentId },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (result) =>
      result.trusteeChanged
        ? {
            type: "TRUSTEE_CHANGED",
            source: EVENT_SOURCE,
            domain: EVENT_DOMAIN,
            operation: "EXECUTE_TRUSTEE_DECISION",
            destinationDomain: null,
            tenantId: result.tenantId,
            legalEntityId: instrument[0]?.trustEntityId ?? null,
            subjectType: "TRUST_DECISION",
            subjectId: result.id,
            actorUserId: principal.userId,
            actorType: "HUMAN" as const,
            classification,
            payload: {
              decisionType: result.decisionType,
              subjectPartyId: result.subjectPartyId,
              appointmentId: result.appointmentId,
              status: result.status,
            },
            traceId: context.traceId,
            correlationId: context.traceId,
            causationId: null,
            authorityContext: {
              authorityId: decision.authorityRef,
              decisionId: null,
              capabilityCode: null,
              permissionCode: "familyoffice:trust.manage",
              policyVersion: policyVersionOf(policy),
            },
            policyVersion: policyVersionOf(policy),
          }
        : {
            type: "TRUST_DECISION_TRANSITIONED",
            source: EVENT_SOURCE,
            domain: EVENT_DOMAIN,
            operation: "TRANSITION_TRUST_DECISION",
            destinationDomain: null,
            tenantId: result.tenantId,
            legalEntityId: instrument[0]?.trustEntityId ?? null,
            subjectType: "TRUST_DECISION",
            subjectId: result.id,
            actorUserId: principal.userId,
            actorType: "HUMAN" as const,
            classification,
            payload: { decisionType: result.decisionType, from: decision.status, to: result.status },
            traceId: context.traceId,
            correlationId: context.traceId,
            causationId: null,
            authorityContext: {
              authorityId: decision.authorityRef,
              decisionId: null,
              capabilityCode: null,
              permissionCode: "familyoffice:trust.manage",
              policyVersion: policyVersionOf(policy),
            },
            policyVersion: policyVersionOf(policy),
          },
  );
}

/* ------------------------------------------------------------------ */
/* Distributions (§8 — discretionary distribution governance)            */
/* ------------------------------------------------------------------ */

export type ProposeTrustDistributionInput = {
  instrumentId: string;
  beneficiaryId: string;
  distributionType: (typeof DISTRIBUTION_TYPES)[number];
  amount?: string | null;
  currency?: string | null;
  assetDescription?: string | null;
  discretionBasis?: string | null;
  conditionsMet?: Record<string, unknown>;
  effectiveDate?: string | null;
  classification?: Classification;
};

export async function proposeTrustDistribution(
  principal: Principal,
  input: ProposeTrustDistributionInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const instrument = await instrumentInScope(input.instrumentId, scope);
  const classification = input.classification ?? (instrument.classification as Classification);
  const policy = await authorize(principal, {
    tenantId: instrument.tenantId,
    classification,
    entityId: instrument.trustEntityId,
  });
  if (!(DISTRIBUTION_TYPES as readonly string[]).includes(input.distributionType)) {
    throw new FamilyTrustError("VALIDATION", `distributionType must be one of ${DISTRIBUTION_TYPES.join(", ")}.`);
  }
  if (instrument.status !== "EXECUTED") {
    throw new FamilyTrustError(
      "GOVERNANCE",
      `Distributions may only be proposed under an EXECUTED instrument (found ${instrument.status}).`,
    );
  }
  if (input.distributionType === "DISCRETIONARY" && (!input.discretionBasis || input.discretionBasis.trim() === "")) {
    // §8: a discretionary distribution is only governable if the basis for
    // exercising discretion is recorded. No basis → refused.
    throw new FamilyTrustError(
      "VALIDATION",
      "A DISCRETIONARY distribution requires a recorded discretion basis (§8).",
    );
  }
  const [beneficiary] = await db
    .select()
    .from(beneficiaries)
    .where(and(eq(beneficiaries.id, input.beneficiaryId), inArray(beneficiaries.tenantId, scope)))
    .limit(1);
  if (!beneficiary) {
    throw new FamilyTrustError("NOT_FOUND", "Beneficiary not found within your authorised scope.");
  }
  if (beneficiary.trustEntityId !== instrument.trustEntityId) {
    throw new FamilyTrustError("VALIDATION", "Beneficiary belongs to a different trust entity.");
  }
  if (beneficiary.eligibility !== "ELIGIBLE") {
    throw new FamilyTrustError(
      "GOVERNANCE",
      `Beneficiary eligibility is ${beneficiary.eligibility}; only an ELIGIBLE beneficiary may receive a distribution.`,
    );
  }
  await assertScope(principal, instrument.tenantId);

  return withAuditTransaction(
    async (tx) => {
      const id = newId(ID_PREFIX.trustDistribution);
      const [row] = await tx
        .insert(trustDistributions)
        .values({
          id,
          tenantId: instrument.tenantId,
          instrumentId: instrument.id,
          beneficiaryId: beneficiary.id,
          distributionType: input.distributionType,
          amount: input.amount ?? null,
          currency: input.currency ?? null,
          assetDescription: input.assetDescription ?? null,
          discretionBasis: input.discretionBasis ?? null,
          conditionsMet: input.conditionsMet ?? {},
          status: "PROPOSED",
          effectiveDate: input.effectiveDate ?? null,
          recordedBy: principal.userId,
          classification,
        })
        .returning();
      return { id: row.id, tenantId: row.tenantId, status: row.status, distributionType: row.distributionType };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "family.trust.distribution.propose",
      objectType: "TRUST_DISTRIBUTION",
      objectId: result.id,
      outcome: "SUCCESS" as const,
      reason: `Trust distribution (${result.distributionType}) proposed`,
      authority: "familyoffice:trust.manage",
      policyVersion: policyVersionOf(policy) ?? undefined,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
  );
}

/**
 * PROPOSED → APPROVED → EXECUTED (or REJECTED/REVERSED/DISPUTED).
 *   - APPROVED requires an APPROVED governance resolution (trustee decision);
 *   - EXECUTED records the decision as executed and moves `payment_status` to
 *     PENDING — the money movement itself remains Finance OS / treasury
 *     authority with `finance_record_ref` null until Finance records it
 *     (BLOCKED — EXTERNAL for real payment; §22/§29);
 *   - emits BENEFICIARY_CHANGED: a beneficiary's recorded position has changed.
 */
export async function transitionTrustDistribution(
  principal: Principal,
  input: {
    distributionId: string;
    to: "APPROVED" | "EXECUTED" | "REJECTED" | "REVERSED" | "DISPUTED";
    resolutionRef?: string;
    approvalRef?: string | null;
  },
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const [distribution] = await db
    .select()
    .from(trustDistributions)
    .where(and(eq(trustDistributions.id, input.distributionId), inArray(trustDistributions.tenantId, scope)))
    .limit(1);
  if (!distribution) {
    throw new FamilyTrustError("NOT_FOUND", "Trust distribution not found within your authorised scope.");
  }
  const classification = distribution.classification as Classification;
  const policy = await authorize(principal, { tenantId: distribution.tenantId, classification });
  const transitions: Record<string, string[]> = {
    PROPOSED: ["APPROVED", "REJECTED", "DISPUTED"],
    LEGAL_REVIEW: ["APPROVED", "REJECTED", "DISPUTED"],
    APPROVED: ["EXECUTED", "REJECTED", "DISPUTED"],
    EXECUTED: ["REVERSED", "DISPUTED"],
    REJECTED: [],
    REVERSED: [],
    DISPUTED: ["PROPOSED"],
  };
  if (!(transitions[distribution.status] ?? []).includes(input.to)) {
    throw new FamilyTrustError(
      "GOVERNANCE",
      `Transition ${distribution.status} → ${input.to} is not permitted by the distribution lifecycle.`,
    );
  }
  if (input.to === "APPROVED" || input.to === "EXECUTED") {
    const resolutionRef = input.resolutionRef ?? distribution.resolutionRef;
    if (!resolutionRef) {
      throw new FamilyTrustError(
        "GOVERNANCE",
        "A distribution requires an APPROVED governance resolution (trustee decision) before approval.",
      );
    }
    await requireApprovedResolution(resolutionRef, scope);
  }
  if (input.to === "REVERSED" && distribution.paymentStatus === "SETTLED") {
    throw new FamilyTrustError(
      "GOVERNANCE",
      "A settled distribution cannot be reversed here; reversal is a Finance OS correction with its own authority.",
    );
  }
  await assertScope(principal, distribution.tenantId);

  return withAuditTransaction(
    async (tx) => {
      const [row] = await tx
        .update(trustDistributions)
        .set({
          status: input.to,
          resolutionRef: input.resolutionRef ?? distribution.resolutionRef,
          approvalRef: input.approvalRef ?? distribution.approvalRef,
          paymentStatus:
            input.to === "EXECUTED"
              ? distribution.amount !== null || distribution.assetDescription !== null
                ? "PENDING"
                : "NOT_DUE"
              : distribution.paymentStatus,
          updatedAt: new Date(),
        })
        .where(and(eq(trustDistributions.id, distribution.id), eq(trustDistributions.status, distribution.status)))
        .returning();
      if (!row) {
        throw new FamilyTrustError("GOVERNANCE", "Distribution was concurrently modified; re-read and retry.");
      }
      return {
        id: row.id,
        tenantId: row.tenantId,
        status: row.status,
        paymentStatus: row.paymentStatus,
        beneficiaryId: row.beneficiaryId,
      };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "family.trust.distribution.transition",
      objectType: "TRUST_DISTRIBUTION",
      objectId: result.id,
      outcome: "SUCCESS" as const,
      reason: `Trust distribution → ${result.status} (payment ${result.paymentStatus})`,
      authority: "familyoffice:trust.manage",
      approvalRef: input.resolutionRef ?? undefined,
      policyVersion: policyVersionOf(policy) ?? undefined,
      oldValue: { status: distribution.status },
      newValue: { status: result.status, paymentStatus: result.paymentStatus },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (result) => ({
      type: "BENEFICIARY_CHANGED",
      source: EVENT_SOURCE,
      domain: EVENT_DOMAIN,
      operation: "TRANSITION_TRUST_DISTRIBUTION",
      destinationDomain: null,
      tenantId: result.tenantId,
      legalEntityId: null,
      subjectType: "TRUST_DISTRIBUTION",
      subjectId: result.id,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      classification,
      payload: {
        beneficiaryId: result.beneficiaryId,
        status: result.status,
        paymentStatus: result.paymentStatus,
        note: "Distribution decision record only; payment remains Finance OS authority.",
      },
      traceId: context.traceId,
      correlationId: context.traceId,
      causationId: null,
      authorityContext: {
        authorityId: input.resolutionRef ?? distribution.resolutionRef,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "familyoffice:trust.manage",
        policyVersion: policyVersionOf(policy),
      },
      policyVersion: policyVersionOf(policy),
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Reads                                                                */
/* ------------------------------------------------------------------ */

/** Read the governed trust view for one trust entity (RBAC/ABAC/tenant scoped). */
export async function readTrustGovernance(
  principal: Principal,
  input: { trustEntityId: string },
) {
  const scope = await tenantScopeIds(principal);
  const entity = await entityInScope(input.trustEntityId, scope);
  const decision = can(principal, "familyoffice:trust.read", {
    classification: "HIGHLY_RESTRICTED",
    tenantId: entity.tenantId,
    entityId: entity.id,
  });
  if (!decision.allowed) {
    throw new FamilyTrustError("SCOPE", decision.reason);
  }
  const instruments = await db
    .select()
    .from(trustInstruments)
    .where(and(eq(trustInstruments.trustEntityId, entity.id), inArray(trustInstruments.tenantId, scope)));
  const instrumentIds = instruments.map((i) => i.id);
  const provisions = instrumentIds.length
    ? await db.select().from(trustProvisions).where(inArray(trustProvisions.instrumentId, instrumentIds))
    : [];
  const decisions = instrumentIds.length
    ? await db.select().from(trustDecisions).where(inArray(trustDecisions.instrumentId, instrumentIds))
    : [];
  const distributions = instrumentIds.length
    ? await db.select().from(trustDistributions).where(inArray(trustDistributions.instrumentId, instrumentIds))
    : [];
  const trustees = await db
    .select()
    .from(entityAppointments)
    .where(
      and(
        eq(entityAppointments.legalEntityId, entity.id),
        eq(entityAppointments.role, "TRUSTEE"),
        sql`${entityAppointments.resignedOn} is null`,
      ),
    );
  return { trustEntityId: entity.id, instruments, provisions, decisions, distributions, trustees };
}
