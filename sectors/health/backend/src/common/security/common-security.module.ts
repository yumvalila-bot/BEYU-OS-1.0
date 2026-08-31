import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { TenantContext } from "./tenant-context";
import { TransactionContext } from "./transaction-context.middleware";
import { TransactionInterceptor } from "./transaction.interceptor";
import { TransactionEnvelopeBuilder } from "../../integrations/beyu/shared/transaction-envelope";
import { CorrelationIdMiddleware } from "../observability/correlation-id.middleware";

/**
 * Common runtime primitives that are needed across every domain module
 * (TenantContext ALS, TransactionContext ALS, correlation helpers,
 * TransactionEnvelopeBuilder, global TransactionInterceptor). Declared
 * @Global so AuditModule, domain services, and adapters can inject them
 * without re-importing.
 */
@Global()
@Module({
  providers: [
    TenantContext,
    TransactionContext,
    TransactionEnvelopeBuilder,
    { provide: APP_INTERCEPTOR, useClass: TransactionInterceptor },
  ],
  exports: [TenantContext, TransactionContext, TransactionEnvelopeBuilder],
})
export class CommonSecurityModule {}
