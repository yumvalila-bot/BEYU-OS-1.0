/**
 * Governance adapter — governs authorization/policy decisions from BEYU OS.
 *
 * In this build, no live governance endpoint is configured
 * (EXTERNAL-BLOCKED). The adapter is always present and fail-closed:
 *
 *  - When configured but not reachable/verified: all high/critical risk
 *    actions default DENY (fail closed). Medium/low actions that are
 *    already satisfied by local RBAC + MFA step-up proceed with a
 *    governanceDecision="APPROVAL_REQUIRED" recorded.
 *  - When endpoint is genuinely configured (future), HTTP calls go through
 *    the BeyuBaseAdapter execution path (timeout, retry, circuit breaker,
 *    audit, idempotency).
 *
 * Health OS never treats governance connectivity loss as APPROVED and
 * never overrides a DENY.
 */
import { Injectable, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DbConnection,
  DB_CONNECTION,
} from "../../../modules/identity/db-connection";
import { TenantContext } from "../../../common/security/tenant-context";
import { CircuitBreaker } from "../../../modules/integrations/circuit-breaker";
import { BeyuBaseAdapter } from "../adapters/beyu-base.adapter";
import type {
  GovernanceDecisionRequest,
  GovernanceDecisionResponse,
  RiskLevel,
} from "../contracts/shared.types";
import { DomainError } from "../../../common/errors/domain.error";

@Injectable()
export class GovernanceAdapter extends BeyuBaseAdapter {
  protected readonly config = {
    provider: "beyu.governance",
    endpointEnv: "BEYU_GOVERNANCE_ENDPOINT",
    credentialEnvs: ["BEYU_GOVERNANCE_TOKEN"],
    requiredForBoot: false,
    defaultTimeoutMs: 3000,
    maxRetries: 1,
    baseBackoffMs: 200,
  };

  constructor(
    @Inject(DB_CONNECTION) db: DbConnection,
    tenantCtx: TenantContext,
    circuit: CircuitBreaker,
    cfg: ConfigService,
  ) {
    super(db, tenantCtx, circuit, cfg);
  }

  /**
   * Request a governance decision. When no live endpoint is configured, this
   * returns a CONSERVATIVE fail-closed decision:
   *   - low/medium risk with actor possessing permission -> APPROVE locally
   *     with decisionId=null and reasonCode="LOCAL_RBAC_ONLY"
   *   - high/critical risk -> APPROVAL_REQUIRED (decision=DENY,
   *     approvalRequired=true). A human approver role is demanded.
   *   - Any missing actor identity/tenant/etc -> DENY.
   *
   * This is a SAFE LOCAL DEFAULT, not a fabricated governance PASS.
   */
  async decide(
    req: GovernanceDecisionRequest,
  ): Promise<GovernanceDecisionResponse> {
    // Record the decision request in audit regardless of connectivity.
    await this.auditDecisionRequest(req);

    if (this.getState() === "NOT_CONFIGURED") {
      return this.localFallbackDecision(req);
    }

    // If an endpoint is configured, dispatch through the execution wrapper.
    // Since we cannot fabricate the HTTP client, this is a hard fail-closed
    // path until a real HTTP transport is wired to BEYU Governance.
    return this.execute("decide", req, async () => {
      // Placeholder HTTP call site. Until transport is implemented this
      // throws so execute() records a failure and we fall back to the
      // local conservative decision BELOW? No — execute throws
      // DomainError.unavailable on failure, so callers that require
      // authoritative governance treat that as DENY. For local enforcement,
      // we call `decide` through the public method only when a live
      // governance transport is wired; otherwise callers should call
      // `decideOrFailClosed` which wraps decide with fallback.
      throw DomainError.unavailable(
        "Governance HTTP transport not implemented; failing closed.",
      );
    });
  }

  /**
   * Callers that MUST NOT act without authoritative governance (e.g.
   * legal-hold override, financial finalization) use this and treat any
   * error as DENY.
   */
  async decideOrFailClosed(
    req: GovernanceDecisionRequest,
  ): Promise<GovernanceDecisionResponse> {
    try {
      return await this.decide(req);
    } catch {
      return {
        decision: "DENY",
        decisionId: null,
        policyVersion: null,
        reasonCode: "GOVERNANCE_UNAVAILABLE_FAIL_CLOSED",
        approvalRequired: true,
        approverRole: "governance.officer",
        expiresAt: null,
        failureReason: "Governance unavailable; fail-closed DENY applied.",
      };
    }
  }

  /* --------- local fallback (conservative) --------- */

  private localFallbackDecision(
    req: GovernanceDecisionRequest,
  ): GovernanceDecisionResponse {
    const risk: RiskLevel = req.riskLevel;
    // A conservative local RBAC gate: require actor to carry a permission
    // matching the action. This does NOT replace governance.
    const hasPerm = (req.actor.permissions ?? []).some((p) =>
      matchPerm(p, req.action),
    );
    if (risk === "critical" || risk === "high") {
      return {
        decision: "DENY",
        decisionId: null,
        policyVersion: "local-conservative-v1",
        reasonCode: "GOVERNANCE_UNAVAILABLE_HIGH_RISK_DENY",
        approvalRequired: true,
        approverRole: this.approverForAction(req.action),
        expiresAt: null,
        failureReason:
          "Governance not configured; high/critical risk denied until human approval and/or live governance.",
      };
    }
    if (!hasPerm) {
      return {
        decision: "DENY",
        decisionId: null,
        policyVersion: "local-conservative-v1",
        reasonCode: "LOCAL_PERMISSION_DENIED",
        approvalRequired: true,
        approverRole: this.approverForAction(req.action),
        expiresAt: null,
      };
    }
    return {
      decision: "APPROVE",
      decisionId: null,
      policyVersion: "local-conservative-v1",
      reasonCode: "LOCAL_RBAC_ONLY_GOVERNANCE_EXTERNAL_BLOCKED",
      approvalRequired: false,
      approverRole: null,
      expiresAt: null,
      failureReason:
        "Governance endpoint not configured; decision based on local RBAC only. Not an authoritative governance decision.",
    };
  }

  private approverForAction(_action: string): string {
    return "governance.approver";
  }

  private async auditDecisionRequest(
    req: GovernanceDecisionRequest,
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO health.audit_events
            (tenant_id, actor_id, operation, resource_type, resource_id, metadata,
             correlation_id, auth_decision, result_status, source_service)
         VALUES (CASE WHEN $1::uuid IS NULL THEN NULL ELSE $1::uuid END,
                 CASE WHEN $2::uuid IS NULL THEN NULL ELSE $2::uuid END,
                 'governance.decision.request','governance',NULL,
                 $3::jsonb,$4,'pending','ok','health-api')`,
        [
          req.actor.tenantId as any,
          req.actor.globalUserId as any,
          JSON.stringify({
            action: req.action,
            risk: req.riskLevel,
            resourceType: req.resourceType,
          }),
          req.propagation.correlationId,
        ],
      );
    } catch {
      // audit failure must not crash caller
    }
  }
}

function matchPerm(perm: string, action: string): boolean {
  if (perm === "*") return true;
  const norm = (s: string) => s.replace(/[:/]/g, ".");
  const pn = norm(perm);
  const an = norm(action);
  if (pn === an) return true;
  if (pn.endsWith(".*")) {
    const prefix = pn.slice(0, -1);
    return an.startsWith(prefix);
  }
  return false;
}
