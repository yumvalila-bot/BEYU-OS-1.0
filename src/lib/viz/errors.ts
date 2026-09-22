/** Visualization domain errors. Never used as an authorization decision. */
export class VizDomainError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "CONFLICT"
      | "INVALID_STATE"
      | "FINANCE_BOUNDARY"
      | "SCOPE"
      | "DIMENSION_UNKNOWN"
      | "SECTOR_UNSUPPORTED"
      | "EXPORT_FORBIDDEN",
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "VizDomainError";
  }
}
