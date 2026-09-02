/**
 * Noelia (governed BEYU AI identity) + HIVE (governed AI runtime) adapter.
 *
 * Health OS does NOT create a separate Health AI identity. AI outputs are
 * classified (informational/decision-support/recommendation/action-proposal/
 * human-approved-action/rejected/blocked) and never self-authorize
 * privileged actions. When HIVE/Noelia is unavailable, invocations are
 * BLOCKED — no fabricated responses.
 */
import { Injectable, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DbConnection,
  DB_CONNECTION,
} from "../../../modules/identity/db-connection";
import { TenantContext } from "../../../common/security/tenant-context";
import { CircuitBreaker } from "../../../modules/integrations/circuit-breaker";
import { AuditService } from "../../../modules/audit/audit.service";
import { inTx } from "../../../common/db/crud-factory";
import { BeyuBaseAdapter } from "../adapters/beyu-base.adapter";
import type {
  AiInvocationRequest,
  AiInvocationResponse,
} from "../contracts/shared.types";
import { randomUUID } from "crypto";

@Injectable()
export class NoeliaAdapter extends BeyuBaseAdapter {
  protected readonly config = {
    provider: "beyu.noelia",
    endpointEnv: "BEYU_HIVE_ENDPOINT",
    credentialEnvs: ["BEYU_HIVE_TOKEN"],
    requiredForBoot: false,
    defaultTimeoutMs: 15000,
    maxRetries: 1,
    baseBackoffMs: 500,
  };

  constructor(
    @Inject(DB_CONNECTION) db: DbConnection,
    tenantCtx: TenantContext,
    circuit: CircuitBreaker,
    cfg: ConfigService,
    auditService: AuditService,
  ) {
    super(db, tenantCtx, circuit, cfg, auditService);
  }

  /**
   * Invoke a governed AI capability. Fail-closed when HIVE is not configured;
   * never fabricate model outputs. High-risk clinical AI automatically
   * requires human approval.
   */
  async invoke(req: AiInvocationRequest): Promise<AiInvocationResponse> {
    await this.auditInvocation(req);

    if (this.getState() === "NOT_CONFIGURED") {
      return {
        invocationId: randomUUID(),
        outputClass: "blocked",
        outputRef: null,
        riskClassification: req.riskLevel,
        humanReviewer: null,
        approvalStatus:
          req.requiresHumanApproval || req.riskLevel === "critical"
            ? "pending"
            : "not_required",
        blocked: true,
        failureReason:
          "Noelia/HIVE EXTERNAL-BLOCKED: HIVE endpoint and token not configured; AI invocation blocked. No fabricated response.",
      };
    }
    return this.execute(
      "invoke",
      req,
      async (): Promise<AiInvocationResponse> => {
        throw new Error(
          "Noelia/HIVE HTTP transport not implemented in this build.",
        );
      },
    );
  }

  /** Mark an AI output as human-approved (binds the reviewer globalUserId). */
  async markHumanApproved(
    invocationId: string,
    reviewerGlobalUserId: string,
  ): Promise<void> {
    await inTx(this.db, this.tenantCtx, (tx) =>
      this.auditService.record(tx, {
        operation: "ai.human_approve",
        resourceType: "ai_invocation",
        resourceId: invocationId,
        metadata: { reviewerGlobalUserId },
        authDecision: "allowed",
        resultStatus: "ok",
        sourceService: "health-api",
      }),
    );
  }

  private async auditInvocation(req: AiInvocationRequest): Promise<void> {
    try {
      await inTx(this.db, this.tenantCtx, (tx) =>
        this.auditService.record(tx, {
          operation: "ai.invoke",
          resourceType: "ai_invocation",
          resourceId: null,
          metadata: {
            capability: req.capability,
            riskLevel: req.riskLevel,
            modelProviderId: req.modelProviderId ?? null,
            modelVersion: req.modelVersion ?? null,
            inputRef: req.inputRef,
            requiresHumanApproval: req.requiresHumanApproval,
            propagationCorrelationId: req.propagation?.correlationId ?? null,
          },
          authDecision: "allowed",
          resultStatus: "ok",
          sourceService: "health-api",
        }),
      );
    } catch (e) {
      // Best-effort, deliberately: invoke() must still return its blocked,
      // fail-closed response when HIVE is EXTERNAL-BLOCKED. The mandatory
      // pre-call gate for any outbound dispatch is the health.beyu_outbox row
      // execute() writes before the call. The failure is never silent.
      this.logger.error(
        `ai.invoke audit write failed for capability ` +
          `'${req.capability}': ${(e as Error).message}`,
      );
    }
  }
}
