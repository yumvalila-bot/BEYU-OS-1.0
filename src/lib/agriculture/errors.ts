/** Agriculture OS domain errors. Never used as an authorization decision. */
export class AgriDomainError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "CONFLICT"
      | "INVALID_STATE"
      | "FINANCE_BOUNDARY"
      | "SYNC_CONFLICT"
      | "SCOPE",
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AgriDomainError";
  }
}
