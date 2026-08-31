/**
 * Typed domain errors. Each error carries a stable machine-readable `code` that
 * controllers map to the appropriate HTTP status. Never leak stack traces or
 * secrets to clients.
 */
export type DomainErrorCode =
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "TENANT_VIOLATION"
  | "VALIDATION"
  | "INVALID_STATE"
  | "IDEMPOTENCY_REPLAY"
  | "EXTERNAL_UNAVAILABLE"
  | "POLICY_REQUIRES_HUMAN";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
    Object.setPrototypeOf(this, DomainError.prototype);
  }

  static notFound(resource: string, id?: string): DomainError {
    return new DomainError(
      "NOT_FOUND",
      id ? `${resource} '${id}' not found` : `${resource} not found`,
      { resource, id },
    );
  }

  static forbidden(reason: string): DomainError {
    return new DomainError("FORBIDDEN", reason);
  }

  static unauthorized(reason = "Authentication required"): DomainError {
    return new DomainError("UNAUTHORIZED", reason);
  }

  static tenantViolation(reason: string): DomainError {
    return new DomainError("TENANT_VIOLATION", reason);
  }

  static invalidState(reason: string): DomainError {
    return new DomainError("INVALID_STATE", reason);
  }

  static conflict(message: string): DomainError {
    return new DomainError("CONFLICT", message);
  }

  static validation(errors: Record<string, string[]> | string): DomainError {
    const detail =
      typeof errors === "string" ? { message: errors } : { fields: errors };
    return new DomainError(
      "VALIDATION",
      typeof errors === "string" ? errors : "Validation failed",
      detail,
    );
  }

  static unavailable(message: string): DomainError {
    return new DomainError("EXTERNAL_UNAVAILABLE", message);
  }

  static requiresHumanDecision(reason: string): DomainError {
    return new DomainError("POLICY_REQUIRES_HUMAN", reason);
  }
}
