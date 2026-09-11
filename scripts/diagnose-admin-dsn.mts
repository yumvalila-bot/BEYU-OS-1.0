/**
 * BEYU OS — ADMIN DSN STRUCTURAL DIAGNOSTIC (READ-ONLY, NON-DESTRUCTIVE).
 *
 * WHY THIS EXISTS
 *   The `db-release` live preflight fails with:
 *       ::error title=db-release::db-release: TLS_FAILURE   (exit code 1)
 *   That shape is produced by `main().catch(failSanitized)` — i.e. BEFORE
 *   `client.connect()` is ever called. It therefore proves the throw came out of
 *   `buildPgConnectionConfig()`, not out of the network, the certificate chain
 *   or PostgreSQL authentication.
 *
 *   What it does NOT prove is *which* policy predicate tripped, because
 *   `scripts/lib/sanitize-error.ts` collapses every failure whose text matches
 *   /self.signed|certificate|SSL|TLS/i into the single token `TLS_FAILURE` — and
 *   the string "DatabaseTlsTrustError" itself matches /TLS/i. So a missing
 *   sslmode, a forbidden sslmode, an IP-literal host and a real certificate
 *   failure are all reported identically.
 *
 *   This script recovers the missing predicate WITHOUT reading the secret into
 *   any output: it parses the DSN and prints a fixed, allowlisted structural
 *   schema, then reports the exact `DatabaseTlsTrustError` message that
 *   `buildPgConnectionConfig` produces for this DSN.
 *
 * SAFETY CONTRACT (non-negotiable)
 *   - The DSN is NEVER printed, logged, serialised or written to a file.
 *   - The password is NEVER printed. Only `passwordPresent: true|false`.
 *   - No connection is attempted. Nothing is written to any database.
 *   - The hostname is NOT emitted verbatim. It is reduced to booleans against
 *     the canonical production endpoint already published in `.env.example`, so
 *     this script cannot disclose an unknown project reference. The port, the
 *     database name and the `sslmode` value ARE emitted: they carry no
 *     credential material and are required to distinguish "wrong endpoint /
 *     wrong port" from "DSN does not declare verify-full".
 *   - `DatabaseTlsTrustError` messages emitted below are constructed by
 *     `src/db/tls.ts` from the DSN *label* and the *sslmode* value only; they
 *     never embed a host, user, password or DSN. They are re-checked against a
 *     redaction guard before being printed.
 *
 * USAGE
 *   BEYU_ADMIN_DATABASE_URL=... npx tsx scripts/diagnose-admin-dsn.mts
 */
import net from "node:net";

import { buildPgConnectionConfig } from "../src/db/tls";

/**
 * The canonical production Supabase endpoint, as already published in
 * `.env.example`. Used only for comparison — never as a connection target.
 */
const CANONICAL_HOST = "aws-0-eu-west-3.pooler.supabase.com";
const CANONICAL_PROJECT_REF = "siyzygezdmlxbvwttrdz";
/** Documented admin/migration port: Supavisor SESSION pooler. */
const EXPECTED_ADMIN_PORT = 5432;
/** Documented runtime port: Supavisor TRANSACTION pooler. */
const EXPECTED_RUNTIME_PORT = 6543;

type Json = Record<string, unknown>;

/**
 * Belt-and-braces redaction: a message may only be printed if it contains no
 * credential-bearing token. This is a guard against a future edit to
 * `src/db/tls.ts` that starts interpolating the DSN into an error message.
 */
function redactOrRefuse(text: string): string {
  const forbidden: RegExp[] = [
    /postgres(ql)?:\/\//i, // a DSN
    /:[^@\s/]{4,}@/, // userinfo with a password
    /password/i,
    /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*[^1\s]/i,
  ];
  const leaked = forbidden.some((re) => re.test(text));
  if (leaked) return "REDACTED (message contained a credential-shaped token)";
  // Bound the length so an unexpected message cannot dump a large payload.
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

function emit(label: string, payload: Json): void {
  const text = `${label} ${JSON.stringify(payload)}`;
  // `::warning::` so it is retrievable from the check-runs annotations API
  // without the (network-restricted) job log archive.
  console.log(`::warning::${text}`);
  console.log(text);
}

function structuralFacts(dsn: string): Json {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return { parseable: false, parseError: "DSN is not a parseable URL" };
  }

  const host = url.hostname.toLowerCase();
  const params = url.searchParams;

  // Host identity is expressed as comparisons, never as a literal, so this
  // script cannot leak an unknown Supabase project reference.
  const hostIsPooler = host.endsWith(".pooler.supabase.com");
  const hostIsSupabase = hostIsPooler || host.endsWith(".supabase.co") || host.endsWith(".supabase.com");
  const refFromHost = host.split(".")[0] === "aws-0-eu-west-3" ? null : host.split(".")[0];

  return {
    parseable: true,
    protocol: url.protocol.replace(/:$/, ""),
    port: url.port ? Number(url.port) : 5432,

    hostMatchesCanonical: host === CANONICAL_HOST,
    hostIsSupabasePooler: hostIsPooler,
    hostIsSupabaseDomain: hostIsSupabase,
    hostProjectRefMatchesCanonical: refFromHost === null ? null : refFromHost === CANONICAL_PROJECT_REF,
    hostIsIpLiteral: net.isIP(host) !== 0,
    hostLength: host.length, // coarse corroboration without disclosure

    database: url.pathname.replace(/^\//, "") || "postgres",

    sslmode: params.get("sslmode"), // null when absent
    sslmodePresent: params.has("sslmode"),
    sslmodeIsVerifyFull: (params.get("sslmode") ?? "").toLowerCase() === "verify-full",

    pgbouncer: params.get("pgbouncer"),

    // Parameter NAMES only. Values are deliberately omitted: a future DSN could
    // carry an unexpected free-text parameter, and its value is not needed to
    // diagnose the policy failure.
    parameterNames: [...new Set([...params.keys()])].sort(),

    uselibpqcompatPresent: params.has("uselibpqcompat"),

    usernamePresent: Boolean(url.username),
    passwordPresent: Boolean(url.password),
  };
}

/** Which port this DSN claims, against the documented topology. */
function classifyPort(port: number): string {
  if (port === EXPECTED_ADMIN_PORT) return "session-pooler (documented admin/migration port)";
  if (port === EXPECTED_RUNTIME_PORT) return "transaction-pooler (documented runtime port)";
  return "unexpected port for the documented BEYU Supabase topology";
}

function main(): void {
  const dsn = process.env.BEYU_ADMIN_DATABASE_URL ?? "";

  if (!dsn) {
    emit("ADMIN_DSN_STRUCTURE", { present: false, verdict: "SECRET_ABSENT" });
    console.log("::error::EXTERNAL_BLOCKED — BEYU_ADMIN_DATABASE_URL is not configured.");
    process.exit(1);
  }

  const facts = structuralFacts(dsn);
  emit("ADMIN_DSN_STRUCTURE", { present: true, ...facts });

  if (facts.parseable === true && typeof facts.port === "number") {
    emit("ADMIN_DSN_PORT_CLASS", { port: facts.port, classification: classifyPort(facts.port) });
  }

  // The decisive datum: the exact predicate `buildPgConnectionConfig` rejects.
  // Its message is assembled from the label + sslmode only, so it is safe to
  // publish — but it is still passed through `redactOrRefuse`.
  try {
    const built = buildPgConnectionConfig(dsn, "BEYU_ADMIN_DATABASE_URL");
    emit("ADMIN_DSN_TLS_POLICY", {
      verdict: "POLICY_PASS",
      localDevelopmentExemption: built.localDevelopment,
      // Explicitly assert the security posture that must survive any fix.
      rejectUnauthorized: built.ssl?.rejectUnauthorized ?? null,
      caAnchorCount: built.ssl?.ca.length ?? 0,
      anchors: built.anchors.map((a) => ({ label: a.label, fingerprintSha256: a.fingerprintSha256 })),
      sslmodeStrippedFromPgConnectionString: !built.connectionString.includes("sslmode="),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "UnknownError";
    const raw = e instanceof Error ? e.message : String(e);
    emit("ADMIN_DSN_TLS_POLICY", {
      verdict: "POLICY_REJECT",
      errorName: name,
      // Exact predicate: e.g. "must set sslmode=verify-full explicitly".
      reason: redactOrRefuse(raw),
    });
  }

  // Always exit 0 once the secret is present: this is a diagnostic, and a
  // non-zero exit would strip the annotations we need to read back.
  process.exit(0);
}

main();
