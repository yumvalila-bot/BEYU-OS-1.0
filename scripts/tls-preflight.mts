/**
 * BEYU OS — production TLS / database preflight (FAIL-CLOSED).
 *
 * Verifies the whole trust path BEFORE production is declared healthy, in the
 * order the task requires:
 *
 *   1  required production DB environment variables exist
 *   2  endpoint is the EXPECTED production endpoint
 *   3  TLS is enabled
 *   4  certificate verification is enabled
 *   5  hostname verification is enabled
 *   6  explicit authoritative CA trust is configured
 *   7  CA fingerprints match the approved allowlist
 *   8  TLS handshake succeeds
 *   9  certificate chain validates
 *  10  hostname validates against the served leaf SAN
 *  11  PostgreSQL authentication succeeds
 *  12  runtime DB security invariants still hold (NOSUPERUSER / NOBYPASSRLS)
 *
 * Checks 1–7 and 10 are evaluated WITHOUT contacting the database. Checks 8–9
 * perform a credential-free PostgreSQL SSLRequest → TLS handshake (no startup
 * packet, no user, no password, no SQL). Checks 11–12 need credentials and are
 * reported BLOCKED rather than PASSED when they are absent — a blocked check is
 * never silently upgraded to a pass.
 *
 * FAIL-CLOSED CONTRACT
 *   There is no insecure fallback, no retry with weaker TLS, and no removal of
 *   verification anywhere in this file. If a required condition cannot be
 *   established, the preflight reports failure and exits non-zero.
 *
 * EXIT CODES
 *   0  every applicable check passed
 *   1  a check FAILED — production must NOT be declared recovered
 *   2  a check was BLOCKED (missing credentials or no network path) and no
 *      check failed — evidence is incomplete, do NOT declare recovered either
 *
 * NO SECRETS: no DSN, password, username or key is ever printed. Only variable
 * NAMES, safe endpoint facts and certificate fingerprints are emitted.
 */
import "dotenv/config";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";
import crypto from "node:crypto";
import { Client } from "pg";

import {
  SUPABASE_TRUST_ANCHOR_FINGERPRINTS,
  buildPgConnectionConfig,
  certificateFingerprintSha256,
  loadSupabaseTrustAnchors,
} from "../src/db/tls.ts";

/* ------------------------- expected production -------------------------- */

const EXPECTED_HOST = "aws-0-eu-west-3.pooler.supabase.com";
const EXPECTED_RUNTIME_PORT = 6543; // Supavisor transaction pooler
const EXPECTED_ADMIN_PORT = 5432; // Supavisor session pooler
const EXPECTED_DATABASE = "postgres";
const EXPECTED_PROJECT_REF = "siyzygezdmlxbvwttrdz";
const HANDSHAKE_TIMEOUT_MS = Number(process.env.BEYU_TLS_PREFLIGHT_TIMEOUT_MS ?? "15000");

const SSL_REQUEST = Buffer.from([0, 0, 0, 8, 4, 210, 22, 47]);

type Verdict = "PASS" | "FAIL" | "BLOCKED";
type Result = { id: string; name: string; verdict: Verdict; detail: string };

const results: Result[] = [];
function record(id: string, name: string, verdict: Verdict, detail: string): Verdict {
  results.push({ id, name, verdict, detail });
  console.log(`${verdict.padEnd(7)} ${id.padEnd(4)} ${name}\n        ${detail}`);
  return verdict;
}

/** True when the environment is a production deployment. */
const IS_PRODUCTION =
  process.env.BEYU_ENV === "production" || process.env.NODE_ENV === "production";

/* ------------------- 1. required variables exist ------------------------ */

function checkRequiredVariables(): { runtime: string | undefined; admin: string | undefined } {
  const required = ["DATABASE_URL", "BEYU_RUNTIME_DATABASE_URL", "BEYU_ADMIN_DATABASE_URL"];
  const missing = required.filter((name) => !process.env[name]);
  // Report NAMES only — never values.
  const present = required.filter((name) => Boolean(process.env[name]));
  if (missing.length > 0) {
    record(
      "1",
      "required production DB variables exist",
      IS_PRODUCTION ? "FAIL" : "BLOCKED",
      `present=[${present.join(", ") || "none"}] missing=[${missing.join(", ")}]`,
    );
  } else {
    record("1", "required production DB variables exist", "PASS", `present=[${required.join(", ")}]`);
  }
  return {
    runtime: process.env.BEYU_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL,
    admin: process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL,
  };
}

/* ---------------- 2–7. endpoint, TLS, verification, CA ------------------ */

function checkTrustConfiguration(dsn: string | undefined, label: string, expectedPort: number) {
  const prefix = label;
  if (!dsn) {
    record("2", `${prefix}: endpoint is the expected production endpoint`, "BLOCKED", "DSN not set");
    for (const [id, name] of [
      ["3", "TLS is enabled"],
      ["4", "certificate verification is enabled"],
      ["5", "hostname verification is enabled"],
      ["6", "explicit authoritative CA trust is configured"],
      ["7", "CA fingerprints match the approved allowlist"],
    ] as const) {
      record(id, `${prefix}: ${name}`, "BLOCKED", "DSN not set");
    }
    return undefined;
  }

  // buildPgConnectionConfig enforces the entire policy and throws on any
  // weakness. That throw IS the fail-closed path — catch it and report.
  let built: ReturnType<typeof buildPgConnectionConfig>;
  try {
    built = buildPgConnectionConfig(dsn, label);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    record("2", `${prefix}: endpoint/TLS policy`, "FAIL", `policy rejected the DSN: ${message}`);
    for (const id of ["3", "4", "5", "6", "7"]) {
      record(id, `${prefix}: checks 3–7`, "BLOCKED", "not evaluated: DSN failed the TLS policy");
    }
    return undefined;
  }

  const { endpoint, anchors, ssl, localDevelopment } = built;

  // 2 — endpoint identity
  const endpointOk =
    endpoint.host === EXPECTED_HOST &&
    endpoint.port === expectedPort &&
    endpoint.database === EXPECTED_DATABASE;
  record(
    "2",
    `${prefix}: endpoint is the expected production endpoint`,
    endpointOk ? "PASS" : "FAIL",
    `observed=${endpoint.host}:${endpoint.port}/${endpoint.database} ` +
      `expected=${EXPECTED_HOST}:${expectedPort}/${EXPECTED_DATABASE}`,
  );

  if (localDevelopment) {
    record("3", `${prefix}: TLS is enabled`, "FAIL", "local-development plaintext exemption is not valid for production");
    for (const id of ["4", "5", "6", "7"]) {
      record(id, `${prefix}: checks 4–7`, "BLOCKED", "TLS is not in force");
    }
    return undefined;
  }

  // 3 — TLS enabled (sslmode=verify-full is asserted by the builder)
  record("3", `${prefix}: TLS is enabled`, "PASS", `sslmode=${endpoint.sslmode}`);

  // 4 — certificate verification enabled
  record(
    "4",
    `${prefix}: certificate verification is enabled`,
    ssl?.rejectUnauthorized === true ? "PASS" : "FAIL",
    `rejectUnauthorized=${String(ssl?.rejectUnauthorized)}`,
  );

  // 5 — hostname verification enabled: the module must not install a
  // checkServerIdentity override, so Node's default runs against pg's servername.
  const overridesIdentity = ssl !== undefined && "checkServerIdentity" in ssl;
  record(
    "5",
    `${prefix}: hostname verification is enabled`,
    !overridesIdentity && net.isIP(endpoint.host) === 0 ? "PASS" : "FAIL",
    overridesIdentity
      ? "a checkServerIdentity override is present"
      : net.isIP(endpoint.host) !== 0
        ? "host is an IP literal, so pg sets no servername"
        : "no checkServerIdentity override; servername = DSN host",
  );

  // 6 — explicit CA trust configured
  const caCount = Array.isArray(ssl?.ca) ? (ssl!.ca as string[]).length : 0;
  record(
    "6",
    `${prefix}: explicit authoritative CA trust is configured`,
    caCount > 0 ? "PASS" : "FAIL",
    `pinned anchors supplied to the TLS stack: ${caCount}`,
  );

  // 7 — fingerprints match the approved allowlist
  const mismatches: string[] = [];
  try {
    const loaded = loadSupabaseTrustAnchors();
    for (const anchor of loaded) {
      const approved =
        SUPABASE_TRUST_ANCHOR_FINGERPRINTS[
          anchor.label as keyof typeof SUPABASE_TRUST_ANCHOR_FINGERPRINTS
        ];
      const recomputed = certificateFingerprintSha256(anchor.pem);
      if (approved !== recomputed) {
        mismatches.push(`${anchor.label}: recomputed ${recomputed} != approved ${approved}`);
      }
    }
    const missingAnchors = (
      Object.keys(SUPABASE_TRUST_ANCHOR_FINGERPRINTS) as Array<
        keyof typeof SUPABASE_TRUST_ANCHOR_FINGERPRINTS
      >
    ).filter((l) => !loaded.some((a) => a.label === l));
    if (missingAnchors.length > 0) {
      mismatches.push(`missing approved anchors: ${missingAnchors.join(", ")}`);
    }
  } catch (e) {
    mismatches.push(e instanceof Error ? e.message : String(e));
  }
  record(
    "7",
    `${prefix}: CA fingerprints match the approved allowlist`,
    mismatches.length === 0 ? "PASS" : "FAIL",
    mismatches.length === 0
      ? `verified ${Object.keys(SUPABASE_TRUST_ANCHOR_FINGERPRINTS).length} anchor(s): ` +
        anchors.map((a) => `${a.label}=${a.fingerprintSha256.slice(0, 12)}…`).join(", ")
      : mismatches.join(" | "),
  );

  return { endpoint, ssl };
}

/* ------------- 8–10. real handshake, chain, hostname -------------------- */

/** `stage` distinguishes "no network path" from "TLS refused the peer". */
type HandshakeOutcome =
  | { ok: true; stage: "tls"; tlsVersion: string; cipher: string; chain: ChainFact[]; hostname: string }
  | { ok: false; stage: "tcp" | "sslrequest" | "tls"; code: string; chain: ChainFact[] };

type ChainFact = {
  depth: number;
  subjectCn: string;
  issuerCn: string;
  fingerprintSha256: string;
  selfSigned: boolean;
  inNodeBundledStore: boolean;
  isPinnedAnchor: boolean;
  validNow: boolean;
  isCa: boolean | null;
};

const NODE_STORE = new Set(
  tls.rootCertificates.map((pem) =>
    crypto
      .createHash("sha256")
      .update(Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64"))
      .digest("hex"),
  ),
);

function describeChain(socket: tls.TLSSocket): ChainFact[] {
  const pinned = new Set(Object.values(SUPABASE_TRUST_ANCHOR_FINGERPRINTS));
  const out: ChainFact[] = [];
  const seen = new Set<string>();
  let cert = socket.getPeerCertificate(true) as tls.DetailedPeerCertificate | undefined;
  let depth = 0;
  while (cert && Object.keys(cert).length > 0 && depth < 10) {
    const der = cert.raw ? Buffer.from(cert.raw) : Buffer.alloc(0);
    const fp = (cert.fingerprint256 ?? crypto.createHash("sha256").update(der).digest("hex"))
      .replace(/:/g, "")
      .toLowerCase();
    if (seen.has(fp)) break;
    seen.add(fp);
    const selfSigned = JSON.stringify(cert.subject) === JSON.stringify(cert.issuer);
    let isCa: boolean | null = null;
    try {
      isCa = new crypto.X509Certificate(der).ca;
    } catch {
      isCa = null;
    }
    const now = Date.now();
    out.push({
      depth,
      subjectCn: String((cert.subject as Record<string, string>).CN ?? "?"),
      issuerCn: String((cert.issuer as Record<string, string>).CN ?? "?"),
      fingerprintSha256: fp,
      selfSigned,
      inNodeBundledStore: NODE_STORE.has(fp),
      isPinnedAnchor: pinned.has(fp),
      validNow: now >= Date.parse(cert.valid_from) && now <= Date.parse(cert.valid_to),
      isCa,
    });
    cert = cert.issuerCertificate;
    depth += 1;
  }
  return out;
}

/**
 * Credential-free PostgreSQL SSLRequest → TLS handshake using the EXACT trust
 * configuration the application will use. Sends no startup packet, no user, no
 * password and no SQL; the socket is destroyed immediately after the handshake.
 */
async function probeHandshake(
  host: string,
  port: number,
  ca: string[] | undefined,
): Promise<HandshakeOutcome> {
  const raw: net.Socket = await new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(Object.assign(new Error("timeout before the server answered the SSLRequest"), { stage: "sslrequest" }));
    }, HANDSHAKE_TIMEOUT_MS);
    socket.once("error", (e) => {
      clearTimeout(timer);
      reject(Object.assign(e, { stage: "tcp" }));
    });
    socket.once("connect", () => socket.write(SSL_REQUEST));
    socket.once("data", (buf) => {
      clearTimeout(timer);
      const code = buf.toString("utf8");
      if (code !== "S") {
        socket.destroy();
        reject(Object.assign(new Error(`server answered '${code}' to SSLRequest (TLS not offered on this port)`), { stage: "sslrequest" }));
        return;
      }
      socket.removeAllListeners("error");
      resolve(socket);
    });
  });

  return await new Promise<HandshakeOutcome>((resolve) => {
    let settled = false;
    const finish = (r: HandshakeOutcome) => {
      if (settled) return;
      settled = true;
      try {
        raw.destroy();
      } catch {
        /* already gone */
      }
      resolve(r);
    };
    const timer = setTimeout(
      () => finish({ ok: false, stage: "tls", code: "TLS_HANDSHAKE_TIMEOUT", chain: [] }),
      HANDSHAKE_TIMEOUT_MS,
    );

    const options: tls.ConnectionOptions = {
      socket: raw,
      servername: host,
      // Always true. This preflight never weakens verification.
      rejectUnauthorized: true,
    };
    if (ca) options.ca = ca;

    const socket = tls.connect(options, () => {
      clearTimeout(timer);
      const chain = describeChain(socket);
      let hostname = "OK (SAN matches SNI hostname)";
      try {
        const err = tls.checkServerIdentity(host, socket.getPeerCertificate());
        if (err) hostname = `MISMATCH: ${err.message}`;
      } catch (e) {
        hostname = `MISMATCH: ${e instanceof Error ? e.message : String(e)}`;
      }
      finish({
        ok: true,
        stage: "tls",
        tlsVersion: socket.getProtocol() ?? "?",
        cipher: socket.getCipher()?.name ?? "?",
        chain,
        hostname,
      });
    });

    socket.on("error", (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      let chain: ChainFact[] = [];
      try {
        chain = describeChain(socket);
      } catch {
        chain = [];
      }
      finish({ ok: false, stage: "tls", code: e.code ?? "TLS_ERROR", chain });
    });
  });
}

async function checkHandshake(config: { endpoint: { host: string; port: number }; ssl: { ca: string[] } }, label: string) {
  const { host, port } = config.endpoint;
  let outcome: HandshakeOutcome;
  try {
    outcome = await probeHandshake(host, port, config.ssl.ca);
  } catch (e) {
    // No network path at all (TCP refused/reset, or the SSLRequest went
    // unanswered). This is INCOMPLETE EVIDENCE, not a trust failure — the
    // distinction matters, because reporting it as a trust failure would hide a
    // genuine egress problem, and reporting it as a pass would be a lie.
    const stage = (e as { stage?: string }).stage ?? "tcp";
    const message = e instanceof Error ? e.message : String(e);
    record("8", `${label}: TLS handshake succeeds`, "BLOCKED", `no network path (${stage}): ${message.split("\n")[0].slice(0, 120)}`);
    record("9", `${label}: certificate chain validates`, "BLOCKED", "handshake never reached TLS");
    record("10", `${label}: hostname validates`, "BLOCKED", "handshake never reached TLS");
    return false;
  }

  if (!outcome.ok) {
    // Reached TLS and TLS refused the peer: that IS a trust failure.
    record("8", `${label}: TLS handshake succeeds`, "FAIL", `error code=${outcome.code}`);
    record("9", `${label}: certificate chain validates`, "FAIL", `handshake failed (${outcome.code})`);
    record("10", `${label}: hostname validates`, "BLOCKED", "handshake failed");
    return false;
  }

  record(
    "8",
    `${label}: TLS handshake succeeds`,
    "PASS",
    `${outcome.tlsVersion} / ${outcome.cipher} to ${host}:${port}`,
  );

  // 9 — chain validation: every cert currently valid, terminating at a pinned
  // self-signed root. Reported from the served chain, not inferred.
  const problems: string[] = [];
  const root = outcome.chain[outcome.chain.length - 1];
  if (outcome.chain.length === 0) problems.push("no peer certificate was presented");
  if (root && !root.selfSigned) problems.push("the served chain does not terminate at a self-signed root");
  if (root && !root.isPinnedAnchor) problems.push(`the served root ${root.fingerprintSha256.slice(0, 16)}… is not a pinned anchor`);
  for (const cert of outcome.chain) {
    if (!cert.validNow) problems.push(`depth ${cert.depth} (${cert.subjectCn}) is outside its validity period`);
    if (cert.depth > 0 && cert.isCa === false) problems.push(`depth ${cert.depth} (${cert.subjectCn}) is not a CA`);
  }
  record(
    "9",
    `${label}: certificate chain validates`,
    problems.length === 0 ? "PASS" : "FAIL",
    problems.length === 0
      ? `leaf → … → root: ${outcome.chain.map((c) => `${c.subjectCn}${c.isPinnedAnchor ? " [PINNED]" : ""}`).join(" → ")}`
      : problems.join(" | "),
  );

  // 10 — hostname validation
  record(
    "10",
    `${label}: hostname validates`,
    outcome.hostname.startsWith("OK") ? "PASS" : "FAIL",
    `${outcome.hostname} (SNI=${host})`,
  );
  return true;
}

/* ---------------- 11–12. authentication + DB security ------------------- */

async function checkDatabase(dsn: string | undefined, label: string) {
  if (!dsn) {
    record("11", `${label}: PostgreSQL authentication succeeds`, "BLOCKED", "DSN not set");
    record("12", `${label}: runtime DB security invariants`, "BLOCKED", "DSN not set");
    return;
  }
  let client: Client | undefined;
  try {
    const built = buildPgConnectionConfig(dsn, label);
    client = new Client({
      connectionString: built.connectionString,
      ssl: built.ssl,
      connectionTimeoutMillis: HANDSHAKE_TIMEOUT_MS,
    });
    await client.connect();
    // 11 — authentication (the DSN password is never printed)
    record("11", `${label}: PostgreSQL authentication succeeds`, "PASS", "connected and authenticated");

    // 12 — runtime DB security invariants
    const role = (await client.query("select current_user as u")).rows[0]?.u as string | undefined;
    const attrs = (
      await client.query(
        "select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb from pg_roles where rolname = $1",
        [role],
      )
    ).rows[0] as
      | { rolsuper: boolean; rolbypassrls: boolean; rolcreaterole: boolean; rolcreatedb: boolean }
      | undefined;
    const rls = (
      await client.query(
        "select count(*)::int as enforced from pg_class c join pg_namespace n on n.oid=c.relnamespace " +
          "where n.nspname='public' and c.relrowsecurity and c.relkind='r'",
      )
    ).rows[0]?.enforced as number | undefined;

    const problems: string[] = [];
    if (!attrs) problems.push(`role ${role ?? "?"} not found in pg_roles`);
    else {
      if (attrs.rolsuper) problems.push("runtime role is a SUPERUSER");
      if (attrs.rolbypassrls) problems.push("runtime role has BYPASSRLS");
      if (attrs.rolcreaterole) problems.push("runtime role has CREATEROLE");
      if (attrs.rolcreatedb) problems.push("runtime role has CREATEDB");
    }
    if (typeof rls === "number" && rls === 0) problems.push("no public table has row-level security enabled");
    record(
      "12",
      `${label}: runtime DB security invariants`,
      problems.length === 0 ? "PASS" : "FAIL",
      problems.length === 0
        ? `role=${role} NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB; RLS-enabled public tables=${rls}`
        : problems.join(" | "),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Never echo a DSN: report the classification-shaped token only.
    const code =
      typeof e === "object" && e !== null && "code" in e && typeof (e as { code?: unknown }).code === "string"
        ? (e as { code: string }).code
        : undefined;
    // A transport-level failure means the evidence could not be obtained
    // (BLOCKED); anything else — a rejected credential, a refused role — is a
    // genuine authentication failure (FAIL). pg-pool and pg wrap the real
    // driver error in `cause`, so walk the chain before deciding.
    const chain: unknown[] = [];
    let current: unknown = e;
    for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth++) {
      chain.push(current);
      const next = (current as { cause?: unknown }).cause;
      if (next === undefined || next === null || next === current) break;
      current = next;
    }
    const codes = chain
      .map((link) => (link as { code?: unknown }).code)
      .filter((c): c is string => typeof c === "string" && c.length > 0);
    const TRANSPORT = /^(ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ESOCKETTIMEDOUT|EHOSTUNREACH|ENETUNREACH|EPIPE)$/;
    const transport = codes.some((c) => TRANSPORT.test(c)) || /Connection terminated|connection timeout/i.test(message);
    record(
      "11",
      `${label}: PostgreSQL authentication succeeds`,
      transport ? "BLOCKED" : "FAIL",
      `${transport ? "no network path to the database" : "authentication/connection failed"}` +
        ` (codes=[${codes.join(",") || "none"}])`,
    );
    record("12", `${label}: runtime DB security invariants`, "BLOCKED", "not connected");
  } finally {
    try {
      await client?.end();
    } catch {
      /* ignore */
    }
  }
}

/* ------------------------------- main ---------------------------------- */

async function main(): Promise<number> {
  console.log("BEYU OS — production TLS / database preflight (fail-closed)");
  console.log(`  environment: ${IS_PRODUCTION ? "production" : "non-production"}`);
  console.log(`  node ${process.version} · openssl ${process.versions.openssl}\n`);

  const { runtime, admin } = checkRequiredVariables();

  const runtimeConfig = checkTrustConfiguration(runtime, "runtime", EXPECTED_RUNTIME_PORT);
  const adminConfig = checkTrustConfiguration(admin, "admin", EXPECTED_ADMIN_PORT);

  if (runtimeConfig) await checkHandshake(runtimeConfig as never, "runtime");
  if (adminConfig) await checkHandshake(adminConfig as never, "admin");

  await checkDatabase(runtime, "runtime");

  // Project-ref sanity: the Supavisor username must carry the production ref.
  if (runtime) {
    try {
      const user = decodeURIComponent(new URL(runtime).username);
      const ok = user.endsWith(`.${EXPECTED_PROJECT_REF}`);
      record(
        "2b",
        "runtime user targets the expected Supabase project",
        ok ? "PASS" : "FAIL",
        ok
          ? `user ends with .${EXPECTED_PROJECT_REF}`
          : `user does not end with .${EXPECTED_PROJECT_REF} (value withheld)`,
      );
    } catch {
      record("2b", "runtime user targets the expected Supabase project", "FAIL", "DSN is not parseable");
    }
  }

  const failed = results.filter((r) => r.verdict === "FAIL");
  const blocked = results.filter((r) => r.verdict === "BLOCKED");
  const passed = results.filter((r) => r.verdict === "PASS");

  console.log(`\n${"─".repeat(72)}`);
  console.log(`PASS ${passed.length}   FAIL ${failed.length}   BLOCKED ${blocked.length}`);
  if (failed.length > 0) {
    console.log("PREFLIGHT FAILED — production must NOT be declared recovered.");
    return 1;
  }
  if (blocked.length > 0) {
    console.log("PREFLIGHT BLOCKED — evidence incomplete; do NOT declare recovered.");
    return 2;
  }
  console.log("PREFLIGHT PASSED.");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error("preflight crashed:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
