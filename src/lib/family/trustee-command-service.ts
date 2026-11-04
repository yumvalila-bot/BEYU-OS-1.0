/**
 * BEYU OS — TRUSTEE COMMAND service (read-only composition).
 *
 * Reads the registers that already own the facts and hands them to the pure
 * model in `./trustee-command.ts`. It writes nothing, opens no transaction it
 * could commit, and exists purely so the page and the API cannot drift apart.
 *
 * ============================ SCOPE RULES ===================================
 *
 *   - The trust entity is resolved from the authenticated principal's canonical
 *     tenant scope plus `entityScope`, never from the URL. An out-of-scope or
 *     non-existent entity is the SAME answer (not found), so the surface cannot
 *     be used to enumerate trust identities.
 *   - An entity-scoped grant is REFUSED rather than widened. The trust tables
 *     carry complete legal-entity keys, but the governing bodies, resolutions and
 *     appointment reads this surface composes do not consistently carry them;
 *     rather than partially honour such a grant (which would let an
 *     entity-limited principal read tenant-wide governance), the surface
 *     fail-closes with `TRUSTEE_COMMAND_ENTITY_SCOPE_UNSUPPORTED`. This mirrors
 *     the canonical `guarded()` scope rule for `familyoffice:*` routes.
 *   - Classification is a second dimension: only rows at or below the
 *     principal's clearance are read. `HIGHLY_RESTRICTED` is the default on
 *     every trust table.
 *
 * The capability itself (`familyoffice:trust.read`) is enforced by the CALLER
 * through the canonical primitives — `requireAccess()` on the page and
 * `guarded()` on the API — and is re-checked here at `HIGHLY_RESTRICTED` so a
 * future caller cannot skip it.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  entityAppointments,
  governanceBodies,
  governanceCapabilityRegistry,
  legalEntities,
  parties,
  trustDecisions,
  trustDistributions,
  trustInstruments,
  trustProvisions,
} from "@/db/schema";
import { can, type Principal } from "@/lib/authz";
import { classificationsAtOrBelow } from "@/lib/constants";
import { tenantScopeIds } from "@/lib/tenant-scope";
import {
  TRUSTEE_COMMAND_BOUNDARY,
  buildTrusteeCommandModel,
  type PostingLock,
  type TrusteeCommandModel,
} from "./trustee-command";

export const TRUSTEE_TRUST_CAPABILITY = "familyoffice:trust.read" as const;

export type TrusteeCommandErrorCode =
  | "TRUSTEE_COMMAND_SCOPE"
  | "TRUSTEE_COMMAND_ENTITY_SCOPE_UNSUPPORTED"
  | "TRUSTEE_COMMAND_TRUST_NOT_FOUND";

export class TrusteeCommandError extends Error {
  constructor(
    readonly code: TrusteeCommandErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TrusteeCommandError";
  }
}

export const TRUSTEE_COMMAND_ERROR_STATUS: Record<TrusteeCommandErrorCode, number> = {
  TRUSTEE_COMMAND_SCOPE: 403,
  TRUSTEE_COMMAND_ENTITY_SCOPE_UNSUPPORTED: 403,
  TRUSTEE_COMMAND_TRUST_NOT_FOUND: 404,
};

/** The canonical trustee governing body code, seeded in `src/db/seed.ts`. */
export const TRUSTEE_BODY_CODE = "TRUSTEE_BOARD";

/**
 * Read the activation gate's verdict for CAP_POSTING.
 *
 * The gate itself (`checkCapabilityActivation`) is the single authority for
 * "may anything post a journal entry". This function reports its answer and
 * makes no judgement of its own, because a governance surface must be able to
 * show that financial posting is locked without either duplicating the rule or
 * implying that it could be unlocked from here.
 */
async function readPostingLock(): Promise<PostingLock> {
  const [row] = await db
    .select()
    .from(governanceCapabilityRegistry)
    .where(eq(governanceCapabilityRegistry.capabilityCode, "CAP_POSTING"))
    .limit(1);

  const required = row && Array.isArray(row.requiredDecisions) ? row.requiredDecisions : [];
  // Fail-closed exactly like the gate: absent registry row, or no stated
  // requirement, is NOT authorisation.
  const registered = Boolean(row);
  const executable = Boolean(row) && required.length > 0 && row!.activationStatus === "ACTIVATED";

  return {
    capabilityCode: "CAP_POSTING",
    executable,
    activationStatus: row?.activationStatus ?? null,
    reason: !registered
      ? "CAP_POSTING is not present in the capability registry; posting is denied by default."
      : executable
        ? "CAP_POSTING reports ACTIVATED with every required decision satisfied."
        : `CAP_POSTING is locked pending ${required.length ? required.join(", ") : "a stated authority requirement"}.`,
    blockedBy: executable ? [] : required,
  };
}

/**
 * Load the Trustee Command model for a principal.
 *
 * `trustEntityId` narrows the view to one trust; omit it to use the canonical
 * Family Trust entity (resolved by entity type within the principal's scope),
 * falling back to the first visible TRUST entity. Ambiguity is refused rather
 * than guessed at only when an explicit id was supplied and it does not resolve.
 */
export async function loadTrusteeCommand(
  principal: Principal,
  options: { trustEntityId?: string | null } = {},
): Promise<TrusteeCommandModel> {
  const decision = can(principal, TRUSTEE_TRUST_CAPABILITY, { classification: "HIGHLY_RESTRICTED" });
  if (!decision.allowed) {
    throw new TrusteeCommandError("TRUSTEE_COMMAND_SCOPE", decision.reason);
  }

  if (principal.entityScope.length > 0) {
    throw new TrusteeCommandError(
      "TRUSTEE_COMMAND_ENTITY_SCOPE_UNSUPPORTED",
      "Trustee Command composes governing bodies, resolutions and appointments that do not all carry legal-entity keys, so an entity-scoped grant is refused rather than widened to tenant level.",
    );
  }

  const scope = await tenantScopeIds(principal);
  const allowedClassifications = classificationsAtOrBelow(principal.clearance);
  const requestedId = options.trustEntityId?.trim() || null;

  const entities = await db
    .select({
      id: legalEntities.id,
      code: legalEntities.code,
      legalName: legalEntities.legalName,
      entityType: legalEntities.entityType,
      parentEntityId: legalEntities.parentEntityId,
      countryCode: legalEntities.countryCode,
      status: legalEntities.status,
      functionalCurrency: legalEntities.functionalCurrency,
      jurisdictionId: legalEntities.jurisdictionId,
      classification: legalEntities.classification,
    })
    .from(legalEntities)
    .where(
      and(
        inArray(legalEntities.tenantId, scope),
        inArray(legalEntities.classification, allowedClassifications),
      ),
    );

  const trustEntities = entities.filter((entity) => entity.entityType === "TRUST");
  const trust = requestedId
    ? trustEntities.find((entity) => entity.id === requestedId)
    : trustEntities[0];

  if (!trust) {
    // Non-enumerating: out-of-scope and non-existent are indistinguishable.
    throw new TrusteeCommandError(
      "TRUSTEE_COMMAND_TRUST_NOT_FOUND",
      "No trust entity resolves within your authorised scope.",
    );
  }

  const [appointmentRows, bodyRows, instrumentRows, decisionRows, distributionRows, posting] =
    await Promise.all([
      db
        .select({
          partyId: entityAppointments.partyId,
          displayName: parties.displayName,
          role: entityAppointments.role,
          appointedOn: entityAppointments.appointedOn,
          resignedOn: entityAppointments.resignedOn,
          authorityLimit: entityAppointments.authorityLimit,
          resolutionRef: entityAppointments.resolutionRef,
        })
        .from(entityAppointments)
        .innerJoin(parties, eq(parties.id, entityAppointments.partyId))
        .where(
          and(
            eq(entityAppointments.legalEntityId, trust.id),
            inArray(entityAppointments.tenantId, scope),
          ),
        ),
      db
        .select()
        .from(governanceBodies)
        .where(
          and(
            inArray(governanceBodies.tenantId, scope),
            eq(governanceBodies.legalEntityId, trust.id),
            eq(governanceBodies.bodyType, "TRUSTEES"),
          ),
        ),
      db
        .select()
        .from(trustInstruments)
        .where(
          and(
            eq(trustInstruments.trustEntityId, trust.id),
            inArray(trustInstruments.tenantId, scope),
            inArray(trustInstruments.classification, allowedClassifications),
          ),
        ),
      db
        .select()
        .from(trustDecisions)
        .where(
          and(
            inArray(trustDecisions.tenantId, scope),
            inArray(trustDecisions.classification, allowedClassifications),
          ),
        ),
      db
        .select()
        .from(trustDistributions)
        .where(
          and(
            inArray(trustDistributions.tenantId, scope),
            inArray(trustDistributions.classification, allowedClassifications),
          ),
        ),
      readPostingLock(),
    ]);

  const instrumentIds = new Set(instrumentRows.map((instrument) => instrument.id));
  // Decisions and distributions reference an instrument, so scoping them by the
  // trust's own instrument set keeps another trust's records out of this view.
  const scopedDecisions = decisionRows.filter((decisionRow) =>
    instrumentIds.has(decisionRow.instrumentId),
  );
  const scopedDistributions = distributionRows.filter((distribution) =>
    instrumentIds.has(distribution.instrumentId),
  );

  const provisions = instrumentIds.size
    ? await db
        .select()
        .from(trustProvisions)
        .where(
          and(
            inArray(trustProvisions.instrumentId, [...instrumentIds]),
            inArray(trustProvisions.tenantId, scope),
            inArray(trustProvisions.classification, allowedClassifications),
          ),
        )
    : [];

  const trusteeBody =
    bodyRows.find((body) => body.code === TRUSTEE_BODY_CODE) ?? bodyRows[0] ?? null;

  const visibleEntityIds = new Set(entities.map((entity) => entity.id));

  return buildTrusteeCommandModel({
    now: new Date(),
    trust: {
      id: trust.id,
      code: trust.code,
      legalName: trust.legalName,
      entityType: trust.entityType,
      countryCode: trust.countryCode,
      status: trust.status,
      functionalCurrency: trust.functionalCurrency,
      jurisdictions: [...new Set(
        entities
          .filter((entity) => entity.jurisdictionId && visibleEntityIds.has(entity.id))
          .map((entity) => entity.jurisdictionId as string),
      )],
    },
    appointments: appointmentRows,
    body: trusteeBody
      ? {
          code: trusteeBody.code,
          quorumMinimum: trusteeBody.quorumMinimum,
          majorityRule: trusteeBody.majorityRule,
        }
      : null,
    declaredReservedMatters: trusteeBody?.reservedMatters ?? [],
    decisions: scopedDecisions.map((decisionRow) => ({
      decisionType: decisionRow.decisionType,
      status: decisionRow.status,
    })),
    instruments: instrumentRows.map((instrument) => ({
      id: instrument.id,
      instrumentName: instrument.instrumentName,
      instrumentType: instrument.instrumentType,
      version: instrument.version,
      status: instrument.status,
      legalReviewStatus: instrument.legalReviewStatus,
      effectiveDate: instrument.effectiveDate,
    })),
    provisions: provisions.map((provision) => ({
      provisionType: provision.provisionType,
      legalEffectStatus: provision.legalEffectStatus,
      legalEffectReference: provision.legalEffectReference,
      enforceabilityAssumed: provision.enforceabilityAssumed,
    })),
    distributions: scopedDistributions.map((distribution) => ({
      distributionType: distribution.distributionType,
      status: distribution.status,
      amount: distribution.amount,
      currency: distribution.currency,
      financeRecordRef: distribution.financeRecordRef,
    })),
    entities: entities.map((entity) => ({
      id: entity.id,
      code: entity.code,
      legalName: entity.legalName,
      entityType: entity.entityType,
      parentEntityId: entity.parentEntityId,
      countryCode: entity.countryCode,
      status: entity.status,
    })),
    posting,
  });
}

export { TRUSTEE_COMMAND_BOUNDARY };
export type { TrusteeCommandModel };
