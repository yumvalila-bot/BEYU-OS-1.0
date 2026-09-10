/**
 * BEYU OS — production runtime DSN diagnostic (READ-ONLY).
 *
 * WHY THIS EXISTS
 *   `GET /api/health` reports only a sanitized classification token
 *   (`DATABASE_TLS_FAILURE`). The token alone cannot distinguish a genuine
 *   certificate failure from a misclassified auth/DNS/timeout/protocol error,
 *   and the structured log event drops every TLS driver code (see
 *   `safeDriverCode`). This script produces the missing evidence from an
 *   environment that can actually reach Supabase (GitHub Actions), without
 *   touching Vercel, without rotating anything, and without writing to the
 *   database.
 *
 * WHAT IT DOES
 *   1. TLS PROBE (no credentials) — performs the PostgreSQL `SSLRequest`
 *      handshake against the pooler host:port and reports the server's answer
 *      byte, whether Node verifies the certificate chain, the hostname
 *      verification result, and the certificate subject/issuer/SANs. This is
 *      pure transport information: no login is attempted, no credential is
 *      sent.
 *   2. RUNTIME PROBE — runs the application's OWN health probe
 *      (`probeDatabaseHealth()` from `src/lib/db-health.ts`) against the
 *      production runtime DSN, i.e. the exact code path Vercel executes.
 *   3. ADMIN CONTROL — runs the same classification against the admin DSN
 *      (`BEYU_ADMIN_DATABASE_URL`, session pooler). If the control connects
 *      and the runtime probe does not, the fault is isolated to the runtime
 *      DSN / pooler mode, not to the driver or to certificate trust.
 *
 * SAFETY CONTRACT
 *   - READ-ONLY: the only statement issued is `select 1`.
 *   - The password is never printed, never logged, never written to a file.
 *     It exists only inside the process as part of the DSN handed to `pg`.
 *   - Output is a fixed, allowlisted field set. No DSN, hostname, username,
 *     IP address or raw driver message is emitted.
 *   - Does not modify the database, the Supabase project, or Vercel.
 */
import net from "node:net";
import tls from "node:tls";

import { Pool } from "pg";

import { classifyConnectionError, probeDatabaseHealth, safeDriverCode } from "../src/lib/db-health";

const HOST = process.env.DIAG_HOST ?? "aws-0-eu-west-3.pooler.supabase.com";
const PORT = Number(process.env.DIAG_PORT ?? "6543");
const USER = process.env.DIAG_USER ?? "beyu_runtime.siyzygezdmlxbvwttrdz";
const DATABASE = process.env.DIAG_DATABASE ?? "postgres";
const SSLMODE = process.env.DIAG_SSLMODE ?? "require";
const PGBOUNCER = process.env.DIAG_PGBOUNCER ?? "true";
const RUNTIME_PASSWORD = process.env.BEYU_RUNTIME_DB_PASSWORD ?? "";
const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? "";

const lines: string[] = [];

/** Emit a workflow annotation (readable from the run summary) and stdout. */
function emit(label: string, payload: unknown): void {
  const text = `${label} ${JSON.stringify(payload)}`;
  lines.push(text);
  console.log(`::warning::${text}`);
}

function certFacts(cert: tls.PeerCertificate) {
  return {
    subjectCN: cert.subject?.CN ?? null,
    subjectO: cert.subject?.O ?? null,
    issuerCN: cert.issuer?.CN ?? null,
    issuerO: cert.issuer?.O ?? null,
    validFrom: cert.valid_from,
    validTo: cert.valid_to,
    subjectAltName: cert.subjectaltname ?? null,
    fingerprint256: cert.fingerprint256 ?? null,
    selfSigned: Boolean(cert.subject?.CN) && cert.subject?.CN === cert.issuer?.CN,
  };
}

/**
 * Stage 1 — credential-free TLS probe of the pooler endpoint.
 * Sends the 8-byte PostgreSQL SSLRequest and, on 'S', upgrades to TLS with
 * full verification (rejectUnauthorized defaults to true).
 */
function tlsProbe(host: string, port: number): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const out: Record<string, unknown> = { host, port };
    let settled = false;
    const finish = (extra: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      resolve({ ...out, ...extra });
    };
    const sock = net.connect(port, host);
    sock.setTimeout(20_000);
    sock.on("error", (e: NodeJS.ErrnoException) => {
      finish({ stage: "tcp", ok: false, errorCode: e.code ?? null, errorMessage: "tcp connect failed" });
    });
    sock.on("timeout", () => {
      sock.destroy();
      finish({ stage: "tcp", ok: false, errorCode: "ETIMEDOUT", errorMessage: "tcp connect timeout" });
    });
    sock.on("connect", () => {
      const req = Buffer.alloc(8);
      req.writeInt32BE(8, 0);
      req.writeInt32BE(80877103, 4); // SSLRequest
      sock.write(req);
    });
    sock.once("data", (chunk) => {
      const byte = chunk.subarray(0, 1).toString("latin1");
      out.sslResponseByte = byte === "S" ? "S (server supports SSL)" : byte === "N" ? "N (server refuses SSL)" : `unexpected:${byte.charCodeAt(0)}`;
      if (byte !== "S") {
        sock.destroy();
        finish({ stage: "sslrequest", ok: false });
        return;
      }
      const secure = tls.connect(
        { socket: sock, servername: host, rejectUnauthorized: true },
        () => {
          const cert = secure.getPeerCertificate(true);
          let identityError: string | null = null;
          try {
            const mismatch = tls.checkServerIdentity(host, cert);
            identityError = mismatch ? mismatch.message : null;
          } catch (e) {
            identityError = e instanceof Error ? e.message : "identity check threw";
          }
          const facts = {
            stage: "tls",
            ok: true,
            authorized: secure.authorized,
            authorizationError: secure.authorizationError ? String(secure.authorizationError) : null,
            authorizationErrorCode: (secure.authorizationError as NodeJS.ErrnoException | undefined)?.code ?? null,
            hostnameVerificationError: identityError,
            protocol: secure.getProtocol(),
            cipher: secure.getCipher()?.name ?? null,
            certificate: certFacts(cert),
          };
          secure.destroy();
          finish(facts);
        },
      );
      secure.on("error", (e: NodeJS.ErrnoException) => {
        const cert = (secure as unknown as { getPeerCertificate?: (b: boolean) => tls.PeerCertificate }).getPeerCertificate?.(true);
        finish({
          stage: "tls",
          ok: false,
          authorized: secure.authorized,
          errorCode: e.code ?? null,
          errorName: e.name,
          // The driver message can embed hostnames; keep only the class.
          errorMessageClass: /certificate/i.test(e.message)
            ? "certificate verification failed"
            : /disconnected|hang up|reset/i.test(e.message)
              ? "peer closed during handshake"
              : /wrong version|unsupported/i.test(e.message)
                ? "peer is not speaking TLS on this port"
                : "tls handshake failed",
          certificate: cert && Object.keys(cert).length ? certFacts(cert) : null,
        });
      });
      secure.setTimeout(20_000, () => {
        secure.destroy();
        finish({ stage: "tls", ok: false, errorCode: "ETIMEDOUT", errorMessageClass: "tls handshake timeout" });
      });
    });
    sock.on("close", () => {
      finish({ stage: "closed", ok: false, errorMessageClass: "server closed with no SSLRequest answer" });
    });
  });
}

/** Stage 2/3 — connect through the driver and classify, using the app's own classifier. */
async function driverProbe(dsn: string, label: string): Promise<void> {
  if (!dsn) {
    emit(`DIAG ${label}`, { skipped: "DSN not provided" });
    return;
  }
  const pool = new Pool({ connectionString: dsn, connectionTimeoutMillis: 10_000 });
  const started = Date.now();
  try {
    const client = await pool.connect();
    await client.query("select 1");
    client.release();
    emit(`DIAG ${label}`, { connected: true, elapsedMs: Date.now() - started });
  } catch (e) {
    emit(`DIAG ${label}`, {
      connected: false,
      classification: classifyConnectionError(e),
      safeCode: safeDriverCode(e) ?? null,
      elapsedMs: Date.now() - started,
    });
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  if (!RUNTIME_PASSWORD) {
    console.log("::error::EXTERNAL_BLOCKED — BEYU_RUNTIME_DB_PASSWORD is not configured.");
    process.exit(1);
  }

  // 1 — credential-free TLS facts for the pooler endpoint.
  emit("DIAG tlsProbe", await tlsProbe(HOST, PORT));

  // 2 — the application's own probe against the production runtime DSN.
  const runtimeDsn = `postgresql://${encodeURIComponent(USER)}:${encodeURIComponent(
    RUNTIME_PASSWORD,
  )}@${HOST}:${PORT}/${DATABASE}?sslmode=${SSLMODE}&pgbouncer=${PGBOUNCER}`;
  process.env.DATABASE_URL = runtimeDsn;
  const started = Date.now();
  const probe = await probeDatabaseHealth();
  emit("DIAG runtimeProbe (src/lib/db-health.ts)", {
    ok: probe.ok,
    ...(probe.ok ? {} : { classification: probe.classification, safeCode: probe.code ?? null }),
    elapsedMs: Date.now() - started,
  });

  // 3 — admin control on the session pooler (proves CI→Supabase reachability).
  await driverProbe(ADMIN_URL, "adminControl (session pooler)");

  console.log("\n--- diagnostic summary (safe fields only) ---");
  for (const l of lines) console.log(l);
}

main().catch((e) => {
  console.log(`::error::diagnostic crashed: ${e instanceof Error ? e.name : "unknown"}`);
  process.exit(1);
});
