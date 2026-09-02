import { Injectable } from "@nestjs/common";
import { IntegrationsRepository } from "./integrations.repository";
import { AuditService } from "../audit/audit.service";
/**
 * Central registry of external integration states (NHIF, TRA, TMDA, PACS,
 * video_provider, fhir_endpoint, mtuha_submission, finance_os). Adapters
 * record availability here; callers check status before attempting calls.
 * Adapters are required to fail-closed when state != available.
 */
@Injectable()
export class IntegrationsService {
  constructor(
    private readonly repo: IntegrationsRepository,
    private readonly audit: AuditService,
  ) {}
  list() {
    return this.repo.listStatuses();
  }
  get(provider: string) {
    return this.repo.getStatus(provider);
  }
  markConfigured(provider: string) {
    return this.repo.markConfigured(provider);
  }
  markSuccess(provider: string) {
    return this.repo.recordSuccess(provider);
  }
  markFailure(provider: string, err: string) {
    return this.repo.recordFailure(provider, err);
  }
}
