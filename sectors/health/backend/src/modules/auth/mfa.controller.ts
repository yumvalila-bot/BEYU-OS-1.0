import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { JwtAuthGuard } from "./guards/jwt.guard";
import { MfaService } from "./mfa.service";
import { CsrfOriginGuard } from "../../common/security/csrf-origin.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { RequiresMfaStepUp } from "../../common/security/mfa-stepup.guard";
import { RequiresGovernance } from "../../integrations/beyu/guards/governance-authorization.guard";

/**
 * MFA HTTP controller. Implements enrollment, activation, challenge,
 * verification, recovery and admin-reset endpoints. Production-ready contract.
 *
 * WebAuthn endpoints are intentionally NOT exposed (PARTIALLY_IMPLEMENTED at
 * service layer; RP configuration is ARCHITECTURE-BLOCKED).
 */
@Controller("auth/mfa")
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  @UseGuards(JwtAuthGuard, CsrfOriginGuard)
  @Post("enroll/totp")
  async enrollTotp(@Req() req: any, @Body() body: { label?: string; issuer?: string }) {
    const actor = req.user;
    if (!actor) throw new UnauthorizedException("NO_ACTOR");
    return this.mfa.enrollTotp({
      globalUserId: actor.userId,
      tenantId: actor.tenantId,
      label: body.label,
      issuer: body.issuer,
    });
  }

  @UseGuards(JwtAuthGuard, CsrfOriginGuard)
  @Post("activate")
  @HttpCode(HttpStatus.NO_CONTENT)
  async activate(@Req() req: any, @Body() body: { challengeId: string; otp: string }) {
    const actor = req.user;
    if (!actor) throw new UnauthorizedException("NO_ACTOR");
    await this.mfa.activateTotp({
      globalUserId: actor.userId,
      tenantId: actor.tenantId,
      challengeId: body.challengeId,
      otp: body.otp,
    });
  }

  @UseGuards(JwtAuthGuard, CsrfOriginGuard)
  @Post("challenge")
  async challenge(@Req() req: any, @Body() body: { type: "verify" | "step_up"; userAgent?: string }) {
    const actor = req.user;
    if (!actor) throw new UnauthorizedException("NO_ACTOR");
    return this.mfa.createChallenge({
      globalUserId: actor.userId,
      tenantId: actor.tenantId,
      type: body.type ?? "verify",
      ip: req.ip,
      userAgent: body.userAgent ?? req.headers["user-agent"],
    });
  }

  @UseGuards(JwtAuthGuard, CsrfOriginGuard)
  @Post("verify")
  async verify(@Req() req: any, @Body() body: { challengeId: string; otp: string }) {
    const actor = req.user;
    if (!actor) throw new UnauthorizedException("NO_ACTOR");
    return this.mfa.verify({
      globalUserId: actor.userId,
      tenantId: actor.tenantId,
      challengeId: body.challengeId,
      otp: body.otp,
      ip: req.ip,
    });
  }

  @UseGuards(JwtAuthGuard, CsrfOriginGuard)
  @Post("recovery/redeem")
  async redeemRecovery(@Req() req: any, @Body() body: { code: string }) {
    const actor = req.user;
    if (!actor) throw new UnauthorizedException("NO_ACTOR");
    return this.mfa.redeemRecoveryCode({
      globalUserId: actor.userId,
      tenantId: actor.tenantId,
      code: body.code,
      ip: req.ip,
    });
  }

  @UseGuards(JwtAuthGuard, CsrfOriginGuard)
  @Post("admin/reset")
  @RequirePermission("tenant:admin")
  @RequiresMfaStepUp("mfa:admin:reset")
  @RequiresGovernance("mfa.admin_reset", "high")
  @HttpCode(HttpStatus.NO_CONTENT)
  async adminReset(
    @Req() req: any,
    @Body() body: { targetGlobalUserId: string; reason: string },
  ) {
    const actor = req.user;
    if (!actor) throw new UnauthorizedException("NO_ACTOR");
    // Defense-in-depth: the canonical permission is tenant:admin, enforced by
    // the global PermissionsGuard via @RequirePermission above. This inline
    // check is retained as a fail-closed secondary assertion.
    if (!actor.permissions?.includes("tenant:admin")) {
      throw new UnauthorizedException("MFA_ADMIN_RESET_FORBIDDEN");
    }
    await this.mfa.adminReset({
      targetGlobalUserId: body.targetGlobalUserId,
      tenantId: actor.tenantId,
      reason: body.reason,
    });
  }
}
