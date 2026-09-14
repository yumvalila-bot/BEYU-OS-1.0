/**
 * BEYU OS — FOUNDER EQUITY / CAP TABLE / ESOP GOVERNED SERVICE (X10THINK Phase 2).
 *
 * Every write follows the CANONICAL GOVERNED MUTATION PATTERN established by
 * `src/lib/governance.ts` (VALIDATE → AUTHENTICATE → SCOPE → RBAC → ABAC →
 * POLICY(DENY-final) → BUSINESS RULES → MUTATE → AUDIT → EVENT → ATOMIC COMMIT)
 * and reuses the kernel services — never reimplements them:
 *
 *   - RBAC + ABAC ...................... lib/authz.ts `can`
 *   - tenant isolation ................. lib/tenant-scope.ts `tenantScopeIds` / `assertWithinScope`
 *   - policy hierarchy (DENY final) .... lib/policy.ts `evaluatePolicy`
 *   - hash-chained audit + events ...... lib/audit.ts `withAuditTransaction`
 *   - deterministic computation ........ lib/equity/model.ts (pure engine)
 *
 * ============================== WHAT THIS SERVICE IS NOT =======================
 *
 * - NOT a money mover: repurchase totals, exercise proceeds and payments are
 *   governed REFERENCES. `finance_record_ref` stays null until Finance OS
 *   records the movement; CAP_POSTING is never called (§22, §29).
 * - NOT an ownership-registry override: entity-level ownership truth remains
 *   `ownership_records` under `organization:ownership.manage`. Positions LINK
 *   to it (§7, §13).
 * - NOT a legal authority: vesting activation, leaver classification,
 *   change-of-control confirmation and ESOP activation all require a human
 *   legal-review closure input and, where governance is required, an APPROVED
 *   resolution. The service refuses to fabricate either (§48, §54).
 * - NOT an executor of scenarios: dilution scenarios are stored analysis with
 *   `execution_prohibited = true` (§14, §42).
 *
 * DENY IS FINAL. Every negative path throws a typed EquityError; routes map it
 * through EQUITY_ERROR_STATUS. Nothing here trusts a client-supplied status,
 * tenant, authorization claim or computed number.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  capTableSnapshots,
  changeOfControlEvents,
  dilutionScenarios,
  equityPositions,
  esopGrantEvents,
  esopGrants,
  esopPlans,
  leaverCases,
  legalEntities,
  resolutions,
  shareClasses,
  vestingEvents,
  vestingSchedules,
} from "@/db/schema";
import { can, type Principal } from "../authz";
import { evaluatePolicy, type PolicyEvaluation } from "../policy";
import { withAuditTransaction } from "../audit";
import { assertWithinScope, tenantScopeIds, TenantIsolationError } from "../tenant-scope";
import { classificationRank, type Classification } from "../constants";
import type { PermissionCode } from "../constants";
import { newId, ID_PREFIX } from "../ids";
import { EquityError } from "./errors";
import {
  ACCELERATION_POLICIES,
  computeAcceleration,
  computeCapTable,
  computeDilution,
  computeLeaverOutcome,
  computeVesting,
  vestingMilestones,
  assertIsoDate,
  isGoodLeaverCondition,
  isBadLeaverCondition,
  EquityModelError,
  type AccelerationPolicy,
  type DilutionScenarioType,
  type DilutionTransaction,
  type LeaverPolicy,
  type VestingFrequency,
  type VestingTerms,
} from "./model";

export type MutationContext = {
  traceId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/* ------------------------------------------------------------------ */
/* Shared governed-mutation scaffolding                                 */
/* ------------------------------------------------------------------ */

const EVENT_SOURCE = "beyu-os/equity";
const EVENT_DOMAIN = "CAPITAL";

const LEGAL_REVIEW_CLOSED = "LEGAL_REVIEW_CLOSED";
const LEGAL_REVIEW_REQUIRED = "REQUIRES_LEGAL_REVIEW";

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
    throw new EquityError(code, decision.reason);
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
    throw new EquityError(
      "POLICY_DENIED",
      policy.denials.map((d) => d.message).join(" ") || "Denied by governance policy.",
      { denials: policy.denials },
    );
  }
  return policy;
}

/** Locate a legal entity strictly inside the principal's tenant scope (non-enumerating). */
async function entityInScope(entityId: string, scope: string[]) {
  const [entity] = await db
    .select()
    .from(legalEntities)
    .where(and(eq(legalEntities.id, entityId), inArray(legalEntities.tenantId, scope)))
    .limit(1);
  if (!entity) {
    throw new EquityError("NOT_FOUND", "Legal entity not found within your authorised scope.");
  }
  return entity;
}

/**
 * Verify a governance resolution exists, is in scope and is APPROVED. Authority
 * is never taken from the client: the resolution row is the only proof (§16).
 */
async function requireApprovedResolution(resolutionId: string, scope: string[]) {
  const [resolution] = await db
    .select({ id: resolutions.id, status: resolutions.status, tenantId: resolutions.tenantId })
    .from(resolutions)
    .where(and(eq(resolutions.id, resolutionId), inArray(resolutions.tenantId, scope)))
    .limit(1);
  if (!resolution) {
    throw new EquityError("NOT_FOUND", "Cited resolution not found within your authorised scope.");
  }
  if (resolution.status !== "APPROVED") {
    throw new EquityError(
      "GOVERNANCE_NOT_SATISFIED",
      `Cited resolution is ${resolution.status}; an APPROVED resolution is required.`,
      { resolutionStatus: resolution.status },
    );
  }
  return resolution;
}

function wrapTenantScope(fn: () => Promise<void>): Promise<void> {
  return fn().catch((err) => {
    if (err instanceof TenantIsolationError) {
      throw new EquityError("TENANT_SCOPE_DENIED", err.message);
    }
    throw err;
  });
}

function wrapModel<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof EquityModelError) {
      throw new EquityError("MODEL_ERROR", err.message, { code: err.code });
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  // node-postgres reports 23505 on the error itself; drizzle may wrap the
  // driver error (DrizzleQueryError with `.cause`), so unwrap one level.
  const codeOf = (e: unknown): string | undefined =>
    typeof e === "object" && e !== null && "code" in e ? (e as { code?: string }).code : undefined;
  const cause = typeof err === "object" && err !== null && "cause" in err ? (err as { cause?: unknown }).cause : undefined;
  return codeOf(err) === "23505" || codeOf(cause) === "23505";
}

/* ------------------------------------------------------------------ */
/* §13 — Share classes and equity issuance                              */
/* ------------------------------------------------------------------ */

export type CreateShareClassInput = {
  legalEntityId: string;
  code: string;
  name: string;
  classType?: string;
  authorizedShares: number;
  votesPerShare?: string;
  rightsSummary?: string | null;
  instrumentDocumentRef?: string | null;
  approvalRef?: string | null;
  classification?: Classification;
};

export async function createShareClass(
  principal: Principal,
  input: CreateShareClassInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const entity = await entityInScope(input.legalEntityId, scope);
  const classification = input.classification ?? "RESTRICTED";
  const policy = await authorizeMutation(principal, "equity:cap-table.manage", {
    classification,
    tenantId: entity.tenantId,
    entityId: entity.id,
  });
  if (!Number.isInteger(input.authorizedShares) || input.authorizedShares < 0) {
    throw new EquityError("RULE_VIOLATION", "authorizedShares must be a non-negative integer.");
  }
  await wrapTenantScope(() => assertWithinScope(principal, entity.tenantId));

  try {
    return await withAuditTransaction(
      async (tx) => {
        const id = newId(ID_PREFIX.shareClass);
        const [row] = await tx
          .insert(shareClasses)
          .values({
            id,
            tenantId: entity.tenantId,
            legalEntityId: entity.id,
            code: input.code,
            name: input.name,
            classType: input.classType ?? "ORDINARY",
            authorizedShares: input.authorizedShares,
            issuedShares: 0,
            votesPerShare: input.votesPerShare ?? "1",
            rightsSummary: input.rightsSummary ?? null,
            instrumentDocumentRef: input.instrumentDocumentRef ?? null,
            approvalRef: input.approvalRef ?? null,
            status: "ACTIVE",
            recordedBy: principal.userId,
            classification,
          })
          .returning();
        return { id: row.id, code: row.code, tenantId: row.tenantId, classification };
      },
      (result) => ({
        tenantId: result.tenantId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        action: "equity.share-class.create",
        objectType: "SHARE_CLASS",
        objectId: result.id,
        outcome: "SUCCESS" as const,
        reason: `Share class ${result.code} created`,
        authority: "equity:cap-table.manage",
        policyVersion: policyVersionOf(policy) ?? undefined,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        traceId: context.traceId,
      }),
      (result) => ({
        type: "CAP_TABLE_CHANGED",
        source: EVENT_SOURCE,
        domain: EVENT_DOMAIN,
        operation: "CREATE_SHARE_CLASS",
        destinationDomain: null,
        tenantId: result.tenantId,
        legalEntityId: entity.id,
        subjectType: "SHARE_CLASS",
        subjectId: result.id,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        classification: result.classification,
        payload: { code: result.code, change: "SHARE_CLASS_CREATED" },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: {
          authorityId: null,
          decisionId: null,
          capabilityCode: null,
          permissionCode: "equity:cap-table.manage",
          policyVersion: policyVersionOf(policy),
        },
        policyVersion: policyVersionOf(policy),
      }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new EquityError("CONFLICT", "A share class with this code already exists for the entity.");
    }
    throw err;
  }
}

export type IssueEquityPositionInput = {
  legalEntityId: string;
  shareClassId: string;
  holderType: string; // FOUNDER | INVESTOR | ESOP_POOL | TREASURY | EMPLOYEE | TRUST | OTHER
  holderPartyId?: string | null;
  holderName: string;
  instrument?: string;
  totalShares: number;
  effectiveFrom: string;
  ownershipRecordId?: string | null;
  provenance: string;
  supportingDocumentId?: string | null;
  /** Issuance is governance-authorized: an APPROVED resolution is required (§13). */
  resolutionRef: string;
  approvalRef?: string | null;
  /** Optional vesting terms; when present a DRAFT schedule is created (see §9). */
  vesting?: {
    vestingMonths: number;
    cliffMonths: number;
    frequency?: VestingFrequency;
    startDate: string;
    accelerationPolicy?: AccelerationPolicy;
    accelerationPctMillionths?: number | null;
    documentRef?: string | null;
  } | null;
  classification?: Classification;
};

const HOLDER_TYPES = ["FOUNDER", "INVESTOR", "ESOP_POOL", "TREASURY", "EMPLOYEE", "TRUST", "OTHER"] as const;

export async function issueEquityPosition(
  principal: Principal,
  input: IssueEquityPositionInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const entity = await entityInScope(input.legalEntityId, scope);
  const classification = input.classification ?? "RESTRICTED";
  const policy = await authorizeMutation(principal, "equity:cap-table.manage", {
    classification,
    tenantId: entity.tenantId,
    entityId: entity.id,
  });

  if (!(HOLDER_TYPES as readonly string[]).includes(input.holderType)) {
    throw new EquityError("RULE_VIOLATION", `holderType must be one of ${HOLDER_TYPES.join(", ")}.`);
  }
  if (!Number.isInteger(input.totalShares) || input.totalShares <= 0) {
    throw new EquityError("RULE_VIOLATION", "totalShares must be a positive integer.");
  }
  wrapModel(() => assertIsoDate(input.effectiveFrom, "effectiveFrom"));
  if (input.vesting) {
    wrapModel(() =>
      assertIsoDate(input.vesting!.startDate, "vesting.startDate"),
    );
    if (["ESOP_POOL", "TREASURY"].includes(input.holderType)) {
      throw new EquityError("RULE_VIOLATION", "Pool and treasury positions do not vest.");
    }
  }

  const [shareClass] = await db
    .select()
    .from(shareClasses)
    .where(and(eq(shareClasses.id, input.shareClassId), eq(shareClasses.tenantId, entity.tenantId)))
    .limit(1);
  if (!shareClass) {
    throw new EquityError("NOT_FOUND", "Share class not found within your authorised scope.");
  }
  if (shareClass.legalEntityId !== entity.id) {
    throw new EquityError("RULE_VIOLATION", "Share class belongs to a different legal entity.");
  }
  if (shareClass.status !== "ACTIVE") {
    throw new EquityError("RULE_VIOLATION", "Shares may only be issued against an ACTIVE share class.");
  }
  if (shareClass.issuedShares + input.totalShares > shareClass.authorizedShares) {
    throw new EquityError(
      "RULE_VIOLATION",
      `Issuance of ${input.totalShares} exceeds authorized capacity (${shareClass.authorizedShares - shareClass.issuedShares} unissued).`,
    );
  }

  await requireApprovedResolution(input.resolutionRef, scope);
  await wrapTenantScope(() => assertWithinScope(principal, entity.tenantId));

  return await withAuditTransaction(
      async (tx) => {
        const id = newId(ID_PREFIX.equityPosition);
        const vests = Boolean(input.vesting);
        const [position] = await tx
          .insert(equityPositions)
          .values({
            id,
            tenantId: entity.tenantId,
            legalEntityId: entity.id,
            shareClassId: shareClass.id,
            holderType: input.holderType,
            holderPartyId: input.holderPartyId ?? null,
            holderName: input.holderName,
            instrument: input.instrument ?? "ORDINARY_SHARES",
            totalShares: input.totalShares,
            vestedShares: vests || ["ESOP_POOL", "TREASURY"].includes(input.holderType) ? 0 : input.totalShares,
            unvestedShares: vests ? input.totalShares : 0,
            status: vests ? "ACTIVE" : ["ESOP_POOL", "TREASURY"].includes(input.holderType) ? "ACTIVE" : "FULLY_VESTED",
            effectiveFrom: input.effectiveFrom,
            ownershipRecordId: input.ownershipRecordId ?? null,
            provenance: input.provenance,
            supportingDocumentId: input.supportingDocumentId ?? null,
            resolutionRef: input.resolutionRef,
            approvalRef: input.approvalRef ?? null,
            recordedBy: principal.userId,
            classification,
          })
          .returning();

        await tx
          .update(shareClasses)
          .set({
            issuedShares: sql`${shareClasses.issuedShares} + ${input.totalShares}`,
            updatedAt: new Date(),
          })
          .where(eq(shareClasses.id, shareClass.id));

        let scheduleId: string | null = null;
        if (input.vesting) {
          const v = input.vesting;
          const terms: VestingTerms = {
            totalShares: input.totalShares,
            vestingMonths: v.vestingMonths,
            cliffMonths: v.cliffMonths,
            frequency: v.frequency ?? "MONTHLY",
            startDate: v.startDate,
          };
          const state = wrapModel(() => computeVesting(terms, terms.startDate));
          scheduleId = newId(ID_PREFIX.vestingSchedule);
          await tx.insert(vestingSchedules).values({
            id: scheduleId,
            tenantId: entity.tenantId,
            positionId: id,
            scheduleType: input.holderType === "FOUNDER" ? "FOUNDER_STANDARD" : "CUSTOM",
            totalShares: input.totalShares,
            vestingMonths: terms.vestingMonths,
            cliffMonths: terms.cliffMonths,
            frequency: terms.frequency,
            startDate: terms.startDate,
            cliffDate: state.cliffDate,
            endDate: state.endDate,
            accelerationPolicy: v.accelerationPolicy ?? "DOUBLE_TRIGGER",
            accelerationPctMillionths: v.accelerationPctMillionths ?? null,
            legalReviewStatus: LEGAL_REVIEW_REQUIRED,
            documentRef: v.documentRef ?? null,
            status: "DRAFT",
            recordedBy: principal.userId,
            classification,
          });
        }

        return {
          id: position.id,
          tenantId: position.tenantId,
          legalEntityId: position.legalEntityId,
          shareClassId: position.shareClassId,
          holderType: position.holderType,
          holderName: position.holderName,
          totalShares: position.totalShares,
          vestedShares: position.vestedShares,
          unvestedShares: position.unvestedShares,
          status: position.status,
          vestingScheduleId: scheduleId,
          classification,
        };
      },
      (result) => ({
        tenantId: result.tenantId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        action: "equity.position.issue",
        objectType: "EQUITY_POSITION",
        objectId: result.id,
        outcome: "SUCCESS" as const,
        reason: `Issued ${result.totalShares} shares to ${result.holderName} (${result.holderType})`,
        authority: "equity:cap-table.manage",
        approvalRef: input.resolutionRef,
        policyVersion: policyVersionOf(policy) ?? undefined,
        newValue: {
          shareClassId: result.shareClassId,
          holderType: result.holderType,
          totalShares: result.totalShares,
          vestingScheduleId: result.vestingScheduleId,
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        traceId: context.traceId,
      }),
      (result) => {
        const events = [
          {
            type: "CAP_TABLE_CHANGED",
            source: EVENT_SOURCE,
            domain: EVENT_DOMAIN,
            operation: "ISSUE_EQUITY_POSITION",
            destinationDomain: null,
            tenantId: result.tenantId,
            legalEntityId: result.legalEntityId,
            subjectType: "EQUITY_POSITION",
            subjectId: result.id,
            actorUserId: principal.userId,
            actorType: "HUMAN" as const,
            classification: result.classification,
            payload: {
              holderType: result.holderType,
              totalShares: result.totalShares,
              shareClassId: result.shareClassId,
            },
            traceId: context.traceId,
            correlationId: context.traceId,
            causationId: null,
            authorityContext: {
              authorityId: input.resolutionRef,
              decisionId: null,
              capabilityCode: null,
              permissionCode: "equity:cap-table.manage",
              policyVersion: policyVersionOf(policy),
            },
            policyVersion: policyVersionOf(policy),
          },
        ];
        if (result.holderType === "FOUNDER") {
          events.push({
            ...events[0],
            type: "FOUNDER_EQUITY_CHANGED",
            operation: "ISSUE_FOUNDER_EQUITY",
          });
        }
        return events;
      },
  );
}

/* ------------------------------------------------------------------ */
/* §9 — Vesting lifecycle                                               */
/* ------------------------------------------------------------------ */

async function scheduleInScope(scheduleId: string, scope: string[]) {
  const [schedule] = await db
    .select()
    .from(vestingSchedules)
    .where(and(eq(vestingSchedules.id, scheduleId), inArray(vestingSchedules.tenantId, scope)))
    .limit(1);
  if (!schedule) {
    throw new EquityError("NOT_FOUND", "Vesting schedule not found within your authorised scope.");
  }
  return schedule;
}

function scheduleTerms(schedule: typeof vestingSchedules.$inferSelect): VestingTerms {
  return {
    totalShares: schedule.totalShares,
    vestingMonths: schedule.vestingMonths,
    cliffMonths: schedule.cliffMonths,
    frequency: schedule.frequency as VestingFrequency,
    startDate: schedule.startDate,
  };
}

export type ActivateVestingInput = {
  scheduleId: string;
  approvedByResolutionId: string;
  /** Human legal-review closure — the software cannot fabricate it (§48). */
  legalReviewStatus: string;
  documentRef?: string | null;
};

export async function activateVestingSchedule(
  principal: Principal,
  input: ActivateVestingInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const schedule = await scheduleInScope(input.scheduleId, scope);
  const classification = schedule.classification as Classification;
  const policy = await authorizeMutation(principal, "equity:vesting.manage", {
    classification,
    tenantId: schedule.tenantId,
  });
  if (schedule.status !== "DRAFT") {
    throw new EquityError("INVALID_STATE", `Only a DRAFT schedule can be activated (found ${schedule.status}).`);
  }
  if (input.legalReviewStatus !== LEGAL_REVIEW_CLOSED) {
    throw new EquityError(
      "LEGAL_REVIEW_REQUIRED",
      "Vesting terms require a recorded human legal-review closure before activation.",
    );
  }
  await requireApprovedResolution(input.approvedByResolutionId, scope);
  await wrapTenantScope(() => assertWithinScope(principal, schedule.tenantId));

  return withAuditTransaction(
    async (tx) => {
      const [row] = await tx
        .update(vestingSchedules)
        .set({
          status: "ACTIVE",
          legalReviewStatus: LEGAL_REVIEW_CLOSED,
          approvedByResolutionId: input.approvedByResolutionId,
          documentRef: input.documentRef ?? schedule.documentRef,
          updatedAt: new Date(),
        })
        .where(and(eq(vestingSchedules.id, schedule.id), eq(vestingSchedules.status, "DRAFT")))
        .returning();
      if (!row) {
        throw new EquityError("CONFLICT", "Schedule was concurrently modified; re-read and retry.");
      }
      const [position] = await tx
        .select()
        .from(equityPositions)
        .where(eq(equityPositions.id, schedule.positionId))
        .limit(1);
      await tx.insert(vestingEvents).values({
        id: newId(ID_PREFIX.vestingEvent),
        tenantId: schedule.tenantId,
        scheduleId: schedule.id,
        positionId: schedule.positionId,
        eventType: "SCHEDULE_ACTIVATED",
        vestedSharesDelta: 0,
        cumulativeVestedShares: position?.vestedShares ?? 0,
        milestoneDate: null,
        payload: { resolutionId: input.approvedByResolutionId },
        actorUserId: principal.userId,
        authorityRef: input.approvedByResolutionId,
        documentRef: input.documentRef ?? schedule.documentRef,
        traceId: context.traceId,
      });
      return { id: row.id, status: row.status, tenantId: row.tenantId, positionId: row.positionId };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "equity.vesting.activate",
      objectType: "VESTING_SCHEDULE",
      objectId: result.id,
      outcome: "SUCCESS" as const,
      reason: "Vesting schedule activated",
      authority: "equity:vesting.manage",
      approvalRef: input.approvedByResolutionId,
      policyVersion: policyVersionOf(policy) ?? undefined,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (result) => ({
      type: "VESTING_SCHEDULE_ACTIVATED",
      source: EVENT_SOURCE,
      domain: EVENT_DOMAIN,
      operation: "ACTIVATE_VESTING_SCHEDULE",
      destinationDomain: null,
      tenantId: result.tenantId,
      legalEntityId: null,
      subjectType: "VESTING_SCHEDULE",
      subjectId: result.id,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      classification,
      payload: { positionId: result.positionId, resolutionId: input.approvedByResolutionId },
      traceId: context.traceId,
      correlationId: context.traceId,
      causationId: null,
      authorityContext: {
        authorityId: input.approvedByResolutionId,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "equity:vesting.manage",
        policyVersion: policyVersionOf(policy),
      },
      policyVersion: policyVersionOf(policy),
    }),
  );
}

export type RunVestingResult = {
  scheduleId: string;
  positionId: string;
  asOf: string;
  milestones: Array<{ date: string; vestedShares: number; cumulativeVestedShares: number }>;
  vestedShares: number;
  unvestedShares: number;
  completed: boolean;
};

/**
 * Run an ACTIVE schedule forward to `asOf`, appending ONE immutable ledger event
 * per milestone and updating the position in the same transaction. Idempotent:
 * milestones already in the ledger are never re-appended, so a second run to the
 * same date is a proven no-op (§13 reconstructable, §52 idempotent).
 */
export async function runVestingTo(
  principal: Principal,
  input: { scheduleId: string; asOf: string },
  context: MutationContext,
): Promise<RunVestingResult> {
  const scope = await tenantScopeIds(principal);
  const schedule = await scheduleInScope(input.scheduleId, scope);
  const classification = schedule.classification as Classification;
  const policy = await authorizeMutation(principal, "equity:vesting.manage", {
    classification,
    tenantId: schedule.tenantId,
  });
  if (schedule.status !== "ACTIVE") {
    throw new EquityError("INVALID_STATE", `Only an ACTIVE schedule can run (found ${schedule.status}).`);
  }
  wrapModel(() => assertIsoDate(input.asOf, "asOf"));

  const terms = scheduleTerms(schedule);
  const [last] = await db
    .select({ milestoneDate: sql<string | null>`max(milestone_date)`.as("milestone_date") })
    .from(vestingEvents)
    .where(eq(vestingEvents.scheduleId, schedule.id));
  const fromDate = last?.milestoneDate ?? terms.startDate;
  const milestones = wrapModel(() => vestingMilestones(terms, fromDate, input.asOf));
  const state = wrapModel(() => computeVesting(terms, input.asOf));

  const [position] = await db
    .select()
    .from(equityPositions)
    .where(and(eq(equityPositions.id, schedule.positionId), eq(equityPositions.tenantId, schedule.tenantId)))
    .limit(1);
  if (!position) {
    throw new EquityError("NOT_FOUND", "The schedule's equity position was not found.");
  }

  if (milestones.length === 0) {
    return {
      scheduleId: schedule.id,
      positionId: position.id,
      asOf: input.asOf,
      milestones: [],
      vestedShares: position.vestedShares,
      unvestedShares: position.unvestedShares,
      completed: false,
    };
  }

  await wrapTenantScope(() => assertWithinScope(principal, schedule.tenantId));

  return withAuditTransaction(
    async (tx) => {
      for (const m of milestones) {
        await tx.insert(vestingEvents).values({
          id: newId(ID_PREFIX.vestingEvent),
          tenantId: schedule.tenantId,
          scheduleId: schedule.id,
          positionId: position.id,
          eventType: "MILESTONE_VESTED",
          vestedSharesDelta: m.vestedShares,
          cumulativeVestedShares: m.cumulativeVestedShares,
          milestoneDate: m.date,
          payload: { asOf: input.asOf },
          actorUserId: principal.userId,
          traceId: context.traceId,
        });
      }
      const completed = state.completed;
      await tx
        .update(equityPositions)
        .set({
          vestedShares: state.vestedShares,
          unvestedShares: state.unvestedShares,
          status: completed ? "FULLY_VESTED" : position.status,
          updatedAt: new Date(),
        })
        .where(eq(equityPositions.id, position.id));
      if (completed) {
        await tx
          .update(vestingSchedules)
          .set({ status: "COMPLETED", updatedAt: new Date() })
          .where(eq(vestingSchedules.id, schedule.id));
      }
      return {
        scheduleId: schedule.id,
        positionId: position.id,
        tenantId: schedule.tenantId,
        legalEntityId: position.legalEntityId,
        asOf: input.asOf,
        milestones,
        vestedShares: state.vestedShares,
        unvestedShares: state.unvestedShares,
        completed,
        classification,
      } satisfies RunVestingResult & { tenantId: string; legalEntityId: string; classification: Classification };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "equity.vesting.run",
      objectType: "VESTING_SCHEDULE",
      objectId: result.scheduleId,
      outcome: "SUCCESS" as const,
      reason: `Vesting run to ${result.asOf}: ${result.milestones.length} milestone(s), vested=${result.vestedShares}`,
      authority: "equity:vesting.manage",
      policyVersion: policyVersionOf(policy) ?? undefined,
      newValue: {
        vestedShares: result.vestedShares,
        unvestedShares: result.unvestedShares,
        completed: result.completed,
        milestones: result.milestones,
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (result) => [
      {
        type: "VESTING_MILESTONE_REACHED",
        source: EVENT_SOURCE,
        domain: EVENT_DOMAIN,
        operation: "RUN_VESTING",
        destinationDomain: null,
        tenantId: result.tenantId,
        legalEntityId: result.legalEntityId,
        subjectType: "VESTING_SCHEDULE",
        subjectId: result.scheduleId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        classification: result.classification,
        payload: {
          positionId: result.positionId,
          asOf: result.asOf,
          milestones: result.milestones,
          vestedShares: result.vestedShares,
          unvestedShares: result.unvestedShares,
          completed: result.completed,
        },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: {
          authorityId: null,
          decisionId: null,
          capabilityCode: null,
          permissionCode: "equity:vesting.manage",
          policyVersion: policyVersionOf(policy),
        },
        policyVersion: policyVersionOf(policy),
      },
      {
        type: "CAP_TABLE_CHANGED",
        source: EVENT_SOURCE,
        domain: EVENT_DOMAIN,
        operation: "RUN_VESTING",
        destinationDomain: null,
        tenantId: result.tenantId,
        legalEntityId: result.legalEntityId,
        subjectType: "EQUITY_POSITION",
        subjectId: result.positionId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        classification: result.classification,
        payload: { change: "VESTING_UPDATED", vestedShares: result.vestedShares },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: {
          authorityId: null,
          decisionId: null,
          capabilityCode: null,
          permissionCode: "equity:vesting.manage",
          policyVersion: policyVersionOf(policy),
        },
        policyVersion: policyVersionOf(policy),
      },
    ],
  );
}

/* ------------------------------------------------------------------ */
/* §12 — Change of control & acceleration                               */
/* ------------------------------------------------------------------ */

export type DeclareChangeOfControlInput = {
  legalEntityId: string;
  eventType: "CHANGE_OF_CONTROL" | "QUALIFYING_TERMINATION";
  description: string;
  occurredOn: string;
  linkedEventId?: string | null;
  affectedPartyId?: string | null;
  resolutionRef?: string | null;
  documentRef?: string | null;
  classification?: Classification;
};

export async function declareChangeOfControl(
  principal: Principal,
  input: DeclareChangeOfControlInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const entity = await entityInScope(input.legalEntityId, scope);
  const classification = input.classification ?? "RESTRICTED";
  const policy = await authorizeMutation(principal, "equity:vesting.manage", {
    classification,
    tenantId: entity.tenantId,
    entityId: entity.id,
  });
  wrapModel(() => assertIsoDate(input.occurredOn, "occurredOn"));
  if (input.eventType === "QUALIFYING_TERMINATION") {
    if (!input.linkedEventId) {
      throw new EquityError(
        "RULE_VIOLATION",
        "A QUALIFYING_TERMINATION must link the CHANGE_OF_CONTROL declaration it pairs with (double trigger, §12).",
      );
    }
    const [linked] = await db
      .select()
      .from(changeOfControlEvents)
      .where(
        and(
          eq(changeOfControlEvents.id, input.linkedEventId),
          eq(changeOfControlEvents.tenantId, entity.tenantId),
        ),
      )
      .limit(1);
    if (!linked || linked.eventType !== "CHANGE_OF_CONTROL") {
      throw new EquityError("NOT_FOUND", "Linked change-of-control declaration not found in scope.");
    }
  }
  await wrapTenantScope(() => assertWithinScope(principal, entity.tenantId));

  return withAuditTransaction(
    async (tx) => {
      const id = newId(ID_PREFIX.changeOfControl);
      const [row] = await tx
        .insert(changeOfControlEvents)
        .values({
          id,
          tenantId: entity.tenantId,
          legalEntityId: entity.id,
          eventType: input.eventType,
          description: input.description,
          occurredOn: input.occurredOn,
          linkedEventId: input.linkedEventId ?? null,
          affectedPartyId: input.affectedPartyId ?? null,
          status: "DECLARED",
          legalReviewStatus: LEGAL_REVIEW_REQUIRED,
          resolutionRef: input.resolutionRef ?? null,
          documentRef: input.documentRef ?? null,
          declaredBy: principal.userId,
          classification,
        })
        .returning();
      return { id: row.id, tenantId: row.tenantId, eventType: row.eventType, status: row.status };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "equity.change-of-control.declare",
      objectType: "CHANGE_OF_CONTROL",
      objectId: result.id,
      outcome: "SUCCESS" as const,
      reason: `${result.eventType} declared`,
      authority: "equity:vesting.manage",
      policyVersion: policyVersionOf(policy) ?? undefined,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (result) => ({
      type: "CHANGE_OF_CONTROL_DECLARED",
      source: EVENT_SOURCE,
      domain: EVENT_DOMAIN,
      operation: "DECLARE_CHANGE_OF_CONTROL",
      destinationDomain: null,
      tenantId: result.tenantId,
      legalEntityId: entity.id,
      subjectType: "CHANGE_OF_CONTROL",
      subjectId: result.id,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      classification,
      payload: { eventType: result.eventType, status: result.status, occurredOn: input.occurredOn },
      traceId: context.traceId,
      correlationId: context.traceId,
      causationId: null,
      authorityContext: {
        authorityId: input.resolutionRef ?? null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "equity:vesting.manage",
        policyVersion: policyVersionOf(policy),
      },
      policyVersion: policyVersionOf(policy),
    }),
  );
}

/**
 * DECLARED → CONFIRMED. Confirmation is what unlocks acceleration and requires
 * BOTH a human legal-review closure and an APPROVED governance resolution —
 * a change of control is a legal fact, not a software determination (§12, §48).
 */
export async function confirmChangeOfControl(
  principal: Principal,
  input: { eventId: string; legalReviewStatus: string; resolutionRef: string },
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const [event] = await db
    .select()
    .from(changeOfControlEvents)
    .where(and(eq(changeOfControlEvents.id, input.eventId), inArray(changeOfControlEvents.tenantId, scope)))
    .limit(1);
  if (!event) {
    throw new EquityError("NOT_FOUND", "Change-of-control event not found within your authorised scope.");
  }
  const classification = event.classification as Classification;
  const policy = await authorizeMutation(principal, "equity:vesting.manage", {
    classification,
    tenantId: event.tenantId,
    entityId: event.legalEntityId,
  });
  if (event.status !== "DECLARED") {
    throw new EquityError("INVALID_STATE", `Only a DECLARED event can be confirmed (found ${event.status}).`);
  }
  if (input.legalReviewStatus !== LEGAL_REVIEW_CLOSED) {
    throw new EquityError(
      "LEGAL_REVIEW_REQUIRED",
      "Change-of-control confirmation requires a recorded human legal-review closure.",
    );
  }
  await requireApprovedResolution(input.resolutionRef, scope);
  await wrapTenantScope(() => assertWithinScope(principal, event.tenantId));

  return withAuditTransaction(
    async (tx) => {
      const [row] = await tx
        .update(changeOfControlEvents)
        .set({
          status: "CONFIRMED",
          legalReviewStatus: LEGAL_REVIEW_CLOSED,
          resolutionRef: input.resolutionRef,
          updatedAt: new Date(),
        })
        .where(and(eq(changeOfControlEvents.id, event.id), eq(changeOfControlEvents.status, "DECLARED")))
        .returning();
      if (!row) throw new EquityError("CONFLICT", "Event was concurrently modified; re-read and retry.");
      return { id: row.id, status: row.status, tenantId: row.tenantId, eventType: row.eventType };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "equity.change-of-control.confirm",
      objectType: "CHANGE_OF_CONTROL",
      objectId: result.id,
      outcome: "SUCCESS" as const,
      reason: `${result.eventType} confirmed`,
      authority: "equity:vesting.manage",
      approvalRef: input.resolutionRef,
      policyVersion: policyVersionOf(policy) ?? undefined,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (result) => ({
      type: "CHANGE_OF_CONTROL_CONFIRMED",
      source: EVENT_SOURCE,
      domain: EVENT_DOMAIN,
      operation: "CONFIRM_CHANGE_OF_CONTROL",
      destinationDomain: null,
      tenantId: result.tenantId,
      legalEntityId: event.legalEntityId,
      subjectType: "CHANGE_OF_CONTROL",
      subjectId: result.id,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      classification,
      payload: { eventType: result.eventType, status: result.status },
      traceId: context.traceId,
      correlationId: context.traceId,
      causationId: null,
      authorityContext: {
        authorityId: input.resolutionRef,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "equity:vesting.manage",
        policyVersion: policyVersionOf(policy),
      },
      policyVersion: policyVersionOf(policy),
    }),
  );
}

/**
 * Apply a confirmed trigger set to an ACTIVE schedule. The pure engine computes
 * the accelerated amount; this service is the ONLY path that writes it, and it
 * requires confirmed triggers matching the schedule's acceleration policy
 * (double trigger by default — §12).
 */
export async function applyAcceleration(
  principal: Principal,
  input: { scheduleId: string; changeOfControlId: string; qualifyingTerminationId?: string | null },
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const schedule = await scheduleInScope(input.scheduleId, scope);
  const classification = schedule.classification as Classification;
  const policy = await authorizeMutation(principal, "equity:vesting.manage", {
    classification,
    tenantId: schedule.tenantId,
  });
  if (schedule.status !== "ACTIVE") {
    throw new EquityError("INVALID_STATE", `Acceleration applies to ACTIVE schedules (found ${schedule.status}).`);
  }
  if (!(ACCELERATION_POLICIES as readonly string[]).includes(schedule.accelerationPolicy)) {
    throw new EquityError("RULE_VIOLATION", "Schedule carries an unknown acceleration policy.");
  }
  if (schedule.accelerationPolicy === "NONE") {
    throw new EquityError("RULE_VIOLATION", "Schedule acceleration policy is NONE; nothing to apply.");
  }

  const [coc] = await db
    .select()
    .from(changeOfControlEvents)
    .where(
      and(
        eq(changeOfControlEvents.id, input.changeOfControlId),
        eq(changeOfControlEvents.tenantId, schedule.tenantId),
      ),
    )
    .limit(1);
  if (!coc || coc.eventType !== "CHANGE_OF_CONTROL") {
    throw new EquityError("NOT_FOUND", "Change-of-control declaration not found in scope.");
  }
  if (coc.status !== "CONFIRMED") {
    throw new EquityError(
      "GOVERNANCE_NOT_SATISFIED",
      `Change of control is ${coc.status}; acceleration requires a CONFIRMED declaration.`,
    );
  }

  let qualifyingTermination = false;
  if (schedule.accelerationPolicy === "DOUBLE_TRIGGER" || schedule.accelerationPolicy === "PARTIAL_DOUBLE_TRIGGER") {
    const qtId = input.qualifyingTerminationId;
    if (!qtId) {
      // Fall back to any CONFIRMED qualifying termination linked to this CoC.
      const [linked] = await db
        .select()
        .from(changeOfControlEvents)
        .where(
          and(
            eq(changeOfControlEvents.linkedEventId, coc.id),
            eq(changeOfControlEvents.eventType, "QUALIFYING_TERMINATION"),
            eq(changeOfControlEvents.status, "CONFIRMED"),
            eq(changeOfControlEvents.tenantId, schedule.tenantId),
          ),
        )
        .limit(1);
      qualifyingTermination = Boolean(linked);
    } else {
      const [qt] = await db
        .select()
        .from(changeOfControlEvents)
        .where(
          and(
            eq(changeOfControlEvents.id, qtId),
            eq(changeOfControlEvents.tenantId, schedule.tenantId),
            eq(changeOfControlEvents.eventType, "QUALIFYING_TERMINATION"),
          ),
        )
        .limit(1);
      if (!qt) throw new EquityError("NOT_FOUND", "Qualifying termination not found in scope.");
      if (qt.status !== "CONFIRMED") {
        throw new EquityError("GOVERNANCE_NOT_SATISFIED", "Qualifying termination is not CONFIRMED.");
      }
      if (qt.linkedEventId !== coc.id) {
        throw new EquityError("RULE_VIOLATION", "Qualifying termination is not linked to this change of control.");
      }
      qualifyingTermination = true;
    }
  }

  const [position] = await db
    .select()
    .from(equityPositions)
    .where(and(eq(equityPositions.id, schedule.positionId), eq(equityPositions.tenantId, schedule.tenantId)))
    .limit(1);
  if (!position) throw new EquityError("NOT_FOUND", "The schedule's equity position was not found.");

  const outcome = wrapModel(() =>
    computeAcceleration({
      policy: schedule.accelerationPolicy as AccelerationPolicy,
      pctMillionths: schedule.accelerationPctMillionths,
      unvestedShares: position.unvestedShares,
      changeOfControlDeclared: true,
      qualifyingTermination,
    }),
  );
  if (!outcome.triggersSatisfied) {
    throw new EquityError("GOVERNANCE_NOT_SATISFIED", outcome.reason);
  }
  if (outcome.acceleratedShares <= 0) {
    throw new EquityError("RULE_VIOLATION", "No unvested shares remain to accelerate.");
  }
  await wrapTenantScope(() => assertWithinScope(principal, schedule.tenantId));

  return withAuditTransaction(
    async (tx) => {
      const newVested = position.vestedShares + outcome.acceleratedShares;
      const newUnvested = position.unvestedShares - outcome.acceleratedShares;
      const completed = newUnvested === 0;
      await tx.insert(vestingEvents).values({
        id: newId(ID_PREFIX.vestingEvent),
        tenantId: schedule.tenantId,
        scheduleId: schedule.id,
        positionId: position.id,
        eventType: "ACCELERATION_APPLIED",
        vestedSharesDelta: outcome.acceleratedShares,
        cumulativeVestedShares: newVested,
        milestoneDate: null,
        changeOfControlId: coc.id,
        payload: {
          policy: schedule.accelerationPolicy,
          qualifyingTermination,
          reason: outcome.reason,
        },
        actorUserId: principal.userId,
        authorityRef: coc.resolutionRef,
        traceId: context.traceId,
      });
      await tx
        .update(equityPositions)
        .set({
          vestedShares: newVested,
          unvestedShares: newUnvested,
          status: completed ? "FULLY_VESTED" : position.status,
          updatedAt: new Date(),
        })
        .where(eq(equityPositions.id, position.id));
      if (completed) {
        await tx
          .update(vestingSchedules)
          .set({ status: "COMPLETED", updatedAt: new Date() })
          .where(eq(vestingSchedules.id, schedule.id));
      }
      return {
        scheduleId: schedule.id,
        positionId: position.id,
        tenantId: schedule.tenantId,
        legalEntityId: position.legalEntityId,
        acceleratedShares: outcome.acceleratedShares,
        vestedShares: newVested,
        unvestedShares: newUnvested,
        completed,
        classification,
      };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "equity.vesting.accelerate",
      objectType: "VESTING_SCHEDULE",
      objectId: result.scheduleId,
      outcome: "SUCCESS" as const,
      reason: `Acceleration applied: ${result.acceleratedShares} share(s) (${schedule.accelerationPolicy})`,
      authority: "equity:vesting.manage",
      approvalRef: coc.resolutionRef ?? undefined,
      policyVersion: policyVersionOf(policy) ?? undefined,
      newValue: {
        acceleratedShares: result.acceleratedShares,
        vestedShares: result.vestedShares,
        completed: result.completed,
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (result) => [
      {
        type: "VESTING_ACCELERATION_APPLIED",
        source: EVENT_SOURCE,
        domain: EVENT_DOMAIN,
        operation: "APPLY_ACCELERATION",
        destinationDomain: null,
        tenantId: result.tenantId,
        legalEntityId: result.legalEntityId,
        subjectType: "VESTING_SCHEDULE",
        subjectId: result.scheduleId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        classification: result.classification,
        payload: {
          changeOfControlId: coc.id,
          acceleratedShares: result.acceleratedShares,
          policy: schedule.accelerationPolicy,
        },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: {
          authorityId: coc.resolutionRef,
          decisionId: null,
          capabilityCode: null,
          permissionCode: "equity:vesting.manage",
          policyVersion: policyVersionOf(policy),
        },
        policyVersion: policyVersionOf(policy),
      },
      {
        type: "CAP_TABLE_CHANGED",
        source: EVENT_SOURCE,
        domain: EVENT_DOMAIN,
        operation: "APPLY_ACCELERATION",
        destinationDomain: null,
        tenantId: result.tenantId,
        legalEntityId: result.legalEntityId,
        subjectType: "EQUITY_POSITION",
        subjectId: result.positionId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        classification: result.classification,
        payload: { change: "ACCELERATION", vestedShares: result.vestedShares },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: {
          authorityId: coc.resolutionRef,
          decisionId: null,
          capabilityCode: null,
          permissionCode: "equity:vesting.manage",
          policyVersion: policyVersionOf(policy),
        },
        policyVersion: policyVersionOf(policy),
      },
    ],
  );
}

/* ------------------------------------------------------------------ */
/* §10/§11 — Leaver lifecycle                                           */
/* ------------------------------------------------------------------ */

export type InitiateLeaverInput = {
  positionId: string;
  conditionCode: string;
  conditionEvidence?: Record<string, unknown>;
  documentRefs?: string[];
  classification?: Classification;
};

export async function initiateLeaverCase(
  principal: Principal,
  input: InitiateLeaverInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const [position] = await db
    .select()
    .from(equityPositions)
    .where(and(eq(equityPositions.id, input.positionId), inArray(equityPositions.tenantId, scope)))
    .limit(1);
  if (!position) {
    throw new EquityError("NOT_FOUND", "Equity position not found within your authorised scope.");
  }
  const classification = input.classification ?? (position.classification as Classification);
  const policy = await authorizeMutation(principal, "equity:leaver.manage", {
    classification,
    tenantId: position.tenantId,
    entityId: position.legalEntityId,
  });
  // §10: the condition vocabulary is CLOSED. An arbitrary or unknown condition
  // is refused at initiation — a forfeiture case is never created on software
  // discretion, and classification later re-checks the good/bad pairing.
  wrapModel(() => {
    if (!isGoodLeaverCondition(input.conditionCode) && !isBadLeaverCondition(input.conditionCode)) {
      throw new EquityModelError(
        "INVALID_CONDITION",
        `Condition '${input.conditionCode}' is not in the governed candidate vocabulary. Arbitrary forfeiture conditions are refused (§10).`,
      );
    }
  });
  if (!["ACTIVE", "FULLY_VESTED"].includes(position.status)) {
    throw new EquityError("INVALID_STATE", `A leaver case requires an open position (found ${position.status}).`);
  }
  if (["ESOP_POOL", "TREASURY"].includes(position.holderType)) {
    throw new EquityError("RULE_VIOLATION", "Pool and treasury positions cannot be leaver cases.");
  }
  const [open] = await db
    .select({ id: leaverCases.id })
    .from(leaverCases)
    .where(
      and(
        eq(leaverCases.positionId, position.id),
        inArray(leaverCases.status, ["INITIATED", "CLASSIFIED", "APPROVED"]),
      ),
    )
    .limit(1);
  if (open) {
    throw new EquityError("CONFLICT", "An open leaver case already exists for this position.");
  }
  await wrapTenantScope(() => assertWithinScope(principal, position.tenantId));

  return withAuditTransaction(
    async (tx) => {
      const id = newId(ID_PREFIX.leaverCase);
      const [row] = await tx
        .insert(leaverCases)
        .values({
          id,
          tenantId: position.tenantId,
          legalEntityId: position.legalEntityId,
          positionId: position.id,
          holderPartyId: position.holderPartyId,
          caseType: "UNDETERMINED",
          conditionCode: input.conditionCode,
          conditionEvidence: input.conditionEvidence ?? {},
          status: "INITIATED",
          vestedSharesAtEvent: position.vestedShares,
          unvestedSharesAtEvent: position.unvestedShares,
          documentRefs: input.documentRefs ?? [],
          legalReviewStatus: LEGAL_REVIEW_REQUIRED,
          initiatedBy: principal.userId,
          recordedBy: principal.userId,
          classification,
        })
        .returning();
      return {
        id: row.id,
        tenantId: row.tenantId,
        legalEntityId: row.legalEntityId,
        status: row.status,
        caseType: row.caseType,
        vestedSharesAtEvent: row.vestedSharesAtEvent,
        unvestedSharesAtEvent: row.unvestedSharesAtEvent,
      };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "equity.leaver.initiate",
      objectType: "LEAVER_CASE",
      objectId: result.id,
      outcome: "SUCCESS" as const,
      reason: `Leaver case initiated (condition ${input.conditionCode})`,
      authority: "equity:leaver.manage",
      policyVersion: policyVersionOf(policy) ?? undefined,
      newValue: { conditionCode: input.conditionCode, vested: result.vestedSharesAtEvent, unvested: result.unvestedSharesAtEvent },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (result) => ({
      type: "LEAVER_INITIATED",
      source: EVENT_SOURCE,
      domain: EVENT_DOMAIN,
      operation: "INITIATE_LEAVER_CASE",
      destinationDomain: null,
      tenantId: result.tenantId,
      legalEntityId: result.legalEntityId,
      subjectType: "LEAVER_CASE",
      subjectId: result.id,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      classification,
      payload: {
        positionId: position.id,
        conditionCode: input.conditionCode,
        caseType: result.caseType,
        vestedSharesAtEvent: result.vestedSharesAtEvent,
        unvestedSharesAtEvent: result.unvestedSharesAtEvent,
      },
      traceId: context.traceId,
      correlationId: context.traceId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "equity:leaver.manage",
        policyVersion: policyVersionOf(policy),
      },
      policyVersion: policyVersionOf(policy),
    }),
  );
}

export type ClassifyLeaverInput = {
  caseId: string;
  caseType: "GOOD_LEAVER" | "BAD_LEAVER";
  /** Human legal-review closure — cannot be fabricated (§48). */
  legalReviewStatus: string;
  treatment?: LeaverPolicy | null;
  costPricePerShare?: string | null;
  fmvPricePerShare?: string | null;
  valuationBasis?: string | null;
  currency?: string | null;
  documentRefs?: string[];
};

/**
 * UNDETERMINED → classified GOOD/BAD with the deterministic outcome computed by
 * the engine. Requires a recorded human legal-review closure; the engine refuses
 * mismatched or arbitrary condition codes (no arbitrary forfeiture, §10).
 */
export async function classifyLeaverCase(
  principal: Principal,
  input: ClassifyLeaverInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const [leaverCase] = await db
    .select()
    .from(leaverCases)
    .where(and(eq(leaverCases.id, input.caseId), inArray(leaverCases.tenantId, scope)))
    .limit(1);
  if (!leaverCase) {
    throw new EquityError("NOT_FOUND", "Leaver case not found within your authorised scope.");
  }
  const classification = leaverCase.classification as Classification;
  const policy = await authorizeMutation(principal, "equity:leaver.manage", {
    classification,
    tenantId: leaverCase.tenantId,
    entityId: leaverCase.legalEntityId,
  });
  if (!["INITIATED", "CLASSIFIED"].includes(leaverCase.status)) {
    throw new EquityError("INVALID_STATE", `A ${leaverCase.status} case can no longer be classified.`);
  }
  if (input.legalReviewStatus !== LEGAL_REVIEW_CLOSED) {
    throw new EquityError(
      "LEGAL_REVIEW_REQUIRED",
      "Leaver classification (GOOD/BAD) requires a recorded human legal-review closure.",
    );
  }

  const outcome = wrapModel(() =>
    computeLeaverOutcome({
      caseType: input.caseType,
      conditionCode: leaverCase.conditionCode,
      vestedShares: leaverCase.vestedSharesAtEvent,
      unvestedShares: leaverCase.unvestedSharesAtEvent,
      policy: input.treatment ?? null,
      costPricePerShare: input.costPricePerShare ?? null,
      fmvPricePerShare: input.fmvPricePerShare ?? null,
    }),
  );
  await wrapTenantScope(() => assertWithinScope(principal, leaverCase.tenantId));

  return withAuditTransaction(
    async (tx) => {
      const [row] = await tx
        .update(leaverCases)
        .set({
          caseType: input.caseType,
          status: "CLASSIFIED",
          treatment: outcome.policy,
          retainedShares: outcome.retainedShares,
          repurchaseShares: outcome.repurchaseShares > 0 ? outcome.repurchaseShares : null,
          forfeitedShares: outcome.forfeitedShares > 0 ? outcome.forfeitedShares : null,
          repurchasePricePerShare: outcome.repurchasePricePerShare,
          repurchaseTotal: outcome.repurchaseTotal,
          currency: input.currency ?? leaverCase.currency,
          valuationBasis: input.valuationBasis ?? leaverCase.valuationBasis,
          legalReviewStatus: LEGAL_REVIEW_CLOSED,
          documentRefs: input.documentRefs ?? leaverCase.documentRefs,
          updatedAt: new Date(),
        })
        .where(and(eq(leaverCases.id, leaverCase.id), inArray(leaverCases.status, ["INITIATED", "CLASSIFIED"])))
        .returning();
      if (!row) throw new EquityError("CONFLICT", "Case was concurrently modified; re-read and retry.");
      return {
        id: row.id,
        tenantId: row.tenantId,
        legalEntityId: row.legalEntityId,
        caseType: row.caseType,
        status: row.status,
        retainedShares: outcome.retainedShares,
        repurchaseShares: outcome.repurchaseShares,
        forfeitedShares: outcome.forfeitedShares,
        repurchaseTotal: outcome.repurchaseTotal,
        notes: outcome.notes,
      };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "equity.leaver.classify",
      objectType: "LEAVER_CASE",
      objectId: result.id,
      outcome: "SUCCESS" as const,
      reason: `Leaver case classified ${result.caseType}`,
      authority: "equity:leaver.manage",
      policyVersion: policyVersionOf(policy) ?? undefined,
      newValue: {
        caseType: result.caseType,
        retainedShares: result.retainedShares,
        repurchaseShares: result.repurchaseShares,
        forfeitedShares: result.forfeitedShares,
        repurchaseTotal: result.repurchaseTotal,
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
  );
}

/** CLASSIFIED → APPROVED. Requires an APPROVED governance resolution (§10, §16). */
export async function approveLeaverCase(
  principal: Principal,
  input: { caseId: string; resolutionRef: string; approvalRef?: string | null },
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const [leaverCase] = await db
    .select()
    .from(leaverCases)
    .where(and(eq(leaverCases.id, input.caseId), inArray(leaverCases.tenantId, scope)))
    .limit(1);
  if (!leaverCase) {
    throw new EquityError("NOT_FOUND", "Leaver case not found within your authorised scope.");
  }
  const classification = leaverCase.classification as Classification;
  const policy = await authorizeMutation(principal, "equity:leaver.manage", {
    classification,
    tenantId: leaverCase.tenantId,
    entityId: leaverCase.legalEntityId,
  });
  if (leaverCase.status !== "CLASSIFIED") {
    throw new EquityError("INVALID_STATE", `Only a CLASSIFIED case can be approved (found ${leaverCase.status}).`);
  }
  await requireApprovedResolution(input.resolutionRef, scope);
  await wrapTenantScope(() => assertWithinScope(principal, leaverCase.tenantId));

  return withAuditTransaction(
    async (tx) => {
      const [row] = await tx
        .update(leaverCases)
        .set({
          status: "APPROVED",
          resolutionRef: input.resolutionRef,
          approvalRef: input.approvalRef ?? leaverCase.approvalRef,
          updatedAt: new Date(),
        })
        .where(and(eq(leaverCases.id, leaverCase.id), eq(leaverCases.status, "CLASSIFIED")))
        .returning();
      if (!row) throw new EquityError("CONFLICT", "Case was concurrently modified; re-read and retry.");
      return { id: row.id, tenantId: row.tenantId, legalEntityId: row.legalEntityId, status: row.status, caseType: row.caseType };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "equity.leaver.approve",
      objectType: "LEAVER_CASE",
      objectId: result.id,
      outcome: "SUCCESS" as const,
      reason: `Leaver case approved (${result.caseType})`,
      authority: "equity:leaver.manage",
      approvalRef: input.resolutionRef,
      policyVersion: policyVersionOf(policy) ?? undefined,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (result) => ({
      type: "LEAVER_APPROVED",
      source: EVENT_SOURCE,
      domain: EVENT_DOMAIN,
      operation: "APPROVE_LEAVER_CASE",
      destinationDomain: null,
      tenantId: result.tenantId,
      legalEntityId: result.legalEntityId,
      subjectType: "LEAVER_CASE",
      subjectId: result.id,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      classification,
      payload: { caseType: result.caseType, resolutionRef: input.resolutionRef },
      traceId: context.traceId,
      correlationId: context.traceId,
      causationId: null,
      authorityContext: {
        authorityId: input.resolutionRef,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "equity:leaver.manage",
        policyVersion: policyVersionOf(policy),
      },
      policyVersion: policyVersionOf(policy),
    }),
  );
}

/**
 * APPROVED → EXECUTED: applies the classified disposition to the position and
 * the append-only ledger (FORFEITURE for cancelled unvested shares, treasury
 * absorption for repurchased vested shares), decrements issued shares for
 * cancellations and closes the position when nothing remains.
 *
 * Payment of any repurchase total is NOT executed here: `payment_status` moves
 * to PENDING and `finance_record_ref` stays null until Finance OS / treasury
 * records the movement under its own authority (BLOCKED — EXTERNAL for real
 * money; §22, §29).
 */
export async function executeLeaverCase(
  principal: Principal,
  input: { caseId: string },
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const [leaverCase] = await db
    .select()
    .from(leaverCases)
    .where(and(eq(leaverCases.id, input.caseId), inArray(leaverCases.tenantId, scope)))
    .limit(1);
  if (!leaverCase) {
    throw new EquityError("NOT_FOUND", "Leaver case not found within your authorised scope.");
  }
  const classification = leaverCase.classification as Classification;
  const policy = await authorizeMutation(principal, "equity:leaver.manage", {
    classification,
    tenantId: leaverCase.tenantId,
    entityId: leaverCase.legalEntityId,
  });
  if (leaverCase.status !== "APPROVED") {
    throw new EquityError("INVALID_STATE", `Only an APPROVED case can be executed (found ${leaverCase.status}).`);
  }
  const [position] = await db
    .select()
    .from(equityPositions)
    .where(eq(equityPositions.id, leaverCase.positionId))
    .limit(1);
  if (!position) throw new EquityError("NOT_FOUND", "The case's equity position was not found.");
  const forfeited = leaverCase.forfeitedShares ?? 0;
  const repurchase = leaverCase.repurchaseShares ?? 0;
  if (position.vestedShares < repurchase || position.unvestedShares < forfeited) {
    throw new EquityError(
      "RULE_VIOLATION",
      "Position balances are below the approved disposition; the case must be re-classified against current vesting state.",
    );
  }
  await wrapTenantScope(() => assertWithinScope(principal, leaverCase.tenantId));

  return withAuditTransaction(
    async (tx) => {
      const now = new Date();
      // 1. Immutable ledger entry for the forfeiture — only when a schedule
      // exists (the ledger is schedule-keyed by FK). Positions without a
      // schedule are evidenced by the leaver case row + audit + event, which
      // are themselves append-only.
      if (forfeited > 0) {
        const [scheduleRow] = await tx
          .select({ id: vestingSchedules.id })
          .from(vestingSchedules)
          .where(eq(vestingSchedules.positionId, position.id))
          .limit(1);
        if (scheduleRow) {
          await tx.insert(vestingEvents).values({
            id: newId(ID_PREFIX.vestingEvent),
            tenantId: leaverCase.tenantId,
            scheduleId: scheduleRow.id,
            positionId: position.id,
            eventType: "FORFEITURE",
            vestedSharesDelta: 0,
            cumulativeVestedShares: position.vestedShares,
            milestoneDate: null,
            payload: { leaverCaseId: leaverCase.id, forfeitedShares: forfeited },
            actorUserId: principal.userId,
            authorityRef: leaverCase.resolutionRef,
            traceId: context.traceId,
          });
        }
      }
      // 2. Cancel any ACTIVE schedule for the position.
      await tx
        .update(vestingSchedules)
        .set({ status: "CANCELLED", updatedAt: now })
        .where(and(eq(vestingSchedules.positionId, position.id), eq(vestingSchedules.status, "ACTIVE")));

      // 3. Repurchased vested shares move to a TREASURY position (still issued).
      if (repurchase > 0) {
        const [treasury] = await tx
          .select()
          .from(equityPositions)
          .where(
            and(
              eq(equityPositions.tenantId, leaverCase.tenantId),
              eq(equityPositions.legalEntityId, position.legalEntityId),
              eq(equityPositions.shareClassId, position.shareClassId),
              eq(equityPositions.holderType, "TREASURY"),
              eq(equityPositions.status, "ACTIVE"),
              isNull(equityPositions.effectiveTo),
            ),
          )
          .limit(1);
        if (treasury) {
          await tx
            .update(equityPositions)
            .set({ totalShares: sql`${equityPositions.totalShares} + ${repurchase}`, updatedAt: now })
            .where(eq(equityPositions.id, treasury.id));
        } else {
          await tx.insert(equityPositions).values({
            id: newId(ID_PREFIX.equityPosition),
            tenantId: leaverCase.tenantId,
            legalEntityId: position.legalEntityId,
            shareClassId: position.shareClassId,
            holderType: "TREASURY",
            holderName: "Treasury (leaver repurchase)",
            instrument: position.instrument,
            totalShares: repurchase,
            vestedShares: 0,
            unvestedShares: 0,
            status: "ACTIVE",
            effectiveFrom: new Date().toISOString().slice(0, 10),
            provenance: `LEAVER_CASE/${leaverCase.id}`,
            resolutionRef: leaverCase.resolutionRef,
            recordedBy: principal.userId,
            classification,
          });
        }
      }

      // 4. Reduce the leaver position; close it when nothing remains.
      const remainingTotal = position.totalShares - repurchase - forfeited;
      const remainingVested = position.vestedShares - repurchase;
      const remainingUnvested = position.unvestedShares - forfeited;
      const newStatus =
        remainingTotal <= 0
          ? repurchase > 0
            ? "REPURCHASED"
            : "FORFEITED"
          : remainingUnvested === 0 && remainingVested === remainingTotal
            ? "FULLY_VESTED"
            : position.status;
      await tx
        .update(equityPositions)
        .set({
          totalShares: Math.max(0, remainingTotal),
          vestedShares: Math.max(0, remainingVested),
          unvestedShares: Math.max(0, remainingUnvested),
          status: newStatus,
          effectiveTo: remainingTotal <= 0 ? new Date().toISOString().slice(0, 10) : null,
          updatedAt: now,
        })
        .where(eq(equityPositions.id, position.id));

      // 5. Forfeited shares are cancelled: issued share count decreases.
      if (forfeited > 0) {
        await tx
          .update(shareClasses)
          .set({
            issuedShares: sql`GREATEST(${shareClasses.issuedShares} - ${forfeited}, 0)`,
            updatedAt: now,
          })
          .where(eq(shareClasses.id, position.shareClassId));
      }

      // 6. Case → EXECUTED; payment stays Finance OS authority.
      const [row] = await tx
        .update(leaverCases)
        .set({
          status: "EXECUTED",
          paymentStatus: (leaverCase.repurchaseTotal ?? null) !== null ? "PENDING" : "NOT_DUE",
          updatedAt: now,
        })
        .where(and(eq(leaverCases.id, leaverCase.id), eq(leaverCases.status, "APPROVED")))
        .returning();
      if (!row) throw new EquityError("CONFLICT", "Case was concurrently modified; re-read and retry.");

      return {
        id: row.id,
        tenantId: row.tenantId,
        legalEntityId: row.legalEntityId,
        positionId: position.id,
        caseType: row.caseType,
        status: row.status,
        forfeitedShares: forfeited,
        repurchaseShares: repurchase,
        retainedShares: remainingTotal,
        paymentStatus: row.paymentStatus,
        classification,
      };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "equity.leaver.execute",
      objectType: "LEAVER_CASE",
      objectId: result.id,
      outcome: "SUCCESS" as const,
      reason: `Leaver disposition executed (${result.caseType}): forfeited=${result.forfeitedShares}, repurchased=${result.repurchaseShares}`,
      authority: "equity:leaver.manage",
      approvalRef: leaverCase.resolutionRef ?? undefined,
      policyVersion: policyVersionOf(policy) ?? undefined,
      newValue: {
        status: result.status,
        forfeitedShares: result.forfeitedShares,
        repurchaseShares: result.repurchaseShares,
        paymentStatus: result.paymentStatus,
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (result) => [
      {
        type: "FOUNDER_EQUITY_CHANGED",
        source: EVENT_SOURCE,
        domain: EVENT_DOMAIN,
        operation: "EXECUTE_LEAVER_CASE",
        destinationDomain: null,
        tenantId: result.tenantId,
        legalEntityId: result.legalEntityId,
        subjectType: "LEAVER_CASE",
        subjectId: result.id,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        classification: result.classification,
        payload: {
          positionId: result.positionId,
          caseType: result.caseType,
          forfeitedShares: result.forfeitedShares,
          repurchaseShares: result.repurchaseShares,
          paymentStatus: result.paymentStatus,
        },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: {
          authorityId: leaverCase.resolutionRef,
          decisionId: null,
          capabilityCode: null,
          permissionCode: "equity:leaver.manage",
          policyVersion: policyVersionOf(policy),
        },
        policyVersion: policyVersionOf(policy),
      },
      {
        type: "CAP_TABLE_CHANGED",
        source: EVENT_SOURCE,
        domain: EVENT_DOMAIN,
        operation: "EXECUTE_LEAVER_CASE",
        destinationDomain: null,
        tenantId: result.tenantId,
        legalEntityId: result.legalEntityId,
        subjectType: "EQUITY_POSITION",
        subjectId: result.positionId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        classification: result.classification,
        payload: { change: "LEAVER_DISPOSITION", leaverCaseId: result.id },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: {
          authorityId: leaverCase.resolutionRef,
          decisionId: null,
          capabilityCode: null,
          permissionCode: "equity:leaver.manage",
          policyVersion: policyVersionOf(policy),
        },
        policyVersion: policyVersionOf(policy),
      },
    ],
  );
}

/* ------------------------------------------------------------------ */
/* §15 — ESOP plans and grants                                          */
/* ------------------------------------------------------------------ */

export type CreateEsopPlanInput = {
  legalEntityId: string;
  planName: string;
  jurisdictionCode: string;
  poolSharesAuthorized: number;
  defaultVesting?: { vestingMonths: number; cliffMonths: number; frequency?: VestingFrequency };
  exerciseWindowDays?: number;
  documentRef?: string | null;
  classification?: Classification;
};

export async function createEsopPlan(
  principal: Principal,
  input: CreateEsopPlanInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const entity = await entityInScope(input.legalEntityId, scope);
  const classification = input.classification ?? "RESTRICTED";
  const policy = await authorizeMutation(principal, "equity:esop.manage", {
    classification,
    tenantId: entity.tenantId,
    entityId: entity.id,
  });
  if (!Number.isInteger(input.poolSharesAuthorized) || input.poolSharesAuthorized <= 0) {
    throw new EquityError("RULE_VIOLATION", "poolSharesAuthorized must be a positive integer.");
  }
  if (input.defaultVesting) {
    wrapModel(() =>
      computeVesting(
        {
          totalShares: 1,
          vestingMonths: input.defaultVesting!.vestingMonths,
          cliffMonths: input.defaultVesting!.cliffMonths,
          frequency: input.defaultVesting!.frequency ?? "MONTHLY",
          startDate: "2000-01-01",
        },
        "2000-01-01",
      ),
    );
  }
  await wrapTenantScope(() => assertWithinScope(principal, entity.tenantId));

  try {
    return await withAuditTransaction(
      async (tx) => {
        const id = newId(ID_PREFIX.esopPlan);
        const [row] = await tx
          .insert(esopPlans)
          .values({
            id,
            tenantId: entity.tenantId,
            legalEntityId: entity.id,
            planName: input.planName,
            jurisdictionCode: input.jurisdictionCode,
            poolSharesAuthorized: input.poolSharesAuthorized,
            poolSharesIssued: 0,
            defaultVesting: {
              vestingMonths: input.defaultVesting?.vestingMonths ?? 48,
              cliffMonths: input.defaultVesting?.cliffMonths ?? 12,
              frequency: input.defaultVesting?.frequency ?? "MONTHLY",
            },
            exerciseWindowDays: input.exerciseWindowDays ?? 90,
            status: "DRAFT",
            legalReviewStatus: LEGAL_REVIEW_REQUIRED,
            documentRef: input.documentRef ?? null,
            recordedBy: principal.userId,
            classification,
          })
          .returning();
        return { id: row.id, tenantId: row.tenantId, planName: row.planName, status: row.status };
      },
      (result) => ({
        tenantId: result.tenantId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        action: "equity.esop.plan.create",
        objectType: "ESOP_PLAN",
        objectId: result.id,
        outcome: "SUCCESS" as const,
        reason: `ESOP plan ${result.planName} drafted`,
        authority: "equity:esop.manage",
        policyVersion: policyVersionOf(policy) ?? undefined,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        traceId: context.traceId,
      }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new EquityError("CONFLICT", "An ESOP plan with this name already exists for the tenant.");
    }
    throw err;
  }
}

/** DRAFT → ACTIVE. Requires human legal-review closure + APPROVED resolution. */
export async function activateEsopPlan(
  principal: Principal,
  input: { planId: string; approvedByResolutionId: string; legalReviewStatus: string },
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const [plan] = await db
    .select()
    .from(esopPlans)
    .where(and(eq(esopPlans.id, input.planId), inArray(esopPlans.tenantId, scope)))
    .limit(1);
  if (!plan) throw new EquityError("NOT_FOUND", "ESOP plan not found within your authorised scope.");
  const classification = plan.classification as Classification;
  const policy = await authorizeMutation(principal, "equity:esop.manage", {
    classification,
    tenantId: plan.tenantId,
    entityId: plan.legalEntityId,
  });
  if (plan.status !== "DRAFT") {
    throw new EquityError("INVALID_STATE", `Only a DRAFT plan can be activated (found ${plan.status}).`);
  }
  if (input.legalReviewStatus !== LEGAL_REVIEW_CLOSED) {
    throw new EquityError("LEGAL_REVIEW_REQUIRED", "ESOP plan activation requires a recorded human legal-review closure.");
  }
  await requireApprovedResolution(input.approvedByResolutionId, scope);
  await wrapTenantScope(() => assertWithinScope(principal, plan.tenantId));

  return withAuditTransaction(
    async (tx) => {
      const [row] = await tx
        .update(esopPlans)
        .set({
          status: "ACTIVE",
          legalReviewStatus: LEGAL_REVIEW_CLOSED,
          approvedByResolutionId: input.approvedByResolutionId,
          updatedAt: new Date(),
        })
        .where(and(eq(esopPlans.id, plan.id), eq(esopPlans.status, "DRAFT")))
        .returning();
      if (!row) throw new EquityError("CONFLICT", "Plan was concurrently modified; re-read and retry.");
      return { id: row.id, tenantId: row.tenantId, status: row.status };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "equity.esop.plan.activate",
      objectType: "ESOP_PLAN",
      objectId: result.id,
      outcome: "SUCCESS" as const,
      reason: "ESOP plan activated",
      authority: "equity:esop.manage",
      approvalRef: input.approvedByResolutionId,
      policyVersion: policyVersionOf(policy) ?? undefined,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
  );
}

export type CreateEsopGrantInput = {
  planId: string;
  granteePartyId: string;
  hcmEmployeeRef?: string | null;
  shareClassId: string;
  optionShares: number;
  exercisePricePerShare: string;
  currency: string;
  grantDate: string;
  approvalRef?: string | null;
  documentRef?: string | null;
  taxMetadata?: Record<string, unknown>;
  classification?: Classification;
};

export async function createEsopGrant(
  principal: Principal,
  input: CreateEsopGrantInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const [plan] = await db
    .select()
    .from(esopPlans)
    .where(and(eq(esopPlans.id, input.planId), inArray(esopPlans.tenantId, scope)))
    .limit(1);
  if (!plan) throw new EquityError("NOT_FOUND", "ESOP plan not found within your authorised scope.");
  const classification = input.classification ?? (plan.classification as Classification);
  const policy = await authorizeMutation(principal, "equity:esop.manage", {
    classification,
    tenantId: plan.tenantId,
    entityId: plan.legalEntityId,
  });
  if (plan.status !== "ACTIVE") {
    throw new EquityError("INVALID_STATE", `Grants may only be made under an ACTIVE plan (found ${plan.status}).`);
  }
  if (!Number.isInteger(input.optionShares) || input.optionShares <= 0) {
    throw new EquityError("RULE_VIOLATION", "optionShares must be a positive integer.");
  }
  wrapModel(() => assertIsoDate(input.grantDate, "grantDate"));
  if (plan.poolSharesIssued + input.optionShares > plan.poolSharesAuthorized) {
    throw new EquityError(
      "RULE_VIOLATION",
      `Grant exceeds the authorized pool (${plan.poolSharesAuthorized - plan.poolSharesIssued} shares available).`,
    );
  }
  const [shareClass] = await db
    .select()
    .from(shareClasses)
    .where(and(eq(shareClasses.id, input.shareClassId), eq(shareClasses.tenantId, plan.tenantId)))
    .limit(1);
  if (!shareClass) throw new EquityError("NOT_FOUND", "Share class not found within your authorised scope.");
  await wrapTenantScope(() => assertWithinScope(principal, plan.tenantId));

  try {
    return await withAuditTransaction(
      async (tx) => {
        const id = newId(ID_PREFIX.esopGrant);
        const [row] = await tx
          .insert(esopGrants)
          .values({
            id,
            tenantId: plan.tenantId,
            planId: plan.id,
            legalEntityId: plan.legalEntityId,
            granteePartyId: input.granteePartyId,
            hcmEmployeeRef: input.hcmEmployeeRef ?? null,
            shareClassId: shareClass.id,
            optionShares: input.optionShares,
            exercisePricePerShare: input.exercisePricePerShare,
            currency: input.currency,
            grantDate: input.grantDate,
            status: "PROPOSED",
            exercisedShares: 0,
            taxMetadata: input.taxMetadata ?? {},
            legalReviewStatus: LEGAL_REVIEW_REQUIRED,
            approvalRef: input.approvalRef ?? null,
            documentRef: input.documentRef ?? null,
            recordedBy: principal.userId,
            classification,
          })
          .returning();
        await tx
          .update(esopPlans)
          .set({ poolSharesIssued: sql`${esopPlans.poolSharesIssued} + ${input.optionShares}`, updatedAt: new Date() })
          .where(eq(esopPlans.id, plan.id));
        return {
          id: row.id,
          tenantId: row.tenantId,
          planId: row.planId,
          legalEntityId: row.legalEntityId,
          granteePartyId: row.granteePartyId,
          optionShares: row.optionShares,
          status: row.status,
        };
      },
      (result) => ({
        tenantId: result.tenantId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        action: "equity.esop.grant.create",
        objectType: "ESOP_GRANT",
        objectId: result.id,
        outcome: "SUCCESS" as const,
        reason: `ESOP grant of ${result.optionShares} options proposed`,
        authority: "equity:esop.manage",
        policyVersion: policyVersionOf(policy) ?? undefined,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        traceId: context.traceId,
      }),
      (result) => ({
        type: "ESOP_GRANT_CREATED",
        source: EVENT_SOURCE,
        domain: EVENT_DOMAIN,
        operation: "CREATE_ESOP_GRANT",
        destinationDomain: null,
        tenantId: result.tenantId,
        legalEntityId: result.legalEntityId,
        subjectType: "ESOP_GRANT",
        subjectId: result.id,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        classification,
        payload: {
          planId: result.planId,
          granteePartyId: result.granteePartyId,
          optionShares: result.optionShares,
          status: result.status,
        },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: {
          authorityId: input.approvalRef ?? null,
          decisionId: null,
          capabilityCode: null,
          permissionCode: "equity:esop.manage",
          policyVersion: policyVersionOf(policy),
        },
        policyVersion: policyVersionOf(policy),
      }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new EquityError("CONFLICT", "Concurrent grant exhausted the pool; re-read the plan and retry.");
    }
    throw err;
  }
}

/** PROPOSED → APPROVED (requires an approval reference — the human decision, §16). */
export async function approveEsopGrant(
  principal: Principal,
  input: { grantId: string; approvalRef: string; legalReviewStatus?: string; documentRef?: string | null },
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const [grant] = await db
    .select()
    .from(esopGrants)
    .where(and(eq(esopGrants.id, input.grantId), inArray(esopGrants.tenantId, scope)))
    .limit(1);
  if (!grant) throw new EquityError("NOT_FOUND", "ESOP grant not found within your authorised scope.");
  const classification = grant.classification as Classification;
  const policy = await authorizeMutation(principal, "equity:esop.manage", {
    classification,
    tenantId: grant.tenantId,
    entityId: grant.legalEntityId,
  });
  if (grant.status !== "PROPOSED") {
    throw new EquityError("INVALID_STATE", `Only a PROPOSED grant can be approved (found ${grant.status}).`);
  }
  if (!input.approvalRef || input.approvalRef.trim() === "") {
    throw new EquityError("EVIDENCE_REQUIRED", "Grant approval requires an approval reference (no evidence = not proven).");
  }
  await wrapTenantScope(() => assertWithinScope(principal, grant.tenantId));

  return withAuditTransaction(
    async (tx) => {
      const [row] = await tx
        .update(esopGrants)
        .set({
          status: "APPROVED",
          approvalRef: input.approvalRef,
          legalReviewStatus: input.legalReviewStatus ?? grant.legalReviewStatus,
          documentRef: input.documentRef ?? grant.documentRef,
          updatedAt: new Date(),
        })
        .where(and(eq(esopGrants.id, grant.id), eq(esopGrants.status, "PROPOSED")))
        .returning();
      if (!row) throw new EquityError("CONFLICT", "Grant was concurrently modified; re-read and retry.");
      await tx.insert(esopGrantEvents).values({
        id: newId(ID_PREFIX.esopGrantEvent),
        tenantId: grant.tenantId,
        grantId: grant.id,
        eventType: "GRANT_APPROVED",
        sharesDelta: 0,
        payload: { approvalRef: input.approvalRef },
        actorUserId: principal.userId,
        authorityRef: input.approvalRef,
        documentRef: input.documentRef ?? grant.documentRef,
        traceId: context.traceId,
      });
      return { id: row.id, tenantId: row.tenantId, status: row.status, legalEntityId: row.legalEntityId };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "equity.esop.grant.approve",
      objectType: "ESOP_GRANT",
      objectId: result.id,
      outcome: "SUCCESS" as const,
      reason: "ESOP grant approved",
      authority: "equity:esop.manage",
      approvalRef: input.approvalRef,
      policyVersion: policyVersionOf(policy) ?? undefined,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (result) => ({
      type: "ESOP_GRANT_APPROVED",
      source: EVENT_SOURCE,
      domain: EVENT_DOMAIN,
      operation: "APPROVE_ESOP_GRANT",
      destinationDomain: null,
      tenantId: result.tenantId,
      legalEntityId: result.legalEntityId,
      subjectType: "ESOP_GRANT",
      subjectId: result.id,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      classification,
      payload: { approvalRef: input.approvalRef },
      traceId: context.traceId,
      correlationId: context.traceId,
      causationId: null,
      authorityContext: {
        authorityId: input.approvalRef,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "equity:esop.manage",
        policyVersion: policyVersionOf(policy),
      },
      policyVersion: policyVersionOf(policy),
    }),
  );
}

async function vestedOptionsFromLedger(txOrDb: typeof db, grantId: string): Promise<number> {
  const [row] = await txOrDb
    .select({ total: sql<number>`coalesce(sum(shares_delta), 0)::int`.as("total") })
    .from(esopGrantEvents)
    .where(and(eq(esopGrantEvents.grantId, grantId), eq(esopGrantEvents.eventType, "VESTING_MILESTONE")));
  return Number(row?.total ?? 0);
}

/**
 * Run grant vesting to `asOf` using the PLAN's default vesting terms from the
 * grant date. Appends one immutable VESTING_MILESTONE ledger row per milestone;
 * idempotent (ledger-derived, never recomputed into existence twice).
 */
export async function runGrantVestingTo(
  principal: Principal,
  input: { grantId: string; asOf: string },
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const [grant] = await db
    .select()
    .from(esopGrants)
    .where(and(eq(esopGrants.id, input.grantId), inArray(esopGrants.tenantId, scope)))
    .limit(1);
  if (!grant) throw new EquityError("NOT_FOUND", "ESOP grant not found within your authorised scope.");
  const classification = grant.classification as Classification;
  const policy = await authorizeMutation(principal, "equity:esop.manage", {
    classification,
    tenantId: grant.tenantId,
    entityId: grant.legalEntityId,
  });
  if (!["APPROVED", "ACTIVE", "PARTIALLY_EXERCISED"].includes(grant.status)) {
    throw new EquityError("INVALID_STATE", `Grant status ${grant.status} does not vest.`);
  }
  wrapModel(() => assertIsoDate(input.asOf, "asOf"));
  const [plan] = await db.select().from(esopPlans).where(eq(esopPlans.id, grant.planId)).limit(1);
  if (!plan) throw new EquityError("NOT_FOUND", "The grant's plan was not found.");

  const terms: VestingTerms = {
    totalShares: grant.optionShares,
    vestingMonths: plan.defaultVesting.vestingMonths,
    cliffMonths: plan.defaultVesting.cliffMonths,
    frequency: (plan.defaultVesting.frequency ?? "MONTHLY") as VestingFrequency,
    startDate: grant.grantDate,
  };
  const vestedAlready = await vestedOptionsFromLedger(db, grant.id);
  const state = wrapModel(() => computeVesting(terms, input.asOf));
  const delta = state.vestedShares - vestedAlready;
  if (delta <= 0) {
    return { grantId: grant.id, asOf: input.asOf, vestedOptions: vestedAlready, milestones: [] as Array<{ date: string; vestedShares: number }> };
  }
  const milestones = wrapModel(() => vestingMilestones(terms, terms.startDate, input.asOf)).filter(
    (m) => m.cumulativeVestedShares > vestedAlready,
  );
  await wrapTenantScope(() => assertWithinScope(principal, grant.tenantId));

  return withAuditTransaction(
    async (tx) => {
      const rows = milestones.length > 0 ? milestones : [{ date: input.asOf, vestedShares: delta, cumulativeVestedShares: state.vestedShares }];
      for (const m of rows) {
        await tx.insert(esopGrantEvents).values({
          id: newId(ID_PREFIX.esopGrantEvent),
          tenantId: grant.tenantId,
          grantId: grant.id,
          eventType: "VESTING_MILESTONE",
          sharesDelta: m.vestedShares,
          payload: { milestoneDate: m.date, cumulativeVestedShares: m.cumulativeVestedShares },
          actorUserId: principal.userId,
          traceId: context.traceId,
        });
      }
      if (grant.status === "APPROVED") {
        await tx.update(esopGrants).set({ status: "ACTIVE", updatedAt: new Date() }).where(eq(esopGrants.id, grant.id));
      }
      return { grantId: grant.id, tenantId: grant.tenantId, asOf: input.asOf, vestedOptions: state.vestedShares, milestones: rows.map((m) => ({ date: m.date, vestedShares: m.vestedShares })) };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "equity.esop.grant.vest",
      objectType: "ESOP_GRANT",
      objectId: result.grantId,
      outcome: "SUCCESS" as const,
      reason: `Grant vesting run to ${result.asOf}: vested options ${result.vestedOptions}`,
      authority: "equity:esop.manage",
      policyVersion: policyVersionOf(policy) ?? undefined,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (result) => ({
      type: "VESTING_MILESTONE_REACHED",
      source: EVENT_SOURCE,
      domain: EVENT_DOMAIN,
      operation: "RUN_ESOP_GRANT_VESTING",
      destinationDomain: null,
      tenantId: result.tenantId,
      legalEntityId: grant.legalEntityId,
      subjectType: "ESOP_GRANT",
      subjectId: result.grantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      classification,
      payload: { vestedOptions: result.vestedOptions, milestones: result.milestones },
      traceId: context.traceId,
      correlationId: context.traceId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "equity:esop.manage",
        policyVersion: policyVersionOf(policy),
      },
      policyVersion: policyVersionOf(policy),
    }),
  );
}

/**
 * Exercise vested options: converts options into issued shares (an EMPLOYEE
 * equity position) and increments the share class issued count. Proceeds are a
 * Finance OS matter: `proceeds_ref` stays null until Finance records receipt.
 */
export async function exerciseEsopGrant(
  principal: Principal,
  input: { grantId: string; shares: number; proceedsRef?: string | null },
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const [grant] = await db
    .select()
    .from(esopGrants)
    .where(and(eq(esopGrants.id, input.grantId), inArray(esopGrants.tenantId, scope)))
    .limit(1);
  if (!grant) throw new EquityError("NOT_FOUND", "ESOP grant not found within your authorised scope.");
  const classification = grant.classification as Classification;
  const policy = await authorizeMutation(principal, "equity:esop.manage", {
    classification,
    tenantId: grant.tenantId,
    entityId: grant.legalEntityId,
  });
  if (!["APPROVED", "ACTIVE", "PARTIALLY_EXERCISED"].includes(grant.status)) {
    throw new EquityError("INVALID_STATE", `Grant status ${grant.status} cannot exercise.`);
  }
  if (!Number.isInteger(input.shares) || input.shares <= 0) {
    throw new EquityError("RULE_VIOLATION", "shares must be a positive integer.");
  }
  const vested = await vestedOptionsFromLedger(db, grant.id);
  const exercisable = vested - grant.exercisedShares;
  if (input.shares > exercisable) {
    throw new EquityError(
      "RULE_VIOLATION",
      `Only ${exercisable} vested unexercised options are available (requested ${input.shares}).`,
    );
  }
  if (!grant.shareClassId) {
    throw new EquityError("RULE_VIOLATION", "Grant has no share class; exercise cannot be recorded.");
  }
  await wrapTenantScope(() => assertWithinScope(principal, grant.tenantId));

  return withAuditTransaction(
    async (tx) => {
      const now = new Date();
      const newExercised = grant.exercisedShares + input.shares;
      const status = newExercised >= grant.optionShares ? "EXERCISED" : "PARTIALLY_EXERCISED";
      await tx.insert(esopGrantEvents).values({
        id: newId(ID_PREFIX.esopGrantEvent),
        tenantId: grant.tenantId,
        grantId: grant.id,
        eventType: "EXERCISED",
        sharesDelta: input.shares,
        exercisePricePerShare: grant.exercisePricePerShare,
        proceedsRef: input.proceedsRef ?? null,
        payload: { cumulativeExercised: newExercised },
        actorUserId: principal.userId,
        traceId: context.traceId,
      });
      await tx
        .update(esopGrants)
        .set({ exercisedShares: newExercised, status, updatedAt: now })
        .where(eq(esopGrants.id, grant.id));
      // Shares issued to the employee position.
      const [existing] = await tx
        .select()
        .from(equityPositions)
        .where(
          and(
            eq(equityPositions.tenantId, grant.tenantId),
            eq(equityPositions.shareClassId, grant.shareClassId!),
            eq(equityPositions.holderPartyId, grant.granteePartyId),
            eq(equityPositions.holderType, "EMPLOYEE"),
            eq(equityPositions.status, "FULLY_VESTED"),
            isNull(equityPositions.effectiveTo),
          ),
        )
        .limit(1);
      let positionId: string;
      if (existing) {
        await tx
          .update(equityPositions)
          .set({
            totalShares: sql`${equityPositions.totalShares} + ${input.shares}`,
            vestedShares: sql`${equityPositions.vestedShares} + ${input.shares}`,
            updatedAt: now,
          })
          .where(eq(equityPositions.id, existing.id));
        positionId = existing.id;
      } else {
        positionId = newId(ID_PREFIX.equityPosition);
        await tx.insert(equityPositions).values({
          id: positionId,
          tenantId: grant.tenantId,
          legalEntityId: grant.legalEntityId,
          shareClassId: grant.shareClassId!,
          holderType: "EMPLOYEE",
          holderPartyId: grant.granteePartyId,
          holderName: `Employee (grant ${grant.id})`,
          instrument: "ORDINARY_SHARES",
          totalShares: input.shares,
          vestedShares: input.shares,
          unvestedShares: 0,
          status: "FULLY_VESTED",
          effectiveFrom: now.toISOString().slice(0, 10),
          provenance: `ESOP_GRANT/${grant.id}`,
          recordedBy: principal.userId,
          classification,
        });
      }
      await tx
        .update(shareClasses)
        .set({ issuedShares: sql`${shareClasses.issuedShares} + ${input.shares}`, updatedAt: now })
        .where(eq(shareClasses.id, grant.shareClassId!));
      return {
        id: grant.id,
        tenantId: grant.tenantId,
        legalEntityId: grant.legalEntityId,
        positionId,
        exercisedShares: input.shares,
        cumulativeExercised: newExercised,
        status,
        classification,
      };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "equity.esop.grant.exercise",
      objectType: "ESOP_GRANT",
      objectId: result.id,
      outcome: "SUCCESS" as const,
      reason: `Exercised ${result.exercisedShares} options (cumulative ${result.cumulativeExercised})`,
      authority: "equity:esop.manage",
      policyVersion: policyVersionOf(policy) ?? undefined,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
    (result) => [
      {
        type: "ESOP_GRANT_EXERCISED",
        source: EVENT_SOURCE,
        domain: EVENT_DOMAIN,
        operation: "EXERCISE_ESOP_GRANT",
        destinationDomain: null,
        tenantId: result.tenantId,
        legalEntityId: result.legalEntityId,
        subjectType: "ESOP_GRANT",
        subjectId: result.id,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        classification: result.classification,
        payload: { exercisedShares: result.exercisedShares, cumulativeExercised: result.cumulativeExercised, status: result.status },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: {
          authorityId: null,
          decisionId: null,
          capabilityCode: null,
          permissionCode: "equity:esop.manage",
          policyVersion: policyVersionOf(policy),
        },
        policyVersion: policyVersionOf(policy),
      },
      {
        type: "CAP_TABLE_CHANGED",
        source: EVENT_SOURCE,
        domain: EVENT_DOMAIN,
        operation: "EXERCISE_ESOP_GRANT",
        destinationDomain: null,
        tenantId: result.tenantId,
        legalEntityId: result.legalEntityId,
        subjectType: "EQUITY_POSITION",
        subjectId: result.positionId,
        actorUserId: principal.userId,
        actorType: "HUMAN" as const,
        classification: result.classification,
        payload: { change: "OPTION_EXERCISE", shares: result.exercisedShares },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: {
          authorityId: null,
          decisionId: null,
          capabilityCode: null,
          permissionCode: "equity:esop.manage",
          policyVersion: policyVersionOf(policy),
        },
        policyVersion: policyVersionOf(policy),
      },
    ],
  );
}

/* ------------------------------------------------------------------ */
/* §13/§14 — Cap-table snapshots and dilution scenarios                 */
/* ------------------------------------------------------------------ */

type CapTableSourceRows = {
  classes: Array<typeof shareClasses.$inferSelect>;
  positions: Array<typeof equityPositions.$inferSelect>;
  plans: Array<typeof esopPlans.$inferSelect>;
  grants: Array<typeof esopGrants.$inferSelect>;
  ledgerCancelled: number;
};

async function loadCapTableSources(entityId: string, tenantId: string): Promise<CapTableSourceRows> {
  const classes = await db.select().from(shareClasses).where(eq(shareClasses.legalEntityId, entityId));
  const positions = await db.select().from(equityPositions).where(eq(equityPositions.legalEntityId, entityId));
  const plans = await db.select().from(esopPlans).where(eq(esopPlans.legalEntityId, entityId));
  const grants = await db.select().from(esopGrants).where(eq(esopGrants.legalEntityId, entityId));
  const [cancelled] = await db
    .select({ total: sql<number>`coalesce(sum(forfeited_shares), 0)::bigint`.as("total") })
    .from(leaverCases)
    .where(and(eq(leaverCases.legalEntityId, entityId), eq(leaverCases.status, "EXECUTED"), eq(leaverCases.tenantId, tenantId)));
  return {
    classes,
    positions,
    plans,
    grants,
    ledgerCancelled: Number(cancelled?.total ?? 0),
  };
}

function toEngineInput(rows: CapTableSourceRows) {
  const codeById = new Map(rows.classes.map((c) => [c.id, c]));
  return {
    shareClasses: rows.classes.map((c) => ({
      shareClassId: c.id,
      code: c.code,
      authorizedShares: c.authorizedShares,
      issuedShares: c.issuedShares,
      votesPerShare: c.votesPerShare,
    })),
    positions: rows.positions.map((p) => ({
      positionId: p.id,
      holderType: p.holderType,
      holderName: p.holderName,
      shareClassId: p.shareClassId,
      shareClassCode: codeById.get(p.shareClassId)?.code ?? "UNKNOWN",
      votesPerShare: codeById.get(p.shareClassId)?.votesPerShare ?? "1",
      totalShares: p.totalShares,
      vestedShares: p.vestedShares,
      unvestedShares: p.unvestedShares,
      status: p.status,
    })),
    plans: rows.plans.map((pl) => ({
      planId: pl.id,
      poolSharesAuthorized: pl.poolSharesAuthorized,
      poolSharesIssued: pl.poolSharesIssued,
      status: pl.status,
    })),
    grants: rows.grants.map((g) => ({
      grantId: g.id,
      holderName: g.granteePartyId,
      optionShares: g.optionShares,
      exercisedShares: g.exercisedShares,
      status: g.status,
    })),
    ledgerCancelledShares: rows.ledgerCancelled,
  };
}

/** Live (read-only) cap-table computation for an entity. */
export async function readCapTable(principal: Principal, input: { legalEntityId: string }) {
  const scope = await tenantScopeIds(principal);
  const entity = await entityInScope(input.legalEntityId, scope);
  const decision = can(principal, "equity:cap-table.read", {
    classification: "RESTRICTED",
    tenantId: entity.tenantId,
    entityId: entity.id,
  });
  if (!decision.allowed) {
    throw new EquityError(
      classificationRank("RESTRICTED") > classificationRank(principal.clearance) ? "CLASSIFICATION_DENIED" : "FORBIDDEN",
      decision.reason,
    );
  }
  const rows = await loadCapTableSources(entity.id, entity.tenantId);
  return { legalEntityId: entity.id, computedAt: new Date().toISOString(), ...wrapModel(() => computeCapTable(toEngineInput(rows))) };
}

/**
 * Compute and persist a reconstructable cap-table snapshot (§13). Deterministic:
 * the same state at the same date always recomputes to the same snapshot; a
 * re-computation for an existing date REPLACES it (never silently diverges) and
 * records its reconstruction basis.
 */
export async function computeCapTableSnapshot(
  principal: Principal,
  input: { legalEntityId: string; asOfDate: string; classification?: Classification },
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const entity = await entityInScope(input.legalEntityId, scope);
  const classification = input.classification ?? "RESTRICTED";
  const policy = await authorizeMutation(principal, "equity:cap-table.manage", {
    classification,
    tenantId: entity.tenantId,
    entityId: entity.id,
  });
  wrapModel(() => assertIsoDate(input.asOfDate, "asOfDate"));
  const rows = await loadCapTableSources(entity.id, entity.tenantId);
  const computation = wrapModel(() => computeCapTable(toEngineInput(rows)));
  await wrapTenantScope(() => assertWithinScope(principal, entity.tenantId));

  return withAuditTransaction(
    async (tx) => {
      const id = newId(ID_PREFIX.capTableSnapshot);
      const basis = {
        shareClassIds: rows.classes.map((c) => c.id),
        positionIds: rows.positions.map((p) => p.id),
        planIds: rows.plans.map((p) => p.id),
        grantIds: rows.grants.map((g) => g.id),
        ledgerCancelledShares: rows.ledgerCancelled,
        modelVersion: "1.0.0",
      };
      const [row] = await tx
        .insert(capTableSnapshots)
        .values({
          id,
          tenantId: entity.tenantId,
          legalEntityId: entity.id,
          asOfDate: input.asOfDate,
          authorizedShares: computation.authorizedShares,
          issuedShares: computation.issuedShares,
          outstandingShares: computation.outstandingShares,
          vestedShares: computation.vestedShares,
          unvestedShares: computation.unvestedShares,
          esopPoolShares: computation.esopPoolShares,
          esopGrantedShares: computation.esopGrantedShares,
          optionsOutstanding: computation.optionsOutstanding,
          treasuryShares: computation.treasuryShares,
          cancelledShares: computation.cancelledShares,
          fullyDilutedShares: computation.fullyDilutedShares,
          breakdown: computation.breakdown as Record<string, unknown>,
          reconstructionBasis: basis,
          computedBy: principal.userId,
          classification,
        })
        .onConflictDoUpdate({
          target: [capTableSnapshots.tenantId, capTableSnapshots.legalEntityId, capTableSnapshots.asOfDate],
          set: {
            authorizedShares: computation.authorizedShares,
            issuedShares: computation.issuedShares,
            outstandingShares: computation.outstandingShares,
            vestedShares: computation.vestedShares,
            unvestedShares: computation.unvestedShares,
            esopPoolShares: computation.esopPoolShares,
            esopGrantedShares: computation.esopGrantedShares,
            optionsOutstanding: computation.optionsOutstanding,
            treasuryShares: computation.treasuryShares,
            cancelledShares: computation.cancelledShares,
            fullyDilutedShares: computation.fullyDilutedShares,
            breakdown: computation.breakdown as Record<string, unknown>,
            reconstructionBasis: basis,
            computedBy: principal.userId,
          },
        })
        .returning();
      return { id: row.id, tenantId: row.tenantId, asOfDate: input.asOfDate, computation };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "equity.cap-table.snapshot",
      objectType: "CAP_TABLE_SNAPSHOT",
      objectId: result.id,
      outcome: "SUCCESS" as const,
      reason: `Cap-table snapshot computed as of ${result.asOfDate}`,
      authority: "equity:cap-table.manage",
      policyVersion: policyVersionOf(policy) ?? undefined,
      newValue: {
        fullyDilutedShares: result.computation.fullyDilutedShares,
        outstandingShares: result.computation.outstandingShares,
        vestedShares: result.computation.vestedShares,
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
  );
}

export type CreateDilutionScenarioInput = {
  legalEntityId: string;
  name: string;
  scenarioType: DilutionScenarioType;
  assumptions?: Record<string, unknown>;
  transactions: DilutionTransaction[];
  decisionOwnerUserId?: string | null;
  classification?: Classification;
};

/**
 * Create a dilution scenario (§14). The pre-transaction cap table is READ from
 * canonical positions; the engine computes post-transaction analysis; the result
 * is STORED AS ANALYSIS with `execution_prohibited = true`. Never alters
 * historical actuals, never executes.
 */
export async function createDilutionScenario(
  principal: Principal,
  input: CreateDilutionScenarioInput,
  context: MutationContext,
) {
  const scope = await tenantScopeIds(principal);
  const entity = await entityInScope(input.legalEntityId, scope);
  const classification = input.classification ?? "RESTRICTED";
  const policy = await authorizeMutation(principal, "equity:dilution.simulate", {
    classification,
    tenantId: entity.tenantId,
    entityId: entity.id,
  });
  const rows = await loadCapTableSources(entity.id, entity.tenantId);
  const holdings = rows.positions
    .filter((p) => ["ACTIVE", "FULLY_VESTED"].includes(p.status) && !["TREASURY"].includes(p.holderType))
    .map((p) => ({
      holder: p.holderPartyId ?? p.id,
      group: p.holderType === "ESOP_POOL" ? "ESOP_POOL" : p.holderType,
      shares: p.totalShares,
    }));
  const optionsOutstanding = rows.grants
    .filter((g) => ["PROPOSED", "APPROVED", "ACTIVE", "PARTIALLY_EXERCISED"].includes(g.status))
    .reduce((s, g) => s + (g.optionShares - g.exercisedShares), 0);
  const poolIssued = rows.plans
    .filter((p) => ["APPROVED", "ACTIVE"].includes(p.status))
    .reduce((s, p) => s + p.poolSharesIssued, 0);
  const poolAuthorized = rows.plans
    .filter((p) => ["APPROVED", "ACTIVE"].includes(p.status))
    .reduce((s, p) => s + p.poolSharesAuthorized, 0);
  const poolPositionShares = holdings.filter((h) => h.group === "ESOP_POOL").reduce((s, h) => s + h.shares, 0);
  const nonPoolHoldings = holdings.filter((h) => h.group !== "ESOP_POOL");
  const poolUnallocated = Math.max(0, poolAuthorized - Math.max(poolIssued, poolPositionShares));

  const result = wrapModel(() =>
    computeDilution({
      holdings: nonPoolHoldings,
      optionsOutstanding,
      poolUnallocated: poolUnallocated + poolPositionShares,
      transactions: input.transactions,
    }),
  );
  await wrapTenantScope(() => assertWithinScope(principal, entity.tenantId));

  return withAuditTransaction(
    async (tx) => {
      const id = newId(ID_PREFIX.dilutionScenario);
      const [row] = await tx
        .insert(dilutionScenarios)
        .values({
          id,
          tenantId: entity.tenantId,
          legalEntityId: entity.id,
          name: input.name,
          scenarioType: input.scenarioType,
          modelVersion: "1.0.0",
          assumptions: input.assumptions ?? {},
          preTransaction: result.pre as unknown as Record<string, unknown>,
          transaction: { transactions: input.transactions } as unknown as Record<string, unknown>,
          postTransaction: { ...result.post, deltas: result.deltas } as unknown as Record<string, unknown>,
          status: "DRAFT",
          executionProhibited: true,
          decisionOwnerUserId: input.decisionOwnerUserId ?? null,
          recordedBy: principal.userId,
          classification,
        })
        .returning();
      return { id: row.id, tenantId: row.tenantId, status: row.status, result };
    },
    (result) => ({
      tenantId: result.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN" as const,
      action: "equity.dilution.simulate",
      objectType: "DILUTION_SCENARIO",
      objectId: result.id,
      outcome: "SUCCESS" as const,
      reason: `Dilution scenario '${input.name}' computed (analysis only — execution prohibited)`,
      authority: "equity:dilution.simulate",
      policyVersion: policyVersionOf(policy) ?? undefined,
      newValue: {
        preFullyDiluted: result.result.pre.fullyDilutedShares,
        postFullyDiluted: result.result.post.fullyDilutedShares,
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId,
    }),
  );
}
