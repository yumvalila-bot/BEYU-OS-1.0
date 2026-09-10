/**
 * BEYU OS — explicit, fail-closed PostgreSQL TLS trust configuration.
 *
 * WHY THIS EXISTS
 *   Production reported, for `GET /api/health`:
 *     {"classification":"DATABASE_TLS_FAILURE","code":"SELF_SIGNED_CERT_IN_CHAIN"}
 *
 *   Supabase's database CA is a PRIVATE CA. It has never been in the
 *   Mozilla/NSS root programme, so it is absent from every Node.js bundled
 *   store (Vercel's runtime included). A client relying on the ambient trust
 *   store therefore cannot verify the Supabase chain and fails closed with
 *   OpenSSL error #19 — exactly the observed incident. Supabase documents this:
 *   `sslmode=verify-full` (the mode Supabase recommends) requires the Supabase
 *   CA certificate to be supplied explicitly.
 *
 *   This module supplies that CA explicitly, from first-party Supabase material
 *   pinned by SHA-256 fingerprint (see config/tls/supabase/README.md).
 *
 * SECURITY POSTURE (non-negotiable, enforced here)
 *   1. `rejectUnauthorized` is always `true`. There is no code path, no
 *      environment variable and no DSN parameter that can turn it off.
 *   2. Hostname verification is PRESERVED. This module never sets
 *      `checkServerIdentity`. Node's default implementation therefore runs
 *      against `options.servername`, which pg sets to the DSN host
 *      (node_modules/pg/lib/connection.js: `options.servername = host`).
 *      Consequently `verify-full` semantics hold: chain trust AND identity.
 *   3. Trust is NARROW. Supplying `ca` replaces Node's default trust store for
 *      this connection, so a BEYU database session can only chain to the pinned
 *      Supabase roots — not to any of the ~120 public roots.
 *   4. FAIL CLOSED. Any of the following throws rather than connecting:
 *        - no CA material found, or CA material that will not parse as X.509
 *        - a certificate whose fingerprint is not on the allowlist
 *        - an allowlisted certificate missing from the bundle
 *        - an insecure `sslmode`, or `uselibpqcompat` (which disables
 *          verification and/or hostname checks — see below)
 *        - an IP-literal database host (pg only sets `servername`, and hence
 *          only enables hostname verification, for non-IP hosts)
 *        - `NODE_TLS_REJECT_UNAUTHORIZED=0` in the environment
 *
 *   FORBIDDEN ALTERNATIVES — verified in pg-connection-string@2.14.0 source:
 *     sslmode=disable                      -> ssl = false          (plaintext)
 *     sslmode=no-verify                    -> rejectUnauthorized=false
 *     uselibpqcompat=true&sslmode=require  -> rejectUnauthorized=false
 *     uselibpqcompat=true&sslmode=require  -> checkServerIdentity = () => {}
 *        + sslrootcert                        (hostname check deleted)
 *   None of these may appear in a BEYU DSN.
 *
 * NO SECRETS
 *   A CA certificate is public material. Only labels and fingerprints are ever
 *   exposed by this module. A DSN, password, username or private key is never
 *   logged, never thrown in an error message, and never returned.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

/**
 * The approved Supabase trust anchors, pinned by SHA-256 over the DER encoding.
 *
 * Both certificates share the subject `CN=Supabase Root 2021 CA` but are
 * different certificates with different keys: Supabase rotated the root key on
 * 2025-09-03 and reused the original subject name. Name-based trust is
 * therefore worthless; the fingerprint is the identity.
 *
 * Provenance, full field listing and the rotation procedure are in
 * config/tls/supabase/README.md. Values are lowercase hex, no separators.
 */
export const SUPABASE_TRUST_ANCHOR_FINGERPRINTS = {
  // C=US, ST=Delware, L=New Castle, O=Supabase Inc, CN=Supabase Root 2021 CA
  // serial 6CBC4CA1DEB63F692D0A2024C67289C2D13D54F6 · 2021-04-28 → 2031-04-26
  "prod-ca-2021": "807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa",
  // C=US, ST=Delware, L=New Castle, O=Supabase Inc, CN=Supabase Root 2021 CA
  // serial 797FA0A5F9AC456F5AB05911BE3C978C7C5B7E07 · 2025-09-03 → 2035-09-01
  // (rotated root KEY; same subject name — hence a distinct fingerprint)
  "prod-ca-2025": "5f9b77951a7aa1303f9b58eea9bfa89e358cfdc15f9786ff10d4930a722c9ae2",
} as const;

export type SupabaseTrustAnchorLabel = keyof typeof SUPABASE_TRUST_ANCHOR_FINGERPRINTS;

/** Raised for every TLS trust failure. The message never contains a DSN or secret. */
export class DatabaseTlsTrustError extends Error {
  readonly code = "DATABASE_TLS_TRUST_MISCONFIGURED";
  constructor(message: string) {
    super(message);
    this.name = "DatabaseTlsTrustError";
  }
}

export type TrustedCaCertificate = {
  /** Allowlist key, e.g. "prod-ca-2021". Never a file path. */
  label: SupabaseTrustAnchorLabel;
  /** PEM text handed to Node's TLS stack. */
  pem: string;
  /** Lowercase hex SHA-256 over the DER encoding. */
  fingerprintSha256: string;
};

/* ----------------------------- PEM / X.509 ------------------------------ */

const PEM_BLOCK = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;

/** Split a PEM bundle into individual PEM blocks. */
function splitPemBlocks(pem: string): string[] {
  return pem.match(PEM_BLOCK) ?? [];
}

/**
 * SHA-256 over the DER encoding of a PEM certificate.
 *
 * Node exposes the DER bytes directly on a parsed certificate (`cert.raw`),
 * which is why the forensic capture reports the same value as
 * `openssl x509 -noout -fingerprint -sha256`.
 */
export function certificateFingerprintSha256(pem: string): string {
  const der = pemToDer(pem);
  return crypto.createHash("sha256").update(der).digest("hex");
}

function pemToDer(pem: string): Buffer {
  const base64 = pem
    .replace(/-----[^-]+-----/g, "")
    .replace(/[^A-Za-z0-9+/=]/g, "");
  if (base64.length === 0) {
    throw new DatabaseTlsTrustError("CA certificate PEM contains no base64 body");
  }
  const der = Buffer.from(base64, "base64");
  if (der.length === 0) {
    throw new DatabaseTlsTrustError("CA certificate PEM did not decode to DER");
  }
  return der;
}

/* --------------------------- CA material source -------------------------- */

const CA_BUNDLE_DIRNAME = path.join("config", "tls", "supabase");

function candidateCaDirs(): string[] {
  const dirs: string[] = [];
  const cwd = process.cwd();
  dirs.push(path.join(cwd, CA_BUNDLE_DIRNAME));
  // Tolerate being run from a subdirectory (e.g. a nested workspace root).
  dirs.push(path.join(cwd, "..", CA_BUNDLE_DIRNAME));
  return dirs;
}

function locateCaBundleDir(): string {
  // An explicit override is AUTHORITATIVE: if BEYU_SUPABASE_CA_DIR names a
  // directory that does not exist we fail closed rather than silently falling
  // back to the repository bundle. A silent fallback would let a
  // mis-deployed override quietly change which CA material is in force.
  const fromEnv = process.env.BEYU_SUPABASE_CA_DIR;
  if (fromEnv) {
    try {
      if (!fs.statSync(fromEnv).isDirectory()) {
        throw new DatabaseTlsTrustError(
          `BEYU_SUPABASE_CA_DIR does not point at a directory: refusing to connect.`,
        );
      }
    } catch (e) {
      if (e instanceof DatabaseTlsTrustError) throw e;
      throw new DatabaseTlsTrustError(
        `BEYU_SUPABASE_CA_DIR does not point at a directory: refusing to connect.`,
      );
    }
    return fromEnv;
  }

  const candidates = candidateCaDirs();
  for (const dir of candidates) {
    try {
      if (fs.statSync(dir).isDirectory()) return dir;
    } catch {
      // Not present at this candidate; try the next.
    }
  }
  throw new DatabaseTlsTrustError(
    `Supabase CA bundle directory not found (looked in ${CA_BUNDLE_DIRNAME} under the working directory; ` +
      "override with BEYU_SUPABASE_CA_DIR). Refusing to connect without explicit CA trust.",
  );
}

/**
 * Load and validate the pinned Supabase trust anchors.
 *
 * FAIL-CLOSED GUARANTEES
 *   - every file in the bundle directory must be an allowlisted anchor
 *     (an unexpected extra certificate — e.g. Supabase's *staging* root —
 *      aborts rather than silently widening trust)
 *   - every allowlisted anchor must be present
 *   - every certificate's recomputed fingerprint must equal the allowlist value
 */
export function loadSupabaseTrustAnchors(): TrustedCaCertificate[] {
  const dir = locateCaBundleDir();
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    throw new DatabaseTlsTrustError(`Supabase CA bundle directory is not readable: ${CA_BUNDLE_DIRNAME}`);
  }

  const files = entries.filter((name) => name.endsWith(".crt") || name.endsWith(".pem")).sort();
  if (files.length === 0) {
    throw new DatabaseTlsTrustError(`Supabase CA bundle directory contains no certificates: ${CA_BUNDLE_DIRNAME}`);
  }

  const expected = SUPABASE_TRUST_ANCHOR_FINGERPRINTS;
  const loaded = new Map<SupabaseTrustAnchorLabel, TrustedCaCertificate>();

  for (const file of files) {
    const label = file.replace(/\.(crt|pem)$/, "") as SupabaseTrustAnchorLabel;
    const approved = Object.prototype.hasOwnProperty.call(expected, label)
      ? expected[label]
      : undefined;
    if (!approved) {
      throw new DatabaseTlsTrustError(
        `Unexpected certificate "${file}" in ${CA_BUNDLE_DIRNAME}: it is not an approved Supabase trust anchor. ` +
          "Refusing to trust unapproved CA material.",
      );
    }

    let raw: string;
    try {
      raw = fs.readFileSync(path.join(dir, file), "utf8");
    } catch {
      throw new DatabaseTlsTrustError(`Could not read CA certificate "${file}" from ${CA_BUNDLE_DIRNAME}`);
    }

    const blocks = splitPemBlocks(raw);
    if (blocks.length !== 1) {
      throw new DatabaseTlsTrustError(
        `CA certificate "${file}" must contain exactly one PEM block (found ${blocks.length}).`,
      );
    }

    const pem = `${blocks[0]}\n`;
    let fingerprint: string;
    try {
      fingerprint = certificateFingerprintSha256(pem);
    } catch {
      throw new DatabaseTlsTrustError(`CA certificate "${file}" is not valid X.509 PEM.`);
    }

    if (fingerprint !== approved) {
      throw new DatabaseTlsTrustError(
        `CA certificate "${file}" does not match its approved fingerprint. ` +
          "The material on disk has changed or been substituted; refusing to connect.",
      );
    }

    loaded.set(label, { label, pem, fingerprintSha256: fingerprint });
  }

  const missing = (Object.keys(expected) as SupabaseTrustAnchorLabel[]).filter((l) => !loaded.has(l));
  if (missing.length > 0) {
    throw new DatabaseTlsTrustError(
      `Approved Supabase trust anchor(s) missing from ${CA_BUNDLE_DIRNAME}: ${missing.join(", ")}.`,
    );
  }

  return (Object.keys(expected) as SupabaseTrustAnchorLabel[]).map((l) => loaded.get(l)!);
}

/* ------------------------------ DSN policy ------------------------------- */

/** `sslmode` values that would weaken or remove verification. Rejected outright. */
const FORBIDDEN_SSLMODES = new Set(["disable", "no-verify", "allow", "prefer", "verify-ca"]);

/**
 * The `sslmode` a BEYU DSN must carry.
 *
 * NOTE on pg-connection-string@2.14.0: in the default (non-libpq) path,
 * `prefer`, `require` and `verify-ca` are *aliases* of `verify-full` — they only
 * emit a deprecation warning and leave `ssl` as `{}`, so Node's default
 * `rejectUnauthorized: true` applies. `require` is therefore verified TODAY.
 * That aliasing is a documented breaking change scheduled for
 * pg-connection-string v3 / pg v9, where these modes revert to libpq semantics
 * and stop verifying. BEYU writes `verify-full` explicitly so the DSN says what
 * the runtime does and survives the dependency bump.
 */
export const REQUIRED_SSLMODE = "verify-full";

/* --------------------- environment / endpoint scoping -------------------- */

/**
 * True when BEYU is running as a production deployment.
 *
 * `BEYU_ENV` is the repository's explicit production guard (see .env.example);
 * `NODE_ENV` is honoured as a fallback so a production build cannot be talked
 * into a weaker posture by omitting one of the two.
 */
export function isProductionEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BEYU_ENV === "production" || env.NODE_ENV === "production";
}

/** True only for a loopback DSN — the CI embedded Postgres and the local
 *  development database, neither of which serves TLS. */
export function isLoopbackDsn(dsn: string): boolean {
  let host: string;
  try {
    host = new URL(dsn).hostname;
  } catch {
    return false;
  }
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

/**
 * Decide whether a DSN must satisfy the full verified-TLS policy.
 *
 * The DEFAULT is strict. Exactly one exemption exists and it is narrow: a
 * loopback DSN in a NON-production environment (the CI embedded Postgres and
 * the local development database, which serve no TLS). A production environment
 * is ALWAYS strict, including for loopback; any remote host is always strict
 * regardless of environment — so a developer pointing a local run at the real
 * Supabase pooler gets the same pinned-CA verification as production.
 */
export function requiresVerifiedTls(dsn: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return !(isLoopbackDsn(dsn) && !isProductionEnvironment(env));
}

/** Safe, credential-free DSN metadata for logging: host/port/database/sslmode only. */
export type DsnEndpointFacts = {
  host: string;
  port: number;
  database: string;
  sslmode: string | null;
};

/**
 * Parse the non-secret facts out of a PostgreSQL DSN.
 *
 * The returned object never contains a username or password, and the DSN is
 * never embedded in an error message.
 */
export function describeDsnEndpoint(dsn: string): DsnEndpointFacts {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    throw new DatabaseTlsTrustError("DATABASE_URL is not a parseable URL");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new DatabaseTlsTrustError(`Unsupported database protocol: ${url.protocol}`);
  }
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    database: url.pathname.replace(/^\//, "") || "postgres",
    sslmode: url.searchParams.get("sslmode"),
  };
}

/**
 * Assert a DSN preserves full TLS + hostname verification.
 *
 * Throws on anything that would weaken verification, on an IP-literal host
 * (which silently disables hostname verification because pg only sets
 * `servername` for non-IP hosts), and on any insecure mode.
 */
/**
 * Reject DSN directives that weaken verification, in EVERY environment.
 *
 * These are rejected even for the local-development exemption: there is no
 * legitimate BEYU configuration that asks for them.
 */
export function assertNoVerificationBypass(dsn: string, label: string): void {
  let searchParams: URLSearchParams;
  try {
    searchParams = new URL(dsn).searchParams;
  } catch {
    throw new DatabaseTlsTrustError(`${label} is not a parseable URL`);
  }

  // `uselibpqcompat` makes pg-connection-string set rejectUnauthorized=false
  // and/or replace checkServerIdentity with a no-op. Never permitted.
  if (searchParams.get("uselibpqcompat") !== null) {
    throw new DatabaseTlsTrustError(
      `${label} must not set uselibpqcompat: it disables certificate and/or hostname verification.`,
    );
  }

  const sslmode = (searchParams.get("sslmode") ?? "").toLowerCase();
  if (FORBIDDEN_SSLMODES.has(sslmode)) {
    throw new DatabaseTlsTrustError(
      `${label} uses sslmode=${sslmode}, which does not verify the certificate chain and hostname. ` +
        `Use sslmode=${REQUIRED_SSLMODE}.`,
    );
  }
}

/**
 * Assert a DSN preserves full TLS + hostname verification.
 *
 * Throws on anything that would weaken verification, on an IP-literal host
 * (which silently disables hostname verification because pg only sets
 * `servername` for non-IP hosts), and on any insecure mode.
 */
export function assertDatabaseDsnIsVerified(dsn: string, label: string): DsnEndpointFacts {
  assertNoVerificationBypass(dsn, label);
  const facts = describeDsnEndpoint(dsn);

  const sslmode = (facts.sslmode ?? "").toLowerCase();
  if (sslmode === "") {
    throw new DatabaseTlsTrustError(`${label} must set sslmode=${REQUIRED_SSLMODE} explicitly.`);
  }
  if (sslmode !== REQUIRED_SSLMODE) {
    throw new DatabaseTlsTrustError(
      `${label} uses sslmode=${sslmode}. BEYU requires sslmode=${REQUIRED_SSLMODE}.`,
    );
  }

  // pg sets options.servername only when the host is not an IP literal
  // (node_modules/pg/lib/connection.js). Without servername there is no name to
  // match, so hostname verification is effectively absent.
  if (!facts.host || isIpLiteral(facts.host)) {
    throw new DatabaseTlsTrustError(
      `${label} must use a DNS hostname, not an IP literal: hostname verification requires a servername.`,
    );
  }

  return facts;
}

function isIpLiteral(host: string): boolean {
  return net.isIP(host) !== 0;
}

/**
 * Refuse to run if the ambient Node TLS posture has been weakened.
 *
 * `NODE_TLS_REJECT_UNAUTHORIZED=0` disables certificate verification process
 * wide, which would silently defeat every guarantee in this module.
 */
export function assertNodeTlsNotWeakened(env: NodeJS.ProcessEnv = process.env): void {
  const value = env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (value !== undefined && value.trim().toLowerCase() !== "1") {
    throw new DatabaseTlsTrustError(
      "NODE_TLS_REJECT_UNAUTHORIZED is set to a value that weakens TLS verification. " +
        "BEYU requires certificate verification to remain enabled.",
    );
  }
}

/* --------------------------- TLS config for pg --------------------------- */

export type DatabaseTlsConfig = {
  /** Explicitly `true` — never derived from a DSN parameter. */
  rejectUnauthorized: true;
  /** Pinned Supabase roots only; replaces Node's default trust store. */
  ca: string[];
};

export type ResolvedDatabaseTls = {
  tls: DatabaseTlsConfig;
  endpoint: DsnEndpointFacts;
  anchors: ReadonlyArray<{ label: SupabaseTrustAnchorLabel; fingerprintSha256: string }>;
};

/**
 * Build the TLS configuration for a BEYU PostgreSQL connection.
 *
 * This is the single place where database TLS trust is decided. It performs the
 * environment check, the DSN policy check and the CA fingerprint check, and
 * throws if any of them fails.
 */
export function resolveDatabaseTls(dsn: string, label = "DATABASE_URL"): ResolvedDatabaseTls {
  assertNodeTlsNotWeakened();
  const endpoint = assertDatabaseDsnIsVerified(dsn, label);
  const anchors = loadSupabaseTrustAnchors();

  return {
    tls: {
      // Hard-coded: no caller, env var or DSN can flip this.
      rejectUnauthorized: true,
      ca: anchors.map((a) => a.pem),
    },
    endpoint,
    anchors: anchors.map(({ label: l, fingerprintSha256 }) => ({ label: l, fingerprintSha256 })),
  };
}

/**
 * A pg connection configuration whose TLS trust cannot be silently discarded.
 *
 * WHY `sslmode` IS STRIPPED FROM THE CONNECTION STRING
 *   `pg/lib/connection-parameters.js` merges the DSN OVER the explicit options:
 *
 *     if (config.connectionString) {
 *       config = Object.assign({}, config, parse(config.connectionString))
 *     }
 *
 *   and `pg-connection-string` sets `ssl = {}` for ANY `sslmode` value. So
 *   passing `{ connectionString: "…?sslmode=verify-full", ssl: { ca: […] } }`
 *   makes pg **silently throw the CA away** — the pool ends up with `ssl: {}`
 *   and no explicit trust anchor. Verified empirically against pg 8.20.0 /
 *   pg-connection-string 2.14.0: with a DSN carrying `sslmode`, the explicit
 *   `ssl` object is discarded; with `sslmode` removed, it survives intact.
 *
 *   Therefore the DSN is still *required* to declare `sslmode=verify-full`
 *   (so the operator's intent is explicit and audited by
 *   `assertDatabaseDsnIsVerified`), but the value handed to pg omits it, and
 *   the equivalent-or-stronger configuration is supplied directly. All other
 *   DSN parameters are preserved verbatim.
 *
 * NEVER LOG `connectionString` — it carries the password.
 */
export type PgTlsConnectionConfig = {
  connectionString: string;
  /** Pinned verified-TLS options; `undefined` only in the local-dev exemption. */
  ssl: DatabaseTlsConfig | undefined;
  /** True only for the loopback + non-production exemption. */
  localDevelopment: boolean;
  endpoint: DsnEndpointFacts;
  anchors: ReadonlyArray<{ label: SupabaseTrustAnchorLabel; fingerprintSha256: string }>;
};

export function buildPgConnectionConfig(
  dsn: string,
  label = "DATABASE_URL",
  env: NodeJS.ProcessEnv = process.env,
): PgTlsConnectionConfig {
  assertNodeTlsNotWeakened(env);
  assertNoVerificationBypass(dsn, label);

  // Narrow local-development exemption: loopback + non-production (the CI
  // embedded Postgres and the local dev database serve no TLS). Everything
  // else — any remote host, and any production environment — is strict.
  if (!requiresVerifiedTls(dsn, env)) {
    return {
      connectionString: dsn,
      ssl: undefined,
      localDevelopment: true,
      endpoint: describeDsnEndpoint(dsn),
      anchors: [],
    };
  }

  const resolved = resolveDatabaseTls(dsn, label);

  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    throw new DatabaseTlsTrustError(`${label} is not a parseable URL`);
  }
  // Removed so that pg's connectionString merge cannot discard the explicit
  // `ssl` object below. See PgTlsConnectionConfig for the full reasoning.
  url.searchParams.delete("sslmode");

  return {
    connectionString: url.toString(),
    ssl: resolved.tls,
    localDevelopment: false,
    endpoint: resolved.endpoint,
    anchors: resolved.anchors,
  };
}

/**
 * Human-readable, secret-free summary of the trust configuration.
 *
 * Safe to log: labels, fingerprints and host/port/database only.
 */
export function describeTrustConfiguration(resolved: ResolvedDatabaseTls): string {
  const { endpoint, anchors } = resolved;
  return (
    `sslmode=verify-full; rejectUnauthorized=true; hostname-verification=on; ` +
    `host=${endpoint.host}:${endpoint.port} db=${endpoint.database}; ` +
    `trust-anchors=${anchors.map((a) => `${a.label}(${a.fingerprintSha256.slice(0, 12)}…)`).join(",")}`
  );
}
