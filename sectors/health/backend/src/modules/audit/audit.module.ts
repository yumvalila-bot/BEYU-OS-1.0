import { Module, Global } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { IdentityModule } from "../identity/identity.module";

/**
 * Audit is GLOBAL so any domain service can inject AuditService without
 * re-importing. Audit writes always run within the caller's transaction so
 * business mutations and their audit event commit atomically.
 */
@Global()
@Module({
  imports: [IdentityModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
