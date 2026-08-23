import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { capitalRequests, governanceBodies, legalEntities } from "@/db/schema";
import { can, type Principal } from "./authz";
import { evaluatePolicy } from "./policy";
import { withAuditTransaction } from "./audit";
import { assertWithinScope, tenantScopeIds, TenantIsolationError } from "./tenant-scope";
import { classificationRank, type Classification } from "./constants";
import { GovernanceError } from "./governance";
import { getGovernanceDecisionAuthorization } from "./governance-authorization";

/**
 * BEYU OS — CAPITAL REQUEST GOVERNANCE AUTHORIZATION.
 *
 * The first REAL downstream consumer of a governed decision: it transitions a
 * capital request to `GOVERNANCE_AUTHORIZED` once — and only once — an APPROVED
 * governance resolution authorises it.
 *
 * ============================ WHAT THIS IS NOT ============================
 *
 * GOVERNANCE AUTHORIZED  !=  CAPITAL APPROVED
 * GOVERNANCE AUTHORIZED  !=  EXECUTED
 * GOVERNANCE AUTHORIZED  !=  FUNDED
 *
 * This transition moves no money, posts no journal entry, creates no ledger
 * record, issues no treasury instruction and calls no external system. It
 * records exactly one fact:
 *
 *     "This capital request has satisfied its governance prerequisite."
 *
 * Execution remains a separate authority and a future phase.
 *
 * ========================== SINGLE SOURCE OF TRUTH =========================
 *
 * The question "does this resolution constitute an approved governance
 * decision?" is answered ONLY by `getGovernanceDecisionAuthorization()`. This
 * service never re-derives governance state, never inspects resolution status
 * directly, and never accepts a client-supplied authorization claim.
 */

/**
 * Capital lifecycle states.
 *
 * `capital_requests.status` is free text in the schema, documented as
 * `DRAFT | SUBMITTED | UNDER_REVIEW | APPROVED | REJECTED | FUNDED`. No enum
 * exists, so representing the governance prerequisite needs no migration.
 *
 * `GOVERNANCE_AUTHORIZED` is added because no existing status expresses it:
 *  - SUBMITTED / UNDER_REVIEW precede governance and say nothing about it;
 *  - APPROVED is the CAPITAL domain's own approval — a different authority, and
 *    reusing it would collapse governance approval into capital approval;
 *  - FUNDED implies money has moved, which is precisely what has NOT happened.
 */
export const CAPITAL_STATUS = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  UNDER_REVIEW: "UNDER_REVIEW",
  GOVERNANCE_AUTHORIZED: "GOVERNANCE_AUTHORIZED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  FUNDED: "FUNDED",
} as const;

/**
 * States from which the governance prerequisite may be recorded.
 *
 * A request must be genuinely awaiting governance. Terminal or post-governance
 * states are refused rather than silently re-authorised.
 */
export const GOVERNANCE_AUTHORIZABLE_STATUSES = [
  CAPITAL_STATUS.SUBMITTED,
  CAPITAL_STATUS.UNDER_REVIEW,
] as const;

export type AuthorizeCapitalInput = {
  capitalRequestId: string;
  /** Free-text note. Metadata only — it can never affect the outcome. */
  note?: string | null;
};

export type MutationContext = {
  traceId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type CapitalGovernanceResult = {
  capitalRequestId: string;
  code: string;
  previousStatus: string;
  status: string;
  /** Governance provenance — the canonical source remains the resolution. */
  resolutionId: string;
  resolutionReference: string;
  governanceBodyCode: string;
  decision: string;
  decidedAt: string | null;
  decidedBy: string | null;
  /** Explicit, so no caller can mistake this for execution. */
  executed: false;
};

/**
 * Is `entityId` the governing entity or one of its descendants?
 *
 * Governance bodies sit at holding/trust entities while capital is raised at
 * operating subsidiaries: the seeded Investment Committee governs
 * `LEN_BEYU_HOLDINGS`, yet authorises capital for `LEN_BEYU_HEALTH_LTD`
 * (Health → TZ Holding → Holdings). Requiring entity EQUALITY would therefore
 * reject the canonical example, so the rule is ANCESTRY: a body governs its own
 * entity and everything beneath it in the ownership chain.
 *
 * A body with no entity (`legal_entity_id` null) is enterprise-wide and governs
 * anything within its tenant scope.
 */
async function entityWithinGovernanceReach(
  governingEntityId: string | null,
  capitalEntityId: string,
): Promise<boolean> {
  if (!governingEntityId) return true;
  if (governingEntityId === capitalEntityId) return true;

  const rows = await db
    .select({ id: legalEntities.id, parent: legalEntities.parentEntityId })
    .from(legalEntities);

  const parentOf = new Map(rows.map((r) => [r.id, r.parent]));
  let cursor: string | null | undefined = parentOf.get(capitalEntityId);
  const seen = new Set<string>([capitalEntityId]);

  while (cursor && !seen.has(cursor)) {
    if (cursor === governingEntityId) return true;
    seen.add(cursor);
    cursor = parentOf.get(cursor);
  }
  return false;
}

/**
 * Record that a capital request has satisfied its governance prerequisite.
 *
 * Pipeline: validate → authenticate (caller) → tenant scope → RBAC → ABAC →
 * classification → policy → domain state → GOVERNANCE AUTHORIZATION →
 * transaction → mutation → audit → durable event → commit.
 */
export async function authorizeCapitalRequestGovernance(
  principal: Principal,
  input: AuthorizeCapitalInput,
  context: MutationContext,
): Promise<CapitalGovernanceResult> {
  const scope = await tenantScopeIds(principal);

  /* ---- LOAD, STRICTLY WITHIN TENANT SCOPE (non-enumerating) ------------ */
  const [request] = await db
    .select()
    .from(capitalRequests)
    .where(and(eq(capitalRequests.id, input.capitalRequestId), inArray(capitalRequests.tenantId, scope)))
    .limit(1);

  if (!request) {
    throw new GovernanceError("NOT_FOUND", "Capital request not found within your authorised scope.");
  }

  /* ---- RBAC + ABAC (entity scope) -------------------------------------- */
  const decision = can(principal, "finance:capital.manage", {
    tenantId: request.tenantId,
    entityId: request.legalEntityId,
  });
  if (!decision.allowed) {
    throw new GovernanceError("FORBIDDEN", decision.reason);
  }

  /* ---- POLICY HIERARCHY (DENY is final) -------------------------------- */
  const [entity] = await db
    .select()
    .from(legalEntities)
    .where(eq(legalEntities.id, request.legalEntityId))
    .limit(1);

  const policy = await evaluatePolicy({
    action: "finance:capital.manage",
    tenantId: request.tenantId,
    roles: principal.roles,
    amount: Number(request.amount),
    jurisdictionCode: entity?.countryCode,
    riskScore: principal.riskScore,
    aiInitiated: false,
  });
  if (policy.effect === "DENY") {
    throw new GovernanceError(
      "POLICY_DENIED",
      policy.denials.map((d) => d.message).join(" ") ||
        "Denied by policy (capital governance authorization).",
      { denials: policy.denials },
    );
  }

  /* ---- DOMAIN STATE PRE-CHECK (re-checked inside the transaction) ------ */
  assertAuthorizableStatus(request.status);

  /* ---- GOVERNANCE LINKAGE ---------------------------------------------- */
  if (!request.resolutionId) {
    throw new GovernanceError(
      "GOVERNANCE_NOT_SATISFIED",
      "No governance resolution is linked to this capital request.",
    );
  }

  try {
    await assertWithinScope(principal, request.tenantId);
  } catch (err) {
    if (err instanceof TenantIsolationError) {
      throw new GovernanceError("TENANT_SCOPE_DENIED", err.message);
    }
    throw err;
  }

  /**
   * THE GOVERNANCE PREREQUISITE.
   *
   * Delegated wholly to the canonical governance authorization service: this
   * service does not reimplement the rule, and cannot be satisfied by any
   * client-supplied value.
   */
  const authorization = await getGovernanceDecisionAuthorization(
    principal,
    "CAPITAL_REQUEST",
    request.id,
  );

  if (!authorization.authorized) {
    throw new GovernanceError("GOVERNANCE_NOT_SATISFIED", authorization.reason, {
      resolutionId: authorization.resolutionId,
      decision: authorization.decision,
    });
  }

  /**
   * Only a GOVERNED decision may authorise a real domain transition. Seeded
   * REFERENCE_DATA has no audit-ledger provenance, so it cannot prove that a
   * governed transaction ever took place; treating it as authority would let
   * unaudited fixture data move the enterprise.
   */
  if (authorization.provenance !== "GOVERNED") {
    throw new GovernanceError(
      "GOVERNANCE_NOT_SATISFIED",
      "The linked resolution has no governed provenance in the audit ledger and cannot authorise a capital transition.",
      { provenance: authorization.provenance },
    );
  }

  /* ---- LINKAGE INTEGRITY ------------------------------------------------ */
  if (authorization.tenantId !== request.tenantId) {
    // Should be unreachable: both were scoped. Fail closed regardless.
    throw new GovernanceError(
      "GOVERNANCE_NOT_SATISFIED",
      "The governing resolution belongs to a different tenant.",
    );
  }

  /**
   * The GOVERNING entity is the body's, not the object's.
   *
   * `authorization.entityId` describes the object being inspected (here the
   * capital request itself), so comparing it to the request's entity would
   * compare a value with itself and always pass. The governing entity must be
   * read from the governance body that took the decision.
   */
  const [governingBody] = await db
    .select({ legalEntityId: governanceBodies.legalEntityId })
    .from(governanceBodies)
    .where(eq(governanceBodies.id, authorization.governanceBodyId!))
    .limit(1);

  const reachable = await entityWithinGovernanceReach(
    governingBody?.legalEntityId ?? null,
    request.legalEntityId,
  );
  if (!reachable) {
    throw new GovernanceError(
      "GOVERNANCE_NOT_SATISFIED",
      "The governing body does not have authority over this capital request's legal entity.",
      { governingEntityId: governingBody?.legalEntityId ?? null, capitalEntityId: request.legalEntityId },
    );
  }

  /* ---- MUTATE + AUDIT + DURABLE EVENT, ATOMICALLY ---------------------- */
  return withAuditTransaction(
    async (tx) => {
      // Serialise concurrent authorization attempts on this request.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`beyu:capital-governance:${request.id}`}))`,
      );

      // Re-read inside the lock: nothing loaded before BEGIN is trusted.
      const [current] = await tx
        .select()
        .from(capitalRequests)
        .where(eq(capitalRequests.id, request.id))
        .limit(1);

      if (!current) {
        throw new GovernanceError("NOT_FOUND", "Capital request not found within your authorised scope.");
      }
      assertAuthorizableStatus(current.status);

      // Guarded on the authorizable statuses so two concurrent attempts cannot
      // both apply; the loser sees zero rows and reports a conflict.
      const [updated] = await tx
        .update(capitalRequests)
        .set({ status: CAPITAL_STATUS.GOVERNANCE_AUTHORIZED })
        .where(
          and(
            eq(capitalRequests.id, request.id),
            inArray(capitalRequests.status, [...GOVERNANCE_AUTHORIZABLE_STATUSES]),
          ),
        )
        .returning();

      if (!updated) {
        throw new GovernanceError(
          "CONFLICT",
          "The capital request was authorized concurrently. Reload and retry.",
        );
      }

      return {
        capitalRequestId: updated.id,
        code: updated.code,
        previousStatus: current.status,
        status: updated.status,
        resolutionId: authorization.resolutionId!,
        resolutionReference: authorization.reference!,
        governanceBodyCode: authorization.governanceBodyCode!,
        decision: authorization.decision!,
        decidedAt: authorization.decidedAt,
        decidedBy: authorization.decidedBy,
        executed: false as const,
      } satisfies CapitalGovernanceResult;
    },
    (result) => ({
      tenantId: request.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "finance.capital.governance_authorize",
      objectType: "CAPITAL_REQUEST",
      objectId: result.capitalRequestId,
      outcome: "SUCCESS" as const,
      reason:
        `Capital request ${result.code} satisfied its governance prerequisite under ` +
        `${result.resolutionReference} (${result.governanceBodyCode}). ` +
        `No capital was executed, released or posted.` +
        (input.note ? ` Note: ${input.note}` : ""),
      authority: "finance:capital.manage",
      approvalRef: result.resolutionId,
      policyVersion:
        policy.appliedPolicies.map((p) => `${p.code}@${p.version}`).join(",") || undefined,
      oldValue: { status: result.previousStatus },
      newValue: {
        status: result.status,
        resolutionId: result.resolutionId,
        resolutionReference: result.resolutionReference,
        governanceBodyCode: result.governanceBodyCode,
        decidedAt: result.decidedAt,
        decidedBy: result.decidedBy,
        executed: false,
        note: input.note ?? null,
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    /**
     * Durable domain event, appended INSIDE the transaction.
     *
     * Named for what it means. It is deliberately NOT `CAPITAL_REQUEST_APPROVED`
     * (capital's own authority) and NOT an execution or treasury event: those
     * are different authorities and must not be conflated.
     */
    (result) => ({
      type: "CAPITAL_REQUEST_GOVERNANCE_AUTHORIZED",
      source: "beyu-os/finance",
      tenantId: request.tenantId,
      subjectType: "CAPITAL_REQUEST",
      subjectId: result.capitalRequestId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      classification: (request.sectorCode ? "RESTRICTED" : "RESTRICTED") as Classification,
      payload: {
        code: result.code,
        previousStatus: result.previousStatus,
        status: result.status,
        amount: request.amount,
        currency: request.currency,
        legalEntityId: request.legalEntityId,
        // Governance provenance by reference; the resolution remains canonical.
        resolutionId: result.resolutionId,
        resolutionReference: result.resolutionReference,
        governanceBodyCode: result.governanceBodyCode,
        decision: result.decision,
        decidedAt: result.decidedAt,
        decidedBy: result.decidedBy,
        executed: false,
      },
      traceId: context.traceId,
    }),
  );
}

/** Reject any state that is not genuinely awaiting governance. */
function assertAuthorizableStatus(status: string): void {
  if ((GOVERNANCE_AUTHORIZABLE_STATUSES as readonly string[]).includes(status)) return;

  if (status === CAPITAL_STATUS.GOVERNANCE_AUTHORIZED) {
    throw new GovernanceError(
      "ALREADY_DECIDED",
      "This capital request has already satisfied its governance prerequisite.",
      { status },
    );
  }
  throw new GovernanceError(
    "INVALID_CAPITAL_STATE",
    `A ${status} capital request cannot be governance-authorized.`,
    { status },
  );
}

/**
 * Read model: does this capital request still need its governance prerequisite?
 *
 * A UI convenience only — the service re-verifies everything. Deliberately does
 * not report WHY for out-of-scope requests.
 */
export async function capitalRequestsAwaitingGovernance(
  principal: Principal,
  capitalRequestIds: string[],
): Promise<Set<string>> {
  const pending = new Set<string>();
  if (capitalRequestIds.length === 0) return pending;
  if (!can(principal, "finance:capital.manage").allowed) return pending;

  const scope = await tenantScopeIds(principal);
  const rows = await db
    .select({ id: capitalRequests.id, status: capitalRequests.status, resolutionId: capitalRequests.resolutionId })
    .from(capitalRequests)
    .where(
      and(
        inArray(capitalRequests.id, capitalRequestIds),
        inArray(capitalRequests.tenantId, scope),
        inArray(capitalRequests.status, [...GOVERNANCE_AUTHORIZABLE_STATUSES]),
      ),
    );

  for (const r of rows) if (r.resolutionId) pending.add(r.id);
  return pending;
}
