/**
 * FORENSIC REPRODUCTION HARNESS — READ-ONLY, LOCAL-ONLY, CREDENTIAL-FREE.
 *
 * Reproduces the exact production TLS verification path of
 *   src/db/index.ts  (`new Pool({ connectionString })`)
 * with the exact production DSN parameter shape
 *   ?sslmode=require&pgbouncer=true
 * against LOCAL fake Postgres STARTTLS endpoints that present different
 * certificate chain shapes. Nothing leaves this machine; the DSN password is
 * a dummy; DNS for the production hostname is patched in-process to 127.0.0.1
 * so pg still exercises the real SNI + checkServerIdentity path.
 *
 * This file is a local-only reproduction harness: it dials ONLY 127.0.0.1
 * (the production-shaped hostname is resolved to loopback in-process), so it
 * never contacts production. It exists so the differential error-code
 * evidence in docs/forensics/2026-09-10-prod-tls-forensics-*.md can be
 * reproduced by any reviewer.
 */
import dns from "node:dns";
import net from "node:net";
import tls from "node:tls";
import fs from "node:fs";

import { Pool } from "pg";
import { classifyConnectionError, safeDriverCode } from "@/lib/db-health";

const CERT_DIR = "/tmp/tls-repro/certs";
const HOSTNAME = "aws-0-eu-west-3.pooler.supabase.com";

// Route ONLY the production-shaped hostname to the local fake server.
const realLookup = dns.lookup.bind(dns);
// @ts-expect-error harness-only monkeypatch
dns.lookup = (hostname: any, options: any, callback: any) => {
  if (hostname === HOSTNAME) {
    const cb = typeof options === "function" ? options : callback;
    const opts = typeof options === "function" ? {} : options ?? {};
    if (opts && opts.all) return cb(null, [{ address: "127.0.0.1", family: 4 }]);
    return cb(null, "127.0.0.1", 4);
  }
  return realLookup(hostname, options, callback);
};

/** Minimal Postgres STARTTLS endpoint: SSLRequest → 'S' → TLS → ErrorResponse 28P01. */
function fakePgServer(chainPem: string, keyPem: string): Promise<number> {
  return new Promise((resolveServer) => {
    const server = net.createServer((raw) => {
      let responded = false;
      raw.once("data", (chunk) => {
        const len = chunk.readInt32BE(0);
        const code = chunk.readInt32BE(4);
        if (len === 8 && code === 80877103) {
          raw.write("S");
          responded = true;
          let secureContext: tls.SecureContext;
          try {
            secureContext = tls.createSecureContext({
              key: fs.readFileSync(keyPem, "utf8"),
              cert: fs.readFileSync(chainPem, "utf8"),
            });
          } catch (e) {
            console.log(JSON.stringify({ fatal: "server cert/key mismatch", file: chainPem, err: String(e) }));
            raw.destroy();
            return;
          }
          const tlsSocket = new tls.TLSSocket(raw, {
            isServer: true,
            secureContext,
            handshakeTimeout: 10_000,
          });
          tlsSocket.once("secure", () => {
            // Handshake done (verified or not — server side). Send auth error.
            const msgBody =
              "S\x00FATAL\x00V\x00FATAL\x00C\x0028P01\x00" +
              'M\x00password authentication failed for user "beyu_runtime" (local repro)\x00\x00';
            const buf = Buffer.alloc(5 + msgBody.length);
            buf.write("E", 0);
            buf.writeInt32BE(4 + msgBody.length, 1);
            buf.write(msgBody, 5);
            tlsSocket.end(buf);
          });
          tlsSocket.once("error", () => {
            /* client-side verification failures land here; nothing to do */
          });
        } else if (!responded) {
          raw.destroy();
        }
      });
      raw.on("error", () => {});
    });
    server.listen(0, "127.0.0.1", () => {
      resolveServer((server.address() as net.AddressInfo).port);
    });
  });
}

/** Extract full error forensics: name, code, message, cause chain. */
function errorForensics(e: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let cur: unknown = e;
  const chain: Record<string, unknown>[] = [];
  for (let depth = 0; depth < 5 && typeof cur === "object" && cur !== null; depth++) {
    const err = cur as NodeJS.ErrnoException & { cause?: unknown };
    chain.push({ name: err.name ?? null, code: (err as { code?: string }).code ?? null, message: err.message ?? null });
    cur = (err as { cause?: unknown }).cause;
  }
  out.chain = chain;
  return out;
}

async function runScenario(
  label: string,
  chainFile: string,
  dsnParams: string,
): Promise<void> {
  const keyFile = chainFile.includes("int") ? "leaf_int.key" : "leaf_unknown_root.key";
  const port = await fakePgServer(`${CERT_DIR}/${chainFile}`, `${CERT_DIR}/${keyFile}`);
  const dsn = `postgresql://beyu_runtime.siyzygezdmlxbvwttrdz:DUMMY-NO-CREDENTIAL@${HOSTNAME}:${port}/postgres?${dsnParams}`;
  const pool = new Pool({ connectionString: dsn, connectionTimeoutMillis: 10_000 });
  const started = Date.now();
  try {
    await pool.query("select 1");
    console.log(JSON.stringify({ scenario: label, outcome: "TLS_OK_AND_QUERY_OK" }));
  } catch (e) {
    console.log(
      JSON.stringify({
        scenario: label,
        servedChain: chainFile,
        dsnParams,
        outcome: "ERROR",
        elapsedMs: Date.now() - started,
        pgSurfaced: errorForensics(e),
        repoClassification: classifyConnectionError(e),
        repoSafeDriverCode: safeDriverCode(e) ?? null,
      }),
    );
  } finally {
    await pool.end().catch(() => {});
  }
}

const argv = process.argv.slice(2);
const scenario = argv[0] ?? "all";

const scenarios: Record<string, () => Promise<void>> = {
  // S1 — chain INCLUDING an unknown self-signed root (mimics "server sends its root")
  S1_unknown_root_in_chain: () =>
    runScenario("S1_unknown_root_in_chain", "chain_root_included.pem", "sslmode=require&pgbouncer=true"),
  // S2 — leaf only, intermediate MISSING (never sent, not in any store)
  S2_missing_intermediate: () =>
    runScenario("S2_missing_intermediate", "leaf_int.pem", "sslmode=require&pgbouncer=true"),
  // S3 — leaf + unknown intermediate sent, root NOT sent and unknown
  S3_int_sent_root_missing: () =>
    runScenario("S3_int_sent_root_missing", "chain_int_included.pem", "sslmode=require&pgbouncer=true"),
  // S4 — SAME failing server as S1 but with uselibpqcompat=true (libpq 'require' semantics)
  S4_uselibpqcompat_require: () =>
    runScenario("S4_uselibpqcompat_require", "chain_root_included.pem", "sslmode=require&uselibpqcompat=true&pgbouncer=true"),
  // S5 — explicit verify-full against the failing server (alias confirmation)
  S5_explicit_verify_full: () =>
    runScenario("S5_explicit_verify_full", "chain_root_included.pem", "sslmode=verify-full&pgbouncer=true"),
};

if (scenario === "all") {
  for (const [name, fn] of Object.entries(scenarios)) {
    await fn();
  }
} else {
  await scenarios[scenario]();
}
process.exit(0);
