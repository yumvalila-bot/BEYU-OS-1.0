/**
 * Legal-hold service.
 *
 * Destructive operations (void/delete) against held resources are blocked:
 *  - at the database trigger level on patients/encounters,
 *  - at the service layer for other resource types (service-layer check
 *    required before any DELETE/void).
 */
import { Inject, Injectable } from "@nestjs/common";
import { DbConnection, DB_CONNECTION } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { withIsolation, atomicWrite } from "../identity/db-utils";
import { AuditService } from "../audit/audit.service";
import { DomainError } from "../../common/errors/domain.error";

@Injectable()
export class LegalHoldsService {
  constructor(
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly tenantCtx: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async place(input: { resource_type: string; resource_id?: string; reason: string; ordered_by: string }): Promise<{ hold_id: string }> {
    return atomicWrite(this.db, this.tenantCtx, this.audit, {
      resourceType: "legal_hold",
      operation: "legal_hold.place",
      work: async (tx) => {
        const actor = this.tenantCtx.require();
        const rows = await tx.query<{ hold_id: string }>(
          `INSERT INTO health.legal_holds (tenant_id, resource_type, resource_id, reason, ordered_by, created_by)
           VALUES (current_setting('app.tenant_id', true)::uuid, $1, $2, $3, $4, $5) RETURNING hold_id`,
          [input.resource_type, input.resource_id ?? null, input.reason, input.ordered_by, actor.userId],
        );
        return rows[0];
      },
    });
  }

  async release(holdId: string): Promise<void> {
    return atomicWrite(this.db, this.tenantCtx, this.audit, {
      resourceType: "legal_hold",
      resourceId: holdId,
      operation: "legal_hold.release",
      work: async (tx) => {
        await tx.query(
          `UPDATE health.legal_holds SET released_at=now() WHERE hold_id=$1
            AND tenant_id=current_setting('app.tenant_id', true)::uuid AND released_at IS NULL`,
          [holdId],
        );
      },
    });
  }

  /** Fail-closed assertion: throws if any active hold covers the resource. */
  async assertNotHeld(resourceType: string, resourceId?: string): Promise<void> {
    const blocked = await withIsolation(this.db, this.tenantCtx, "legal_hold", async (tx) => {
      const rows = await tx.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM health.legal_holds
          WHERE tenant_id=current_setting('app.tenant_id', true)::uuid
            AND resource_type=$1
            AND (resource_id IS NULL OR $2::uuid IS NULL OR resource_id=$2::uuid)
            AND released_at IS NULL`,
        [resourceType, resourceId ?? null],
      );
      return Number(rows[0]?.n ?? 0) > 0;
    });
    if (blocked) throw DomainError.forbidden(`LEGAL_HOLD_ACTIVE: destructive operation on ${resourceType} blocked`);
  }
}
