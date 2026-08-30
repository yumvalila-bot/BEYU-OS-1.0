import { Injectable } from "@nestjs/common";
import { IdentityRepository, AuthEventInput } from "./identity.repository";

/**
 * Persistent security/audit event service. Every important identity/authorization
 * action is recorded with WHO / WHAT / WHEN / TENANT / RESULT / REASON context.
 * Never stores passwords or raw tokens — context is free-form JSON supplied by
 * callers, who are responsible for not placing secrets into it.
 */
@Injectable()
export class AuditService {
  constructor(private readonly repo: IdentityRepository) {}

  record(input: AuthEventInput): Promise<string> {
    return this.repo.recordAuthEvent(input);
  }

  latest(limit?: number) {
    return this.repo.latestAuthEvents(limit);
  }
}
