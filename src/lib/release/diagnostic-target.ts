/**
 * Target guard for the read-only runtime DSN diagnostic (scripts/diagnose-runtime-dsn.mts).
 *
 * The diagnostic sends the NOSUPERUSER runtime password to a host and port chosen
 * at dispatch time (DIAG_HOST / DIAG_PORT). Without this guard, anyone able to
 * dispatch the workflow could point that credential at a host they control.
 * The only legitimate targets are the Supabase connection poolers, so everything
 * else is refused before any socket is opened or any credential is formatted.
 *
 * Pure function: no I/O, no environment reads.
 */

/** Supabase session pooler (5432) and transaction pooler (6543). */
export const DIAGNOSTIC_ALLOWED_PORTS: readonly number[] = [5432, 6543];

/**
 * One or more DNS labels followed by `pooler.supabase.com`. Anchored at both ends,
 * so `pooler.supabase.com.attacker.example` and `attacker.example` are rejected.
 */
const POOLER_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+pooler\.supabase\.com$/;

export class DiagnosticTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiagnosticTargetError";
  }
}

/**
 * Returns the normalised target, or throws `DiagnosticTargetError`.
 * The thrown message names the rule, never the offending value, so a rejected
 * target cannot leak a credential-adjacent string into logs.
 */
export function assertDiagnosticTarget(host: string, port: number): { host: string; port: number } {
  const normalised = host.trim().toLowerCase();
  if (normalised.length === 0 || normalised.length > 253 || !POOLER_HOST.test(normalised)) {
    throw new DiagnosticTargetError(
      "DIAG_HOST must be a Supabase connection pooler (*.pooler.supabase.com). Refusing to send credentials to any other host.",
    );
  }
  if (!Number.isInteger(port) || !DIAGNOSTIC_ALLOWED_PORTS.includes(port)) {
    throw new DiagnosticTargetError("DIAG_PORT must be 5432 (session pooler) or 6543 (transaction pooler).");
  }
  return { host: normalised, port };
}
