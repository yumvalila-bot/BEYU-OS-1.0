/**
 * BEYU OS — Intercompany and consolidation scope (Finance OS, Phases 14–15).
 *
 * THE PROBLEM THIS ADDRESSES. An intercompany transaction is the one place where two legal
 * entities — potentially in two different tenants — appear in a single financial record. It is
 * therefore the natural route for one tenant's balances to end up inside another's reported
 * position. The seeded data already shows the failure mode: three treasury positions claim
 * TEN_BEYU_GROUP for entities owned by TEN_BEYU_TZ, TEN_BEYU_HEALTH and TEN_BEYU_AGRI.
 *
 * ENTITY OWNERSHIP IS NEVER INFERRED FROM FINANCIAL RECORDS. `legal_entities.tenant_id` is
 * canonical. A financial row that disagrees is evidence of a defect, not a source of ownership
 * information. Every function here reads ownership from the entity table and reports
 * disagreement.
 *
 * WHAT IS NOT INVENTED. Transfer pricing, elimination rules, ownership percentages, control
 * conclusions, consolidation policy and minority-interest treatment are all unratified accounting
 * judgements. The rails are built; the rules return REQUIRES_AUTHORITY.
 *
 * NO TABLE. `ownership_records` and `legal_entities` already exist. An intercompany transaction
 * store would be a subledger, and creating one without ratified policy would be inventing the
 * accounting treatment it is supposed to record.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { legalEntities } from "@/db/schema";

export const INTERCOMPANY_VERSION = "intercompany-1.0.0";

export const IC_DECISION = [
  "PERMITTED",
  "ATTRIBUTION_CONFLICT",
  "GOVERNANCE_REVIEW_REQUIRED",
  "CROSS_TENANT_REQUIRES_AUTHORITY",
  "REQUIRES_AUTHORITY",
  "DATA_NOT_AVAILABLE",
  "SAME_ENTITY",
] as const;
export type IcDecision = (typeof IC_DECISION)[number];

export type EntityOwnership = {
  legalEntityId: string;
  owningTenantId: string | null;
  exists: boolean;
};

export type IcValidation = {
  permitted: boolean;
  decision: IcDecision;
  sourceEntity: EntityOwnership;
  destinationEntity: EntityOwnership;
  crossTenant: boolean;
  reason: string;
  /** Policy decisions that would be needed for this to proceed. */
  policyDependencies: string[];
};

/** Reads canonical ownership. Never derived from financial records. */
export async function ownershipOf(legalEntityId: string): Promise<EntityOwnership> {
  const [row] = await db
    .select({ id: legalEntities.id, tenantId: legalEntities.tenantId })
    .from(legalEntities)
    .where(eq(legalEntities.id, legalEntityId))
    .limit(1);

  return {
    legalEntityId,
    owningTenantId: row?.tenantId ?? null,
    exists: Boolean(row),
  };
}

/**
 * Validates a proposed intercompany transaction between two entities.
 *
 * A cross-tenant intercompany transaction is not forbidden outright — a group legitimately
 * transacts across its own tenants — but it is never merely operational. It requires governed
 * authority, because it moves value across a legal and reporting boundary.
 */
export async function validateIntercompany(input: {
  sourceEntityId: string;
  destinationEntityId: string;
  /** The tenant the operation is being performed under. */
  actingTenantId: string;
  hasCrossTenantAuthority?: boolean;
}): Promise<IcValidation> {
  const source = await ownershipOf(input.sourceEntityId);
  const destination = await ownershipOf(input.destinationEntityId);

  const base = {
    sourceEntity: source,
    destinationEntity: destination,
    crossTenant: source.owningTenantId !== destination.owningTenantId,
  };

  if (!source.exists || !destination.exists) {
    const missing = [
      !source.exists ? input.sourceEntityId : null,
      !destination.exists ? input.destinationEntityId : null,
    ].filter(Boolean);
    return {
      ...base,
      permitted: false,
      decision: "DATA_NOT_AVAILABLE",
      reason: `Legal entit(ies) not found: ${missing.join(", ")}. Ownership cannot be established.`,
      policyDependencies: [],
    };
  }

  if (input.sourceEntityId === input.destinationEntityId) {
    return {
      ...base,
      permitted: false,
      decision: "SAME_ENTITY",
      reason: "Source and destination are the same entity; this is not an intercompany transaction.",
      policyDependencies: [],
    };
  }

  // The acting tenant must own at least one side. Otherwise a third party is arranging a transfer
  // between two entities it has no relationship with.
  const actingOwnsSource = source.owningTenantId === input.actingTenantId;
  const actingOwnsDestination = destination.owningTenantId === input.actingTenantId;

  if (!actingOwnsSource && !actingOwnsDestination) {
    return {
      ...base,
      permitted: false,
      decision: "ATTRIBUTION_CONFLICT",
      reason:
        `Tenant ${input.actingTenantId} owns neither ${input.sourceEntityId} (owned by ` +
        `${source.owningTenantId}) nor ${input.destinationEntityId} (owned by ` +
        `${destination.owningTenantId}). It cannot transact between two entities it does not own.`,
      policyDependencies: [],
    };
  }

  if (base.crossTenant) {
    if (!input.hasCrossTenantAuthority) {
      return {
        ...base,
        permitted: false,
        decision: "CROSS_TENANT_REQUIRES_AUTHORITY",
        reason:
          `${input.sourceEntityId} (${source.owningTenantId}) -> ${input.destinationEntityId} ` +
          `(${destination.owningTenantId}) crosses a tenant boundary. Cross-tenant value movement ` +
          "requires governed authority; it is never an ordinary operational act.",
        policyDependencies: ["P2", "P5"],
      };
    }
    return {
      ...base,
      permitted: true,
      decision: "PERMITTED",
      reason: `Cross-tenant intercompany permitted with the governance authority supplied.`,
      policyDependencies: ["P2", "P5"],
    };
  }

  return {
    ...base,
    permitted: true,
    decision: "PERMITTED",
    reason: `Both entities belong to ${source.owningTenantId}; the transaction is within one tenant.`,
    policyDependencies: [],
  };
}

export type ReciprocalMatch = {
  matched: boolean;
  decision: "MATCHED" | "UNMATCHED" | "AMOUNT_MISMATCH" | "CURRENCY_MISMATCH" | "DATA_NOT_AVAILABLE";
  difference: string | null;
  reason: string;
  /** Never true. A difference is evidence and is never written away. */
  autoResolved: false;
};

/**
 * Matches two sides of an intercompany transaction.
 *
 * A mismatch is reported, never adjusted. Posting a plug to make two entities agree destroys the
 * evidence that they disagreed — which is the whole point of intercompany reconciliation.
 */
export function matchReciprocal(input: {
  sourceAmount: string | null;
  destinationAmount: string | null;
  sourceCurrency: string | null;
  destinationCurrency: string | null;
}): ReciprocalMatch {
  if (
    input.sourceAmount === null ||
    input.destinationAmount === null ||
    input.sourceCurrency === null ||
    input.destinationCurrency === null
  ) {
    return {
      matched: false,
      decision: "DATA_NOT_AVAILABLE",
      difference: null,
      reason: "One or both sides of the intercompany pair are absent; no match can be asserted.",
      autoResolved: false,
    };
  }

  if (input.sourceCurrency !== input.destinationCurrency) {
    return {
      matched: false,
      decision: "CURRENCY_MISMATCH",
      difference: null,
      reason:
        `The two sides are denominated in ${input.sourceCurrency} and ${input.destinationCurrency}. ` +
        "Comparing them requires a governed FX rate (P4); no rate is derived.",
      autoResolved: false,
    };
  }

  const difference = (Number(input.sourceAmount) - Number(input.destinationAmount)).toFixed(2);

  if (Number(difference) !== 0) {
    return {
      matched: false,
      decision: "AMOUNT_MISMATCH",
      difference,
      reason:
        `The two sides differ by ${difference} ${input.sourceCurrency}. Reported for investigation; ` +
        "no adjustment was posted.",
      autoResolved: false,
    };
  }

  return {
    matched: true,
    decision: "MATCHED",
    difference: "0.00",
    reason: "The reciprocal pair agrees in amount and currency.",
    autoResolved: false,
  };
}

export type ConsolidationScope = {
  parentTenantId: string;
  includedEntities: string[];
  excludedEntities: Array<{ legalEntityId: string; reason: string }>;
  decision: "SCOPE_DETERMINED" | "REQUIRES_AUTHORITY";
  ownershipBasis: "CANONICAL_ENTITY_TABLE";
  eliminationsRequired: boolean;
  policyDependencies: string[];
  limitations: string[];
};

/**
 * Determines which entities fall inside a consolidation.
 *
 * Includes entities the tenant OWNS, per the canonical entity table. It does NOT compute control,
 * ownership percentages or minority interests — those need ratified policy and an ownership
 * register with percentages, neither of which exists. Scope determination is therefore structural
 * only, and says so.
 */
export async function determineConsolidationScope(parentTenantId: string): Promise<ConsolidationScope> {
  const all = await db
    .select({ id: legalEntities.id, tenantId: legalEntities.tenantId })
    .from(legalEntities);

  const included = all.filter((e) => e.tenantId === parentTenantId).map((e) => e.id).sort();
  const excluded = all
    .filter((e) => e.tenantId !== parentTenantId)
    .map((e) => ({
      legalEntityId: e.id,
      reason: `Owned by ${e.tenantId}, not ${parentTenantId}. Inclusion would require a ratified control assessment.`,
    }))
    .sort((a, b) => a.legalEntityId.localeCompare(b.legalEntityId));

  return {
    parentTenantId,
    includedEntities: included,
    excludedEntities: excluded,
    decision: "REQUIRES_AUTHORITY",
    ownershipBasis: "CANONICAL_ENTITY_TABLE",
    eliminationsRequired: included.length > 1,
    policyDependencies: ["P1", "P4"],
    limitations: [
      "Scope is structural: it lists entities the tenant owns per legal_entities.tenant_id.",
      "CONTROL is not assessed. Ownership percentages are not recorded, so control, significant " +
        "influence and minority interests cannot be determined.",
      "Elimination rules are unratified (P1); no intercompany balance is eliminated.",
      "FX translation of subsidiary results requires a governed rate source (P4); none exists.",
      "This scope must not be used to produce consolidated figures.",
    ],
  };
}

export type EliminationAssessment = {
  candidatePairs: number;
  eliminated: 0;
  decision: "REQUIRES_AUTHORITY";
  reason: string;
};

/**
 * Intercompany elimination.
 *
 * Always eliminates zero. Which balances offset, at what value, and how residual differences are
 * treated are accounting-policy judgements. The function exists so the pipeline is complete and
 * the refusal is explicit and testable, rather than the step being silently absent.
 */
export async function assessEliminations(parentTenantId: string): Promise<EliminationAssessment> {
  const scope = await determineConsolidationScope(parentTenantId);
  const n = scope.includedEntities.length;
  const candidatePairs = n > 1 ? (n * (n - 1)) / 2 : 0;

  return {
    candidatePairs,
    eliminated: 0,
    decision: "REQUIRES_AUTHORITY",
    reason:
      `${candidatePairs} intercompany entity pair(s) are in scope, but no balance was eliminated. ` +
      "Elimination requires a ratified consolidation policy (P1) defining which balances offset " +
      "and how residual differences are treated. Inventing that rule would fabricate group results.",
  };
}

/** Cross-tenant entity references in the entity hierarchy itself. */
export async function scanEntityOwnershipConsistency(): Promise<
  Array<{ legalEntityId: string; owningTenantId: string; consistent: boolean; detail: string }>
> {
  const rows = await db
    .select({ id: legalEntities.id, tenantId: legalEntities.tenantId })
    .from(legalEntities)
    .orderBy(legalEntities.id);

  return rows.map((r) => ({
    legalEntityId: r.id,
    owningTenantId: r.tenantId,
    consistent: Boolean(r.tenantId),
    detail: r.tenantId
      ? `Owned by ${r.tenantId} per the canonical entity table.`
      : "No owning tenant recorded; ownership is undetermined.",
  }));
}

/** Entities referenced by a set of ids that the acting tenant does not own. */
export async function foreignEntities(input: {
  entityIds: string[];
  actingTenantId: string;
}): Promise<string[]> {
  if (input.entityIds.length === 0) return [];

  const rows = await db
    .select({ id: legalEntities.id, tenantId: legalEntities.tenantId })
    .from(legalEntities)
    .where(inArray(legalEntities.id, input.entityIds));

  return rows
    .filter((r) => r.tenantId !== input.actingTenantId)
    .map((r) => r.id)
    .sort();
}
