/**
 * HcmAuthorizationGuard — enforces that the authenticated actor has a
 * verified HCM practitioner record eligible for the requested action.
 *
 * Used on clinical endpoints that require verified licensure. When HCM is
 * EXTERNAL-BLOCKED, high-risk actions are denied with
 * HCM_EXTERNAL_VERIFICATION_REQUIRED so no fabricated licensure passes.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { HcmAdapter } from "../hcm/hcm.adapter";

export const HCM_ACTION_KEY = "hcm:action";
export const HCM_SCOPE_KEY = "hcm:scope";
export const RequireHcmPractitioner = (
  action: string,
  opts: { scope?: string[] } = {},
) => {
  // Decorator: set metadata consumed by the guard.
  return (target: any, key?: any, desc?: any) => {
    if (desc) {
      Reflect.defineMetadata(HCM_ACTION_KEY, action, desc.value);
      if (opts.scope)
        Reflect.defineMetadata(HCM_SCOPE_KEY, opts.scope, desc.value);
      return desc;
    }
    Reflect.defineMetadata(HCM_ACTION_KEY, action, target);
    if (opts.scope) Reflect.defineMetadata(HCM_SCOPE_KEY, opts.scope, target);
    return target;
  };
};

@Injectable()
export class HcmAuthorizationGuard implements CanActivate {
  constructor(
    private readonly hcm: HcmAdapter,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<string>(HCM_ACTION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!action) return true; // no HCM requirement
    const scope =
      this.reflector.getAllAndOverride<string[]>(HCM_SCOPE_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? [];
    const req = ctx.switchToHttp().getRequest();
    const res = await this.hcm.authorizeClinicalActor({
      action,
      facilityId: req.user?.facilityId ?? null,
      requiredScope: scope,
    });
    if (!res.authorized) {
      throw new ForbiddenException(res.reason ?? "HCM_AUTHORIZATION_DENIED");
    }
    req.hcmPractitioner = res.record;
    return true;
  }
}
