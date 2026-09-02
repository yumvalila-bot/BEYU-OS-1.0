/**
 * Electronic signature service.
 *
 * Stores signature references (hash of signed payload) with signer identity,
 * professional license context, verification status, and correlation IDs.
 * Never stores PHI inline; references the signed resource by type/id.
 */
import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { DbConnection, DB_CONNECTION } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { withIsolation } from "../identity/db-utils";
import { DomainError } from "../../common/errors/domain.error";
import { AuditService } from "../audit/audit.service";
import { currentCorrelationId } from "../../common/observability/correlation-id.middleware";

export interface SignInput {
  resourceType: string;
  resourceId: string;
  action?: "sign" | "authorize" | "verify" | "dispense" | "co_sign";
  payloadToSign?: Record<string, unknown>;
  signatureMethod?: "application_session" | "certificate" | "external";
  metadata?: Record<string, unknown>;
}

@Injectable()
export class SignaturesService {
  constructor(
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly tenantCtx: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async sign(
    input: SignInput,
  ): Promise<{ signature_id: string; signature_hash: string }> {
    const actor = this.tenantCtx.current();
    if (!actor) throw new Error("AUTH_REQUIRED");
    const signatureHash = createHash("sha256")
      .update(
        JSON.stringify({
          actor: actor.userId,
          resource: `${input.resourceType}:${input.resourceId}`,
          action: input.action ?? "sign",
          ts: new Date().toISOString(),
          payload: input.payloadToSign ?? {},
        }),
      )
      .digest("hex");
    const cid = currentCorrelationId();
    return withIsolation(this.db, this.tenantCtx, "signature", async (tx) => {
      const rows = await tx.query<{ signature_id: string }>(
        `INSERT INTO health.signatures
           (tenant_id, entity_code, country_code, signer_global_user_id, practitioner_id,
            professional_license_number, resource_type, resource_id, action, signature_hash,
            signature_method, verification_status, correlation_id, metadata)
         VALUES (current_setting('app.tenant_id', true)::uuid,
                 current_setting('app.entity_code', true),
                 current_setting('app.country_code', true),
                 $1, $2, $3, $4, $5::uuid, $6, $7, $8, 'unverified', $9, $10::jsonb)
         RETURNING signature_id`,
        [
          actor.userId,
          (actor as any).practitionerId ?? null,
          actor.licenceNumber ?? null,
          input.resourceType,
          input.resourceId,
          input.action ?? "sign",
          signatureHash,
          input.signatureMethod ?? "application_session",
          cid,
          JSON.stringify(input.metadata ?? {}),
        ],
      );
      await this.audit.record(tx, {
        operation: `signature.${input.action ?? "sign"}`,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        after: {
          signature_id: rows[0].signature_id,
          signature_hash: signatureHash,
        },
      });
      return {
        signature_id: rows[0].signature_id,
        signature_hash: signatureHash,
      };
    });
  }

  async assertSigned(
    resourceType: string,
    resourceId: string,
    action = "sign",
  ): Promise<void> {
    const ok = await this.hasSignature(resourceType, resourceId, action);
    if (!ok)
      throw DomainError.forbidden(
        `Resource ${resourceType}:${resourceId} requires ${action} signature`,
      );
  }

  async hasSignature(
    resourceType: string,
    resourceId: string,
    action = "sign",
  ): Promise<boolean> {
    return withIsolation(this.db, this.tenantCtx, "signature", async (tx) => {
      const rows = await tx.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM health.signatures
          WHERE resource_type=$1 AND resource_id=$2 AND action=$3
            AND tenant_id=current_setting('app.tenant_id', true)::uuid`,
        [resourceType, resourceId, action],
      );
      return Number(rows[0]?.n ?? 0) > 0;
    });
  }
}
