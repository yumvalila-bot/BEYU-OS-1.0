import { Global, Module } from "@nestjs/common";
import { TenantContext } from "./tenant-context";
import { CorrelationIdMiddleware } from "../observability/correlation-id.middleware";

/**
 * Common runtime primitives that are needed across every domain module
 * (TenantContext ALS, correlation helpers). Declared @Global so AuditModule,
 * domain services, and adapters can inject them without re-importing.
 */
@Global()
@Module({
  providers: [TenantContext],
  exports: [TenantContext],
})
export class CommonSecurityModule {}
