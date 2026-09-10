#!/usr/bin/env node
/**
 * BEYU OS — TLS TRUST MATRIX (READ-ONLY, CREDENTIAL-FREE).
 *
 * WHAT IT ANSWERS
 *   Production (Vercel) fails against the Supabase TRANSACTION pooler with
 *   SELF_SIGNED_CERT_IN_CHAIN, while GitHub Actions migrations against the
 *   SESSION pooler SUCCEED with no explicit CA. Those two facts cannot both be
 *   explained without knowing the exact chain each port serves and which trust
 *   set makes each one verify. This script measures precisely that.
 *
 *   For each port it performs PostgreSQL SSLRequest → TLS and reports, for
 *   three candidate trust sets, whether a STRICT verified handshake succeeds:
 *
 *     A. NODE_DEFAULT_STORE      — tls.rootCertificates only (what a client
 *                                  that supplies no `ca` gets today)
 *     B. SUPABASE_ANCHORS_ONLY   — only config/tls/supabase/*.crt (a private
 *                                  Supabase CA, absent from every public store)
 *     C. SUPABASE_PLUS_DEFAULT   — both (the dual-trust transition shape)
 *
 *   It also records the served chain (leaf → root) with per-certificate
 *   subject/issuer/SAN/validity/SHA-256 fingerprint and whether each cert is in
 *   Node's bundled store, so the chain identity is established from evidence
 *   rather than inferred from an error string.
 *
 * SAFETY CONTRACT
 *   - The only PostgreSQL bytes transmitted are the 8-byte SSLRequest: no
 *     startup packet, no username, no password, no SQL.
 *   - Every trust-set probe uses rejectUnauthorized:true. Verification is NEVER
 *     disabled for a probe whose verdict is reported as authoritative.
 *   - ONE additional handshake with rejectUnauthorized:false is performed per
 *     port solely to RECORD a chain that a strict handshake refuses to surface.
 *     Its result is labelled `captureOnly:true` and is never used as a verdict.
 *   - No file outside the process is modified. Output is a fixed JSONL field
 *     set containing no DSN, credential or secret (none exists here).
 *
 * USAGE
 *   node scripts/tls-trust-matrix.mjs [--host aws-0-eu-west-3.pooler.supabase.com]
 *        [--ports 6543,5432] [--ca-dir config/tls/supabase] [--timeout-ms 15000]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const HOST = argValue("--host", "aws-0-eu-west-3.pooler.supabase.com");
const PORTS = argValue("--ports", "6543,5432")
  .split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
const CA_DIR = argValue("--ca-dir", "config/tls/supabase");
const TIMEOUT_MS = Number(argValue("--timeout-ms", "15000"));

const SSL_REQUEST = Buffer.from([0, 0, 0, 8, 4, 210, 22, 47]);

function emit(line) {
  console.log(JSON.stringify(line));
}

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

const NODE_STORE = new Set(
  tls.rootCertificates.map((pem) =>
    sha256Hex(Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64"))),
);

function loadSupabaseAnchors() {
  const out = [];
  let files = [];
  try {
    files = fs.readdirSync(CA_DIR).filter((f) => f.endsWith(".crt") || f.endsWith(".pem")).sort();
  } catch {
    return { anchors: out, error: `cannot read ${CA_DIR}` };
  }
  for (const file of files) {
    const pem = fs.readFileSync(path.join(CA_DIR, file), "utf8").trim() + "\n";
    let fingerprint;
    try {
      const x = new crypto.X509Certificate(pem);
      fingerprint = sha256Hex(Buffer.from(x.raw));
    } catch {
      continue;
    }
    out.push({ label: file.replace(/\.(crt|pem)$/, ""), pem, fingerprint });
  }
  return { anchors: out, error: null };
}

const { anchors: SUPABASE_ANCHORS, error: ANCHOR_ERROR } = loadSupabaseAnchors();

const TRUST_SETS = {
  NODE_DEFAULT_STORE: { ca: undefined },
  SUPABASE_ANCHORS_ONLY: { ca: SUPABASE_ANCHORS.map((a) => a.pem) },
  SUPABASE_PLUS_DEFAULT: { ca: [...SUPABASE_ANCHORS.map((a) => a.pem), ...tls.rootCertificates] },
};

function certFacts(cert, depth) {
  const der = cert.raw ? Buffer.from(cert.raw) : Buffer.alloc(0);
  const fingerprint256 = cert.fingerprint256 ?? sha256Hex(der);
  const selfSigned = JSON.stringify(cert.subject) === JSON.stringify(cert.issuer);
  let x509 = null;
  try {
    x509 = new crypto.X509Certificate(der);
  } catch {
    /* leave null */
  }
  return {
    depth,
    role: depth === 0 ? "leaf" : selfSigned ? "self-signed-root" : "intermediate",
    subject: cert.subject,
    issuer: cert.issuer,
    subjectAltName: cert.subjectaltname ?? null,
    validFrom: cert.valid_from,
    validTo: cert.valid_to,
    serialNumber: cert.serialNumber ?? null,
    fingerprint256,
    selfSigned,
    inNodeBundledCAStore: NODE_STORE.has(fingerprint256),
    inSupabaseAnchors: SUPABASE_ANCHORS.some((a) => a.fingerprint === fingerprint256),
    isCa: x509 ? x509.ca : null,
  };
}

function peerChain(socket) {
  const chain = [];
  let cert = socket.getPeerCertificate(true);
  const seen = new Set();
  let depth = 0;
  while (cert && Object.keys(cert).length > 0 && depth < 10) {
    const fp = cert.fingerprint256 ?? sha256Hex(Buffer.from(cert.raw ?? []));
    if (seen.has(fp)) break;
    seen.add(fp);
    chain.push(certFacts(cert, depth));
    cert = cert.issuerCertificate;
    depth += 1;
  }
  return chain;
}

/** PostgreSQL SSLRequest, then TLS upgrade. Returns the raw socket at TLS start. */
function sslRequestSocket(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(Object.assign(new Error("timeout before SSLRequest answer"), { stage: "sslrequest" }));
    }, TIMEOUT_MS);
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
        reject(Object.assign(new Error(`server answered '${code}' to SSLRequest`), { stage: "sslrequest" }));
        return;
      }
      socket.removeAllListeners("error");
      resolve(socket);
    });
  });
}

async function probe(host, port, trustSetName, { captureOnly = false } = {}) {
  const started = Date.now();
  const trust = TRUST_SETS[trustSetName];
  let raw;
  try {
    raw = await sslRequestSocket(host, port);
  } catch (e) {
    return {
      trustSet: trustSetName, stage: e.stage ?? "sslrequest", ok: false,
      errorCode: e.code ?? "NO_SSL_REPLY_CONNECTION_CLOSED",
      errorMessage: e.message, elapsedMs: Date.now() - started,
      ...(captureOnly ? { captureOnly: true } : {}),
    };
  }

  const options = {
    socket: raw,
    servername: host,
    rejectUnauthorized: !captureOnly,
  };
  if (trust.ca) options.ca = trust.ca;

  return await new Promise((resolve) => {
    const settled = { done: false };
    const finish = (result) => {
      if (settled.done) return;
      settled.done = true;
      try { raw.destroy(); } catch { /* already gone */ }
      resolve(result);
    };
    const timer = setTimeout(() => finish({
      trustSet: trustSetName, stage: "tls", ok: false,
      errorCode: "TLS_HANDSHAKE_TIMEOUT", elapsedMs: Date.now() - started,
      ...(captureOnly ? { captureOnly: true } : {}),
    }), TIMEOUT_MS);

    const socket = tls.connect(options, () => {
      clearTimeout(timer);
      const chain = peerChain(socket);
      const leaf = socket.getPeerCertificate();
      let hostname = "OK (SAN matches SNI hostname)";
      try {
        const err = tls.checkServerIdentity(host, leaf);
        if (err) hostname = `MISMATCH: ${err.message}`;
      } catch (e) {
        hostname = `MISMATCH: ${e.message}`;
      }
      finish({
        trustSet: trustSetName, stage: "tls", ok: true,
        tlsVersion: socket.getProtocol(), cipher: socket.getCipher()?.name ?? null,
        authorized: socket.authorized, hostnameCheck: hostname,
        elapsedMs: Date.now() - started,
        ...(captureOnly ? { captureOnly: true } : {}),
        servedChain: chain,
      });
    });

    socket.on("error", (e) => {
      clearTimeout(timer);
      const chain = (() => { try { return peerChain(socket); } catch { return []; } })();
      finish({
        trustSet: trustSetName, stage: "tls", ok: false,
        errorCode: e.code ?? null, errorName: e.name ?? null,
        authorizationError: socket.authorizationError?.code ?? socket.authorizationError ?? null,
        authorized: socket.authorized,
        elapsedMs: Date.now() - started,
        ...(captureOnly ? { captureOnly: true } : {}),
        ...(captureOnly ? { servedChain: chain } : {}),
      });
    });
  });
}

emit({
  event: "tls_trust_matrix",
  phase: "environment",
  nodeVersion: process.version,
  opensslVersion: process.versions.openssl,
  bundledRootCACount: tls.rootCertificates.length,
  supabaseAnchorCount: SUPABASE_ANCHORS.length,
  supabaseAnchors: SUPABASE_ANCHORS.map((a) => ({ label: a.label, fingerprint256: a.fingerprint })),
  supabaseAnchorLoadError: ANCHOR_ERROR,
  NODE_EXTRA_CA_CERTS_set: process.env.NODE_EXTRA_CA_CERTS !== undefined,
  NODE_TLS_REJECT_UNAUTHORIZED_set: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== undefined,
  runnerUtc: new Date().toISOString(),
});

for (const port of PORTS) {
  // 1. The decisive differential: which trust set verifies this port.
  for (const trustSetName of Object.keys(TRUST_SETS)) {
    const result = await probe(HOST, port, trustSetName);
    emit({ event: "tls_trust_matrix", phase: "verify", host: HOST, port, ...result });
  }
  // 2. Record the served chain even if every strict handshake refused it.
  const captured = await probe(HOST, port, "NODE_DEFAULT_STORE", { captureOnly: true });
  emit({ event: "tls_trust_matrix", phase: "capture", host: HOST, port, ...captured });
}

emit({ event: "tls_trust_matrix", phase: "complete" });
