/**
 * Outbox operator endpoints (Phase 8) — operator-authorized ONLY.
 *
 * These are NOT client-facing APIs. Replay of dead-lettered governed events
 * and reconciliation state repairs are privileged operations actions:
 *
 *   * global JwtAuthGuard + CsrfDoubleSubmitGuard apply (app.module APP_GUARD)
 *   * @RequirePermission("outbox:replay" | "outbox:reconcile") — the admin
 *     (Hospital Administrator) and trustee (constitutional oversight) roles
 *     hold these permissions; nobody else
 *   * an inline fail-closed secondary permission check (defense in depth,
 *     same convention as the MFA admin reset endpoint)
 *   * every action is written to the tamper-evident health audit chain with
 *     the operator's identity and mandatory reason
 *   * idempotency survives replay: BEYU's idempotency receipt turns a
 *     replayed delivery into duplicate:true with the ORIGINAL event id —
 *     replay can never create a second business effect
 */
import { Body, Controller, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { CsrfOriginGuard } from "../../common/security/csrf-origin.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { OutboxOpsService, type ReconcileReport, type ReplayResult } from "./outbox-ops.service";

@Controller("api/events/outbox")
export class OutboxOpsController {
  constructor(private readonly ops: OutboxOpsService) {}

  /** Operator-authorized replay of dead-lettered / failed / blocked events. */
  @UseGuards(JwtAuthGuard, CsrfOriginGuard)
  @Post("replay")
  @RequirePermission("outbox:replay")
  async replay(
    @Body() body: { idempotencyKeys?: string[]; all?: boolean; reason: string },
    // The guard populates req.user; typed loosely to match repo convention.
    @Req() req: { user?: { userId: string; tenantId: string | null; email?: string | null; permissions?: string[] } },
  ): Promise<ReplayResult> {
    const actor = req.user;
    if (!actor) throw new UnauthorizedException("NO_ACTOR");
    // Fail-closed secondary assertion (guard is the canonical enforcement).
    if (!actor.permissions?.includes("outbox:replay")) {
      throw new UnauthorizedException("OUTBOX_REPLAY_FORBIDDEN");
    }
    return this.ops.replay({
      idempotencyKeys: body?.idempotencyKeys,
      all: body?.all === true,
      reason: body?.reason ?? "",
      operator: { userId: actor.userId, tenantId: actor.tenantId, email: actor.email ?? null },
    });
  }

  /** Reconciliation report; repairs additionally require outbox:replay. */
  @UseGuards(JwtAuthGuard, CsrfOriginGuard)
  @Post("reconcile")
  @RequirePermission("outbox:reconcile")
  async reconcile(
    @Body() body: { repair?: boolean; limit?: number },
    @Req() req: { user?: { userId: string; tenantId: string | null; email?: string | null; permissions?: string[] } },
  ): Promise<ReconcileReport> {
    const actor = req.user;
    if (!actor) throw new UnauthorizedException("NO_ACTOR");
    if (!actor.permissions?.includes("outbox:reconcile")) {
      throw new UnauthorizedException("OUTBOX_RECONCILE_FORBIDDEN");
    }
    const repair = body?.repair === true;
    // Repairing state is a mutation on par with replay: require BOTH
    // permissions fail-closed (defense in depth beyond the route guard).
    if (repair && !actor.permissions?.includes("outbox:replay")) {
      throw new UnauthorizedException("OUTBOX_REPAIR_FORBIDDEN");
    }
    return this.ops.reconcile({ repair, limit: body?.limit });
  }
}
