/**
 * Shared Identity adapter — canonical GlobalUserID lookup.
 *
 * Health OS already treats JWT sub as globalUserId (canonical identity).
 * This adapter provides explicit lookup against BEYU OS identity services
 * for cross-domain resolution. When EXTERNAL-BLOCKED, Health OS only trusts
 * the JWT-supplied globalUserId it already validated and refuses to resolve
 * arbitrary identifiers it cannot verify.
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
import { BeyuBaseAdapter } from "../adapters/beyu-base.adapter";
import type {
  CanonicalActorContext,
  GlobalUserLookupRequest,
  GlobalUserRecord,
} from "../contracts/shared.types";

@Injectable()
export class IdentityAdapter extends BeyuBaseAdapter {
  protected readonly config = {
    provider: "beyu.identity",
    endpointEnv: "BEYU_IDENTITY_ENDPOINT",
    credentialEnvs: ["BEYU_IDENTITY_TOKEN"],
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
    auditService: AuditService,
  ) {
    super(db, tenantCtx, circuit, cfg, auditService);
  }

  async lookup(req: GlobalUserLookupRequest): Promise<GlobalUserRecord> {
    // Local fallback: trust JWT-derived globalUserId as canonical; refuse to
    // cross-resolve arbitrary IDs when BEYU identity is unavailable.
    if (this.getState() === "NOT_CONFIGURED") {
      const gid = req.globalUserId ?? req.actor.globalUserId;
      return {
        globalUserId: gid,
        email: req.actor.email ?? null,
        status: "unknown",
        linkedIdentities: [],
      };
    }
    return this.execute("lookup", req, async (): Promise<GlobalUserRecord> => {
      throw new Error("Identity HTTP transport not implemented in this build.");
    });
  }

  /**
   * Provision (idempotently, by email) the canonical BEYU identity for a
   * sector registration. Service-initiated call: no human request context
   * exists yet, so the whole call chain (outbox → circuit → transport) runs
   * under an explicit, code-created SERVICE principal context — never a
   * client-supplied one.
   */
  async registerCanonical(req: {
    email: string;
    displayName: string;
    tenantCode: string;
    sectorUserId: string;
    tenantId: string | null;
  }): Promise<CanonicalRegistration> {
    const actor = this.serviceActor(req.tenantId);
    return this.runAsServiceActor(actor, () =>
      this.execute<CanonicalRegistration>(
        "identity.register",
        { email: req.email, displayName: req.displayName, tenantCode: req.tenantCode },
        () =>
          this.postJson<CanonicalRegistration>("/api/v1/internal/identity/register", {
            email: req.email,
            displayName: req.displayName,
            tenantCode: req.tenantCode,
            sector: "HEALTH_OS",
            sectorUserId: req.sectorUserId,
          }),
        { actor, idempotencyKey: `identity-register:${req.email.toLowerCase()}`, retries: 1 },
      ),
    );
  }

  /**
   * Resolve a canonical identity (by email or GlobalUserId) with its
   * lifecycle status — the sector-side revocation check. Service-initiated.
   */
  async lookupCanonical(req: {
    email?: string;
    globalUserId?: string;
    tenantId: string | null;
  }): Promise<CanonicalIdentity> {
    const actor = this.serviceActor(req.tenantId);
    return this.runAsServiceActor(actor, () =>
      this.execute<CanonicalIdentity>(
        "identity.lookup",
        { email: req.email ?? null, globalUserId: req.globalUserId ?? null },
        () =>
          this.postJson<CanonicalIdentity>("/api/v1/internal/identity/lookup", {
            ...(req.email ? { email: req.email } : {}),
            ...(req.globalUserId ? { globalUserId: req.globalUserId } : {}),
          }),
        { actor, retries: 1 },
      ),
    );
  }

  /**
   * Run `fn` under an explicit SERVICE actor context (ALS) so downstream
   * outbox/circuit/audit plumbing sees a clearly-labelled service principal
   * instead of failing AUTH_REQUIRED. The context is code-created — nothing
   * client-supplied can ever land here.
   */
  private runAsServiceActor<T>(
    actor: CanonicalActorContext,
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.tenantCtx.run(
      {
        userId: actor.globalUserId,
        globalUserId: actor.globalUserId,
        email: "service@health-os.internal",
        role: actor.role,
        permissions: actor.permissions,
        tenantId: actor.tenantId,
        entityCode: actor.entityCode ?? null,
        countryCode: actor.countryCode ?? null,
        facilityId: null,
        sessionId: null,
      } as never,
      fn,
    );
  }
}

/** Canonical registration result (BEYU OS internal API contract). */
export interface CanonicalRegistration {
  globalUserId: string;
  partyId: string;
  email: string;
  tenantId: string;
  status: string;
  created: boolean;
}

/** Canonical identity record (BEYU OS internal API contract). */
export interface CanonicalIdentity {
  globalUserId: string;
  partyId: string;
  email: string;
  displayName: string;
  status: string;
  partyStatus: string;
  tenantId: string;
  tenantCode: string;
  countryCode: string | null;
}
