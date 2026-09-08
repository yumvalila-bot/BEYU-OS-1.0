/**
 * BEYU OS — database health probe with sanitized failure classification.
 *
 * WHY THIS EXISTS
 *   `GET /api/health` is the production readiness probe. It used to catch the
 *   database exception and collapse every possible failure (missing variable,
 *   DNS, TCP, TLS, authentication, timeout, query error) into one identical
 *   `503 { database: DOWN }` with no log line — so a red production database
 *   was undiagnosable from the outside. This module probes the SAME canonical
 *   pool (`src/db/index.ts`, runtime `DATABASE_URL` only) in two stages and
 *   reduces any failure to a fixed, machine-readable classification.
 *
 * SAFETY CONTRACT (non-negotiable)
 *   - The HTTP response carries ONLY the classification token (e.g.
 *     `DATABASE_AUTH_FAILURE`). Never the raw message, SQLSTATE detail,
 *     hostname, username, password, DSN, or stack trace.
 *   - The structured log event carries ONLY timestamp, trace id, environment,
 *     classification, safe driver code, and elapsed milliseconds. The driver
 *     message is NEVER logged: it routinely embeds hostnames, ports, usernames
 *     and pooler routing detail.
 *   - The probe issues exactly one table-less `select 1`. It touches no
 *     application table, establishes no RLS context, and performs no write.
 *   - The admin/migration DSN is never read here. The probe uses the
 *     canonical runtime pool and nothing else.
 */
import type { PoolClient } from "pg";
import { pool } from "@/db";

/** Fixed vocabulary of database health failure classifications. Nothing else may leave the probe. */
export const DATABASE_HEALTH_CLASSIFICATIONS = [
  "DATABASE_CONFIG_MISSING",
  "DATABASE_DNS_FAILURE",
  "DATABASE_CONNECTION_TIMEOUT",
  "DATABASE_TLS_FAILURE",
  "DATABASE_AUTH_FAILURE",
  "DATABASE_CONNECTION_REFUSED",
  "DATABASE_QUERY_FAILURE",
  "DATABASE_UNKNOWN_FAILURE",
] as const;

export type DatabaseHealthClassification = (typeof DATABASE_HEALTH_CLASSIFICATIONS)[number];

/** Node errnos that are safe to log: transport facts, never infrastructure identity. */
const SAFE_NODE_ERRNOS = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "ERR_INVALID_URL",
]);

function driverCodeOf(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "code" in e) {
    const code = (e as { code: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return undefined;
}

/**
 * Extract a log-safe driver code: a PostgreSQL SQLSTATE (a public 5-character
 * constant such as `28P01`, never credential-derived) or an allowlisted Node
 * errno. Anything else is dropped rather than risk leaking detail.
 */
export function safeDriverCode(e: unknown): string | undefined {
  const code = driverCodeOf(e);
  if (!code) return undefined;
  if (/^[0-9A-Z]{5}$/.test(code)) return code;
  if (SAFE_NODE_ERRNOS.has(code)) return code;
  return undefined;
}

function haystackOf(e: unknown): string {
  // The driver `code` is folded into the match text (never into output) so
  // failures with an empty message (e.g. bare ECONNREFUSED) still classify.
  const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return `${driverCodeOf(e) ?? ""} ${message}`;
}

/**
 * Reduce a connection-stage failure to a sanitized classification.
 * First match wins; disjoint patterns keep the mapping deterministic.
 */
export function classifyConnectionError(e: unknown): DatabaseHealthClassification {
  const haystack = haystackOf(e);
  const code = driverCodeOf(e);

  // A — the runtime variable is absent or empty (src/db/index.ts throws the
  // canonical message before any network activity).
  if (/DATABASE_URL is required/.test(haystack)) return "DATABASE_CONFIG_MISSING";
  // B — the value cannot be parsed as a connection string at all.
  if (/invalid url|invalid connection string|malformed/i.test(haystack)) return "DATABASE_CONFIG_MISSING";
  // SQLSTATE-first: authorization failures are unambiguous regardless of message wording.
  if (code && /^28/.test(code)) return "DATABASE_AUTH_FAILURE";
  // Wrong database name is a value-shape problem: the operator must fix the variable.
  if (code === "3D000" || /database .* does not exist/i.test(haystack)) return "DATABASE_CONFIG_MISSING";
  // C — name resolution.
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(haystack)) return "DATABASE_DNS_FAILURE";
  // D — transport rejected: refused, reset mid-handshake, or unreachable network.
  if (/ECONNREFUSED|ECONNRESET|EPIPE|EHOSTUNREACH|ENETUNREACH/i.test(haystack)) return "DATABASE_CONNECTION_REFUSED";
  // G — acquisition or establishment timed out (includes the pool's
  // connectionTimeoutMillis budget expiring while connecting or waiting).
  if (/ETIMEDOUT|ESOCKETTIMEDOUT|timeout expired|connection timeout|timed out/i.test(haystack)) {
    return "DATABASE_CONNECTION_TIMEOUT";
  }
  // E — TLS negotiation / certificate verification.
  if (/self.signed|certificate|SSL|TLS/i.test(haystack)) return "DATABASE_TLS_FAILURE";
  // F — the server rejected the credential identity. Covers SCRAM/SASL
  // password rejection, unknown pooler users (`beyu_runtime` without the
  // Supavisor `.<project-ref>` suffix surfaces as "Tenant or user not
  // found"), and unknown roles.
  if (
    /password authentication failed|SASL|SCRAM|Tenant or user not found|role .* does not exist|authentication failed/i.test(
      haystack,
    )
  ) {
    return "DATABASE_AUTH_FAILURE";
  }
  // Host-based access rejection: without an SSL/encryption hint it is an
  // authorization-shape problem, otherwise a TLS-shape problem.
  if (/no pg_hba\.conf entry/i.test(haystack)) {
    return /ssl|encryption/i.test(haystack) ? "DATABASE_TLS_FAILURE" : "DATABASE_AUTH_FAILURE";
  }
  // Post-authentication privilege errors cannot occur for `select 1`, but if
  // the server ever emits one it means the connection worked and the
  // statement did not.
  if (/permission denied|insufficient privilege|must be owner/i.test(haystack)) return "DATABASE_QUERY_FAILURE";
  // Deliberately opaque: an unmodelled driver message may embed connection
  // detail, so only the class leaves the probe.
  return "DATABASE_UNKNOWN_FAILURE";
}

export type DatabaseHealthProbeResult =
  | { readonly ok: true; readonly elapsedMs: number }
  | {
      readonly ok: false;
      readonly classification: DatabaseHealthClassification;
      readonly code: string | undefined;
      readonly elapsedMs: number;
    };

/**
 * Probe the canonical runtime pool in two stages so H (connected, but the
 * query failed) is distinguishable from connect-stage failures A–G:
 *
 *   1. acquire a pooled connection (classify any failure by driver signal);
 *   2. run exactly one table-less `select 1` (any failure is QUERY_FAILURE).
 *
 * The client is always released. No RLS context is established: `select 1`
 * needs none and must stay independent of tenant/session state.
 */
export async function probeDatabaseHealth(): Promise<DatabaseHealthProbeResult> {
  const startedAt = Date.now();
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
  } catch (e) {
    return {
      ok: false,
      classification: classifyConnectionError(e),
      code: safeDriverCode(e),
      elapsedMs: Date.now() - startedAt,
    };
  }
  try {
    await client.query("select 1");
    return { ok: true, elapsedMs: Date.now() - startedAt };
  } catch (e) {
    return {
      ok: false,
      classification: "DATABASE_QUERY_FAILURE",
      code: safeDriverCode(e),
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    client.release();
  }
}

export type DatabaseHealthLogEvent = {
  readonly event: "db_health_probe";
  readonly timestamp: string;
  readonly traceId: string;
  readonly environment: string;
  readonly classification: DatabaseHealthClassification;
  readonly code: string | null;
  readonly elapsedMs: number;
};

/**
 * Build the structured log event. Pure (returning the object, not logging it)
 * so tests can assert the exact emitted shape. Field set is fixed: adding a
 * field here is a security-relevant change and must be reviewed as such.
 */
export function buildDatabaseHealthLogEvent(input: {
  traceId: string;
  environment: string;
  classification: DatabaseHealthClassification;
  code: string | undefined;
  elapsedMs: number;
}): DatabaseHealthLogEvent {
  return {
    event: "db_health_probe",
    timestamp: new Date().toISOString(),
    traceId: input.traceId,
    environment: input.environment,
    classification: input.classification,
    code: input.code ?? null,
    elapsedMs: input.elapsedMs,
  };
}
