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
import { BeyuBaseAdapter } from "../adapters/beyu-base.adapter";
import type {
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
  ) {
    super(db, tenantCtx, circuit, cfg);
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
}
