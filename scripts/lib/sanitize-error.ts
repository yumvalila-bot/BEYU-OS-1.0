/**
 * Infrastructure-detail redaction for database tooling output.
 *
 * WHY THIS EXISTS
 *   `scripts/db-release.ts`, `scripts/migrate.ts` and `scripts/setup-db-role.ts`
 *   run inside GitHub Actions with the production admin DSN in the environment.
 *   On failure they serialised `String(e)` straight into stdout/stderr — and,
 *   for db-release, into the uploaded `preflight-live.json` / `verify.json`
 *   artifacts.
 *
 *   GitHub Actions masks a registered secret only when the EXACT secret string
 *   appears in the log. A driver error does not reproduce the DSN verbatim; it
 *   reproduces a FRAGMENT of it. Empirically, a failed connection yields:
 *
 *       Error: getaddrinfo ENOTFOUND db.<project-ref>.supabase.co
 *
 *   The password is not present (verified), but the production database
 *   hostname and project ref are — unmasked, in a public-by-default log and in
 *   a downloadable artifact. That is an infrastructure-topology disclosure.
 *
 *   These scripts are diagnostics: the operator needs the FAILURE CLASS
 *   (DNS / refused / TLS / auth / timeout), not the hostname, which they
 *   already know. This module preserves the diagnostic signal and drops the
 *   identifying detail.
 *
 * GUARANTEE
 *   The returned string is built only from a fixed vocabulary of failure
 *   classes plus the driver's SQLSTATE code (e.g. `28P01`), which is a public
 *   PostgreSQL constant and never credential-derived. No caller-supplied text
 *   is ever passed through.
 */

/** Ordered, first-match-wins. Each entry maps a driver signal to a safe class. */
const FAILURE_CLASSES: ReadonlyArray<{ readonly test: RegExp; readonly label: string }> = [
  { test: /ENOTFOUND|EAI_AGAIN|getaddrinfo/i, label: "DNS_RESOLUTION_FAILED" },
  { test: /ECONNREFUSED/i, label: "CONNECTION_REFUSED" },
  { test: /ETIMEDOUT|ESOCKETTIMEDOUT|timeout expired|connection timeout/i, label: "CONNECTION_TIMEOUT" },
  { test: /ECONNRESET|EPIPE/i, label: "CONNECTION_RESET" },
  { test: /EHOSTUNREACH|ENETUNREACH/i, label: "HOST_UNREACHABLE" },
  { test: /self.signed|certificate|SSL|TLS/i, label: "TLS_FAILURE" },
  { test: /password authentication failed|SASL|SCRAM/i, label: "AUTHENTICATION_FAILED" },
  { test: /no pg_hba\.conf entry/i, label: "HBA_REJECTED" },
  { test: /database .* does not exist/i, label: "DATABASE_NOT_FOUND" },
  { test: /role .* does not exist/i, label: "ROLE_NOT_FOUND" },
  { test: /permission denied|must be owner|insufficient privilege/i, label: "PERMISSION_DENIED" },
];

/**
 * Reduce an unknown thrown value to a non-identifying failure class.
 *
 * Never returns hostnames, ports, usernames, database names, passwords, DSNs,
 * IP addresses or file paths.
 */
export function sanitizeError(e: unknown): string {
  const raw = e instanceof Error ? `${e.name}: ${e.message}` : String(e);

  const matched = FAILURE_CLASSES.find((c) => c.test.test(raw));

  // SQLSTATE is a 5-character public PostgreSQL constant, safe to surface and
  // highly diagnostic. Read defensively: `code` is untyped on unknown errors.
  const code =
    typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string"
      ? (e as { code: string }).code
      : undefined;
  const sqlstate = code && /^[0-9A-Z]{5}$/.test(code) ? ` (SQLSTATE ${code})` : "";

  if (matched) return `${matched.label}${sqlstate}`;
  // Unrecognised failure: emit the class only. Deliberately opaque — an
  // unknown driver message may embed connection detail we have not modelled.
  return `UNCLASSIFIED_DATABASE_ERROR${sqlstate}`;
}
