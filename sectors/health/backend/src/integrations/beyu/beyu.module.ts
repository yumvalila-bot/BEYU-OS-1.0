import { Module, Global } from "@nestjs/common";
import { CircuitBreaker } from "../../modules/integrations/circuit-breaker";
import { DbModule } from "../../common/db/db.module";
import { GovernanceAdapter } from "./governance/governance.adapter";
import { HcmAdapter } from "./hcm/hcm.adapter";
import { FinanceAdapter } from "./finance/finance.adapter";
import { TaxAdapter } from "./tax/tax.adapter";
import { NoeliaAdapter } from "./noelia/noelia.adapter";
import { IdentityAdapter } from "./shared/identity.adapter";
import { CrossDomainOrchestrator } from "./events/cross-domain-orchestrator";
import { TransactionEnvelopeBuilder } from "./shared/transaction-envelope";
import { HcmAuthorizationGuard } from "./guards/hcm-authorization.guard";
import { GovernanceAuthorizationGuard } from "./guards/governance-authorization.guard";

@Global()
@Module({
  imports: [DbModule],
  providers: [
    CircuitBreaker,
    GovernanceAdapter,
    HcmAdapter,
    FinanceAdapter,
    TaxAdapter,
    NoeliaAdapter,
    IdentityAdapter,
    TransactionEnvelopeBuilder,
    CrossDomainOrchestrator,
    HcmAuthorizationGuard,
    GovernanceAuthorizationGuard,
  ],
  exports: [
    GovernanceAdapter,
    HcmAdapter,
    FinanceAdapter,
    TaxAdapter,
    NoeliaAdapter,
    IdentityAdapter,
    CircuitBreaker,
    TransactionEnvelopeBuilder,
    CrossDomainOrchestrator,
    HcmAuthorizationGuard,
    GovernanceAuthorizationGuard,
  ],
})
export class BeyuIntegrationModule {}
