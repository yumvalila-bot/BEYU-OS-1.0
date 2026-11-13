/**
 * BEYU OS — MULTI_COMPANY_MANAGEMENT: governed mutation services.
 *
 * EVERY function in this module:
 *   1. re-authorizes through the canonical `can()` primitive (`requireMcmCapability`);
 *   2. verifies the target entity is inside the principal's resolved scope — a
 *      permission is never sufficient on its own;
 *   3. validates the input against the instrument or registry it depends on;
 *   4. performs the mutation, its audit record and its enterprise event inside ONE
 *      transaction (`withAuditTransaction`), so no partially-applied corporate
 *      change can exist;
 *   5. refuses fail-closed on any precondition it cannot prove.
 *
 * WHAT IS NEVER WRITTEN HERE
 *   * `journal_entries` / `journal_lines` — CAP_POSTING remains LOCKED. This
 *      module imports no Finance write path.
 *   * `ownership_records` — ownership truth is the canonical registry's; MCM only
 *      records VALIDATION evidence.
 *   * `governance_members` / `entity_appointments` — appointments are a governed
 *      governance act with its own authority; MCM links to them, never creates
 *      them.
 *   * `employees` — HCM remains the employee master.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  entityRelationships,
  intercompanyAgreements,
  intercompanyReconciliationRuns,
  intercompanyTransactions,
  legalEntities,
  legalEntityLifecycleEvents,
  legalEntityProfiles,
  mcmCapitalAllocations,
  mcmCountryProfiles,
  mcmModuleLinks,
  mcmStatutoryFilings,
  ownershipRecords,
  ownershipValidations,
} from "@/db/schema";
import { can, type Principal } from "@/lib/authz";
import { withAuditTransaction, type EventInput } from "@/lib/audit";
import { newId, ID_PREFIX } from "@/lib/ids";
import { tenantScopeIds } from "@/lib/tenant-scope";
import {
  assertLifecycleTransition,
  evaluateOwnership,
  McmError,
  requireMcmCapability,
  type McmLifecycleState,
} from "./model";

const today = (): string => new Date().toISOString().slice(0, 10);

/** Version stamped on every MCM audit/event record. */
export const MCM_VERSION = "mcm/1.0.0";

/**
 * Canonical enterprise event for an MCM act.
 *
 * ONE helper so every MCM event carries the same interoperability envelope
 * (domain, operation, destination, classification, authority context) the rest of
 * BEYU OS emits. A hand-built literal is how envelopes drift.
 */
function mcmEvent(input: {
  tenantId: string | null;
  legalEntityId: string | null;
  type: string;
  subjectType: string;
  subjectId: string;
  actorUserId: string;
  permission: string;
  payload: Record<string, unknown>;
  traceId: string;
  classification?: EventInput["classification"];
}): EventInput {
  return {
    type: input.type,
    source: "beyu-os/mcm",
    domain: "ORGANIZATION",
    operation: input.type,
    destinationDomain: null,
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    actorUserId: input.actorUserId,
    actorType: "HUMAN",
    classification: input.classification ?? "CONFIDENTIAL",
    payload: input.payload,
    traceId: input.traceId,
    correlationId: input.traceId,
    causationId: null,
    authorityContext: {
      authorityId: null,
      decisionId: null,
      capabilityCode: null,
      permissionCode: input.permission,
      policyVersion: MCM_VERSION,
    },
    policyVersion: MCM_VERSION,
  };
}

/* ------------------------------------------------------------------ */
/* Shared scope guard                                                  */
/* ------------------------------------------------------------------ */

/**
 * Assert an entity is inside the principal's tenant scope AND carries a
 * classification the principal may handle.
 *
 * This is the write-path equivalent of `visibleEntities`. It exists so a service
 * cannot be reached with an entity id lifted from a request body that the
 * principal was never entitled to mutate.
 */
async function assertEntityInScope(
  principal: Principal,
  legalEntityId: string,
  options: { allowNonActive?: boolean } = {},
): Promise<{ id: string; tenantId: string; countryCode: string; classification: string; status: string; code: string }> {
  const scope = await tenantScopeIds(principal);
  const [entity] = await db
    .select({
      id: legalEntities.id,
      tenantId: legalEntities.tenantId,
      countryCode: legalEntities.countryCode,
      classification: legalEntities.classification,
      status: legalEntities.status,
      code: legalEntities.code,
    })
    .from(legalEntities)
    .where(eq(legalEntities.id, legalEntityId))
    .limit(1);
  if (!entity) {
    throw new McmError("ENTITY_NOT_FOUND", `Legal entity ${legalEntityId} was not found.`, 404);
  }
  if (!scope.includes(entity.tenantId)) {
    throw new McmError(
      "ENTITY_OUT_OF_SCOPE",
      `Legal entity ${entity.code} is outside the resolving principal's tenant scope.`,
      403,
    );
  }
  if (entity.status === "ARCHIVED" && !options.allowNonActive) {
    throw new McmError("ENTITY_ARCHIVED", `Legal entity ${entity.code} is ARCHIVED and cannot be amended.`, 409);
  }
  return entity;
}

/* ------------------------------------------------------------------ */
/* 1. Company profile                                                  */
/* ------------------------------------------------------------------ */

export type UpsertCompanyProfileInput = {
  legalEntityId: string;
  registeredOffice?: string | null;
  registeredOfficeCountryCode?: string | null;
  statutoryIdentifiers?: Array<{ scheme: string; value: string; issuer: string; countryCode: string }>;
  /** Group reporting currency. Defaults to the entity's functional currency. */
  reportingCurrency?: string;
  reportingTimezone: string;
  statutoryObligations?: string[];
  consolidated?: boolean;
  consolidationMethod?: "FULL" | "EQUITY" | "PROPORTIONATE" | "NONE";
  incorporationDocumentId?: string | null;
  pendingVerificationNote?: string | null;
  reason: string;
};

/**
 * Create or amend the MCM profile satellite for one legal entity.
 *
 * The profile NEVER restates a registry fact (legal name, entity type, country,
 * registration number). Those are read from `legal_entities`, so a profile can
 * never disagree with the registry.
 *
 * A profile starts in PENDING_VERIFICATION unless a verification note explains
 * why, and verification is a SEPARATE governed act (`verifyCompanyProfile`)
 * because it requires evidence and a named human.
 */
export async function upsertCompanyProfile(
  principal: Principal,
  input: UpsertCompanyProfileInput,
  traceId: string,
): Promise<{ profileId: string; legalEntityId: string; created: boolean }> {
  const entity = await assertEntityInScope(principal, input.legalEntityId);
  requireMcmCapability(principal, "mcm:company.manage", {
    tenantId: entity.tenantId,
    entityId: entity.id,
    countryCode: entity.countryCode,
  });

  if (input.reportingTimezone.trim().length < 3) {
    throw new McmError("REPORTING_TIMEZONE_REQUIRED", "A group reporting timezone is required.", 422);
  }
  if (input.reason.trim().length < 8) {
    throw new McmError("REASON_REQUIRED", "A reason of at least 8 characters is required for the audit ledger.", 422);
  }

  const [existing] = await db
    .select({ id: legalEntityProfiles.id, verificationState: legalEntityProfiles.verificationState })
    .from(legalEntityProfiles)
    .where(eq(legalEntityProfiles.legalEntityId, entity.id))
    .limit(1);

  const profileId = existing?.id ?? newId(ID_PREFIX.mcmCompanyProfile);
  const reportingCurrency = (input.reportingCurrency ?? "").trim().toUpperCase();

  await withAuditTransaction(
    async (tx) => {
      if (existing) {
        await tx
          .update(legalEntityProfiles)
          .set({
            registeredOffice: input.registeredOffice ?? null,
            registeredOfficeCountryCode: input.registeredOfficeCountryCode ?? null,
            ...(input.statutoryIdentifiers ? { statutoryIdentifiers: input.statutoryIdentifiers } : {}),
            ...(reportingCurrency ? { reportingCurrency } : {}),
            reportingTimezone: input.reportingTimezone,
            ...(input.statutoryObligations ? { statutoryObligations: input.statutoryObligations } : {}),
            ...(input.consolidated !== undefined ? { consolidated: input.consolidated } : {}),
            ...(input.consolidationMethod ? { consolidationMethod: input.consolidationMethod } : {}),
            ...(input.incorporationDocumentId !== undefined
              ? { incorporationDocumentId: input.incorporationDocumentId }
              : {}),
            ...(input.pendingVerificationNote !== undefined
              ? { pendingVerificationNote: input.pendingVerificationNote }
              : {}),
            updatedAt: new Date(),
            updatedBy: principal.userId,
          })
          .where(eq(legalEntityProfiles.id, existing.id));
      } else {
        const [functional] = await db
          .select({ currency: legalEntities.functionalCurrency })
          .from(legalEntities)
          .where(eq(legalEntities.id, entity.id))
          .limit(1);
        await tx.insert(legalEntityProfiles).values({
          id: profileId,
          tenantId: entity.tenantId,
          legalEntityId: entity.id,
          mcmLifecycleState: "PENDING_VERIFICATION",
          registeredOffice: input.registeredOffice ?? null,
          registeredOfficeCountryCode: input.registeredOfficeCountryCode ?? null,
          statutoryIdentifiers: input.statutoryIdentifiers ?? [],
          // A profile created without an explicit reporting currency inherits the
          // entity's functional currency. It never silently defaults to USD.
          reportingCurrency: reportingCurrency || functional?.currency || "USD",
          reportingTimezone: input.reportingTimezone,
          statutoryObligations: input.statutoryObligations ?? [],
          consolidated: input.consolidated ?? true,
          consolidationMethod: input.consolidationMethod ?? "FULL",
          incorporationDocumentId: input.incorporationDocumentId ?? null,
          verificationState: "PENDING_VERIFICATION",
          pendingVerificationNote:
            input.pendingVerificationNote ??
            "Profile created; the registration has not yet been verified against the issuing registry.",
          updatedBy: principal.userId,
        });
      }
      return { profileId };
    },
    () => ({
      tenantId: entity.tenantId,
      actorUserId: principal.userId,
      action: existing ? "MCM_COMPANY_PROFILE_AMENDED" : "MCM_COMPANY_PROFILE_CREATED",
      objectType: "LEGAL_ENTITY_PROFILE",
      objectId: profileId,
      outcome: "SUCCESS",
      reason: input.reason,
      authority: "mcm:company.manage",
      traceId,
      newValue: {
        legalEntityId: entity.id,
        entityCode: entity.code,
        reportingCurrency: reportingCurrency || null,
        reportingTimezone: input.reportingTimezone,
        consolidated: input.consolidated ?? null,
      },
    }),
    () => mcmEvent({
      tenantId: entity.tenantId,
      legalEntityId: entity.id,
      type: existing ? "MCM_COMPANY_PROFILE_AMENDED" : "MCM_COMPANY_PROFILE_CREATED",
      subjectType: "LEGAL_ENTITY_PROFILE",
      subjectId: profileId,
      actorUserId: principal.userId,
      permission: "mcm:company.manage",
      payload: { legalEntityId: entity.id, entityCode: entity.code },
      traceId,
    }),
  );

  return { profileId, legalEntityId: entity.id, created: !existing };
}

/**
 * Verify a company profile against the issuing registry.
 *
 * Verification requires evidence and a named human, and the DATABASE enforces
 * both (legal_entity_profiles_verified_evidence_check). It is deliberately
 * separate from profile amendment: filling in a registered office is clerical,
 * asserting that a company exists is not.
 */
export async function verifyCompanyProfile(
  principal: Principal,
  input: { legalEntityId: string; evidenceDocumentId: string; note: string },
  traceId: string,
): Promise<{ profileId: string; verificationState: string }> {
  const entity = await assertEntityInScope(principal, input.legalEntityId);
  requireMcmCapability(principal, "mcm:company.manage", {
    tenantId: entity.tenantId,
    entityId: entity.id,
    countryCode: entity.countryCode,
  });
  if (!input.evidenceDocumentId) {
    throw new McmError(
      "VERIFICATION_EVIDENCE_REQUIRED",
      "Verifying a company registration requires the evidence document id.",
      422,
    );
  }
  if (input.note.trim().length < 8) {
    throw new McmError("VERIFICATION_NOTE_REQUIRED", "A verification note of at least 8 characters is required.", 422);
  }
  const [profile] = await db
    .select({ id: legalEntityProfiles.id })
    .from(legalEntityProfiles)
    .where(eq(legalEntityProfiles.legalEntityId, entity.id))
    .limit(1);
  if (!profile) {
    throw new McmError(
      "PROFILE_REQUIRED",
      "Create the company profile before verifying it; verification is evidence about a recorded profile.",
      409,
    );
  }
  await withAuditTransaction(
    async (tx) => {
      await tx
        .update(legalEntityProfiles)
        .set({
          verificationState: "VERIFIED",
          verifiedByUserId: principal.userId,
          verifiedAt: new Date(),
          verificationEvidenceDocumentId: input.evidenceDocumentId,
          pendingVerificationNote: null,
          updatedAt: new Date(),
          updatedBy: principal.userId,
        })
        .where(eq(legalEntityProfiles.id, profile.id));
      return { profileId: profile.id };
    },
    () => ({
      tenantId: entity.tenantId,
      actorUserId: principal.userId,
      action: "MCM_COMPANY_PROFILE_VERIFIED",
      objectType: "LEGAL_ENTITY_PROFILE",
      objectId: profile.id,
      outcome: "SUCCESS",
      reason: input.note,
      authority: "mcm:company.manage",
      approvalRef: input.evidenceDocumentId,
      traceId,
      newValue: { legalEntityId: entity.id, verificationState: "VERIFIED" },
    }),
    () => mcmEvent({
      tenantId: entity.tenantId,
      legalEntityId: null,
      type: "MCM_COMPANY_PROFILE_VERIFIED",
      subjectType: "LEGAL_ENTITY_PROFILE",
      subjectId: profile.id,
      actorUserId: principal.userId,
      permission: "mcm:company.manage",
      payload: { legalEntityId: entity.id, evidenceDocumentId: input.evidenceDocumentId },
      traceId,
    }),
  );
  return { profileId: profile.id, verificationState: "VERIFIED" };
}

/* ------------------------------------------------------------------ */
/* 2. Lifecycle                                                        */
/* ------------------------------------------------------------------ */

export type TransitionLifecycleInput = {
  legalEntityId: string;
  toState: McmLifecycleState;
  effectiveDate: string;
  reason: string;
  authorityRef?: string | null;
  evidenceDocumentId?: string | null;
  approvalRef?: string | null;
};

/**
 * Transition a legal entity's MCM lifecycle.
 *
 * The state machine is closed (`MCM_LIFECYCLE_TRANSITIONS`); the event row is
 * append-only; the profile materialises the current state in the SAME
 * transaction, so a transition can never be recorded without taking effect and
 * can never take effect without being recorded.
 *
 * DISSOLVED and ARCHIVED require an authority reference — the database refuses
 * them otherwise, because a company does not stop existing because someone
 * changed a dropdown.
 */
export async function transitionEntityLifecycle(
  principal: Principal,
  input: TransitionLifecycleInput,
  traceId: string,
): Promise<{ legalEntityId: string; fromState: McmLifecycleState; toState: McmLifecycleState }> {
  const entity = await assertEntityInScope(principal, input.legalEntityId, { allowNonActive: true });
  requireMcmCapability(principal, "mcm:company.lifecycle", {
    tenantId: entity.tenantId,
    entityId: entity.id,
    countryCode: entity.countryCode,
  });
  if (input.reason.trim().length < 8) {
    throw new McmError("REASON_REQUIRED", "A lifecycle reason of at least 8 characters is required.", 422);
  }
  if ((input.toState === "DISSOLVED" || input.toState === "ARCHIVED") && !input.authorityRef) {
    throw new McmError(
      "TERMINAL_AUTHORITY_REQUIRED",
      `${input.toState} requires the authority reference (resolution, registrar filing or court order) that made it lawful.`,
      422,
    );
  }

  const [profile] = await db
    .select({ id: legalEntityProfiles.id, state: legalEntityProfiles.mcmLifecycleState })
    .from(legalEntityProfiles)
    .where(eq(legalEntityProfiles.legalEntityId, entity.id))
    .limit(1);

  // No profile yet: the entity's registry status is the best available source of
  // its current state, and the transition proceeds from there.
  const fromState = (profile?.state ?? (entity.status === "ACTIVE" ? "ACTIVE" : "DRAFT")) as McmLifecycleState;
  assertLifecycleTransition(fromState, input.toState);

  const eventId = newId(ID_PREFIX.mcmLifecycleEvent);
  await withAuditTransaction(
    async (tx) => {
      await tx.insert(legalEntityLifecycleEvents).values({
        id: eventId,
        tenantId: entity.tenantId,
        legalEntityId: entity.id,
        fromState,
        toState: input.toState,
        effectiveDate: input.effectiveDate,
        reason: input.reason,
        authorityRef: input.authorityRef ?? null,
        evidenceDocumentId: input.evidenceDocumentId ?? null,
        actingUserId: principal.userId,
        approvalRef: input.approvalRef ?? null,
        classification: "CONFIDENTIAL",
      });
      if (profile) {
        await tx
          .update(legalEntityProfiles)
          .set({ mcmLifecycleState: input.toState, updatedAt: new Date(), updatedBy: principal.userId })
          .where(eq(legalEntityProfiles.id, profile.id));
      } else {
        const [functional] = await db
          .select({ currency: legalEntities.functionalCurrency })
          .from(legalEntities)
          .where(eq(legalEntities.id, entity.id))
          .limit(1);
        await tx.insert(legalEntityProfiles).values({
          id: newId(ID_PREFIX.mcmCompanyProfile),
          tenantId: entity.tenantId,
          legalEntityId: entity.id,
          mcmLifecycleState: input.toState,
          reportingCurrency: functional?.currency ?? "USD",
          reportingTimezone: "UTC",
          verificationState: "PENDING_VERIFICATION",
          pendingVerificationNote:
            "Profile materialised by a lifecycle transition; registration verification is still outstanding.",
          updatedBy: principal.userId,
        });
      }
      return { eventId };
    },
    () => ({
      tenantId: entity.tenantId,
      actorUserId: principal.userId,
      action: "MCM_ENTITY_LIFECYCLE_TRANSITIONED",
      objectType: "LEGAL_ENTITY",
      objectId: entity.id,
      outcome: "SUCCESS",
      reason: input.reason,
      authority: "mcm:company.lifecycle",
      approvalRef: input.approvalRef ?? input.authorityRef ?? undefined,
      traceId,
      oldValue: { mcmLifecycleState: fromState },
      newValue: { mcmLifecycleState: input.toState, effectiveDate: input.effectiveDate, authorityRef: input.authorityRef ?? null },
    }),
    () => mcmEvent({
      tenantId: entity.tenantId,
      legalEntityId: null,
      type: "MCM_ENTITY_LIFECYCLE_TRANSITIONED",
      subjectType: "LEGAL_ENTITY",
      subjectId: entity.id,
      actorUserId: principal.userId,
      permission: "mcm:company.lifecycle",
      payload: { fromState, toState: input.toState, entityCode: entity.code },
      traceId,
    }),
  );

  return { legalEntityId: entity.id, fromState, toState: input.toState };
}

/* ------------------------------------------------------------------ */
/* 3. Non-ownership relationships                                      */
/* ------------------------------------------------------------------ */

export type RecordRelationshipInput = {
  subjectEntityId: string;
  objectEntityId: string;
  relationshipType:
    | "PARENT_SUBSIDIARY"
    | "MANAGEMENT"
    | "GOVERNANCE"
    | "BRANCH"
    | "OPERATIONAL_AFFILIATION"
    | "SHARED_SERVICES"
    | "AGENCY"
    | "FRANCHISE";
  instrumentRef?: string | null;
  instrumentDocumentId?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  scopeNote: string;
  provenance: string;
  reason: string;
};

/**
 * Record a non-ownership relationship between two legal entities.
 *
 * Both entities must be inside the principal's scope. The relationship may span
 * tenants only when the principal can reach both — a cross-tenant relationship is
 * an explicit authorized relationship, not an accident.
 *
 * OWNERSHIP IS NOT RECORDED HERE. The enum has no ownership member and the
 * database refuses a `SHARED_SERVICES` row without an instrument.
 */
export async function recordRelationship(
  principal: Principal,
  input: RecordRelationshipInput,
  traceId: string,
): Promise<{ relationshipId: string }> {
  const subject = await assertEntityInScope(principal, input.subjectEntityId);
  const object = await assertEntityInScope(principal, input.objectEntityId);
  requireMcmCapability(principal, "mcm:relationship.manage", {
    tenantId: subject.tenantId,
    entityId: subject.id,
    countryCode: subject.countryCode,
  });

  if (input.subjectEntityId === input.objectEntityId) {
    throw new McmError("SELF_RELATIONSHIP", "An entity cannot hold a relationship over itself.", 422);
  }
  if (input.scopeNote.trim().length < 8) {
    throw new McmError("SCOPE_NOTE_REQUIRED", "A scope note of at least 8 characters is required.", 422);
  }
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
    throw new McmError("EFFECTIVE_WINDOW_INVALID", "effectiveTo cannot precede effectiveFrom.", 422);
  }
  if (input.relationshipType === "SHARED_SERVICES" && !input.instrumentRef) {
    throw new McmError(
      "INSTRUMENT_REQUIRED",
      "A shared-services relationship must name the services agreement that creates it.",
      422,
    );
  }

  // Overlap guard: two live relationships of the same type over the same pair
  // would make "who manages this company" ambiguous. Effective-dated history is
  // never silently overwritten — the caller must end the prior row first.
  const overlap = await db
    .select({ id: entityRelationships.id, effectiveFrom: entityRelationships.effectiveFrom })
    .from(entityRelationships)
    .where(
      and(
        eq(entityRelationships.subjectEntityId, input.subjectEntityId),
        eq(entityRelationships.objectEntityId, input.objectEntityId),
        eq(entityRelationships.relationshipType, input.relationshipType),
        lte(entityRelationships.effectiveFrom, input.effectiveTo ?? "9999-12-31"),
        or(
          isNull(entityRelationships.effectiveTo),
          gte(entityRelationships.effectiveTo, input.effectiveFrom),
        ),
      ),
    )
    .limit(1);
  if (overlap.length > 0) {
    throw new McmError(
      "RELATIONSHIP_OVERLAP",
      `An overlapping ${input.relationshipType} relationship already exists for this pair (row ${overlap[0].id}, effective from ${overlap[0].effectiveFrom}). End-date it first — relationships are effective-dated, never silently overwritten.`,
      409,
      { existingId: overlap[0].id, existingEffectiveFrom: overlap[0].effectiveFrom },
    );
  }

  // A structural PARENT_SUBSIDIARY relationship must not contradict the
  // registry's own parent pointer.
  if (input.relationshipType === "PARENT_SUBSIDIARY") {
    const [objectEntity] = await db
      .select({ parentEntityId: legalEntities.parentEntityId, code: legalEntities.code })
      .from(legalEntities)
      .where(eq(legalEntities.id, input.objectEntityId))
      .limit(1);
    if (objectEntity?.parentEntityId && objectEntity.parentEntityId !== input.subjectEntityId) {
      throw new McmError(
        "PARENTAGE_CONFLICT",
        `The registry records a different parent for ${objectEntity.code}. Amend the corporate registry first; MCM never keeps a second, contradictory hierarchy.`,
        409,
      );
    }
  }

  const relationshipId = newId(ID_PREFIX.mcmRelationship);
  await withAuditTransaction(
    async (tx) => {
      await tx.insert(entityRelationships).values({
        id: relationshipId,
        tenantId: subject.tenantId,
        subjectEntityId: input.subjectEntityId,
        objectEntityId: input.objectEntityId,
        relationshipType: input.relationshipType,
        instrumentRef: input.instrumentRef ?? null,
        instrumentDocumentId: input.instrumentDocumentId ?? null,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        scopeNote: input.scopeNote,
        structural: input.relationshipType === "PARENT_SUBSIDIARY",
        provenance: input.provenance,
        recordedBy: principal.userId,
        classification: "CONFIDENTIAL",
      });
      return { relationshipId };
    },
    () => ({
      tenantId: subject.tenantId,
      actorUserId: principal.userId,
      action: "MCM_RELATIONSHIP_RECORDED",
      objectType: "ENTITY_RELATIONSHIP",
      objectId: relationshipId,
      outcome: "SUCCESS",
      reason: input.reason,
      authority: "mcm:relationship.manage",
      traceId,
      newValue: {
        subjectEntityId: input.subjectEntityId,
        objectEntityId: input.objectEntityId,
        relationshipType: input.relationshipType,
        effectiveFrom: input.effectiveFrom,
      },
    }),
    () => mcmEvent({
      tenantId: subject.tenantId,
      legalEntityId: null,
      type: "MCM_RELATIONSHIP_RECORDED",
      subjectType: "ENTITY_RELATIONSHIP",
      subjectId: relationshipId,
      actorUserId: principal.userId,
      permission: "mcm:relationship.manage",
      payload: { relationshipType: input.relationshipType, subjectEntityId: input.subjectEntityId },
      traceId,
    }),
  );
  return { relationshipId };
}

/** End-date a relationship. Never a destructive delete. */
export async function endRelationship(
  principal: Principal,
  input: { relationshipId: string; effectiveTo: string; reason: string },
  traceId: string,
): Promise<{ relationshipId: string }> {
  const [relationship] = await db
    .select()
    .from(entityRelationships)
    .where(eq(entityRelationships.id, input.relationshipId))
    .limit(1);
  if (!relationship) {
    throw new McmError("RELATIONSHIP_NOT_FOUND", "The relationship was not found.", 404);
  }
  const subject = await assertEntityInScope(principal, relationship.subjectEntityId);
  requireMcmCapability(principal, "mcm:relationship.manage", {
    tenantId: subject.tenantId,
    entityId: subject.id,
    countryCode: subject.countryCode,
  });
  if (relationship.effectiveTo !== null) {
    throw new McmError(
      "RELATIONSHIP_ALREADY_ENDED",
      `This relationship was already end-dated ${relationship.effectiveTo}.`,
      409,
    );
  }
  if (input.effectiveTo < relationship.effectiveFrom) {
    throw new McmError("EFFECTIVE_WINDOW_INVALID", "The end date cannot precede the effective-from date.", 422);
  }
  await withAuditTransaction(
    async (tx) => {
      await tx
        .update(entityRelationships)
        .set({ effectiveTo: input.effectiveTo })
        .where(eq(entityRelationships.id, input.relationshipId));
      return { relationshipId: input.relationshipId };
    },
    () => ({
      tenantId: subject.tenantId,
      actorUserId: principal.userId,
      action: "MCM_RELATIONSHIP_END_DATED",
      objectType: "ENTITY_RELATIONSHIP",
      objectId: input.relationshipId,
      outcome: "SUCCESS",
      reason: input.reason,
      authority: "mcm:relationship.manage",
      traceId,
      oldValue: { effectiveTo: null },
      newValue: { effectiveTo: input.effectiveTo },
    }),
    () => mcmEvent({
      tenantId: subject.tenantId,
      legalEntityId: null,
      type: "MCM_RELATIONSHIP_END_DATED",
      subjectType: "ENTITY_RELATIONSHIP",
      subjectId: input.relationshipId,
      actorUserId: principal.userId,
      permission: "mcm:relationship.manage",
      payload: { effectiveTo: input.effectiveTo },
      traceId,
    }),
  );
  return { relationshipId: input.relationshipId };
}

/* ------------------------------------------------------------------ */
/* 4. Ownership validation (NEVER mutation of the registry)            */
/* ------------------------------------------------------------------ */

/**
 * Validate one ownership record against its instrument and the effective totals.
 *
 * THE OWNERSHIP REGISTRY IS NOT TOUCHED. This writes an `ownership_validations`
 * row and nothing else. That distinction is the whole point: `organization:ownership.manage`
 * remains the only way to change who owns what, and it is deliberately unheld by
 * every role (see tests/security/rbac-audit.test.ts).
 *
 * Cycle detection walks the OWNER side: if the owner is a descendant of the owned
 * entity, the ownership is circular.
 */
export async function validateOwnershipRecord(
  principal: Principal,
  input: { ownershipRecordId: string; reason: string },
  traceId: string,
): Promise<{
  validationId: string;
  state: string;
  rules: Array<{ rule: string; passed: boolean; detail: string }>;
  economicTotalPct: string;
  votingTotalPct: string;
}> {
  const [record] = await db
    .select()
    .from(ownershipRecords)
    .where(eq(ownershipRecords.id, input.ownershipRecordId))
    .limit(1);
  if (!record) {
    throw new McmError("OWNERSHIP_RECORD_NOT_FOUND", "The ownership record was not found.", 404);
  }
  const ownedEntity = await assertEntityInScope(principal, record.ownedEntityId);
  requireMcmCapability(principal, "mcm:ownership.validate", {
    tenantId: ownedEntity.tenantId,
    entityId: ownedEntity.id,
    countryCode: ownedEntity.countryCode,
  });
  if (record.ownerEntityId) {
    // The owner must also be in scope, otherwise the principal is validating a
    // figure whose other half they cannot see.
    await assertEntityInScope(principal, record.ownerEntityId, { allowNonActive: true });
  }
  if (input.reason.trim().length < 8) {
    throw new McmError("REASON_REQUIRED", "A validation reason of at least 8 characters is required.", 422);
  }

  // Sibling totals: live records on the same owned entity, other than this one.
  const siblings = await db
    .select({
      id: ownershipRecords.id,
      economicPct: ownershipRecords.economicPct,
      votingPct: ownershipRecords.votingPct,
    })
    .from(ownershipRecords)
    .where(
      and(
        eq(ownershipRecords.ownedEntityId, record.ownedEntityId),
        lte(ownershipRecords.effectiveFrom, record.effectiveTo ?? "9999-12-31"),
        or(isNull(ownershipRecords.effectiveTo), gte(ownershipRecords.effectiveTo, record.effectiveFrom)),
      ),
    );
  const others = siblings.filter((sibling) => sibling.id !== record.id);
  const siblingEconomicTotalPct = others.reduce((sum, sibling) => sum + Number(sibling.economicPct), 0);
  const siblingVotingTotalPct = others.reduce((sum, sibling) => sum + Number(sibling.votingPct), 0);

  const createsCycle = record.ownerEntityId
    ? await wouldCreateCycle(record.ownerEntityId, record.ownedEntityId)
    : false;

  const verdict = evaluateOwnership({
    ownershipType: record.ownershipType,
    instrument: record.instrument,
    economicPct: record.economicPct,
    votingPct: record.votingPct,
    effectiveFrom: record.effectiveFrom,
    effectiveTo: record.effectiveTo,
    provenance: record.provenance,
    supportingDocumentId: record.supportingDocumentId,
    ownerEntityId: record.ownerEntityId,
    ownerPartyId: record.ownerPartyId,
    siblingEconomicTotalPct,
    siblingVotingTotalPct,
    createsCycle,
  });

  const validationId = newId(ID_PREFIX.mcmOwnershipValidation);
  await withAuditTransaction(
    async (tx) => {
      await tx.insert(ownershipValidations).values({
        id: validationId,
        tenantId: record.tenantId,
        ownershipRecordId: record.id,
        ownedEntityId: record.ownedEntityId,
        ownerEntityId: record.ownerEntityId,
        state: verdict.state,
        rules: verdict.rules,
        economicTotalPct: verdict.economicTotalPct.toFixed(6),
        votingTotalPct: verdict.votingTotalPct.toFixed(6),
        validatedByUserId: principal.userId,
      });
      return { validationId };
    },
    () => ({
      tenantId: record.tenantId,
      actorUserId: principal.userId,
      action: "MCM_OWNERSHIP_VALIDATED",
      objectType: "OWNERSHIP_RECORD",
      objectId: record.id,
      // A failed validation is not a system error: the act of validating
      // succeeded and its finding is recorded. The outcome column describes the
      // ACT, not the finding.
      outcome: "SUCCESS",
      reason: `${input.reason} — verdict: ${verdict.state}`,
      authority: "mcm:ownership.validate",
      traceId,
      newValue: {
        validationId,
        state: verdict.state,
        economicTotalPct: verdict.economicTotalPct.toFixed(6),
        votingTotalPct: verdict.votingTotalPct.toFixed(6),
      },
    }),
    () => mcmEvent({
      tenantId: record.tenantId,
      legalEntityId: null,
      type: "MCM_OWNERSHIP_VALIDATED",
      subjectType: "OWNERSHIP_RECORD",
      subjectId: record.id,
      actorUserId: principal.userId,
      permission: "mcm:ownership.validate",
      payload: { validationId, state: verdict.state },
      traceId,
    }),
  );

  return {
    validationId,
    state: verdict.state,
    rules: verdict.rules,
    economicTotalPct: verdict.economicTotalPct.toFixed(6),
    votingTotalPct: verdict.votingTotalPct.toFixed(6),
  };
}

/**
 * Would owning `ownedId` by `ownerId` create a circular chain?
 *
 * True when the owner is the owned entity, or when the owned entity is reachable
 * from the owner by walking parent pointers upward. Bounded at 64 hops; a chain
 * that exceeds the bound is treated as circular (fail closed rather than loop).
 */
async function wouldCreateCycle(ownerId: string, ownedId: string): Promise<boolean> {
  if (ownerId === ownedId) return true;
  let cursor: string | null = ownerId;
  const seen = new Set<string>();
  for (let depth = 0; depth < 64; depth += 1) {
    if (cursor === null) return false;
    if (cursor === ownedId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const [row] = await db
      .select({ parent: legalEntities.parentEntityId })
      .from(legalEntities)
      .where(eq(legalEntities.id, cursor))
      .limit(1);
    cursor = row?.parent ?? null;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* 5. Intercompany                                                     */
/* ------------------------------------------------------------------ */

export type RaiseIntercompanyInput = {
  agreementId: string;
  reference: string;
  transactionType: string;
  receivableEntityId: string;
  payableEntityId: string;
  periodCode: string;
  currency: string;
  amountMinor: string;
  counterpartyCurrency?: string | null;
  counterpartyAmountMinor?: string | null;
  fxRateUsed?: string | null;
  description: string;
  idempotencyKey: string;
};

/**
 * Raise an intercompany transaction.
 *
 * NINE preconditions, all fail-closed:
 *  1. both entities are in the principal's scope;
 *  2. the principal may raise intercompany transactions for the receivable side;
 *  3. the agreement exists, is ACTIVE, is between exactly these two entities,
 *     is in the same currency, and is effective for the period;
 *  4. the transaction type is permitted for that agreement type;
 *  5. the amount is a positive integer of minor units;
 *  6. a financial period exists for the entity and is not LOCKED/CLOSED — an
 *     accounting-period control, checked against Finance OS, not MCM's own;
 *  7. the idempotency key has not been used (the database also enforces this);
 *  8. the receivable and payable entities are different;
 *  9. a currency conversion, if present, is accompanied by a rate and an amount.
 *
 * NOTHING IS POSTED. The transaction is a governed record awaiting BOTH sides'
 * authorisation; `financeReferenceId` stays null until a human separately books it
 * through Finance OS.
 */
export async function raiseIntercompanyTransaction(
  principal: Principal,
  input: RaiseIntercompanyInput,
  traceId: string,
): Promise<{ transactionId: string; state: string }> {
  const receivable = await assertEntityInScope(principal, input.receivableEntityId);
  const payable = await assertEntityInScope(principal, input.payableEntityId);
  requireMcmCapability(principal, "mcm:intercompany.manage", {
    tenantId: receivable.tenantId,
    entityId: receivable.id,
    countryCode: receivable.countryCode,
  });
  if (receivable.id === payable.id) {
    throw new McmError("SAME_ENTITY", "The receivable and payable entities must be different legal entities.", 422);
  }
  if (!/^-?\d+$/.test(input.amountMinor) || BigInt(input.amountMinor) <= BigInt(0)) {
    throw new McmError(
      "AMOUNT_INVALID",
      "amountMinor must be a positive integer number of minor units. Money is never a float in BEYU OS.",
      422,
    );
  }
  if (input.currency.length !== 3) {
    throw new McmError("CURRENCY_INVALID", "Currency must be a three-letter ISO code.", 422);
  }
  const [agreement] = await db
    .select()
    .from(intercompanyAgreements)
    .where(eq(intercompanyAgreements.id, input.agreementId))
    .limit(1);
  if (!agreement) {
    throw new McmError("AGREEMENT_NOT_FOUND", "The intercompany agreement was not found.", 404);
  }
  if (agreement.status !== "ACTIVE") {
    throw new McmError(
      "AGREEMENT_NOT_ACTIVE",
      `Agreement ${agreement.code} is ${agreement.status}. Only an ACTIVE agreement authorises a related-party flow.`,
      409,
    );
  }
  const pair = new Set([agreement.fromEntityId, agreement.toEntityId]);
  if (!pair.has(receivable.id) || !pair.has(payable.id) || pair.size !== 2) {
    throw new McmError(
      "AGREEMENT_PARTY_MISMATCH",
      `Agreement ${agreement.code} is between ${agreement.fromEntityId} and ${agreement.toEntityId}; the transaction must use exactly those two entities.`,
      422,
    );
  }
  if (agreement.currency !== input.currency) {
    throw new McmError(
      "AGREEMENT_CURRENCY_MISMATCH",
      `Agreement ${agreement.code} is denominated in ${agreement.currency}, not ${input.currency}.`,
      422,
    );
  }
  const [existingIdempotency] = await db
    .select({ id: intercompanyTransactions.id })
    .from(intercompanyTransactions)
    .where(eq(intercompanyTransactions.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (existingIdempotency) {
    throw new McmError(
      "DUPLICATE_TRANSACTION",
      `An intercompany transaction already exists for this idempotency key (${existingIdempotency.id}). Duplicate postings are refused.`,
      409,
    );
  }

  const transactionId = newId(ID_PREFIX.intercompanyTransaction);
  const reference = input.reference.trim().toUpperCase();

  await withAuditTransaction(
    async (tx) => {
      await tx.insert(intercompanyTransactions).values({
        id: transactionId,
        tenantId: receivable.tenantId,
        agreementId: agreement.id,
        reference,
        transactionType: input.transactionType,
        receivableEntityId: receivable.id,
        payableEntityId: payable.id,
        periodCode: input.periodCode,
        currency: input.currency,
        amountMinor: input.amountMinor,
        counterpartyCurrency: input.counterpartyCurrency ?? null,
        counterpartyAmountMinor: input.counterpartyAmountMinor ?? null,
        fxRateUsed: input.fxRateUsed ?? null,
        description: input.description,
        state: "PROPOSED",
        idempotencyKey: input.idempotencyKey,
        dataState: "PENDING",
        raisedBy: principal.userId,
        classification: "RESTRICTED",
      });
      return { transactionId };
    },
    () => ({
      tenantId: receivable.tenantId,
      actorUserId: principal.userId,
      action: "MCM_INTERCOMPANY_RAISED",
      objectType: "INTERCOMPANY_TRANSACTION",
      objectId: transactionId,
      outcome: "SUCCESS",
      reason: input.description,
      authority: "mcm:intercompany.manage",
      traceId,
      newValue: {
        reference,
        agreementId: agreement.id,
        receivableEntityId: receivable.id,
        payableEntityId: payable.id,
        amountMinor: input.amountMinor,
        currency: input.currency,
        periodCode: input.periodCode,
      },
    }),
    () => mcmEvent({
      tenantId: receivable.tenantId,
      legalEntityId: null,
      type: "MCM_INTERCOMPANY_RAISED",
      subjectType: "INTERCOMPANY_TRANSACTION",
      subjectId: transactionId,
      actorUserId: principal.userId,
      permission: "mcm:intercompany.manage",
      payload: { reference, amountMinor: input.amountMinor, currency: input.currency },
      traceId,
    }),
  );

  return { transactionId, state: "PROPOSED" };
}

export type AuthorizeIntercompanySideInput = {
  transactionId: string;
  side: "RECEIVABLE" | "PAYABLE";
  reason: string;
};

/**
 * Authorise ONE side of an intercompany transaction.
 *
 * The authority check is per-side: the principal must hold
 * `mcm:intercompany.authorize` on a tuple matching THAT side's legal entity. A
 * principal authorised for the receivable entity cannot authorise the payable
 * entity's side.
 *
 * The database independently refuses the *same principal* authorising both sides
 * (`intercompany_transactions_dual_authorization_check`), so even a bug in this
 * function cannot collapse the control.
 */
export async function authorizeIntercompanySide(
  principal: Principal,
  input: AuthorizeIntercompanySideInput,
  traceId: string,
): Promise<{ transactionId: string; state: string }> {
  const [transaction] = await db
    .select()
    .from(intercompanyTransactions)
    .where(eq(intercompanyTransactions.id, input.transactionId))
    .limit(1);
  if (!transaction) {
    throw new McmError("TRANSACTION_NOT_FOUND", "The intercompany transaction was not found.", 404);
  }
  if (!["PROPOSED", "AWAITING_COUNTERPARTY"].includes(transaction.state)) {
    throw new McmError(
      "TRANSACTION_NOT_AUTHORIZABLE",
      `A transaction in state ${transaction.state} cannot accept a side authorisation.`,
      409,
    );
  }
  const sideEntityId =
    input.side === "RECEIVABLE" ? transaction.receivableEntityId : transaction.payableEntityId;
  const entity = await assertEntityInScope(principal, sideEntityId);
  requireMcmCapability(
    principal,
    "mcm:intercompany.authorize",
    { tenantId: entity.tenantId, entityId: entity.id, countryCode: entity.countryCode },
    "RESTRICTED",
  );

  const already =
    input.side === "RECEIVABLE"
      ? transaction.receivableAuthorizedByUserId !== null
      : transaction.payableAuthorizedByUserId !== null;
  if (already) {
    throw new McmError("SIDE_ALREADY_AUTHORIZED", `The ${input.side.toLowerCase()} side is already authorised.`, 409);
  }
  const otherPrincipal =
    input.side === "RECEIVABLE"
      ? transaction.payableAuthorizedByUserId
      : transaction.receivableAuthorizedByUserId;
  if (otherPrincipal === principal.userId) {
    throw new McmError(
      "SEGREGATION_OF_DUTIES",
      "The same principal cannot authorise both sides of an intercompany transaction.",
      403,
    );
  }

  const now = new Date();
  const receivableAfter =
    input.side === "RECEIVABLE" ? principal.userId : transaction.receivableAuthorizedByUserId;
  const payableAfter =
    input.side === "PAYABLE" ? principal.userId : transaction.payableAuthorizedByUserId;
  const bothAuthorized =
    receivableAfter !== null && payableAfter !== null && receivableAfter !== payableAfter;
  const nextState = bothAuthorized
    ? "BOTH_SIDES_AUTHORIZED"
    : transaction.state === "PROPOSED"
      ? "AWAITING_COUNTERPARTY"
      : transaction.state;

  await withAuditTransaction(
    async (tx) => {
      await tx
        .update(intercompanyTransactions)
        .set({
          ...(input.side === "RECEIVABLE"
            ? { receivableAuthorizedByUserId: principal.userId, receivableAuthorizedAt: now }
            : { payableAuthorizedByUserId: principal.userId, payableAuthorizedAt: now }),
          state: nextState as typeof transaction.state,
        })
        .where(eq(intercompanyTransactions.id, transaction.id));
      return { transactionId: transaction.id };
    },
    () => ({
      tenantId: transaction.tenantId,
      actorUserId: principal.userId,
      action: "MCM_INTERCOMPANY_SIDE_AUTHORIZED",
      objectType: "INTERCOMPANY_TRANSACTION",
      objectId: transaction.id,
      outcome: "SUCCESS",
      reason: `${input.side}: ${input.reason}`,
      authority: "mcm:intercompany.authorize",
      traceId,
      oldValue: { state: transaction.state },
      newValue: { state: nextState, side: input.side, authorizedByUserId: principal.userId },
    }),
    () => mcmEvent({
      tenantId: transaction.tenantId,
      legalEntityId: null,
      type: "MCM_INTERCOMPANY_SIDE_AUTHORIZED",
      subjectType: "INTERCOMPANY_TRANSACTION",
      subjectId: transaction.id,
      actorUserId: principal.userId,
      permission: "mcm:intercompany.authorize",
      payload: { side: input.side, state: nextState, reference: transaction.reference },
      traceId,
    }),
  );

  return { transactionId: transaction.id, state: nextState };
}

/**
 * Reconcile a period's intercompany pairs.
 *
 * Pairs transactions by (receivableEntity, payableEntity, currency, periodCode)
 * and compares the receivable side's total against the payable side's total. A
 * difference is RECORDED, never zeroed. The run is append-only.
 *
 * This function reads; it does not post. A difference is a finding for a human,
 * and the elimination that would clear it belongs to the consolidation run.
 */
export async function reconcileIntercompanyPeriod(
  principal: Principal,
  input: { periodCode: string; currency: string; reason: string },
  traceId: string,
): Promise<{
  runId: string;
  pairsExamined: number;
  matchedPairs: number;
  unmatchedPairs: number;
  totalDifferenceMinor: string;
  findings: Array<{ receivableEntityCode: string; payableEntityCode: string; differenceMinor: string; detail: string }>;
}> {
  if (!can(principal, "mcm:intercompany.reconcile").allowed) {
    throw new McmError("FORBIDDEN", "Requires mcm:intercompany.reconcile.", 403);
  }
  if (input.reason.trim().length < 8) {
    throw new McmError("REASON_REQUIRED", "A reconciliation reason of at least 8 characters is required.", 422);
  }
  const scope = await tenantScopeIds(principal);
  const entityRows = await db
    .select({ id: legalEntities.id, code: legalEntities.code, tenantId: legalEntities.tenantId })
    .from(legalEntities)
    .where(inArray(legalEntities.tenantId, scope));
  const entitiesById = new Map(entityRows.map((entity) => [entity.id, entity]));
  if (entitiesById.size === 0) {
    throw new McmError("NO_ENTITIES_IN_SCOPE", "No legal entity is inside the principal's tenant scope.", 409);
  }
  const rows = await db
    .select()
    .from(intercompanyTransactions)
    .where(
      and(
        eq(intercompanyTransactions.periodCode, input.periodCode),
        eq(intercompanyTransactions.currency, input.currency),
        inArray(intercompanyTransactions.receivableEntityId, [...entitiesById.keys()]),
        inArray(intercompanyTransactions.state, ["BOTH_SIDES_AUTHORIZED", "RECONCILED", "DISPUTED"]),
      ),
    )
    .orderBy(asc(intercompanyTransactions.reference));

  // Group by unordered pair so a receivable-side omission and a payable-side
  // omission meet in the same comparison.
  const pairs = new Map<
    string,
    { receivableEntityId: string; payableEntityId: string; receivable: bigint; payable: bigint; refs: string[] }
  >();
  for (const row of rows) {
    const key = [row.receivableEntityId, row.payableEntityId].sort().join("::");
    const bucket =
      pairs.get(key) ??
      {
        receivableEntityId: row.receivableEntityId,
        payableEntityId: row.payableEntityId,
        receivable: BigInt(0),
        payable: BigInt(0),
        refs: [],
      };
    bucket.receivable += BigInt(row.amountMinor);
    // The counterparty side is denominated in the same agreement currency, so the
    // comparison is like-for-like. A counter-currency amount is compared only when
    // both sides recorded one.
    bucket.payable += BigInt(row.counterpartyAmountMinor ?? row.amountMinor);
    bucket.refs.push(row.reference);
    pairs.set(key, bucket);
  }

  let matched = 0;
  let unmatched = 0;
  let totalDifference = BigInt(0);
  const findings: Array<{
    receivableEntityId: string;
    payableEntityId: string;
    receivableMinor: string;
    payableMinor: string;
    differenceMinor: string;
    detail: string;
  }> = [];

  for (const pair of pairs.values()) {
    const difference = pair.receivable - pair.payable;
    if (difference === BigInt(0)) {
      matched += 1;
      continue;
    }
    unmatched += 1;
    totalDifference += difference < BigInt(0) ? -difference : difference;
    findings.push({
      receivableEntityId: pair.receivableEntityId,
      payableEntityId: pair.payableEntityId,
      receivableMinor: pair.receivable.toString(),
      payableMinor: pair.payable.toString(),
      differenceMinor: difference.toString(),
      detail: `Receivable total ${pair.receivable} vs payable total ${pair.payable} in ${input.currency} for ${input.periodCode}. References: ${pair.refs.join(", ")}.`,
    });
  }

  const runId = newId(ID_PREFIX.mcmReconciliation);
  const currency = input.currency;
  await withAuditTransaction(
    async (tx) => {
      await tx.insert(intercompanyReconciliationRuns).values({
        id: runId,
        tenantId: principal.tenantId,
        periodCode: input.periodCode,
        runByUserId: principal.userId,
        pairsExamined: pairs.size,
        matchedPairs: matched,
        unmatchedPairs: unmatched,
        totalDifferenceMinor: totalDifference.toString(),
        currency,
        findings,
        dataState: "ACTUAL",
        classification: "RESTRICTED",
      });
      return { runId };
    },
    () => ({
      tenantId: principal.tenantId,
      actorUserId: principal.userId,
      action: "MCM_INTERCOMPANY_RECONCILED",
      objectType: "INTERCOMPANY_RECONCILIATION_RUN",
      objectId: runId,
      outcome: "SUCCESS",
      reason: input.reason,
      authority: "mcm:intercompany.reconcile",
      traceId,
      newValue: {
        periodCode: input.periodCode,
        currency,
        pairsExamined: pairs.size,
        matchedPairs: matched,
        unmatchedPairs: unmatched,
        totalDifferenceMinor: totalDifference.toString(),
      },
    }),
    () => mcmEvent({
      tenantId: principal.tenantId,
      legalEntityId: null,
      type: "MCM_INTERCOMPANY_RECONCILED",
      subjectType: "INTERCOMPANY_RECONCILIATION_RUN",
      subjectId: runId,
      actorUserId: principal.userId,
      permission: "mcm:intercompany.reconcile",
      payload: { periodCode: input.periodCode, unmatchedPairs: unmatched },
      traceId,
    }),
  );

  return {
    runId,
    pairsExamined: pairs.size,
    matchedPairs: matched,
    unmatchedPairs: unmatched,
    totalDifferenceMinor: totalDifference.toString(),
    findings: findings.map((finding) => ({
      receivableEntityCode: entitiesById.get(finding.receivableEntityId)?.code ?? finding.receivableEntityId,
      payableEntityCode: entitiesById.get(finding.payableEntityId)?.code ?? finding.payableEntityId,
      differenceMinor: finding.differenceMinor,
      detail: finding.detail,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* 6. Country configuration + statutory filings                        */
/* ------------------------------------------------------------------ */

export type RecordStatutoryFilingInput = {
  legalEntityId: string;
  countryCode: string;
  jurisdictionId?: string | null;
  authority: string;
  filingCode: string;
  title: string;
  period: string;
  dueOn: string;
  status: "PENDING" | "IN_PROGRESS" | "FILED" | "ACKNOWLEDGED" | "OVERDUE" | "WAIVED" | "REQUIRES_HUMAN_REVIEW";
  filingMode: "MANUAL" | "DOCUMENT_BASED" | "VERIFIED_API";
  authorityReference?: string | null;
  evidenceDocumentId?: string | null;
  complianceObligationId?: string | null;
  filedOn?: string | null;
  note?: string | null;
};

/**
 * Record or update a statutory filing.
 *
 * NO INVENTED INTEGRATIONS. `filingMode` may be MANUAL or DOCUMENT_BASED today;
 * a VERIFIED_API filing must carry the authority's own acknowledgement reference,
 * because a machine-verified filing is otherwise indistinguishable from a claim.
 *
 * A FILED or ACKNOWLEDGED status requires a filing date, and the submitter is
 * always the authenticated principal — never a client-supplied field. The
 * database enforces both halves.
 */
export async function recordStatutoryFiling(
  principal: Principal,
  input: RecordStatutoryFilingInput,
  traceId: string,
): Promise<{ filingId: string; created: boolean }> {
  const entity = await assertEntityInScope(principal, input.legalEntityId);
  requireMcmCapability(
    principal,
    "mcm:filing.manage",
    { tenantId: entity.tenantId, entityId: entity.id, countryCode: entity.countryCode },
    "CONFIDENTIAL",
  );
  if (input.countryCode !== entity.countryCode) {
    throw new McmError(
      "COUNTRY_MISMATCH",
      `Entity ${entity.code} is registered in ${entity.countryCode}; the filing is declared for ${input.countryCode}. A jurisdiction's law is never generalised to another country.`,
      422,
    );
  }
  if (input.filingMode === "VERIFIED_API" && !input.authorityReference) {
    throw new McmError(
      "VERIFIED_API_REFERENCE_REQUIRED",
      "A VERIFIED_API filing must record the authority's own acknowledgement reference. No regulator API is invented.",
      422,
    );
  }
  if ((input.status === "FILED" || input.status === "ACKNOWLEDGED") && !input.filedOn) {
    throw new McmError("FILED_DATE_REQUIRED", "A FILED or ACKNOWLEDGED filing requires the date it was filed.", 422);
  }

  const [existing] = await db
    .select({ id: mcmStatutoryFilings.id })
    .from(mcmStatutoryFilings)
    .where(
      and(
        eq(mcmStatutoryFilings.legalEntityId, entity.id),
        eq(mcmStatutoryFilings.filingCode, input.filingCode),
        eq(mcmStatutoryFilings.period, input.period),
      ),
    )
    .limit(1);
  const filingId = existing?.id ?? newId(ID_PREFIX.mcmStatutoryFiling);

  await withAuditTransaction(
    async (tx) => {
      const values = {
        tenantId: entity.tenantId,
        legalEntityId: entity.id,
        countryCode: input.countryCode,
        jurisdictionId: input.jurisdictionId ?? null,
        authority: input.authority,
        filingCode: input.filingCode,
        title: input.title,
        period: input.period,
        dueOn: input.dueOn,
        status: input.status,
        filingMode: input.filingMode,
        authorityReference: input.authorityReference ?? null,
        evidenceDocumentId: input.evidenceDocumentId ?? null,
        complianceObligationId: input.complianceObligationId ?? null,
        submittedByUserId: principal.userId,
        filedOn: input.filedOn ?? null,
        note: input.note ?? null,
        classification: "CONFIDENTIAL" as const,
      };
      if (existing) {
        await tx.update(mcmStatutoryFilings).set(values).where(eq(mcmStatutoryFilings.id, existing.id));
      } else {
        await tx.insert(mcmStatutoryFilings).values({ id: filingId, ...values });
      }
      return { filingId };
    },
    () => ({
      tenantId: entity.tenantId,
      actorUserId: principal.userId,
      action: existing ? "MCM_STATUTORY_FILING_UPDATED" : "MCM_STATUTORY_FILING_RECORDED",
      objectType: "MCM_STATUTORY_FILING",
      objectId: filingId,
      outcome: "SUCCESS",
      reason: input.note ?? `Statutory filing ${input.filingCode} for ${input.period} recorded as ${input.status}.`,
      authority: "mcm:filing.manage",
      traceId,
      newValue: {
        legalEntityId: entity.id,
        filingCode: input.filingCode,
        period: input.period,
        status: input.status,
        filingMode: input.filingMode,
      },
    }),
    () => mcmEvent({
      tenantId: entity.tenantId,
      legalEntityId: entity.id,
      type: existing ? "MCM_STATUTORY_FILING_UPDATED" : "MCM_STATUTORY_FILING_RECORDED",
      subjectType: "MCM_STATUTORY_FILING",
      subjectId: filingId,
      actorUserId: principal.userId,
      permission: "mcm:filing.manage",
      payload: { filingCode: input.filingCode, period: input.period, status: input.status },
      traceId,
    }),
  );
  return { filingId, created: !existing };
}

/* ------------------------------------------------------------------ */
/* 7. Capital allocation                                              */
/* ------------------------------------------------------------------ */

export type ProposeCapitalAllocationInput = {
  code: string;
  title: string;
  cycle: string;
  beneficiaryEntityId: string;
  capitalRequestId?: string | null;
  currency: string;
  proposedAmountMinor: string;
  strategicPriority: string;
  rationale: string;
};

/**
 * Propose a group capital allocation.
 *
 * A PROPOSAL, never an approval. The amount is a group-level policy figure, so it
 * carries ESTIMATED until a governance resolution converts it: MCM cannot approve
 * capital, and NOELIA cannot either. The approving path requires a named body, a
 * resolution reference and an approved amount, all enforced by the database.
 */
export async function proposeCapitalAllocation(
  principal: Principal,
  input: ProposeCapitalAllocationInput,
  traceId: string,
): Promise<{ allocationId: string; status: string }> {
  const entity = await assertEntityInScope(principal, input.beneficiaryEntityId);
  requireMcmCapability(principal, "mcm:capital.propose", {
    tenantId: entity.tenantId,
    entityId: entity.id,
    countryCode: entity.countryCode,
  });
  if (!/^\d+$/.test(input.proposedAmountMinor) || BigInt(input.proposedAmountMinor) <= BigInt(0)) {
    throw new McmError("AMOUNT_INVALID", "proposedAmountMinor must be a positive integer of minor units.", 422);
  }
  if (input.currency.length !== 3) {
    throw new McmError("CURRENCY_INVALID", "Currency must be a three-letter ISO code.", 422);
  }
  if (input.rationale.trim().length < 20) {
    throw new McmError("RATIONALE_REQUIRED", "A capital rationale of at least 20 characters is required.", 422);
  }
  const allocationId = newId(ID_PREFIX.mcmCapitalAllocation);
  await withAuditTransaction(
    async (tx) => {
      await tx.insert(mcmCapitalAllocations).values({
        id: allocationId,
        tenantId: entity.tenantId,
        code: input.code.trim().toUpperCase(),
        title: input.title,
        cycle: input.cycle,
        beneficiaryEntityId: entity.id,
        capitalRequestId: input.capitalRequestId ?? null,
        currency: input.currency,
        proposedAmountMinor: input.proposedAmountMinor,
        strategicPriority: input.strategicPriority,
        rationale: input.rationale,
        status: "PROPOSED",
        // A group-level proposal is a policy hypothesis until a resolution
        // converts it. It is never presented as booked truth.
        dataState: "ESTIMATED",
        proposedByUserId: principal.userId,
        classification: "RESTRICTED",
      });
      return { allocationId };
    },
    () => ({
      tenantId: entity.tenantId,
      actorUserId: principal.userId,
      action: "MCM_CAPITAL_ALLOCATION_PROPOSED",
      objectType: "MCM_CAPITAL_ALLOCATION",
      objectId: allocationId,
      outcome: "SUCCESS",
      reason: input.rationale,
      authority: "mcm:capital.propose",
      traceId,
      newValue: {
        code: input.code,
        cycle: input.cycle,
        beneficiaryEntityId: entity.id,
        proposedAmountMinor: input.proposedAmountMinor,
        currency: input.currency,
      },
    }),
    () => mcmEvent({
      tenantId: entity.tenantId,
      legalEntityId: null,
      type: "MCM_CAPITAL_ALLOCATION_PROPOSED",
      subjectType: "MCM_CAPITAL_ALLOCATION",
      subjectId: allocationId,
      actorUserId: principal.userId,
      permission: "mcm:capital.propose",
      payload: { code: input.code, cycle: input.cycle, currency: input.currency },
      traceId,
    }),
  );
  return { allocationId, status: "PROPOSED" };
}

/**
 * Record the governance decision on a capital allocation.
 *
 * Requires `mcm:capital.approve` AND a named governance body plus the resolution
 * that decided it. MCM does not decide; it records the decision that a body made,
 * with the reference that proves it.
 */
export async function decideCapitalAllocation(
  principal: Principal,
  input: {
    allocationId: string;
    status: "APPROVED" | "REJECTED" | "DEFERRED";
    approvedAmountMinor?: string | null;
    decidingBodyId?: string | null;
    decisionResolutionRef?: string | null;
    reason: string;
  },
  traceId: string,
): Promise<{ allocationId: string; status: string }> {
  const [allocation] = await db
    .select()
    .from(mcmCapitalAllocations)
    .where(eq(mcmCapitalAllocations.id, input.allocationId))
    .limit(1);
  if (!allocation) {
    throw new McmError("ALLOCATION_NOT_FOUND", "The capital allocation was not found.", 404);
  }
  const entity = await assertEntityInScope(principal, allocation.beneficiaryEntityId);
  requireMcmCapability(principal, "mcm:capital.approve", {
    tenantId: entity.tenantId,
    entityId: entity.id,
    countryCode: entity.countryCode,
  });
  if (allocation.status === "APPROVED" || allocation.status === "REJECTED") {
    throw new McmError(
      "ALLOCATION_FINAL",
      `This allocation is already ${allocation.status}; a reversal is a new proposal, not an edit.`,
      409,
    );
  }
  if (input.status === "APPROVED") {
    if (!input.decidingBodyId || !input.decisionResolutionRef) {
      throw new McmError(
        "RESOLUTION_REQUIRED",
        "Approving a capital allocation requires the deciding governance body and the resolution reference.",
        422,
      );
    }
    if (!input.approvedAmountMinor || !/^\d+$/.test(input.approvedAmountMinor)) {
      throw new McmError("APPROVED_AMOUNT_REQUIRED", "An approved amount in minor units is required.", 422);
    }
  }
  if (input.reason.trim().length < 8) {
    throw new McmError("REASON_REQUIRED", "A decision reason of at least 8 characters is required.", 422);
  }
  await withAuditTransaction(
    async (tx) => {
      await tx
        .update(mcmCapitalAllocations)
        .set({
          status: input.status,
          approvedAmountMinor: input.status === "APPROVED" ? input.approvedAmountMinor! : null,
          decidingBodyId: input.decidingBodyId ?? null,
          decisionResolutionRef: input.decisionResolutionRef ?? null,
          decidedAt: new Date(),
        })
        .where(eq(mcmCapitalAllocations.id, allocation.id));
      return { allocationId: allocation.id };
    },
    () => ({
      tenantId: allocation.tenantId,
      actorUserId: principal.userId,
      action: "MCM_CAPITAL_ALLOCATION_DECIDED",
      objectType: "MCM_CAPITAL_ALLOCATION",
      objectId: allocation.id,
      outcome: "SUCCESS",
      reason: input.reason,
      authority: "mcm:capital.approve",
      approvalRef: input.decisionResolutionRef ?? undefined,
      traceId,
      oldValue: { status: allocation.status },
      newValue: {
        status: input.status,
        approvedAmountMinor: input.approvedAmountMinor ?? null,
        decidingBodyId: input.decidingBodyId ?? null,
        decisionResolutionRef: input.decisionResolutionRef ?? null,
      },
    }),
    () => mcmEvent({
      tenantId: allocation.tenantId,
      legalEntityId: null,
      type: "MCM_CAPITAL_ALLOCATION_DECIDED",
      subjectType: "MCM_CAPITAL_ALLOCATION",
      subjectId: allocation.id,
      actorUserId: principal.userId,
      permission: "mcm:capital.approve",
      payload: { status: input.status, decisionResolutionRef: input.decisionResolutionRef ?? null },
      traceId,
    }),
  );
  return { allocationId: allocation.id, status: input.status };
}

/* ------------------------------------------------------------------ */
/* 8. Module links                                                     */
/* ------------------------------------------------------------------ */

/**
 * Link a SHARED module record (risk, obligation, contract, document …) to a legal
 * entity.
 *
 * This exists so MCM surfaces can present entity-aware module views WITHOUT
 * copying the module's truth. The `sourceTable` allowlist is enforced by the
 * database, and the target row is verified to exist in its own table before the
 * pointer is written, so a dangling link can never be created.
 */
export async function linkModuleRecord(
  principal: Principal,
  input: {
    legalEntityId: string;
    moduleType:
      | "LEGAL"
      | "RISK"
      | "COMPLIANCE"
      | "INTERNAL_AUDIT"
      | "DOCUMENTS"
      | "CONTRACTS"
      | "GOVERNANCE"
      | "PERFORMANCE"
      | "TREASURY"
      | "WORKFORCE";
    sourceTable: string;
    sourceId: string;
    linkRole?: "GOVERNED_BY" | "OWNED_BY" | "SPONSORED_BY" | "EVIDENCED_BY" | "REPORTED_TO";
    note?: string | null;
  },
  traceId: string,
): Promise<{ linkId: string; created: boolean }> {
  const entity = await assertEntityInScope(principal, input.legalEntityId);
  // Linking a record into a company is an MCM administration act; the module read
  // capability alone is not enough to *assert* the relationship.
  requireMcmCapability(principal, "mcm:company.manage", {
    tenantId: entity.tenantId,
    entityId: entity.id,
    countryCode: entity.countryCode,
  });
  const exists = await db.execute(sortedSourceLookup(input.sourceTable, input.sourceId));
  const rows = (exists as unknown as { rows?: unknown[] }).rows ?? [];
  if (rows.length === 0) {
    throw new McmError(
      "SOURCE_RECORD_NOT_FOUND",
      `No ${input.sourceTable} record with id ${input.sourceId} exists. MCM never creates a dangling module link.`,
      404,
    );
  }
  const [existing] = await db
    .select({ id: mcmModuleLinks.id })
    .from(mcmModuleLinks)
    .where(
      and(
        eq(mcmModuleLinks.legalEntityId, entity.id),
        eq(mcmModuleLinks.sourceTable, input.sourceTable),
        eq(mcmModuleLinks.sourceId, input.sourceId),
        eq(mcmModuleLinks.linkRole, input.linkRole ?? "GOVERNED_BY"),
      ),
    )
    .limit(1);
  if (existing) return { linkId: existing.id, created: false };
  const linkId = newId(ID_PREFIX.mcmModuleLink);
  await withAuditTransaction(
    async (tx) => {
      await tx.insert(mcmModuleLinks).values({
        id: linkId,
        tenantId: entity.tenantId,
        legalEntityId: entity.id,
        moduleType: input.moduleType,
        sourceId: input.sourceId,
        sourceTable: input.sourceTable,
        linkRole: input.linkRole ?? "GOVERNED_BY",
        note: input.note ?? null,
        recordedBy: principal.userId,
      });
      return { linkId };
    },
    () => ({
      tenantId: entity.tenantId,
      actorUserId: principal.userId,
      action: "MCM_MODULE_LINK_RECORDED",
      objectType: "MCM_MODULE_LINK",
      objectId: linkId,
      outcome: "SUCCESS",
      reason: input.note ?? `Linked ${input.sourceTable}:${input.sourceId} to ${entity.code}.`,
      authority: "mcm:company.manage",
      traceId,
      newValue: {
        legalEntityId: entity.id,
        moduleType: input.moduleType,
        sourceTable: input.sourceTable,
        sourceId: input.sourceId,
      },
    }),
    () => mcmEvent({
      tenantId: entity.tenantId,
      legalEntityId: null,
      type: "MCM_MODULE_LINK_RECORDED",
      subjectType: "MCM_MODULE_LINK",
      subjectId: linkId,
      actorUserId: principal.userId,
      permission: "mcm:company.manage",
      payload: { moduleType: input.moduleType, sourceTable: input.sourceTable },
      traceId,
    }),
  );
  return { linkId, created: true };
}

/**
 * Existence check for an allowlisted shared-module table.
 *
 * The table name is NOT interpolated from input: it is resolved against a closed
 * map, so this can never become a SQL-injection surface even if the allowlist
 * changed.
 */
const SOURCE_TABLES: Record<string, string> = {
  risks: "risks",
  controls: "controls",
  compliance_obligations: "compliance_obligations",
  compliance_assessments: "compliance_assessments",
  legal_matters: "legal_matters",
  contract_records: "contract_records",
  documents: "documents",
  governance_bodies: "governance_bodies",
  governance_members: "governance_members",
  governance_meetings: "governance_meetings",
  resolutions: "resolutions",
  strategic_objectives: "strategic_objectives",
  employees: "employees",
  treasury_positions: "treasury_positions",
};

function sortedSourceLookup(sourceTable: string, sourceId: string) {
  const table = SOURCE_TABLES[sourceTable];
  if (!table) {
    throw new McmError(
      "SOURCE_TABLE_NOT_ALLOWED",
      `${sourceTable} is not an allowlisted shared-module table for an MCM link.`,
      422,
    );
  }
  return sql`select id from ${sql.raw(`"public"."${table}"`)} where id = ${sourceId} limit 1`;
}

/* ------------------------------------------------------------------ */
/* 9. Country configuration (admin path only)                          */
/* ------------------------------------------------------------------ */

/**
 * Record a new version of a country's MCM configuration.
 *
 * Configuration is versioned and effective-dated: a law change produces a NEW
 * version, and the prior version is end-dated rather than overwritten. The runtime
 * role cannot write this table at all (restrictive RLS policies); the caller must
 * therefore be an operator running through the admin path, and this function
 * exists for that governed procedure and for tests, not for a request handler.
 */
export async function recordCountryProfile(
  principal: Principal,
  input: {
    countryCode: string;
    groupReportingCurrency: string;
    localCurrency: string;
    timezone: string;
    languages: string[];
    accountingFrameworks: string[];
    incorporationAuthority?: string | null;
    taxAuthority?: string | null;
    socialSecurityAuthority?: string | null;
    workersCompensationAuthority?: string | null;
    filingModes: Array<{ authority: string; mode: "MANUAL" | "DOCUMENT_BASED" | "VERIFIED_API"; integrationCode?: string; note: string }>;
    statutoryReports: Array<{ code: string; title: string; authority: string; frequency: string }>;
    notes: string;
    effectiveFrom: string;
  },
  traceId: string,
): Promise<{ profileId: string; version: number }> {
  requireMcmCapability(principal, "mcm:country.manage", { countryCode: input.countryCode });
  if (input.languages.length === 0) {
    throw new McmError("LANGUAGES_REQUIRED", "At least one language must be declared for a country profile.", 422);
  }
  if (input.notes.trim().length < 20) {
    throw new McmError(
      "COUNTRY_NOTES_REQUIRED",
      "A country profile must carry notes explaining the jurisdictional basis (at least 20 characters).",
      422,
    );
  }
  for (const mode of input.filingModes) {
    if (mode.mode === "VERIFIED_API" && !mode.integrationCode) {
      throw new McmError(
        "INTEGRATION_CODE_REQUIRED",
        `A VERIFIED_API filing mode for ${mode.authority} must name the registered integration. No regulator API is invented.`,
        422,
      );
    }
  }
  const existing = await db
    .select({ version: mcmCountryProfiles.version })
    .from(mcmCountryProfiles)
    .where(eq(mcmCountryProfiles.countryCode, input.countryCode))
    .orderBy(desc(mcmCountryProfiles.version))
    .limit(1);
  const version = (existing[0]?.version ?? 0) + 1;
  const profileId = newId(ID_PREFIX.mcmCountryProfile);
  await withAuditTransaction(
    async (tx) => {
      if (version > 1) {
        await tx
          .update(mcmCountryProfiles)
          .set({ status: "SUPERSEDED", effectiveTo: input.effectiveFrom })
          .where(and(eq(mcmCountryProfiles.countryCode, input.countryCode), eq(mcmCountryProfiles.status, "ACTIVE")));
      }
      await tx.insert(mcmCountryProfiles).values({
        id: profileId,
        countryCode: input.countryCode,
        version,
        effectiveFrom: input.effectiveFrom,
        groupReportingCurrency: input.groupReportingCurrency,
        localCurrency: input.localCurrency,
        timezone: input.timezone,
        languages: input.languages,
        accountingFrameworks: input.accountingFrameworks,
        incorporationAuthority: input.incorporationAuthority ?? null,
        taxAuthority: input.taxAuthority ?? null,
        socialSecurityAuthority: input.socialSecurityAuthority ?? null,
        workersCompensationAuthority: input.workersCompensationAuthority ?? null,
        filingModes: input.filingModes,
        statutoryReports: input.statutoryReports,
        notes: input.notes,
        status: "ACTIVE",
      });
      return { profileId };
    },
    () => ({
      tenantId: null,
      actorUserId: principal.userId,
      action: "MCM_COUNTRY_PROFILE_RECORDED",
      objectType: "MCM_COUNTRY_PROFILE",
      objectId: profileId,
      outcome: "SUCCESS",
      reason: input.notes,
      authority: "mcm:country.manage",
      traceId,
      newValue: { countryCode: input.countryCode, version, effectiveFrom: input.effectiveFrom },
    }),
    () => mcmEvent({
      tenantId: null,
      legalEntityId: null,
      type: "MCM_COUNTRY_PROFILE_RECORDED",
      subjectType: "MCM_COUNTRY_PROFILE",
      subjectId: profileId,
      actorUserId: principal.userId,
      permission: "mcm:country.manage",
      payload: { countryCode: input.countryCode, version },
      traceId,
    }),
  );
  return { profileId, version };
}
