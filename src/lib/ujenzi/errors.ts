/** Ujenzi OS domain errors. Never used as an authorization decision. */
export class UjenziDomainError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "CONFLICT"
      | "INVALID_STATE"
      | "FINANCE_BOUNDARY"
      | "SCOPE",
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "UjenziDomainError";
  }
}
