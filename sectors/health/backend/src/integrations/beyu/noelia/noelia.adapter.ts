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
import { DbConnection, DB_CONNECTION } from "../../../modules/identity/db-connection";
import { TenantContext } from "../../../common/security/tenant-context";
import { CircuitBreaker } from "../../../modules/integrations/circuit-breaker";
import { BeyuBaseAdapter } from "../adapters/beyu-base.adapter";
import type { AiInvocationRequest, AiInvocationResponse } from "../contracts/shared.types";
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
  ) { super(db, tenantCtx, circuit, cfg); }

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
        approvalStatus: req.requiresHumanApproval || req.riskLevel === "critical" ? "pending" : "not_required",
        blocked: true,
        failureReason: "Noelia/HIVE EXTERNAL-BLOCKED: HIVE endpoint and token not configured; AI invocation blocked. No fabricated response.",
      };
    }
    return this.execute("invoke", req, async (): Promise<AiInvocationResponse> => {
      throw new Error("Noelia/HIVE HTTP transport not implemented in this build.");
    });
  }

  /** Mark an AI output as human-approved (binds the reviewer globalUserId). */
  async markHumanApproved(invocationId: string, reviewerGlobalUserId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO health.audit_events
          (tenant_id, actor_id, operation, resource_type, resource_id, metadata,
           correlation_id, auth_decision, result_status, source_service)
       VALUES (CASE WHEN $1::uuid IS NULL THEN NULL ELSE $1::uuid END,
               CASE WHEN $2::uuid IS NULL THEN NULL ELSE $2::uuid END,
               'ai.human_approve','ai_invocation',$3,$4::jsonb,
               current_setting('app.correlation_id',true),'allowed','ok','health-api')`,
      [
        this.tenantCtx.current()?.tenantId ?? null,
        this.tenantCtx.current()?.userId ?? null,
        invocationId,
        JSON.stringify({ reviewerGlobalUserId }),
      ],
    );
  }

  private async auditInvocation(req: AiInvocationRequest): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO health.audit_events
            (tenant_id, actor_id, operation, resource_type, resource_id, metadata,
             correlation_id, auth_decision, result_status, source_service)
         VALUES (CASE WHEN $1::uuid IS NULL THEN NULL ELSE $1::uuid END,
                 CASE WHEN $2::uuid IS NULL THEN NULL ELSE $2::uuid END,
                 'ai.invoke','ai_invocation',NULL,$3::jsonb,$4,'allowed','ok','health-api')`,
        [
          req.actor.tenantId as any,
          req.actor.globalUserId as any,
          JSON.stringify({
            capability: req.capability,
            riskLevel: req.riskLevel,
            modelProviderId: req.modelProviderId ?? null,
            modelVersion: req.modelVersion ?? null,
            inputRef: req.inputRef,
            requiresHumanApproval: req.requiresHumanApproval,
          }),
          req.propagation.correlationId,
        ],
      );
    } catch {
      // ignore
    }
  }
}
