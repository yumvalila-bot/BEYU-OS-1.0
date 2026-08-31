/**
 * AI / Noelia / HIVE boundary.
 *
 * Governance rules enforced here (and documented):
 *  - AI requests must carry actor GlobalUserID + tenant/entity/country.
 *  - AI may NOT self-authorize / self-approve / bypass RBAC/RLS.
 *  - Tool calls are allowlisted; write operations go through the regular
 *    service layer with permissions checked by the guard.
 *  - Every AI-mediated action is recorded in health.ai_invocations with
 *    model/version/confidence/human-review fields and the correlation ID
 *    of the originating request.
 *  - High/critical-risk outputs default to human_approval_status=pending.
 *  - The HIVE runtime is addressed via the configured integration adapter
 *    (health.integration_status -> provider='hive'); when unavailable the
 *    endpoint returns 503 UNAVAILABLE, never a fabricated response.
 */
import { Module } from "@nestjs/common";
import { AiGovernanceService } from "./ai-governance.service";
import { AuditModule } from "../audit/audit.module";
import { IntegrationsModule } from "../integrations/integrations.module";

@Module({
  imports: [AuditModule, IntegrationsModule],
  providers: [AiGovernanceService],
  exports: [AiGovernanceService],
})
export class AiModule {}
