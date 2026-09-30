/**
 * BEYU OS — BEYU REGISTRY: unified governed registration orchestration.
 *
 * ONE orchestration layer over the EXISTING canonical models — never a second
 * OS, a second identity store or a second authorization/audit engine. Every
 * function here:
 *
 *   1. re-authorizes through the same canonical `can()` primitive the API
 *      route already enforced (`requireCapability` — defence in depth);
 *   2. re-validates tenant/entity/country scope (`requireActionScope`);
 *   3. validates input and duplicate/conflict preconditions — identities are
 *      NEVER silently merged or duplicated; conflicts surface as controlled
 *      governed refusals with the existing record identified;
 *   4. executes the mutation, its audit record and its enterprise event in ONE
 *      transaction through `withAuditTransaction` (hash-chained audit);
 *   5. refuses fail-closed on any precondition it cannot prove.
 *
 * PERSON ≠ USER ≠ EMPLOYEE ≠ FAMILY MEMBER: registering a person Party never
 * creates a login identity; employment is an employees row over an existing
 * Party; family membership is a relationship row — never authorization.
 */
import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  countries,
  employees,
  families,
  familyMembers,
  jurisdictions,
  legalEntities,
  orgUnits,
  ownershipRecords,
  parties,
  positions,
  tenants,
  users,
} from "@/db/schema";
import { can, filterByClearance, type Principal } from "@/lib/authz";
import { withAuditTransaction } from "@/lib/audit";
import { newId, ID_PREFIX } from "@/lib/ids";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { createEmployment } from "@/lib/hcm";
import {
  DESCENT_RELATIONSHIPS,
  isAffinalRelationship,
  type LineageRelationship,
} from "@/lib/family/model";
import {
  AdminGovernanceError,
  adminAudit,
  adminEvent,
  auditRefusal,
  requireActionScope,
  requireCapability,
} from "./governance-service";

const today = (): string => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/* PERSON PARTY REGISTRATION (no User creation)                       */
/* ------------------------------------------------------------------ */

export type RegisterPartyInput = {
  displayName: string;
  givenName?: string | null;
  familyName?: string | null;
  email?: string | null;
  phone?: string | null;
  countryCode?: string | null;
  birthDate?: string | null;
  nationality?: string | null;
  /** The scope tenant the registrar acts within (parties themselves are tenantless MDM records). */
  primaryTenantId: string;
  reason: string;
};

/**
 * Register a canonical PERSON Party. This is the Party half of the identity
 * master: it creates NO users row, NO password, NO session, NO role. A
 * duplicate email or an identical (displayName, birthDate) candidate produces
 * a controlled DUPLICATE refusal naming the existing Party — never a silent
 * second identity and never an automatic merge.
 */
export async function registerParty(
  actor: Principal,
  input: RegisterPartyInput,
  traceId: string,
): Promise<{ partyId: string; status: string; userCreated: boolean }> {
  requireCapability(actor, "identity:party.register", "registry.party.register");
  await requireActionScope(actor, "identity:party.register", {
    tenantId: input.primaryTenantId,
    countryCode: input.countryCode ?? null,
  });

  const email = input.email?.trim().toLowerCase() || null;

  if (email) {
    const [partyByEmail] = await db
      .select({ id: parties.id, displayName: parties.displayName })
      .from(parties)
      .where(sql`lower(${parties.email}) = ${email}`)
      .limit(1);
    if (partyByEmail) {
      await auditRefusal(actor, "PARTY_REGISTERED", "PARTY", email, "DUPLICATE_PARTY_EMAIL", traceId);
      throw new AdminGovernanceError(
        "DUPLICATE_PARTY",
        `A canonical person Party already exists for ${email} (party ${partyByEmail.id}, "${partyByEmail.displayName}"). Resolve the conflict through the governed registry — identities are never silently merged or duplicated.`,
        409,
        { conflictType: "DUPLICATE_EMAIL", existingPartyId: partyByEmail.id },
      );
    }
    const [userByEmail] = await db
      .select({ id: users.id, partyId: users.partyId })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    if (userByEmail) {
      await auditRefusal(actor, "PARTY_REGISTERED", "PARTY", email, "DUPLICATE_PARTY_EMAIL", traceId);
      throw new AdminGovernanceError(
        "DUPLICATE_PARTY",
        `A governed user identity already exists for ${email} (user ${userByEmail.id}, party ${userByEmail.partyId}). Resolve the conflict through the governed registry — identities are never silently merged or duplicated.`,
        409,
        { conflictType: "DUPLICATE_EMAIL", existingPartyId: userByEmail.partyId, existingUserId: userByEmail.id },
      );
    }
  }

  if (input.birthDate) {
    const candidates = await db
      .select({ id: parties.id, displayName: parties.displayName, email: parties.email })
      .from(parties)
      .where(
        and(
          sql`lower(${parties.displayName}) = lower(${input.displayName})`,
          eq(parties.birthDate, input.birthDate),
          eq(parties.type, "PERSON"),
        ),
      )
      .limit(5);
    if (candidates.length > 0) {
      const ids = candidates.map((c) => c.id).join(", ");
      await auditRefusal(actor, "PARTY_REGISTERED", "PARTY", input.displayName, "DUPLICATE_PARTY_CANDIDATE", traceId);
      throw new AdminGovernanceError(
        "DUPLICATE_PARTY",
        `A person with the same name and birth date already exists (parties: ${ids}). Resolve the conflict through the governed registry — identities are never silently merged or duplicated.`,
        409,
        { conflictType: "DUPLICATE_NAME_BIRTHDATE", candidates },
      );
    }
  }

  if (input.countryCode) {
    const [country] = await db
      .select({ code: countries.code })
      .from(countries)
      .where(eq(countries.code, input.countryCode))
      .limit(1);
    if (!country) {
      throw new AdminGovernanceError(
        "COUNTRY_NOT_FOUND",
        `Country ${input.countryCode} is not in the canonical country registry.`,
        404,
      );
    }
  }

  const partyId = newId(ID_PREFIX.party);
  await withAuditTransaction(
    async (tx) => {
      await tx.insert(parties).values({
        id: partyId,
        type: "PERSON",
        displayName: input.displayName,
        givenName: input.givenName ?? null,
        familyName: input.familyName ?? null,
        birthDate: input.birthDate ?? null,
        nationality: input.nationality ?? null,
        countryCode: input.countryCode ?? null,
        email,
        phone: input.phone ?? null,
        // Person party ≠ verified identity: KYC stays UNVERIFIED until a
        // governed verification act records proof.
        kycStatus: "UNVERIFIED",
        classification: "CONFIDENTIAL",
        status: "ACTIVE",
      });
      return { partyId };
    },
    () =>
      adminAudit(
        actor,
        "PARTY_REGISTERED",
        "PARTY",
        partyId,
        input.reason,
        null,
        {
          partyId,
          displayName: input.displayName,
          email,
          countryCode: input.countryCode ?? null,
          userCreated: false,
        },
        "identity:party.register",
        traceId,
      ),
    () =>
      adminEvent(
        actor,
        "PARTY_REGISTERED",
        "PARTY",
        partyId,
        { displayName: input.displayName, email, userCreated: false },
        "identity:party.register",
        traceId,
      ),
  );

  return { partyId, status: "ACTIVE", userCreated: false };
}

/* ------------------------------------------------------------------ */
/* FAMILY REGISTRATION                                                 */
/* ------------------------------------------------------------------ */

export type RegisterFamilyInput = {
  tenantId: string;
  code: string;
  displayName: string;
  legalName?: string | null;
  countryCode?: string | null;
  jurisdictionId?: string | null;
  reason: string;
};

/**
 * Register the canonical Family entity: ONE governed transaction creates the
 * family's canonical MDM identity (parties row, type ORGANIZATION — enabling
 * family → company ownership through the existing ownership_records model) and
 * the families domain row. Code is unique per tenant; a duplicate is a
 * controlled refusal.
 */
export async function registerFamily(
  actor: Principal,
  input: RegisterFamilyInput,
  traceId: string,
): Promise<{ familyId: string; partyId: string; code: string; status: string }> {
  requireCapability(actor, "family:member.manage", "registry.family.register", {
    classification: "HIGHLY_RESTRICTED",
  });
  await requireActionScope(actor, "family:member.manage", {
    tenantId: input.tenantId,
    countryCode: input.countryCode ?? null,
  });

  const code = input.code.trim().toUpperCase();

  const [tenant] = await db
    .select({ id: tenants.id, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, input.tenantId))
    .limit(1);
  if (!tenant) {
    throw new AdminGovernanceError("TENANT_NOT_FOUND", `Tenant ${input.tenantId} was not found.`, 404);
  }
  if (tenant.status !== "ACTIVE") {
    throw new AdminGovernanceError(
      "TENANT_NOT_OPERATIONAL",
      `Tenant ${input.tenantId} is ${tenant.status}; families may only be registered under ACTIVE tenants.`,
      409,
    );
  }

  const [existingFamily] = await db
    .select({ id: families.id })
    .from(families)
    .where(and(eq(families.tenantId, input.tenantId), eq(families.code, code)))
    .limit(1);
  if (existingFamily) {
    await auditRefusal(actor, "FAMILY_REGISTERED", "FAMILY", code, "FAMILY_CODE_EXISTS", traceId);
    throw new AdminGovernanceError(
      "FAMILY_CODE_EXISTS",
      `Family code ${code} already exists in this tenant (family ${existingFamily.id}).`,
      409,
      { conflictType: "FAMILY_CODE_EXISTS", existingFamilyId: existingFamily.id },
    );
  }

  if (input.countryCode) {
    const [country] = await db
      .select({ code: countries.code })
      .from(countries)
      .where(eq(countries.code, input.countryCode))
      .limit(1);
    if (!country) {
      throw new AdminGovernanceError(
        "COUNTRY_NOT_FOUND",
        `Country ${input.countryCode} is not in the canonical country registry.`,
        404,
      );
    }
  }

  if (input.jurisdictionId) {
    if (!input.countryCode) {
      throw new AdminGovernanceError(
        "JURISDICTION_REQUIRES_COUNTRY",
        "A jurisdiction may only be recorded together with the family's country.",
        422,
      );
    }
    const [jurisdiction] = await db
      .select({ id: jurisdictions.id, countryCode: jurisdictions.countryCode })
      .from(jurisdictions)
      .where(eq(jurisdictions.id, input.jurisdictionId))
      .limit(1);
    if (!jurisdiction) {
      throw new AdminGovernanceError(
        "JURISDICTION_NOT_FOUND",
        `Jurisdiction ${input.jurisdictionId} is not in the canonical jurisdiction registry.`,
        404,
      );
    }
    if (jurisdiction.countryCode !== input.countryCode) {
      throw new AdminGovernanceError(
        "JURISDICTION_COUNTRY_MISMATCH",
        `Jurisdiction ${input.jurisdictionId} belongs to ${jurisdiction.countryCode}, not ${input.countryCode}.`,
        422,
      );
    }
  }

  const partyId = newId(ID_PREFIX.party);
  const familyId = newId(ID_PREFIX.family);

  await withAuditTransaction(
    async (tx) => {
      await tx.insert(parties).values({
        id: partyId,
        type: "ORGANIZATION",
        displayName: input.displayName,
        legalName: input.legalName ?? null,
        countryCode: input.countryCode ?? null,
        classification: "CONFIDENTIAL",
        status: "ACTIVE",
      });
      await tx.insert(families).values({
        id: familyId,
        tenantId: input.tenantId,
        partyId,
        code,
        displayName: input.displayName,
        legalName: input.legalName ?? null,
        countryCode: input.countryCode ?? null,
        jurisdictionId: input.jurisdictionId ?? null,
        status: "ACTIVE",
        classification: "HIGHLY_RESTRICTED",
      });
      return { familyId, partyId };
    },
    () =>
      adminAudit(
        actor,
        "FAMILY_REGISTERED",
        "FAMILY",
        familyId,
        input.reason,
        null,
        {
          familyId,
          partyId,
          code,
          displayName: input.displayName,
          tenantId: input.tenantId,
          countryCode: input.countryCode ?? null,
          status: "ACTIVE",
        },
        "family:member.manage",
        traceId,
      ),
    () =>
      adminEvent(
        actor,
        "FAMILY_REGISTERED",
        "FAMILY",
        familyId,
        { code, displayName: input.displayName, partyId },
        "family:member.manage",
        traceId,
        // The family domain is HIGHLY_RESTRICTED — the event envelope carries
        // the same classification as the domain row it announces.
        "HIGHLY_RESTRICTED",
      ),
  );

  return { familyId, partyId, code, status: "ACTIVE" };
}

/* ------------------------------------------------------------------ */
/* FAMILY MEMBERSHIP REGISTRATION (relationship — never a User)        */
/* ------------------------------------------------------------------ */

export type RegisterFamilyMemberInput = {
  familyId: string;
  partyId: string;
  relationshipType: LineageRelationship;
  parentMemberId?: string | null;
  linkedToMemberId?: string | null;
  branch?: string | null;
  directDescendant?: boolean | null;
  provenance: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  reason: string;
};

/**
 * Register a family membership — a governed relationship row over an existing
 * Party. Rules (fail-closed):
 *   * descent requires a parent member of the same family, except the founder
 *     of an empty family (parent NULL, generation 1); the branch is inherited;
 *   * affinal relationships require linkedToMemberId (same family) and forbid
 *     parentMemberId — marriage never creates descent;
 *   * NON_FAMILY carries neither link;
 *   * a Party may belong to at most one membership row (one person, one
 *     canonical membership);
 *   * directDescendant is a VERIFIED claim — registration records UNVERIFIED.
 */
export async function registerFamilyMember(
  actor: Principal,
  input: RegisterFamilyMemberInput,
  traceId: string,
): Promise<{
  memberId: string;
  partyId: string;
  familyId: string;
  relationship: LineageRelationship;
  generation: number;
  branch: string;
  membershipStatus: string;
}> {
  requireCapability(actor, "family:member.manage", "registry.family.member.add", {
    classification: "HIGHLY_RESTRICTED",
  });

  const [family] = await db
    .select({
      id: families.id,
      tenantId: families.tenantId,
      code: families.code,
      status: families.status,
      countryCode: families.countryCode,
    })
    .from(families)
    .where(eq(families.id, input.familyId))
    .limit(1);
  if (!family) {
    throw new AdminGovernanceError(
      "FAMILY_NOT_FOUND",
      `Family ${input.familyId} was not found in the canonical registry.`,
      404,
    );
  }

  await requireActionScope(actor, "family:member.manage", {
    tenantId: family.tenantId,
    countryCode: family.countryCode,
  });

  if (family.status !== "ACTIVE") {
    throw new AdminGovernanceError(
      "FAMILY_NOT_OPERATIONAL",
      `Family ${family.id} is ${family.status}; members may only be registered under ACTIVE families.`,
      409,
    );
  }

  const [party] = await db
    .select({ id: parties.id, displayName: parties.displayName })
    .from(parties)
    .where(eq(parties.id, input.partyId))
    .limit(1);
  if (!party) {
    throw new AdminGovernanceError("PARTY_NOT_FOUND", `Party ${input.partyId} was not found.`, 404);
  }

  const [existingMembership] = await db
    .select({ id: familyMembers.id, familyId: familyMembers.familyId })
    .from(familyMembers)
    .where(eq(familyMembers.partyId, input.partyId))
    .limit(1);
  if (existingMembership) {
    await auditRefusal(
      actor,
      "FAMILY_MEMBER_ADDED",
      "FAMILY_MEMBER",
      input.partyId,
      "PARTY_ALREADY_MEMBER",
      traceId,
    );
    throw new AdminGovernanceError(
      "ALREADY_FAMILY_MEMBER",
      `Party ${input.partyId} is already a family member (membership ${existingMembership.id}, family ${existingMembership.familyId}). One person, one canonical membership — resolve the conflict through the governed registry.`,
      409,
      {
        conflictType: "PERSON_ALREADY_IN_FAMILY",
        existingMembershipId: existingMembership.id,
        existingFamilyId: existingMembership.familyId,
      },
    );
  }

  const relationship = input.relationshipType;
  const descent = DESCENT_RELATIONSHIPS.includes(relationship);
  const affinal = isAffinalRelationship(relationship);

  const [{ n: memberCount }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(familyMembers)
    .where(eq(familyMembers.familyId, family.id));
  const emptyFamily = Number(memberCount ?? 0) === 0;

  let parent: {
    id: string;
    branch: string;
    generation: number;
    familyId: string | null;
    relationshipToParent: string;
  } | null = null;
  if (input.parentMemberId) {
    const [row] = await db
      .select({
        id: familyMembers.id,
        branch: familyMembers.branch,
        generation: familyMembers.generation,
        familyId: familyMembers.familyId,
        relationshipToParent: familyMembers.relationshipToParent,
      })
      .from(familyMembers)
      .where(eq(familyMembers.id, input.parentMemberId))
      .limit(1);
    if (!row || row.familyId !== family.id) {
      throw new AdminGovernanceError(
        "PARENT_NOT_IN_FAMILY",
        `Parent member ${input.parentMemberId} is not a member of family ${family.id}.`,
        422,
      );
    }
    parent = row;
  }

  let linked: { id: string; relationshipToParent: string } | null = null;
  if (input.linkedToMemberId) {
    const [row] = await db
      .select({
        id: familyMembers.id,
        relationshipToParent: familyMembers.relationshipToParent,
        familyId: familyMembers.familyId,
      })
      .from(familyMembers)
      .where(eq(familyMembers.id, input.linkedToMemberId))
      .limit(1);
    if (!row) {
      throw new AdminGovernanceError(
        "LINK_NOT_FOUND",
        `Linked member ${input.linkedToMemberId} was not found.`,
        404,
      );
    }
    if (row.familyId !== family.id) {
      throw new AdminGovernanceError(
        "LINK_NOT_IN_FAMILY",
        `Linked member ${input.linkedToMemberId} is not a member of family ${family.id}.`,
        422,
      );
    }
    linked = row;
  }

  if (affinal) {
    if (parent) {
      throw new AdminGovernanceError(
        "AFFINAL_PARENT_FORBIDDEN",
        `Relationship ${relationship} is affinity, not descent: it attaches through linkedToMemberId, never through a descent parent.`,
        422,
      );
    }
    if (!linked) {
      throw new AdminGovernanceError(
        "AFFINAL_LINK_REQUIRED",
        `Relationship ${relationship} requires linkedToMemberId — an existing member of the same family.`,
        422,
      );
    }
    if (isAffinalRelationship(linked.relationshipToParent as LineageRelationship)) {
      throw new AdminGovernanceError(
        "LINK_TARGET_AFFINAL",
        "An affinal member must attach to a lineage member, not to another affinal member.",
        422,
      );
    }
  } else if (relationship !== "NON_FAMILY") {
    // descent
    if (linked) {
      throw new AdminGovernanceError(
        "DESCENT_LINK_FORBIDDEN",
        `Relationship ${relationship} is descent: linkedToMemberId must be null (parent descent only).`,
        422,
      );
    }
    if (emptyFamily) {
      if (parent) {
        throw new AdminGovernanceError(
          "PARENT_NOT_IN_FAMILY",
          `Family ${family.id} has no members yet; the founder cannot have a parent.`,
          422,
        );
      }
    } else if (!parent) {
      throw new AdminGovernanceError(
        "DESCENT_PARENT_REQUIRED",
        `Relationship ${relationship} requires parentMemberId — descent is never inferred from presence alone.`,
        422,
      );
    }
  } else {
    // NON_FAMILY
    if (parent || linked) {
      throw new AdminGovernanceError(
        "NON_FAMILY_LINKS_FORBIDDEN",
        "NON_FAMILY memberships carry neither a descent parent nor an affinal link.",
        422,
      );
    }
  }

  if (input.directDescendant === true) {
    throw new AdminGovernanceError(
      "DIRECT_DESCENDANT_REQUIRES_VERIFICATION",
      "directDescendant is a verified lineage claim: register the member UNVERIFIED first; the governed verification flow governs the flag.",
      422,
    );
  }

  const effectiveFrom = input.effectiveFrom ?? today();
  if (input.effectiveTo && input.effectiveTo < effectiveFrom) {
    throw new AdminGovernanceError(
      "EFFECTIVE_DATE_ORDER",
      "effectiveTo must not precede effectiveFrom.",
      422,
    );
  }

  const branch = parent ? parent.branch : input.branch?.trim() || "FOUNDER";
  const generation = parent ? parent.generation + 1 : 1;
  const membershipStatus = effectiveFrom > today() ? "PENDING" : "ACTIVE";
  const memberId = newId(ID_PREFIX.familyMember);

  await withAuditTransaction(
    async (tx) => {
      await tx.insert(familyMembers).values({
        id: memberId,
        tenantId: family.tenantId,
        partyId: input.partyId,
        familyId: family.id,
        familyLine: family.code,
        branch,
        generation,
        parentMemberId: parent?.id ?? null,
        relationshipToParent: relationship,
        linkedToMemberId: affinal ? linked?.id ?? null : null,
        directDescendant: false,
        membershipStatus,
        effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        provenance: input.provenance,
        createdBy: actor.userId,
        classification: "HIGHLY_RESTRICTED",
      });
      return { memberId };
    },
    () =>
      adminAudit(
        actor,
        "FAMILY_MEMBER_ADDED",
        "FAMILY_MEMBER",
        memberId,
        input.reason,
        null,
        {
          memberId,
          familyId: family.id,
          partyId: input.partyId,
          relationship,
          branch,
          generation,
          membershipStatus,
          provenance: input.provenance,
        },
        "family:member.manage",
        traceId,
      ),
    () =>
      adminEvent(
        actor,
        "FAMILY_MEMBER_ADDED",
        "FAMILY_MEMBER",
        memberId,
        {
          familyId: family.id,
          partyId: input.partyId,
          relationship,
          familyCode: family.code,
        },
        "family:member.manage",
        traceId,
        "HIGHLY_RESTRICTED",
      ),
  );

  return {
    memberId,
    partyId: input.partyId,
    familyId: family.id,
    relationship,
    generation,
    branch,
    membershipStatus,
  };
}

/* ------------------------------------------------------------------ */
/* LEGAL ENTITY REGISTRATION                                           */
/* ------------------------------------------------------------------ */

export type RegisterLegalEntityInput = {
  tenantId: string;
  code: string;
  legalName: string;
  entityType:
    | "TRUST"
    | "FOUNDATION"
    | "HOLDING"
    | "COUNTRY_HOLDING"
    | "OPERATING_COMPANY"
    | "SUBSIDIARY"
    | "ASSOCIATE"
    | "JOINT_VENTURE"
    | "PARTNERSHIP"
    | "BRANCH"
    | "NON_PROFIT";
  tradingName?: string | null;
  parentEntityId?: string | null;
  countryCode: string;
  jurisdictionId?: string | null;
  registrationNumber?: string | null;
  taxIdentifier?: string | null;
  incorporationDate?: string | null;
  functionalCurrency?: string | null;
  accountingStandard?: string | null;
  sectorCode?: string | null;
  effectiveFrom?: string | null;
  reason: string;
};

/** Register a canonical legal entity — TENANT ≠ LEGAL ENTITY ≠ BUSINESS. */
export async function registerLegalEntity(
  actor: Principal,
  input: RegisterLegalEntityInput,
  traceId: string,
): Promise<{ legalEntityId: string; code: string; status: string }> {
  requireCapability(actor, "organization:entity.manage", "registry.entity.register", {
    classification: "CONFIDENTIAL",
    entityId: input.parentEntityId ?? undefined,
  });
  await requireActionScope(actor, "organization:entity.manage", {
    tenantId: input.tenantId,
    legalEntityId: input.parentEntityId ?? null,
    countryCode: input.countryCode,
  });

  if (actor.entityScope.length > 0 && !input.parentEntityId) {
    throw new AdminGovernanceError(
      "ENTITY_SCOPE_PARENT_REQUIRED",
      "A principal with an entity-scoped authority may only register entities under an in-scope parent entity.",
      403,
    );
  }

  const code = input.code.trim().toUpperCase();

  const [tenant] = await db
    .select({ id: tenants.id, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, input.tenantId))
    .limit(1);
  if (!tenant) {
    throw new AdminGovernanceError("TENANT_NOT_FOUND", `Tenant ${input.tenantId} was not found.`, 404);
  }
  if (tenant.status !== "ACTIVE") {
    throw new AdminGovernanceError(
      "TENANT_NOT_OPERATIONAL",
      `Tenant ${input.tenantId} is ${tenant.status}; entities may only be registered under ACTIVE tenants.`,
      409,
    );
  }

  const [existingCode] = await db
    .select({ id: legalEntities.id })
    .from(legalEntities)
    .where(eq(legalEntities.code, code))
    .limit(1);
  if (existingCode) {
    await auditRefusal(actor, "LEGAL_ENTITY_REGISTERED", "LEGAL_ENTITY", code, "ENTITY_CODE_EXISTS", traceId);
    throw new AdminGovernanceError(
      "ENTITY_CODE_EXISTS",
      `Legal entity code ${code} already exists (entity ${existingCode.id}).`,
      409,
      { conflictType: "ENTITY_CODE_EXISTS", existingEntityId: existingCode.id },
    );
  }

  if (input.registrationNumber) {
    const [existingReg] = await db
      .select({ id: legalEntities.id })
      .from(legalEntities)
      .where(
        and(
          eq(legalEntities.tenantId, input.tenantId),
          eq(legalEntities.registrationNumber, input.registrationNumber),
        ),
      )
      .limit(1);
    if (existingReg) {
      await auditRefusal(
        actor,
        "LEGAL_ENTITY_REGISTERED",
        "LEGAL_ENTITY",
        input.registrationNumber,
        "REGISTRATION_NUMBER_EXISTS",
        traceId,
      );
      throw new AdminGovernanceError(
        "REGISTRATION_NUMBER_EXISTS",
        `Registration number ${input.registrationNumber} is already registered in this tenant (entity ${existingReg.id}).`,
        409,
        { conflictType: "REGISTRATION_NUMBER_EXISTS", existingEntityId: existingReg.id },
      );
    }
  }

  const [country] = await db
    .select({ code: countries.code })
    .from(countries)
    .where(eq(countries.code, input.countryCode))
    .limit(1);
  if (!country) {
    throw new AdminGovernanceError(
      "COUNTRY_NOT_FOUND",
      `Country ${input.countryCode} is not in the canonical country registry.`,
      404,
    );
  }

  if (input.jurisdictionId) {
    const [jurisdiction] = await db
      .select({ id: jurisdictions.id, countryCode: jurisdictions.countryCode })
      .from(jurisdictions)
      .where(eq(jurisdictions.id, input.jurisdictionId))
      .limit(1);
    if (!jurisdiction) {
      throw new AdminGovernanceError(
        "JURISDICTION_NOT_FOUND",
        `Jurisdiction ${input.jurisdictionId} is not in the canonical jurisdiction registry.`,
        404,
      );
    }
    if (jurisdiction.countryCode !== input.countryCode) {
      throw new AdminGovernanceError(
        "JURISDICTION_COUNTRY_MISMATCH",
        `Jurisdiction ${input.jurisdictionId} belongs to ${jurisdiction.countryCode}, not ${input.countryCode}.`,
        422,
      );
    }
  }

  if (input.parentEntityId) {
    const [parent] = await db
      .select({ id: legalEntities.id, tenantId: legalEntities.tenantId, status: legalEntities.status })
      .from(legalEntities)
      .where(eq(legalEntities.id, input.parentEntityId))
      .limit(1);
    if (!parent) {
      throw new AdminGovernanceError(
        "PARENT_ENTITY_NOT_FOUND",
        `Parent entity ${input.parentEntityId} was not found.`,
        404,
      );
    }
    if (parent.tenantId !== input.tenantId) {
      throw new AdminGovernanceError(
        "PARENT_ENTITY_WRONG_TENANT",
        `Parent entity ${parent.id} belongs to another tenant.`,
        409,
      );
    }
    if (parent.status === "ARCHIVED") {
      throw new AdminGovernanceError(
        "PARENT_NOT_OPERATIONAL",
        `Parent entity ${parent.id} is ARCHIVED.`,
        409,
      );
    }
  }

  const legalEntityId = newId(ID_PREFIX.legalEntity);
  await withAuditTransaction(
    async (tx) => {
      await tx.insert(legalEntities).values({
        id: legalEntityId,
        tenantId: input.tenantId,
        code,
        legalName: input.legalName,
        tradingName: input.tradingName ?? null,
        entityType: input.entityType,
        parentEntityId: input.parentEntityId ?? null,
        countryCode: input.countryCode,
        jurisdictionId: input.jurisdictionId ?? null,
        registrationNumber: input.registrationNumber ?? null,
        taxIdentifier: input.taxIdentifier ?? null,
        incorporationDate: input.incorporationDate ?? null,
        functionalCurrency: input.functionalCurrency ?? "USD",
        accountingStandard: input.accountingStandard ?? "IFRS",
        sectorCode: input.sectorCode ?? null,
        status: "ACTIVE",
        classification: "CONFIDENTIAL",
        effectiveFrom: input.effectiveFrom ?? today(),
      });
      return { legalEntityId };
    },
    () =>
      adminAudit(
        actor,
        "LEGAL_ENTITY_REGISTERED",
        "LEGAL_ENTITY",
        legalEntityId,
        input.reason,
        null,
        {
          legalEntityId,
          code,
          legalName: input.legalName,
          entityType: input.entityType,
          tenantId: input.tenantId,
          countryCode: input.countryCode,
          parentEntityId: input.parentEntityId ?? null,
          status: "ACTIVE",
        },
        "organization:entity.manage",
        traceId,
      ),
    () =>
      adminEvent(
        actor,
        // Declared catalogue event (docs/events/README.md: ENTITY_CREATED).
        "ENTITY_CREATED",
        "LEGAL_ENTITY",
        legalEntityId,
        { entityCode: code, countryCode: input.countryCode, legalName: input.legalName, entityType: input.entityType },
        "organization:entity.manage",
        traceId,
      ),
  );

  return { legalEntityId, code, status: "ACTIVE" };
}

/* ------------------------------------------------------------------ */
/* BUSINESS / OPERATING UNIT REGISTRATION                              */
/* ------------------------------------------------------------------ */

export type RegisterBusinessInput = {
  tenantId: string;
  legalEntityId: string;
  code: string;
  name: string;
  unitType: "DIVISION" | "DEPARTMENT" | "BRANCH" | "TEAM";
  parentUnitId?: string | null;
  costCentre?: string | null;
  reason: string;
};

/**
 * Register a business / operating unit (org unit) under an existing in-scope
 * legal entity. An org unit is neither a legal entity nor a tenant — the
 * canonical model keeps TENANT ≠ LEGAL ENTITY ≠ BUSINESS.
 */
export async function registerOrgUnit(
  actor: Principal,
  input: RegisterBusinessInput,
  traceId: string,
): Promise<{ orgUnitId: string; code: string; unitType: string; status: string }> {
  requireCapability(actor, "organization:business.register", "registry.business.register", {
    entityId: input.legalEntityId,
  });
  await requireActionScope(actor, "organization:business.register", {
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId,
  });

  if (actor.entityScope.length > 0 && !actor.entityScope.includes(input.legalEntityId)) {
    throw new AdminGovernanceError(
      "ENTITY_OUT_OF_SCOPE",
      `Legal entity ${input.legalEntityId} is outside the principal's data scope.`,
      403,
    );
  }

  const code = input.code.trim().toUpperCase();

  const [entity] = await db
    .select({ id: legalEntities.id, tenantId: legalEntities.tenantId, status: legalEntities.status })
    .from(legalEntities)
    .where(eq(legalEntities.id, input.legalEntityId))
    .limit(1);
  if (!entity) {
    throw new AdminGovernanceError(
      "ENTITY_NOT_FOUND",
      `Legal entity ${input.legalEntityId} was not found.`,
      404,
    );
  }
  if (entity.tenantId !== input.tenantId) {
    throw new AdminGovernanceError(
      "ENTITY_WRONG_TENANT",
      `Legal entity ${entity.id} belongs to another tenant.`,
      409,
    );
  }
  if (entity.status !== "ACTIVE") {
    throw new AdminGovernanceError(
      "ENTITY_NOT_OPERATIONAL",
      `Legal entity ${entity.id} is ${entity.status}; business units may only be registered under ACTIVE entities.`,
      409,
    );
  }

  const [existingCode] = await db
    .select({ id: orgUnits.id })
    .from(orgUnits)
    .where(eq(orgUnits.code, code))
    .limit(1);
  if (existingCode) {
    await auditRefusal(actor, "BUSINESS_REGISTERED", "ORG_UNIT", code, "BUSINESS_CODE_EXISTS", traceId);
    throw new AdminGovernanceError(
      "BUSINESS_CODE_EXISTS",
      `Business unit code ${code} already exists (unit ${existingCode.id}).`,
      409,
      { conflictType: "BUSINESS_CODE_EXISTS", existingUnitId: existingCode.id },
    );
  }

  if (input.parentUnitId) {
    const [parentUnit] = await db
      .select({
        id: orgUnits.id,
        tenantId: orgUnits.tenantId,
        legalEntityId: orgUnits.legalEntityId,
      })
      .from(orgUnits)
      .where(eq(orgUnits.id, input.parentUnitId))
      .limit(1);
    if (!parentUnit) {
      throw new AdminGovernanceError(
        "PARENT_UNIT_NOT_FOUND",
        `Parent unit ${input.parentUnitId} was not found.`,
        404,
      );
    }
    if (parentUnit.tenantId !== input.tenantId || parentUnit.legalEntityId !== input.legalEntityId) {
      throw new AdminGovernanceError(
        "PARENT_UNIT_SCOPE_MISMATCH",
        `Parent unit ${parentUnit.id} must share the same tenant and legal entity.`,
        422,
      );
    }
  }

  const orgUnitId = newId(ID_PREFIX.orgUnit);
  await withAuditTransaction(
    async (tx) => {
      await tx.insert(orgUnits).values({
        id: orgUnitId,
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        code,
        name: input.name,
        unitType: input.unitType,
        parentUnitId: input.parentUnitId ?? null,
        costCentre: input.costCentre ?? null,
        status: "ACTIVE",
      });
      return { orgUnitId };
    },
    () =>
      adminAudit(
        actor,
        "BUSINESS_REGISTERED",
        "ORG_UNIT",
        orgUnitId,
        input.reason,
        null,
        {
          orgUnitId,
          code,
          name: input.name,
          unitType: input.unitType,
          tenantId: input.tenantId,
          legalEntityId: input.legalEntityId,
          status: "ACTIVE",
        },
        "organization:business.register",
        traceId,
      ),
    () =>
      adminEvent(
        actor,
        "BUSINESS_REGISTERED",
        "ORG_UNIT",
        orgUnitId,
        { code, name: input.name, unitType: input.unitType },
        "organization:business.register",
        traceId,
      ),
  );

  return { orgUnitId, code, unitType: input.unitType, status: "ACTIVE" };
}

/* ------------------------------------------------------------------ */
/* OWNERSHIP REGISTRATION (effective-dated; never silently overwritten) */
/* ------------------------------------------------------------------ */

export type RegisterOwnershipInput = {
  tenantId: string;
  ownedEntityId: string;
  ownerPartyId?: string | null;
  ownerEntityId?: string | null;
  ownershipType: "DIRECT" | "INDIRECT" | "BENEFICIAL" | "CONTROL_ONLY";
  instrument?: string | null;
  economicPct: number;
  votingPct: number;
  controlRights?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  provenance: string;
  supportingDocumentId?: string | null;
  reason: string;
};

/** Record an ownership right — OWNERSHIP ≠ MEMBERSHIP ≠ ROLE ≠ PERMISSION. */
export async function registerOwnership(
  actor: Principal,
  input: RegisterOwnershipInput,
  traceId: string,
): Promise<{ ownershipId: string; ownedEntityId: string; ownershipType: string; effectiveFrom: string }> {
  requireCapability(actor, "organization:ownership.manage", "registry.ownership.record", {
    entityId: input.ownedEntityId,
  });
  await requireActionScope(actor, "organization:ownership.manage", {
    tenantId: input.tenantId,
    legalEntityId: input.ownedEntityId,
  });

  if ((!input.ownerPartyId && !input.ownerEntityId) || (input.ownerPartyId && input.ownerEntityId)) {
    throw new AdminGovernanceError(
      "OWNERSHIP_OWNER_REQUIRED",
      "Exactly one owner (ownerPartyId or ownerEntityId) must be provided.",
      422,
    );
  }
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
    throw new AdminGovernanceError(
      "EFFECTIVE_DATE_ORDER",
      "effectiveTo must not precede effectiveFrom.",
      422,
    );
  }

  const [owned] = await db
    .select({ id: legalEntities.id, tenantId: legalEntities.tenantId })
    .from(legalEntities)
    .where(eq(legalEntities.id, input.ownedEntityId))
    .limit(1);
  if (!owned) {
    throw new AdminGovernanceError(
      "OWNED_ENTITY_NOT_FOUND",
      `Owned entity ${input.ownedEntityId} was not found.`,
      404,
    );
  }
  if (owned.tenantId !== input.tenantId) {
    throw new AdminGovernanceError(
      "OWNED_ENTITY_WRONG_TENANT",
      `Owned entity ${owned.id} belongs to another tenant.`,
      409,
    );
  }

  if (input.ownerEntityId) {
    if (input.ownerEntityId === input.ownedEntityId) {
      throw new AdminGovernanceError(
        "SELF_OWNERSHIP_FORBIDDEN",
        "An entity cannot own itself.",
        422,
      );
    }
    const [ownerEntity] = await db
      .select({ id: legalEntities.id, tenantId: legalEntities.tenantId })
      .from(legalEntities)
      .where(eq(legalEntities.id, input.ownerEntityId))
      .limit(1);
    if (!ownerEntity) {
      throw new AdminGovernanceError(
        "OWNER_ENTITY_NOT_FOUND",
        `Owner entity ${input.ownerEntityId} was not found.`,
        404,
      );
    }
    if (ownerEntity.tenantId !== input.tenantId) {
      throw new AdminGovernanceError(
        "OWNER_ENTITY_WRONG_TENANT",
        `Owner entity ${ownerEntity.id} belongs to another tenant.`,
        409,
      );
    }
  } else if (input.ownerPartyId) {
    const [ownerParty] = await db
      .select({ id: parties.id })
      .from(parties)
      .where(eq(parties.id, input.ownerPartyId))
      .limit(1);
    if (!ownerParty) {
      throw new AdminGovernanceError(
        "OWNER_PARTY_NOT_FOUND",
        `Owner party ${input.ownerPartyId} was not found.`,
        404,
      );
    }
  }

  const newEnd = input.effectiveTo ?? "9999-12-31";
  const ownerFilter = input.ownerPartyId
    ? eq(ownershipRecords.ownerPartyId, input.ownerPartyId)
    : eq(ownershipRecords.ownerEntityId, input.ownerEntityId!);

  const [overlap] = await db
    .select({ id: ownershipRecords.id, effectiveFrom: ownershipRecords.effectiveFrom })
    .from(ownershipRecords)
    .where(
      and(
        eq(ownershipRecords.tenantId, input.tenantId),
        eq(ownershipRecords.ownedEntityId, input.ownedEntityId),
        eq(ownershipRecords.ownershipType, input.ownershipType),
        ownerFilter,
        lte(ownershipRecords.effectiveFrom, newEnd),
        or(isNull(ownershipRecords.effectiveTo), gte(ownershipRecords.effectiveTo, input.effectiveFrom)),
      ),
    )
    .limit(1);
  if (overlap) {
    await auditRefusal(
      actor,
      "OWNERSHIP_CREATED",
      "OWNERSHIP",
      input.ownedEntityId,
      "OWNERSHIP_EXISTS",
      traceId,
    );
    throw new AdminGovernanceError(
      "OWNERSHIP_EXISTS",
      `An overlapping ${input.ownershipType} ownership record already exists for this owner and entity (record ${overlap.id}, effective from ${overlap.effectiveFrom}). Ownership is effective-dated — never silently overwritten.`,
      409,
      { conflictType: "OWNERSHIP_EXISTS", existingOwnershipId: overlap.id },
    );
  }

  const ownershipId = newId(ID_PREFIX.ownership);
  await withAuditTransaction(
    async (tx) => {
      await tx.insert(ownershipRecords).values({
        id: ownershipId,
        tenantId: input.tenantId,
        ownedEntityId: input.ownedEntityId,
        ownerEntityId: input.ownerEntityId ?? null,
        ownerPartyId: input.ownerPartyId ?? null,
        ownershipType: input.ownershipType,
        instrument: input.instrument ?? "ORDINARY_SHARES",
        economicPct: String(input.economicPct),
        votingPct: String(input.votingPct),
        controlRights: input.controlRights ?? null,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        provenance: input.provenance,
        supportingDocumentId: input.supportingDocumentId ?? null,
        recordedBy: actor.userId,
      });
      return { ownershipId };
    },
    () =>
      adminAudit(
        actor,
        "OWNERSHIP_CREATED",
        "OWNERSHIP",
        ownershipId,
        input.reason,
        null,
        {
          ownershipId,
          ownedEntityId: input.ownedEntityId,
          ownerPartyId: input.ownerPartyId ?? null,
          ownerEntityId: input.ownerEntityId ?? null,
          ownershipType: input.ownershipType,
          economicPct: input.economicPct,
          votingPct: input.votingPct,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null,
        },
        "organization:ownership.manage",
        traceId,
      ),
    () =>
      adminEvent(
        actor,
        // Declared catalogue event (docs/events/README.md: OWNERSHIP_CHANGED).
        "OWNERSHIP_CHANGED",
        "OWNERSHIP",
        ownershipId,
        {
          ownedEntityId: input.ownedEntityId,
          economicPct: input.economicPct,
          votingPct: input.votingPct,
          ownerPartyId: input.ownerPartyId ?? null,
          ownerEntityId: input.ownerEntityId ?? null,
          ownershipType: input.ownershipType,
        },
        "organization:ownership.manage",
        traceId,
      ),
  );

  return {
    ownershipId,
    ownedEntityId: input.ownedEntityId,
    ownershipType: input.ownershipType,
    effectiveFrom: input.effectiveFrom,
  };
}

/* ------------------------------------------------------------------ */
/* EMPLOYMENT REGISTRATION (employment ≠ membership ≠ role)            */
/* ------------------------------------------------------------------ */

export type RegisterEmploymentInput = {
  tenantId: string;
  partyId: string;
  legalEntityId: string;
  employeeNo: string;
  hireDate: string;
  countryCode: string;
  employmentType?: string | null;
  positionId?: string | null;
  workEmail?: string | null;
  managerEmployeeId?: string | null;
  endDate?: string | null;
  reason: string;
};

/**
 * Register an employment relationship: an employees row over an existing
 * Party plus its canonical HIRE employment event — one governed transaction,
 * one audit record, one enterprise event.
 */
export async function registerEmployment(
  actor: Principal,
  input: RegisterEmploymentInput,
  traceId: string,
): Promise<{ employeeId: string; employeeNo: string; partyId: string }> {
  requireCapability(actor, "hcm:employee.manage", "registry.employment.register", {
    classification: "RESTRICTED",
    entityId: input.legalEntityId,
  });
  await requireActionScope(actor, "hcm:employee.manage", {
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId,
    countryCode: input.countryCode,
  });

  if (input.endDate && input.endDate < input.hireDate) {
    throw new AdminGovernanceError(
      "EFFECTIVE_DATE_ORDER",
      "endDate must not precede hireDate.",
      422,
    );
  }

  const [party] = await db
    .select({ id: parties.id })
    .from(parties)
    .where(eq(parties.id, input.partyId))
    .limit(1);
  if (!party) {
    throw new AdminGovernanceError("PARTY_NOT_FOUND", `Party ${input.partyId} was not found.`, 404);
  }

  const [existingEmployment] = await db
    .select({ id: employees.id, legalEntityId: employees.legalEntityId })
    .from(employees)
    .where(eq(employees.partyId, input.partyId))
    .limit(1);
  if (existingEmployment) {
    await auditRefusal(actor, "EMPLOYMENT_REGISTERED", "EMPLOYEE", input.partyId, "EMPLOYMENT_EXISTS", traceId);
    throw new AdminGovernanceError(
      "EMPLOYMENT_EXISTS",
      `Party ${input.partyId} is already an employee (employee ${existingEmployment.id}, entity ${existingEmployment.legalEntityId}). Employment is one canonical row per person — resolve the conflict through the governed registry.`,
      409,
      { conflictType: "EMPLOYMENT_EXISTS", existingEmployeeId: existingEmployment.id },
    );
  }

  const employeeNo = input.employeeNo.trim().toUpperCase();
  const [existingNo] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.employeeNo, employeeNo))
    .limit(1);
  if (existingNo) {
    await auditRefusal(actor, "EMPLOYMENT_REGISTERED", "EMPLOYEE", employeeNo, "EMPLOYEE_NO_EXISTS", traceId);
    throw new AdminGovernanceError(
      "EMPLOYEE_NO_EXISTS",
      `Employee number ${employeeNo} already exists (employee ${existingNo.id}).`,
      409,
      { conflictType: "EMPLOYEE_NO_EXISTS", existingEmployeeId: existingNo.id },
    );
  }

  const [entity] = await db
    .select({ id: legalEntities.id, tenantId: legalEntities.tenantId, status: legalEntities.status })
    .from(legalEntities)
    .where(eq(legalEntities.id, input.legalEntityId))
    .limit(1);
  if (!entity) {
    throw new AdminGovernanceError(
      "ENTITY_NOT_FOUND",
      `Legal entity ${input.legalEntityId} was not found.`,
      404,
    );
  }
  if (entity.tenantId !== input.tenantId) {
    throw new AdminGovernanceError(
      "ENTITY_WRONG_TENANT",
      `Legal entity ${entity.id} belongs to another tenant.`,
      409,
    );
  }
  if (entity.status !== "ACTIVE") {
    throw new AdminGovernanceError(
      "ENTITY_NOT_OPERATIONAL",
      `Legal entity ${entity.id} is ${entity.status}.`,
      409,
    );
  }

  if (input.positionId) {
    const [position] = await db
      .select({ id: positions.id, tenantId: positions.tenantId })
      .from(positions)
      .where(eq(positions.id, input.positionId))
      .limit(1);
    if (!position) {
      throw new AdminGovernanceError("POSITION_NOT_FOUND", `Position ${input.positionId} was not found.`, 404);
    }
    if (position.tenantId !== input.tenantId) {
      throw new AdminGovernanceError(
        "POSITION_WRONG_TENANT",
        `Position ${position.id} belongs to another tenant.`,
        409,
      );
    }
  }

  if (input.managerEmployeeId) {
    const [manager] = await db
      .select({ id: employees.id, tenantId: employees.tenantId })
      .from(employees)
      .where(eq(employees.id, input.managerEmployeeId))
      .limit(1);
    if (!manager) {
      throw new AdminGovernanceError(
        "MANAGER_NOT_FOUND",
        `Manager employee ${input.managerEmployeeId} was not found.`,
        404,
      );
    }
    if (manager.tenantId !== input.tenantId) {
      throw new AdminGovernanceError(
        "MANAGER_WRONG_TENANT",
        `Manager employee ${manager.id} belongs to another tenant.`,
        409,
      );
    }
  }

  const employeeId = newId(ID_PREFIX.employee);
  const employmentEventId = newId(ID_PREFIX.employmentEvent);

  await withAuditTransaction(
    async (tx) => {
      // THE single application writer of people.employees lives in lib/hcm —
      // this orchestration layer never writes the master itself.
      await createEmployment(tx, {
        id: employeeId,
        tenantId: input.tenantId,
        employeeNo,
        partyId: input.partyId,
        legalEntityId: input.legalEntityId,
        positionId: input.positionId ?? null,
        managerEmployeeId: input.managerEmployeeId ?? null,
        workEmail: input.workEmail ?? null,
        countryCode: input.countryCode,
        employmentType: input.employmentType ?? "PERMANENT",
        hireDate: input.hireDate,
        endDate: input.endDate ?? null,
        employmentEventId,
        recordedBy: actor.userId,
        provenance: input.reason,
      });
      return { employeeId };
    },
    () =>
      adminAudit(
        actor,
        "EMPLOYMENT_REGISTERED",
        "EMPLOYEE",
        employeeId,
        input.reason,
        null,
        {
          employeeId,
          employeeNo,
          partyId: input.partyId,
          legalEntityId: input.legalEntityId,
          hireDate: input.hireDate,
          employmentType: input.employmentType ?? "PERMANENT",
        },
        "hcm:employee.manage",
        traceId,
      ),
    () =>
      adminEvent(
        actor,
        // Declared catalogue event (docs/events/README.md + os_registry SHARED_HCM).
        "EMPLOYEE_CREATED",
        "EMPLOYEE",
        employeeId,
        {
          employeeNo,
          legalEntityId: input.legalEntityId,
          partyId: input.partyId,
          hireDate: input.hireDate,
        },
        "hcm:employee.manage",
        traceId,
      ),
  );

  return { employeeId, employeeNo, partyId: input.partyId };
}

/* ------------------------------------------------------------------ */
/* READ SURFACES (scoped, clearance-filtered)                          */
/* ------------------------------------------------------------------ */

/** Party ids the principal may see through any in-scope registry relationship. */
async function scopedPartyIds(actor: Principal, scope: string[]): Promise<Set<string>> {
  const partyIds = new Set<string>();
  const collect = (rows: Array<{ partyId: string | null }>) => {
    for (const r of rows) if (r.partyId) partyIds.add(r.partyId);
  };

  const [userRows, employeeRows, memberRows, familyRows, ownedRows] = await Promise.all([
    db.select({ partyId: users.partyId }).from(users).where(inArray(users.primaryTenantId, scope)),
    db
      .select({ partyId: employees.partyId })
      .from(employees)
      .leftJoin(legalEntities, eq(legalEntities.id, employees.legalEntityId))
      .where(or(inArray(employees.tenantId, scope), inArray(legalEntities.tenantId, scope))),
    db.select({ partyId: familyMembers.partyId }).from(familyMembers).where(inArray(familyMembers.tenantId, scope)),
    db.select({ partyId: families.partyId }).from(families).where(inArray(families.tenantId, scope)),
    db
      .select({ partyId: ownershipRecords.ownerPartyId })
      .from(ownershipRecords)
      .where(and(inArray(ownershipRecords.tenantId, scope), isNotNull(ownershipRecords.ownerPartyId))),
  ]);
  collect(userRows);
  collect(employeeRows);
  collect(memberRows);
  collect(familyRows);
  collect(ownedRows);

  // UNATTACHED MDM persons: a `parties` row with no user, employment,
  // family-membership, family-identity or ownership link ANYWHERE belongs to
  // no tenant yet — it is a pure canonical identity record whose registration
  // is audited against the registrar's tenant. Such rows are visible to any
  // scoped identity reader (otherwise a freshly registered person could never
  // be found — registration would write into a hole). As soon as the party is
  // attached to ANY tenant's records, the scoped-link rules above apply
  // exclusively: an affiliation the principal cannot reach hides the row,
  // fail-closed.
  const linkedSets = await Promise.all([
    db.select({ partyId: users.partyId }).from(users),
    db.select({ partyId: employees.partyId }).from(employees),
    db.select({ partyId: familyMembers.partyId }).from(familyMembers),
    db.select({ partyId: families.partyId }).from(families),
    db
      .select({ partyId: ownershipRecords.ownerPartyId })
      .from(ownershipRecords)
      .where(isNotNull(ownershipRecords.ownerPartyId)),
  ]);
  const allLinked = new Set<string>();
  for (const rows of linkedSets) collect(rows); // reuses collector; rows are {partyId}
  for (const rows of linkedSets) for (const r of rows) if (r.partyId) allLinked.add(r.partyId);
  const unattached = allLinked.size === 0
    ? await db.select({ id: parties.id }).from(parties).limit(10_000)
    : await db.select({ id: parties.id }).from(parties).where(notInArray(parties.id, [...allLinked])).limit(10_000);
  for (const r of unattached) partyIds.add(r.id);

  return partyIds;
}

export async function listRegistryParties(
  actor: Principal,
  query?: string,
): Promise<{ items: Array<Record<string, unknown>>; conflicts: Array<Record<string, unknown>> }> {
  const scope = await tenantScopeIds(actor);
  const partyIds = await scopedPartyIds(actor, scope);
  if (partyIds.size === 0) return { items: [], conflicts: [] };

  const trimmed = query?.trim();
  const conditions = [inArray(parties.id, [...partyIds])];
  if (trimmed) {
    conditions.push(
      or(
        ilike(parties.displayName, `%${trimmed.replace(/[%_\\]/g, "\\$&")}%`),
        eq(sql`lower(${parties.email})`, trimmed.toLowerCase()),
      )!,
    );
  }

  let rows = await db
    .select({
      id: parties.id,
      type: parties.type,
      displayName: parties.displayName,
      email: parties.email,
      countryCode: parties.countryCode,
      kycStatus: parties.kycStatus,
      status: parties.status,
      classification: parties.classification,
      createdAt: parties.createdAt,
    })
    .from(parties)
    .where(and(...conditions))
    .orderBy(parties.displayName)
    .limit(200);
  rows = filterByClearance(actor, rows);

  // Controlled conflict surfacing: exact normalized-email collisions inside
  // the visible scope (historical data), reported — never auto-resolved.
  const byEmail = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.email) continue;
    const key = r.email.trim().toLowerCase();
    byEmail.set(key, [...(byEmail.get(key) ?? []), r.id]);
  }
  const conflicts = [...byEmail.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([email, ids]) => ({ type: "DUPLICATE_EMAIL", email, partyIds: ids }));

  return { items: rows, conflicts };
}

export async function listRegistryFamilies(actor: Principal) {
  const scope = await tenantScopeIds(actor);
  const rows = await db
    .select({
      id: families.id,
      tenantId: families.tenantId,
      partyId: families.partyId,
      code: families.code,
      displayName: families.displayName,
      legalName: families.legalName,
      countryCode: families.countryCode,
      jurisdictionId: families.jurisdictionId,
      status: families.status,
      classification: families.classification,
      createdAt: families.createdAt,
    })
    .from(families)
    .where(inArray(families.tenantId, scope))
    .orderBy(families.code)
    .limit(100);
  return filterByClearance(actor, rows);
}

export async function getRegistryFamily(actor: Principal, familyId: string) {
  const scope = await tenantScopeIds(actor);
  const rows = await db
    .select({
      id: families.id,
      tenantId: families.tenantId,
      partyId: families.partyId,
      code: families.code,
      displayName: families.displayName,
      legalName: families.legalName,
      countryCode: families.countryCode,
      jurisdictionId: families.jurisdictionId,
      status: families.status,
      classification: families.classification,
      createdAt: families.createdAt,
    })
    .from(families)
    .where(and(eq(families.id, familyId), inArray(families.tenantId, scope)))
    .limit(1);
  const [family] = filterByClearance(actor, rows);
  if (!family) {
    throw new AdminGovernanceError(
      "FAMILY_NOT_FOUND",
      `Family ${familyId} was not found in the principal's scope.`,
      404,
    );
  }
  return family;
}

export type RegistryFamilyMember = {
  id: string;
  partyId: string;
  branch: string;
  generation: number;
  relationshipToParent: string;
  membershipStatus: string;
  provenance: string | null;
  verificationStatus: string;
  directDescendant: boolean;
  classification: string;
  displayName: string;
  /** GlobalUserID (users.id) when — and only when — this person is also a user. */
  globalUserId: string | null;
  /** True only when an employees row actually exists — never fabricated. */
  employed: boolean;
};

export async function listRegistryFamilyMembers(
  actor: Principal,
  familyId: string,
): Promise<{ items: RegistryFamilyMember[] }> {
  await getRegistryFamily(actor, familyId); // resolves scope + clearance, fail-closed

  const rows = await db
    .select({
      id: familyMembers.id,
      partyId: familyMembers.partyId,
      branch: familyMembers.branch,
      generation: familyMembers.generation,
      relationshipToParent: familyMembers.relationshipToParent,
      membershipStatus: familyMembers.membershipStatus,
      provenance: familyMembers.provenance,
      verificationStatus: familyMembers.verificationStatus,
      directDescendant: familyMembers.directDescendant,
      classification: familyMembers.classification,
      displayName: parties.displayName,
      globalUserId: users.id,
      employeeId: employees.id,
    })
    .from(familyMembers)
    .innerJoin(parties, eq(parties.id, familyMembers.partyId))
    .leftJoin(users, eq(users.partyId, familyMembers.partyId))
    .leftJoin(employees, eq(employees.partyId, familyMembers.partyId))
    .where(eq(familyMembers.familyId, familyId))
    .orderBy(familyMembers.generation, familyMembers.branch);

  const items: RegistryFamilyMember[] = filterByClearance(actor, rows).map((r) => ({
    id: r.id,
    partyId: r.partyId,
    branch: r.branch,
    generation: r.generation,
    relationshipToParent: r.relationshipToParent,
    membershipStatus: r.membershipStatus,
    provenance: r.provenance,
    verificationStatus: r.verificationStatus,
    directDescendant: r.directDescendant,
    classification: r.classification,
    displayName: r.displayName,
    globalUserId: r.globalUserId,
    employed: Boolean(r.employeeId),
  }));
  return { items };
}

export async function listRegistryEntities(actor: Principal) {
  const scope = await tenantScopeIds(actor);
  const rows = await db
    .select({
      id: legalEntities.id,
      tenantId: legalEntities.tenantId,
      code: legalEntities.code,
      legalName: legalEntities.legalName,
      tradingName: legalEntities.tradingName,
      entityType: legalEntities.entityType,
      parentEntityId: legalEntities.parentEntityId,
      countryCode: legalEntities.countryCode,
      registrationNumber: legalEntities.registrationNumber,
      status: legalEntities.status,
      classification: legalEntities.classification,
      effectiveFrom: legalEntities.effectiveFrom,
    })
    .from(legalEntities)
    .where(inArray(legalEntities.tenantId, scope))
    .orderBy(legalEntities.code)
    .limit(200);
  return filterByClearance(actor, rows);
}

export async function listRegistryBusinesses(actor: Principal) {
  const scope = await tenantScopeIds(actor);
  const rows = await db
    .select({
      id: orgUnits.id,
      tenantId: orgUnits.tenantId,
      legalEntityId: orgUnits.legalEntityId,
      code: orgUnits.code,
      name: orgUnits.name,
      unitType: orgUnits.unitType,
      parentUnitId: orgUnits.parentUnitId,
      costCentre: orgUnits.costCentre,
      status: orgUnits.status,
      classification: legalEntities.classification,
    })
    .from(orgUnits)
    .innerJoin(legalEntities, eq(legalEntities.id, orgUnits.legalEntityId))
    .where(inArray(orgUnits.tenantId, scope))
    .orderBy(orgUnits.code)
    .limit(200);
  return filterByClearance(actor, rows);
}

export async function listRegistryOwnership(actor: Principal, ownedEntityId?: string) {
  const scope = await tenantScopeIds(actor);
  const conditions = [inArray(ownershipRecords.tenantId, scope)];
  if (ownedEntityId) conditions.push(eq(ownershipRecords.ownedEntityId, ownedEntityId));
  const rows = await db
    .select({
      id: ownershipRecords.id,
      tenantId: ownershipRecords.tenantId,
      ownedEntityId: ownershipRecords.ownedEntityId,
      ownerEntityId: ownershipRecords.ownerEntityId,
      ownerPartyId: ownershipRecords.ownerPartyId,
      ownershipType: ownershipRecords.ownershipType,
      instrument: ownershipRecords.instrument,
      economicPct: ownershipRecords.economicPct,
      votingPct: ownershipRecords.votingPct,
      controlRights: ownershipRecords.controlRights,
      effectiveFrom: ownershipRecords.effectiveFrom,
      effectiveTo: ownershipRecords.effectiveTo,
      provenance: ownershipRecords.provenance,
      createdAt: ownershipRecords.createdAt,
    })
    .from(ownershipRecords)
    .where(and(...conditions))
    .orderBy(desc(ownershipRecords.createdAt))
    .limit(200);
  return rows;
}

/* ------------------------------------------------------------------ */
/* IDENTITY / RELATIONSHIP GRAPH (read-only projection)                */
/* ------------------------------------------------------------------ */

export type RegistryGraphNode = {
  id: string;
  kind: "PERSON" | "USER" | "FAMILY" | "LEGAL_ENTITY" | "TENANT";
  label: string;
  tenantId?: string | null;
  classification?: string;
};

export type RegistryGraphEdge = {
  type: "contains" | "memberOf" | "personWorksFor" | "personOwns" | "hasUser";
  from: string;
  to: string;
  meta?: Record<string, unknown>;
};

/**
 * Read-only projection of the canonical relationship graph. Every edge family
 * is gated by ITS OWN permission (family membership needs family:member.read,
 * employment needs hcm:employee.read, ownership needs
 * organization:ownership.read, the user link needs identity:user.read) — the
 * graph never grants visibility its underlying permission would deny, and it
 * never fabricates a User or Employment edge that does not exist.
 */
export async function buildRegistryGraph(actor: Principal): Promise<{
  nodes: RegistryGraphNode[];
  edges: RegistryGraphEdge[];
}> {
  const scope = await tenantScopeIds(actor);
  const nodes: RegistryGraphNode[] = [];
  const edges: RegistryGraphEdge[] = [];
  const nodeIds = new Set<string>();

  const addNode = (n: RegistryGraphNode) => {
    if (nodeIds.has(n.id)) return;
    nodeIds.add(n.id);
    nodes.push(n);
  };

  // Tenants (structural containment of entities).
  const tenantRows = await db
    .select({ id: tenants.id, code: tenants.code, name: tenants.name, status: tenants.status })
    .from(tenants)
    .where(inArray(tenants.id, scope))
    .orderBy(tenants.code)
    .limit(100);
  for (const t of tenantRows) {
    addNode({ id: t.id, kind: "TENANT", label: t.name, tenantId: t.id });
  }

  // Legal entities.
  const entityRows = await db
    .select({
      id: legalEntities.id,
      tenantId: legalEntities.tenantId,
      legalName: legalEntities.legalName,
      code: legalEntities.code,
      classification: legalEntities.classification,
    })
    .from(legalEntities)
    .where(inArray(legalEntities.tenantId, scope))
    .limit(200);
  const visibleEntities = filterByClearance(actor, entityRows);
  const canStructure = can(actor, "organization:entity.read").allowed;
  for (const e of visibleEntities) {
    addNode({ id: e.id, kind: "LEGAL_ENTITY", label: e.legalName, tenantId: e.tenantId, classification: e.classification });
    if (canStructure && nodeIds.has(e.tenantId)) {
      edges.push({ type: "contains", from: e.tenantId, to: e.id });
    }
  }

  // Person parties in scope.
  const partyIds = await scopedPartyIds(actor, scope);
  let personRows: Array<{ id: string; displayName: string; classification: string }> = [];
  if (partyIds.size > 0) {
    personRows = filterByClearance(
      actor,
      await db
        .select({
          id: parties.id,
          displayName: parties.displayName,
          classification: parties.classification,
        })
        .from(parties)
        .where(inArray(parties.id, [...partyIds]))
        .limit(200),
    );
  }
  for (const p of personRows) {
    addNode({ id: p.id, kind: "PERSON", label: p.displayName, classification: p.classification });
  }
  const personNode = (id: string) => nodeIds.has(id);

  // Families (HIGHLY_RESTRICTED — clearance filtered).
  if (can(actor, "family:member.read").allowed) {
    const familyRows = await db
      .select({
        id: families.id,
        tenantId: families.tenantId,
        partyId: families.partyId,
        displayName: families.displayName,
        code: families.code,
        classification: families.classification,
      })
      .from(families)
      .where(inArray(families.tenantId, scope))
      .limit(100);
    for (const f of filterByClearance(actor, familyRows)) {
      addNode({ id: f.id, kind: "FAMILY", label: f.displayName, tenantId: f.tenantId, classification: f.classification });
      if (personNode(f.partyId)) {
        // The family's canonical MDM identity edge (party ORGANIZATION).
        edges.push({ type: "contains", from: f.id, to: f.partyId, meta: { as: "identity" } });
      }
      const memberRows = await db
        .select({
          partyId: familyMembers.partyId,
          relationshipToParent: familyMembers.relationshipToParent,
          membershipStatus: familyMembers.membershipStatus,
        })
        .from(familyMembers)
        .where(eq(familyMembers.familyId, f.id))
        .limit(500);
      for (const m of memberRows) {
        if (!personNode(m.partyId)) continue;
        edges.push({
          type: "memberOf",
          from: m.partyId,
          to: f.id,
          meta: { relationship: m.relationshipToParent, membershipStatus: m.membershipStatus },
        });
      }
    }
  }

  // Employment edges (only where an employees row actually exists).
  if (can(actor, "hcm:employee.read").allowed) {
    const employmentRows = await db
      .select({
        partyId: employees.partyId,
        legalEntityId: employees.legalEntityId,
        employeeNo: employees.employeeNo,
        employmentType: employees.employmentType,
        hireDate: employees.hireDate,
        status: employees.status,
      })
      .from(employees)
      .leftJoin(legalEntities, eq(legalEntities.id, employees.legalEntityId))
      .where(or(inArray(employees.tenantId, scope), inArray(legalEntities.tenantId, scope)))
      .limit(500);
    for (const e of employmentRows) {
      if (!personNode(e.partyId)) continue;
      edges.push({
        type: "personWorksFor",
        from: e.partyId,
        to: e.legalEntityId,
        meta: {
          employeeNo: e.employeeNo,
          employmentType: e.employmentType,
          hireDate: e.hireDate,
          status: e.status,
        },
      });
    }
  }

  // Ownership edges (ownership_records is the authority — never inferred).
  if (can(actor, "organization:ownership.read").allowed) {
    const ownershipRows = await db
      .select({
        ownerPartyId: ownershipRecords.ownerPartyId,
        ownerEntityId: ownershipRecords.ownerEntityId,
        ownedEntityId: ownershipRecords.ownedEntityId,
        ownershipType: ownershipRecords.ownershipType,
        economicPct: ownershipRecords.economicPct,
        votingPct: ownershipRecords.votingPct,
        effectiveFrom: ownershipRecords.effectiveFrom,
        effectiveTo: ownershipRecords.effectiveTo,
      })
      .from(ownershipRecords)
      .where(inArray(ownershipRecords.tenantId, scope))
      .limit(500);
    for (const o of ownershipRows) {
      if (o.ownerPartyId && personNode(o.ownerPartyId)) {
        edges.push({
          type: "personOwns",
          from: o.ownerPartyId,
          to: o.ownedEntityId,
          meta: {
            ownershipType: o.ownershipType,
            economicPct: o.economicPct,
            votingPct: o.votingPct,
            effectiveFrom: o.effectiveFrom,
            effectiveTo: o.effectiveTo,
          },
        });
      } else if (o.ownerEntityId && nodeIds.has(o.ownerEntityId) && nodeIds.has(o.ownedEntityId)) {
        edges.push({
          type: "contains",
          from: o.ownerEntityId,
          to: o.ownedEntityId,
          meta: { as: "ownership", ownershipType: o.ownershipType },
        });
      }
    }
  }

  // GlobalUserID edges — emitted only for people who really are users.
  if (can(actor, "identity:user.read").allowed) {
    const userRows = await db
      .select({ id: users.id, partyId: users.partyId, primaryTenantId: users.primaryTenantId, status: users.status })
      .from(users)
      .where(inArray(users.primaryTenantId, scope))
      .limit(500);
    for (const u of userRows) {
      if (!personNode(u.partyId)) continue;
      addNode({ id: u.id, kind: "USER", label: u.id, tenantId: u.primaryTenantId });
      edges.push({ type: "hasUser", from: u.partyId, to: u.id, meta: { status: u.status } });
    }
  }

  return { nodes, edges };
}
