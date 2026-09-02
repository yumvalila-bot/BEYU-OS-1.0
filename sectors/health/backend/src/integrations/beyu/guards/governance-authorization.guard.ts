/**
 * GovernanceAuthorizationGuard — consults Governance for authoritative
 * policy decision before allowing a high-risk action. If governance denies
 * (or is unavailable on a high-risk action), the request is FORBIDDEN.
 * Health OS NEVER overrides a DENY.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { GovernanceAdapter } from "../governance/governance.adapter";
import type { RiskLevel } from "../contracts/shared.types";

export const GOV_ACTION_KEY = "gov:action";
export const GOV_RISK_KEY = "gov:risk";
export const RequiresGovernance = (
  action: string,
  risk: RiskLevel = "medium",
) => {
  return (target: any, key?: any, desc?: any) => {
    const set = (t: any) => {
      Reflect.defineMetadata(GOV_ACTION_KEY, action, t);
      Reflect.defineMetadata(GOV_RISK_KEY, risk, t);
    };
    if (desc) {
      set(desc.value);
      return desc;
    }
    set(target);
    return target;
  };
};

@Injectable()
export class GovernanceAuthorizationGuard implements CanActivate {
  constructor(
    private readonly gov: GovernanceAdapter,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<string>(GOV_ACTION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!action) return true;
    const risk =
      this.reflector.getAllAndOverride<RiskLevel>(GOV_RISK_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? "medium";
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    const actor = {
      globalUserId: user?.globalUserId ?? user?.userId,
      email: user?.email ?? null,
      tenantId: user?.tenantId,
      entityCode: user?.entityCode ?? null,
      countryCode: user?.countryCode ?? null,
      licenceNumber: user?.licenceNumber ?? null,
      practitionerId: user?.practitionerId ?? null,
      facilityId: user?.facilityId ?? null,
      sessionId: user?.sessionId ?? null,
      role: user?.role ?? "unknown",
      permissions: user?.permissions ?? [],
      timezone: user?.timezone ?? null,
      sourceService: "health-os" as const,
    };
    if (!actor.tenantId || !actor.globalUserId) {
      throw new ForbiddenException("NO_ACTOR");
    }
    const decision = await this.gov.decideOrFailClosed({
      actor,
      propagation: {
        correlationId: req?.correlationId ?? "no-context",
        causationId: null,
        requestId: req?.requestId ?? "no-context",
        idempotencyKey: undefined,
        timestamp: new Date().toISOString(),
      },
      action,
      resourceType: req?.route?.path ?? "unknown",
      resourceId: req?.params?.id ?? null,
      riskLevel: risk,
    });
    req.governanceDecision = decision;
    if (decision.decision !== "APPROVE") {
      throw new ForbiddenException(decision.reasonCode ?? "GOVERNANCE_DENIED");
    }
    return true;
  }
}
