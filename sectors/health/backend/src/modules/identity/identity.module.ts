import { Module, Global } from "@nestjs/common";
import { IdentityRepository } from "./identity.repository";
import { SessionService } from "./session.service";
import { AuditService } from "./audit.service";
import { MfaService } from "./mfa.service";
import { BeyuIdentityBridge } from "./beyu-bridge";
import { IdentityFederationService } from "./identity-federation.service";

/**
 * Identity foundation module — owns the persistent identity repositories and
 * services. DB_CONNECTION is NOT provided here: it resolves from the global
 * DbModule (src/common/db/db.module.ts), so the identity path and every domain
 * module share ONE pool built from ONE contract (buildPgPoolConfig). A second
 * provider here previously read DATABASE_URL while DbModule read DB_*, which
 * split a production process across two credential sources.
 * Integration tests construct the repositories with a PGlite connection directly.
 */
@Global()
@Module({
  providers: [
    IdentityRepository,
    SessionService,
    AuditService,
    MfaService,
    // BEYU OS integration: canonical identity bridge + isolation boundary
    // guards (links sector domain identities to the ONE BEYU GlobalUserID).
    BeyuIdentityBridge,
    // Canonical identity federation (register/login/refresh/middleware gates).
    // IdentityAdapter comes from the @Global() BeyuIntegrationModule.
    IdentityFederationService,
  ],
  exports: [
    IdentityRepository,
    SessionService,
    AuditService,
    MfaService,
    BeyuIdentityBridge,
    IdentityFederationService,
  ],
})
export class IdentityModule {}
