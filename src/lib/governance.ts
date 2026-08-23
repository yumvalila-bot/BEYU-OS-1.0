import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { capitalRequests, governanceBodies, policies, resolutions } from "@/db/schema";
import { can, type Principal } from "./authz";
import { evaluatePolicy, type PolicyObligation } from "./policy";
import { withAuditTransaction } from "./audit";
import { assertWithinScope, tenantScopeIds, TenantIsolationError } from "./tenant-scope";
import { newId, ID_PREFIX } from "./ids";
import { classificationRank, type Classification } from "./constants";
import {
  checkBodyCompetence,
  requiresReservedMatterTreatment,
  type MatterTrigger,
} from "./governance/reserved-matters";

/**
 * BEYU OS — Governance domain service.
 *
 * This module implements the CANONICAL GOVERNED MUTATION PATTERN. Every future
 * BEYU OS domain write (Finance, HCM, Capital, Documents, Sector OSs) must follow
 * the same ordering and reuse the same kernel services rather than reimplementing
 * them:
 *
 *   VALIDATE → AUTHENTICATE → SCOPE → AUTHORIZE (RBAC) → AUTHORIZE (ABAC /
 *   classification) → POLICY (DENY-final) → BUSINESS RULES → MUTATE → AUDIT →
 *   EVENT → ATOMIC COMMIT
 *
 * Kernel services consumed (never duplicated):
 *   - authentication / principal ....... lib/session.ts via lib/api.ts `guarded`
 *   - RBAC + ABAC ...................... lib/authz.ts `can`
 *   - tenant isolation ................. lib/tenant-scope.ts `tenantScopeIds`
 *   - policy hierarchy (DENY final) .... lib/policy.ts `evaluatePolicy`
 *   - hash-chained audit + events ...... lib/audit.ts `withAuditTransaction`
 *
 * Lifecycle integrity: this service PROPOSES only. It creates a resolution in the
 * initial lifecycle state and can never produce an approved, voted or otherwise
 * decided resolution. Voting and approval are separate governed mutations that do
 * not exist yet.
 */

/**
 * The initial lifecycle state of a newly proposed resolution.
 *
 * `beyu_decision_status` (drizzle/schema/enums.ts) defines the canonical decision
 * lifecycle as DRAFT → TABLED → VOTED → APPROVED | REJECTED | WITHDRAWN | DEFERRED.
 * DRAFT is this system's "proposed" state — the entry point of the lifecycle. A new
 * enum value is deliberately NOT introduced: the existing lifecycle already models
 * proposal, and adding a parallel state would fragment the decision model.
 */
export const INITIAL_RESOLUTION_STATUS = "DRAFT" as const;

/** Lifecycle states this service must never be able to produce. */
export const NON_PROPOSABLE_STATUSES = [
  "TABLED",
  "VOTED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
  "DEFERRED",
] as const;

export const RESOLUTION_CATEGORIES = [
  "RESERVED_MATTER",
  "CAPITAL",
  "POLICY",
  "APPOINTMENT",
  "TAX",
  "RISK",
  "OTHER",
] as const;

export type ResolutionCategory = (typeof RESOLUTION_CATEGORIES)[number];

/** Failure taxonomy. Maps to transport status codes at the API boundary. */
export type GovernanceErrorCode =
  | "NOT_FOUND"
  | "TENANT_SCOPE_DENIED"
  | "FORBIDDEN"
  | "CLASSIFICATION_DENIED"
  | "POLICY_DENIED"
  | "RULE_VIOLATION"
  | "CONFLICT"
  /** Closure attempted before voting has legitimately concluded. */
  | "NOT_READY_FOR_DECISION"
  /** Closure attempted on a resolution already in a terminal state. */
  | "ALREADY_DECIDED"
  /** A downstream domain action lacks its governance prerequisite. */
  | "GOVERNANCE_NOT_SATISFIED"
  /** The domain object is in a state that cannot accept the transition. */
  | "INVALID_CAPITAL_STATE";

/**
 * Canonical transport mapping for the governance failure taxonomy.
 *
 * Defined once so every governance route reports the same status for the same
 * governance failure, and so adding a code cannot leave a route silently
 * returning `undefined` as its HTTP status.
 */
export const GOVERNANCE_ERROR_STATUS: Record<GovernanceErrorCode, number> = {
  NOT_FOUND: 404,
  TENANT_SCOPE_DENIED: 403,
  FORBIDDEN: 403,
  CLASSIFICATION_DENIED: 403,
  POLICY_DENIED: 403,
  RULE_VIOLATION: 422,
  CONFLICT: 409,
  NOT_READY_FOR_DECISION: 422,
  ALREADY_DECIDED: 409,
  GOVERNANCE_NOT_SATISFIED: 422,
  INVALID_CAPITAL_STATE: 422,
};

export class GovernanceError extends Error {
  constructor(
    readonly code: GovernanceErrorCode,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "GovernanceError";
  }
}

/**
 * Client-supplied proposal payload.
 *
 * Deliberately absent — these are DERIVED from trusted server state and can never
 * be supplied by a caller:
 *   tenantId, proposedBy/actor, reference, status, requiredMajority, quorumMet,
 *   votesFor/Against/Abstain, decisionDate, createdAt.
 */
export type ProposeResolutionInput = {
  bodyId: string;
  title: string;
  category: ResolutionCategory;
  summary: string;
  rationale: string;
  dataBasis: string;
  consequences: string;
  classification: Classification;
  authorityPolicyId?: string | null;
  linkedObjectType?: string | null;
  linkedObjectId?: string | null;
  /**
   * Monetary amount of the operation, when known. Required to evaluate
   * `CAPITAL>N` reserved matters. Omitting it does NOT escape a monetary
   * reservation — the reserved-matters engine fails closed.
   */
  amount?: number | null;
  /**
   * Which reserved-matter trigger this proposal engages. Inferred as
   * CAPITAL_ALLOCATION when category is CAPITAL. Other mappings are not
   * inferred — that would invent law.
   */
  matterTrigger?: MatterTrigger | null;
};

export type ProposeResolutionContext = {
  traceId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type ProposedResolution = {
  id: string;
  reference: string;
  status: typeof INITIAL_RESOLUTION_STATUS;
  tenantId: string;
  bodyId: string;
  bodyName: string;
  title: string;
  category: ResolutionCategory;
  classification: Classification;
  requiredMajority: string;
  proposedBy: string;
  proposedByUserId: string;
  quorumMet: boolean;
  createdAt: string;
  obligations: PolicyObligation[];
  appliedPolicies: { code: string; version: string; level: string }[];
};

/**
 * Resolve the governance role the principal is acting under.
 *
 * Derived from the authenticated session's role grants — never from the request
 * body. `resolutions.proposed_by` records the governing role (consistent with the
 * existing decision record), while the acting user identity is captured in the
 * immutable audit ledger and the domain event.
 */
function proposingRole(principal: Principal): string {
  const governing = principal.roles.find((role) =>
    ["CHIEF_GOVERNANCE_OFFICER", "GROUP_CEO", "GROUP_CFO", "FAMILY_OFFICE_PRINCIPAL"].includes(role),
  );
  return governing ?? principal.roles[0] ?? "UNASSIGNED";
}

/**
 * Allocate the next human-readable reference: <BODY_CODE>-<YEAR>-<NNN>.
 *
 * A transaction-scoped advisory lock keyed on the body+year serialises allocation
 * so concurrent proposals to the same body receive consecutive numbers instead of
 * colliding. The unique index on resolutions.reference remains the storage-level
 * backstop (surfaced as a retryable CONFLICT).
 *
 * The trailing counter is extracted with a regex rather than substring(): the
 * positional form `substring(x from N)` requires an integer, and passing a bind
 * parameter makes PostgreSQL resolve the SQL-regex overload instead, which
 * silently yields NULL.
 */
async function nextReference(
  tx: { execute: typeof db.execute },
  bodyCode: string,
  year: number,
): Promise<string> {
  const prefix = `${bodyCode}-${year}-`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`beyu:resolution-ref:${prefix}`}))`);
  const result = await tx.execute<{ max_seq: string | null }>(sql`
    select max((regexp_match(reference, '([0-9]+)$'))[1]::int)::text as max_seq
    from resolutions
    where reference like ${`${prefix}%`}
  `);
  const next = Number(result.rows[0]?.max_seq ?? 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

/**
 * Infer a reserved-matter trigger from the proposal.
 *
 * CAPITAL → CAPITAL_ALLOCATION is the only inference: the ratified reserved
 * strings are written `CAPITAL>N`. Mapping POLICY → POLICY_CONSTITUTION or
 * TAX → AGGRESSIVE_TAX_POSITION would invent law — those require an explicit
 * matterTrigger from the caller.
 */
export function inferMatterTrigger(
  category: ResolutionCategory,
  matterTrigger?: MatterTrigger | null,
): MatterTrigger | null {
  if (matterTrigger) return matterTrigger;
  if (category === "CAPITAL") return "CAPITAL_ALLOCATION";
  return null;
}

async function resolveProposalAmount(input: ProposeResolutionInput): Promise<number | null> {
  if (typeof input.amount === "number" && Number.isFinite(input.amount)) return input.amount;
  if (input.linkedObjectType === "CAPITAL_REQUEST" && input.linkedObjectId) {
    const [req] = await db
      .select({ amount: capitalRequests.amount })
      .from(capitalRequests)
      .where(eq(capitalRequests.id, input.linkedObjectId))
      .limit(1);
    if (req?.amount != null) {
      const n = Number(req.amount);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

/**
 * Propose a governance resolution.
 *
 * The caller MUST already be authenticated; `principal` is the server-resolved
 * session identity (see lib/api.ts `guarded`). Every field written to the database
 * is either validated client input or derived from trusted server state.
 */
export async function proposeResolution(
  principal: Principal,
  input: ProposeResolutionInput,
  context: ProposeResolutionContext,
): Promise<ProposedResolution> {
  /* ---- 1. TENANT SCOPE ------------------------------------------------
   * The governing body is located strictly inside the principal's canonical
   * tenant scope. A forged bodyId belonging to another tenant resolves to
   * nothing and is rejected — the tenant is never taken from the request. */
  const scope = await tenantScopeIds(principal);
  const [governingBody] = await db
    .select()
    .from(governanceBodies)
    .where(and(eq(governanceBodies.id, input.bodyId), inArray(governanceBodies.tenantId, scope)))
    .limit(1);

  if (!governingBody) {
    // Deliberately indistinguishable from "does not exist": an out-of-scope body
    // must not be confirmed to exist (prevents cross-tenant enumeration / IDOR).
    throw new GovernanceError("NOT_FOUND", "Governance body not found within your authorised scope.");
  }
  if (governingBody.status !== "ACTIVE") {
    throw new GovernanceError(
      "RULE_VIOLATION",
      "Resolutions may only be proposed to an ACTIVE governance body.",
      { bodyStatus: governingBody.status },
    );
  }

  /* ---- 2. ABAC: classification ceiling, tenant, entity -----------------
   * RBAC for governance:resolution.propose is already enforced by the API guard.
   * Re-evaluated here WITH data context so the service is safe for any caller. */
  const decision = can(principal, "governance:resolution.propose", {
    classification: input.classification,
    tenantId: governingBody.tenantId,
    entityId: governingBody.legalEntityId ?? undefined,
  });
  if (!decision.allowed) {
    const code: GovernanceErrorCode =
      classificationRank(input.classification) > classificationRank(principal.clearance)
        ? "CLASSIFICATION_DENIED"
        : "FORBIDDEN";
    throw new GovernanceError(code, decision.reason);
  }

  /* ---- 3. POLICY HIERARCHY (DENY is final) ---------------------------- */
  const policy = await evaluatePolicy({
    action: "governance:resolution.propose",
    tenantId: governingBody.tenantId,
    roles: principal.roles,
    classification: input.classification,
    riskScore: principal.riskScore,
    aiInitiated: false,
  });
  if (policy.effect === "DENY") {
    throw new GovernanceError(
      "POLICY_DENIED",
      policy.denials.map((d) => d.message).join(" ") || "Denied by governance policy.",
      { denials: policy.denials },
    );
  }

  /* ---- 4. GOVERNANCE BUSINESS RULES ----------------------------------- */
  if (input.authorityPolicyId) {
    const [authority] = await db
      .select({ id: policies.id, status: policies.status })
      .from(policies)
      .where(eq(policies.id, input.authorityPolicyId))
      .limit(1);
    if (!authority) {
      throw new GovernanceError("NOT_FOUND", "The cited authority policy does not exist.");
    }
    if (authority.status !== "ACTIVE") {
      throw new GovernanceError(
        "RULE_VIOLATION",
        "A resolution may only cite an ACTIVE policy as its authority.",
      );
    }
  }
  if (input.linkedObjectType && !input.linkedObjectId) {
    throw new GovernanceError("RULE_VIOLATION", "A linked object type requires a linked object id.");
  }
  if (input.category === "RESERVED_MATTER" && governingBody.reservedMatters.length === 0) {
    throw new GovernanceError(
      "RULE_VIOLATION",
      "This body has no reserved matters; the proposal cannot be categorised as a reserved matter.",
    );
  }

  /* ---- 4b. RESERVED-MATTER COMPETENCE (Phase 9 integration) --------------
   * The reserved-matters engine existed and was tested in isolation. A capital
   * allocation of 5,000,000 categorised CAPITAL (not RESERVED_MATTER) still
   * passed this service. The engine is now the API-boundary control. */
  const trigger = inferMatterTrigger(input.category, input.matterTrigger);
  if (trigger) {
    const amount = await resolveProposalAmount(input);
    const treatment = await requiresReservedMatterTreatment({
      trigger,
      amount,
      declaredCategory: input.category,
    });
    if (treatment.decision === "MISCATEGORISED_RESERVED_MATTER") {
      throw new GovernanceError("RULE_VIOLATION", treatment.reason, {
        competentBodies: treatment.competentBodies,
      });
    }
    const competence = await checkBodyCompetence({
      bodyId: governingBody.id,
      trigger,
      amount,
    });
    if (
      competence.decision === "RESERVED_MATTER_BYPASS" ||
      competence.decision === "BODY_NOT_FOUND" ||
      competence.decision === "UNPARSEABLE_MATTER"
    ) {
      throw new GovernanceError("RULE_VIOLATION", competence.reason, {
        decision: competence.decision,
        competentBodies: competence.competentBodies,
      });
    }
  }

  /* ---- 5. WRITE-PATH TENANT INVARIANT ---------------------------------
   * The body was already located inside the principal's scope, so this can only
   * fire if that query is ever refactored incorrectly. Asserting immediately
   * before the mutation converts a silent cross-tenant write into a hard failure. */
  try {
    await assertWithinScope(principal, governingBody.tenantId);
  } catch (err) {
    if (err instanceof TenantIsolationError) {
      throw new GovernanceError("TENANT_SCOPE_DENIED", err.message);
    }
    throw err;
  }

  /* ---- 6–9. MUTATE + AUDIT + EVENT, ATOMICALLY ------------------------
   * A single database transaction. If the audit append or the event append
   * fails, the resolution insert is rolled back with it. */
  const year = new Date().getUTCFullYear();
  const actingRole = proposingRole(principal);

  try {
    return await withAuditTransaction(
      async (tx) => {
        const reference = await nextReference(tx as { execute: typeof db.execute }, governingBody.code, year);
        const id = newId(ID_PREFIX.resolution);

        const [row] = await tx
          .insert(resolutions)
          .values({
            id,
            // Server-derived, never client-supplied:
            tenantId: governingBody.tenantId,
            bodyId: governingBody.id,
            reference,
            proposedBy: actingRole,
            status: INITIAL_RESOLUTION_STATUS,
            requiredMajority: governingBody.majorityRule,
            quorumMet: false,
            votesFor: 0,
            votesAgainst: 0,
            votesAbstain: 0,
            decisionDate: null,
            // Validated client input:
            title: input.title,
            category: input.category,
            summary: input.summary,
            rationale: input.rationale,
            dataBasis: input.dataBasis,
            consequences: input.consequences,
            classification: input.classification,
            authorityPolicyId: input.authorityPolicyId ?? null,
            linkedObjectType: input.linkedObjectType ?? null,
            linkedObjectId: input.linkedObjectId ?? null,
          })
          .returning();

        return {
          id: row.id,
          reference: row.reference,
          status: INITIAL_RESOLUTION_STATUS,
          tenantId: row.tenantId,
          bodyId: row.bodyId,
          bodyName: governingBody.name,
          title: row.title,
          category: row.category as ResolutionCategory,
          classification: row.classification as Classification,
          requiredMajority: row.requiredMajority,
          proposedBy: row.proposedBy,
          proposedByUserId: principal.userId,
          quorumMet: row.quorumMet,
          createdAt: row.createdAt.toISOString(),
          obligations: policy.obligations,
          appliedPolicies: policy.appliedPolicies,
        } satisfies ProposedResolution;
      },
      (result) => ({
        tenantId: result.tenantId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        action: "governance.resolution.propose",
        objectType: "RESOLUTION",
        objectId: result.id,
        outcome: "SUCCESS" as const,
        reason: `Resolution ${result.reference} proposed to ${governingBody.name}`,
        authority: "governance:resolution.propose",
        policyVersion:
          policy.appliedPolicies.map((p) => `${p.code}@${p.version}`).join(",") || undefined,
        oldValue: null,
        newValue: {
          reference: result.reference,
          bodyId: result.bodyId,
          title: result.title,
          category: result.category,
          classification: result.classification,
          status: result.status,
          requiredMajority: result.requiredMajority,
          proposedBy: result.proposedBy,
          proposedByUserId: principal.userId,
          obligations: policy.obligations.map((o) => `${o.type}:${o.approverRole ?? "-"}`),
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        traceId: context.traceId,
      }),
      (result) => ({
        type: "GOVERNANCE_RESOLUTION_PROPOSED",
        source: "beyu-os/governance",
        tenantId: result.tenantId,
        subjectType: "RESOLUTION",
        subjectId: result.id,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        classification: result.classification,
        payload: {
          reference: result.reference,
          bodyId: result.bodyId,
          bodyCode: governingBody.code,
          title: result.title,
          category: result.category,
          status: result.status,
          requiredMajority: result.requiredMajority,
          quorumMet: result.quorumMet,
          proposedBy: result.proposedBy,
        },
        traceId: context.traceId,
      }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new GovernanceError(
        "CONFLICT",
        "A concurrent proposal claimed the same reference. Retry the request.",
      );
    }
    if (err instanceof TenantIsolationError) {
      // Surfaced as an authorisation failure, never as an internal error.
      throw new GovernanceError("TENANT_SCOPE_DENIED", err.message);
    }
    throw err;
  }
}
