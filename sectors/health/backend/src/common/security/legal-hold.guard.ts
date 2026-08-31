/**
 * @CheckLegalHold + LegalHoldGuard — blocks destructive writes (DELETE /
 * PUT / PATCH) on resources subject to an active legal hold. Returns
 * HTTP 423 LOCKED with code LEGAL_HOLD_ACTIVE (or LEGAL_HOLD_INFRASTRUCTURE_REQUIRED
 * if the legal_holds table is missing — fail-closed even on bootstrap).
 *
 * Decorator accepts either a static resourceType string or { paramKey } to
 * read the resource type from a URL param (used for generic controllers
 * like SupabaseController where `:table` carries the table name).
 *
 * DB triggers (`block_void_patients_when_held`, `block_void_encounters_when_held`,
 * extended in migration 017) provide defence-in-depth — even a request that
 * bypasses the HTTP layer will fail at the database.
 */
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Inject } from "@nestjs/common";
import { DbConnection, DB_CONNECTION } from "../../modules/identity/db-connection";
import { TenantContext } from "./tenant-context";
import { SetMetadata } from "@nestjs/common";

export const LEGAL_HOLD_KEY = "legalhold:resource";
const HTTP_LOCKED = 423;

export function CheckLegalHold(resourceType: string | { paramKey: string }): any {
  return SetMetadata(LEGAL_HOLD_KEY, resourceType);
}

function locked(body: Record<string, unknown>): never {
  throw new HttpException(body, HTTP_LOCKED);
}

@Injectable()
export class LegalHoldGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly tenantCtx: TenantContext,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<string | { paramKey?: string } | null>(
      LEGAL_HOLD_KEY, [ctx.getHandler(), ctx.getClass()],
    );
    if (!meta) return true;
    const req = ctx.switchToHttp().getRequest();
    const method = req.method?.toUpperCase() ?? "GET";
    if (method !== "DELETE" && method !== "PUT" && method !== "PATCH") return true;
    const actor = this.tenantCtx.current();
    if (!actor) return true;
    const resourceType = typeof meta === "string" ? meta : req.params?.[meta.paramKey ?? "table"] ?? null;
    if (!resourceType) return true;
    const resourceId = req.params?.id ?? req.params?.resourceId ?? null;
    const tenantId = actor.tenantId;

    const tableExists = await this.db.query<{ exists: string }>(
      `SELECT to_regclass('health.legal_holds') IS NOT NULL AS exists`,
    );
    if (!(tableExists as any[])[0]?.exists) {
      locked({ code: "LEGAL_HOLD_INFRASTRUCTURE_REQUIRED" });
    }
    const holds = await this.db.query<{ hold_id: string; scope: string; resource_id: string | null }>(
      `SELECT hold_id, scope, resource_id
         FROM health.legal_holds
        WHERE tenant_id = $1::uuid
          AND resource_type = $2
          AND status = 'active'
          AND (released_at IS NULL OR released_at > now())`,
      [tenantId, resourceType],
    );
    for (const h of holds as any[]) {
      if (h.scope === "all" || h.scope === "tenant_wide") {
        locked({ code: "LEGAL_HOLD_ACTIVE", holdId: h.hold_id, scope: "tenant_wide" });
      }
      if (resourceId && h.scope === "resource" && String(h.resource_id) === String(resourceId)) {
        locked({ code: "LEGAL_HOLD_ACTIVE", holdId: h.hold_id, scope: "resource" });
      }
    }
    return true;
  }
}
