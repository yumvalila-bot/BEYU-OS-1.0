/**
 * Government Integration Gateway — the ONE canonical boundary through which
 * BEYU OS (and every sector under it) reaches a government system.
 *
 * PIPELINE (§16.3):
 *   actor → RBAC/ABAC (can) → policy (evaluatePolicy) → registry state →
 *   idempotent submission record → adapter → response validation →
 *   fail-closed state transition → audit → evidence.
 *
 * WHAT THIS MODULE REFUSES TO DO:
 *   - It never marks a submission ACCEPTED unless the adapter returned the
 *     government system's own reference (the DB CHECK enforces the same
 *     invariant a second time, in the database).
 *   - It never bypasses the registry: an agency whose row is SUSPENDED or
 *     EXTERNAL_BLOCKED cannot be called, no matter what the caller holds.
 *   - It never logs or persists credentials; adapters read env-var NAMES
 *     recorded in the registry (credential_refs) at call time.
 *   - It never deletes a submission record (the runtime role cannot).
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { governmentAgencies, governmentSubmissions } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { can, type Principal } from "@/lib/authz";
import { evaluatePolicy } from "@/lib/policy";
import { sha256, stableStringify } from "@/lib/crypto";
import { newId, ID_PREFIX } from "@/lib/ids";
import type {
  AdapterSubmitResult,
  AdapterVerifyResult,
  GovernmentAdapter,
  GovernmentSubmissionStatus,
} from "./adapter";
import type { PermissionCode } from "@/lib/constants";

export class GovernmentGatewayError extends Error {
  constructor(
    readonly code:
      | "UNKNOWN_AGENCY"
      | "AGENCY_NOT_CALLABLE"
      | "FORBIDDEN"
      | "POLICY_DENIED"
      | "APPROVAL_REQUIRED"
      | "UNSUPPORTED_CAPABILITY"
      | "DUPLICATE_SUBMISSION"
      | "INVALID_PAYLOAD",
    message: string,
    readonly status: number = 422,
  ) {
    super(message);
    this.name = "GovernmentGatewayError";
  }
}

/** Registry statuses under which an adapter may actually be invoked. */
const CALLABLE_STATUSES = new Set([
  "SANDBOX_READY",
  "UAT_VERIFIED",
  "PRODUCTION_READY",
  "LIVE",
  "DEGRADED", // degraded is callable; results will fail closed on their own
]);

export type GovernmentActor = {
  principal: Principal;
  traceId: string;
  correlationId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/** Central adapter registry — the only permitted way to reach an adapter. */
export class GovernmentGateway {
  private readonly adapters = new Map<string, GovernmentAdapter>();

  register(adapter: GovernmentAdapter): this {
    if (this.adapters.has(adapter.agencyCode)) {
      throw new Error(`Duplicate government adapter for ${adapter.agencyCode}`);
    }
    this.adapters.set(adapter.agencyCode, adapter);
    return this;
  }

  list(): Array<{ agencyCode: string; displayName: string; isMock: boolean; status: string }> {
    return [...this.adapters.values()].map((a) => ({
      agencyCode: a.agencyCode,
      displayName: a.displayName,
      isMock: a.isMock,
      status: a.status(),
    }));
  }

  adapter(agencyCode: string): GovernmentAdapter | null {
    return this.adapters.get(agencyCode) ?? null;
  }

  /**
   * Common front half of every government operation: authorization, policy,
   * registry gate. Throws GovernmentGatewayError on any refusal; the caller
   * (guarded route / Noelia tool) converts that into its own envelope.
   */
  private async authorize(
    actor: GovernmentActor,
    agencyCode: string,
    permission: PermissionCode,
    action: string,
  ): Promise<{ adapter: GovernmentAdapter; agencyStatus: string }> {
    const decision = can(actor.principal, permission);
    if (!decision.allowed) {
      await recordAudit({
        tenantId: actor.principal.tenantId,
        actorUserId: actor.principal.userId,
        action,
        objectType: "GOVERNMENT_AGENCY",
        objectId: agencyCode,
        outcome: "DENIED",
        reason: decision.reason,
        traceId: actor.traceId,
      });
      throw new GovernmentGatewayError("FORBIDDEN", decision.reason, 403);
    }

    const policy = await evaluatePolicy({
      action,
      tenantId: actor.principal.tenantId,
      roles: actor.principal.roles,
      classification: "CONFIDENTIAL",
    });
    if (policy.effect === "DENY") {
      await recordAudit({
        tenantId: actor.principal.tenantId,
        actorUserId: actor.principal.userId,
        action,
        objectType: "GOVERNMENT_AGENCY",
        objectId: agencyCode,
        outcome: "DENIED",
        reason: policy.denials.map((d) => d.policyCode).join(",") || "POLICY_DENY",
        traceId: actor.traceId,
      });
      throw new GovernmentGatewayError("POLICY_DENIED", "Denied by governing policy.", 403);
    }
    if (policy.obligations.length > 0) {
      // Material government actions with an approval obligation stop here —
      // the workflow/approval engine owns the continuation, not this gateway.
      throw new GovernmentGatewayError(
        "APPROVAL_REQUIRED",
        `Approval required: ${policy.obligations.map((o) => o.policyCode).join(", ")}`,
        428,
      );
    }

    const [agency] = await db
      .select()
      .from(governmentAgencies)
      .where(eq(governmentAgencies.code, agencyCode));
    if (!agency) throw new GovernmentGatewayError("UNKNOWN_AGENCY", `Agency ${agencyCode} is not registered.`, 404);
    if (!CALLABLE_STATUSES.has(agency.integrationStatus)) {
      throw new GovernmentGatewayError(
        "AGENCY_NOT_CALLABLE",
        `Agency ${agencyCode} is ${agency.integrationStatus}; external calls are not permitted in this state.`,
        409,
      );
    }

    const adapter = this.adapters.get(agencyCode);
    if (!adapter) {
      throw new GovernmentGatewayError("AGENCY_NOT_CALLABLE", `No adapter is mounted for ${agencyCode}.`, 409);
    }
    return { adapter, agencyStatus: agency.integrationStatus };
  }

  /**
   * Submit a material government operation (fiscal receipt, claim folio,
   * report). Durable, idempotent, fail-closed.
   */
  async submit(input: {
    actor: GovernmentActor;
    agencyCode: string;
    permission: PermissionCode;
    legalEntityId: string;
    submissionType: string;
    payload: unknown;
    idempotencyKey: string;
  }): Promise<{
    submissionId: string;
    status: GovernmentSubmissionStatus;
    externalReference: string | null;
    duplicate: boolean;
  }> {
    const action = `government.${input.agencyCode.toLowerCase()}.submit`;
    const { adapter } = await this.authorize(input.actor, input.agencyCode, input.permission, action);
    if (!adapter.submit) {
      throw new GovernmentGatewayError(
        "UNSUPPORTED_CAPABILITY",
        `${input.agencyCode} adapter does not support submissions.`,
      );
    }
    if (adapter.submitSchema) {
      const parsed = adapter.submitSchema.safeParse(input.payload);
      if (!parsed.success) {
        throw new GovernmentGatewayError("INVALID_PAYLOAD", "Payload failed the agency contract schema.");
      }
    }

    const tenantId = input.actor.principal.tenantId;
    const payloadDigest = sha256(stableStringify(input.payload));

    // Idempotency: an existing submission for (tenant, agency, key) is the
    // answer — a duplicate government submission must never happen (§38).
    const [existing] = await db
      .select()
      .from(governmentSubmissions)
      .where(
        and(
          eq(governmentSubmissions.tenantId, tenantId),
          eq(governmentSubmissions.agencyCode, input.agencyCode),
          eq(governmentSubmissions.idempotencyKey, input.idempotencyKey),
        ),
      );
    if (existing) {
      if (existing.payloadDigest !== payloadDigest) {
        throw new GovernmentGatewayError(
          "DUPLICATE_SUBMISSION",
          "Idempotency key reuse with a different payload.",
          409,
        );
      }
      return {
        submissionId: existing.id,
        status: existing.status as GovernmentSubmissionStatus,
        externalReference: existing.externalReference,
        duplicate: true,
      };
    }

    const id = newId(ID_PREFIX.integration);
    await db.insert(governmentSubmissions).values({
      id,
      tenantId,
      legalEntityId: input.legalEntityId,
      agencyCode: input.agencyCode,
      submissionType: input.submissionType,
      status: "PENDING_EXTERNAL",
      payloadDigest,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.actor.correlationId,
      submittedByUserId: input.actor.principal.userId,
    });

    let result: AdapterSubmitResult;
    try {
      result = await adapter.submit(input.payload, {
        idempotencyKey: input.idempotencyKey,
        correlationId: input.actor.correlationId,
      });
    } catch {
      // Fail closed: adapter faults are never surfaced as government facts.
      result = { outcome: "EXTERNAL_UNAVAILABLE", detail: "ADAPTER_FAULT" };
    }

    const transition = this.submissionTransition(result);
    await db
      .update(governmentSubmissions)
      .set({
        status: transition.status,
        externalReference: transition.externalReference,
        responseDigest: transition.responseDigest,
        lastErrorCode: transition.errorCode,
        attemptCount: 1,
        updatedAt: new Date(),
      })
      .where(eq(governmentSubmissions.id, id));

    await recordAudit({
      tenantId,
      actorUserId: input.actor.principal.userId,
      action,
      objectType: "GOVERNMENT_SUBMISSION",
      objectId: id,
      outcome: transition.status === "ACCEPTED" || transition.status === "SUBMITTED" ? "SUCCESS" : "FAILURE",
      reason: transition.errorCode ?? transition.status,
      authority: input.permission,
      newValue: {
        agencyCode: input.agencyCode,
        submissionType: input.submissionType,
        status: transition.status,
        payloadDigest,
        externalReference: transition.externalReference,
      },
      ipAddress: input.actor.ipAddress ?? null,
      userAgent: input.actor.userAgent ?? null,
      traceId: input.actor.traceId,
    });

    return {
      submissionId: id,
      status: transition.status,
      externalReference: transition.externalReference,
      duplicate: false,
    };
  }

  /**
   * Verification lookup (NIDA NIN check, BRELA company check, NHIF
   * eligibility). Read-shaped but still audited — a verification against a
   * government identity register is a material data access.
   */
  async verify(input: {
    actor: GovernmentActor;
    agencyCode: string;
    permission: PermissionCode;
    subject: Record<string, string>;
  }): Promise<AdapterVerifyResult> {
    const action = `government.${input.agencyCode.toLowerCase()}.verify`;
    const { adapter } = await this.authorize(input.actor, input.agencyCode, input.permission, action);
    if (!adapter.verify) {
      throw new GovernmentGatewayError(
        "UNSUPPORTED_CAPABILITY",
        `${input.agencyCode} adapter does not support verification.`,
      );
    }

    let result: AdapterVerifyResult;
    try {
      result = await adapter.verify(input.subject, {
        idempotencyKey: newId(ID_PREFIX.integration),
        correlationId: input.actor.correlationId,
      });
    } catch {
      result = { outcome: "EXTERNAL_UNAVAILABLE", detail: "ADAPTER_FAULT" };
    }

    // Audit records the SUBJECT DIGEST, never raw identity attributes: an
    // audit reader must not learn a NIN or company register entry from the log.
    await recordAudit({
      tenantId: input.actor.principal.tenantId,
      actorUserId: input.actor.principal.userId,
      action,
      objectType: "GOVERNMENT_VERIFICATION",
      objectId: sha256(stableStringify(input.subject)).slice(0, 32),
      outcome: "verified" in result && result.verified ? "SUCCESS" : "FAILURE",
      reason:
        "verified" in result
          ? result.verified
            ? "VERIFIED"
            : result.errorCode
          : result.outcome,
      authority: input.permission,
      ipAddress: input.actor.ipAddress ?? null,
      userAgent: input.actor.userAgent ?? null,
      traceId: input.actor.traceId,
    });

    return result;
  }

  /** Map an adapter result onto the fail-closed submission state machine. */
  private submissionTransition(result: AdapterSubmitResult): {
    status: GovernmentSubmissionStatus;
    externalReference: string | null;
    responseDigest: string | null;
    errorCode: string | null;
  } {
    switch (result.outcome) {
      case "ACCEPTED":
        return {
          status: "ACCEPTED",
          externalReference: result.externalReference,
          responseDigest: sha256(result.rawResponse),
          errorCode: null,
        };
      case "REJECTED":
        return {
          status: "REJECTED",
          externalReference: null,
          responseDigest: sha256(result.rawResponse),
          errorCode: result.errorCode,
        };
      case "RETRY_REQUIRED":
        return { status: "RETRY_REQUIRED", externalReference: null, responseDigest: null, errorCode: result.errorCode };
      case "EXTERNAL_UNAVAILABLE":
        return { status: "EXTERNAL_UNAVAILABLE", externalReference: null, responseDigest: null, errorCode: "EXTERNAL_UNAVAILABLE" };
      case "EXTERNAL_BLOCKED":
        return {
          status: "EXTERNAL_BLOCKED",
          externalReference: null,
          responseDigest: null,
          errorCode: `MISSING:${result.missing.join(",")}`,
        };
    }
  }
}
