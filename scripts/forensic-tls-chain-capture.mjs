#!/usr/bin/env node
/**
 * BEYU OS — credential-free TLS certificate-chain forensics (READ-ONLY).
 *
 * PURPOSE
 *   Capture and report the EXACT X.509 chain a PostgreSQL endpoint presents,
 *   and pinpoint the trust-failure depth, without ever authenticating.
 *   Produced for the production incident:
 *     {"event":"db_health_probe","classification":"DATABASE_TLS_FAILURE",
 *      "code":"SELF_SIGNED_CERT_IN_CHAIN"}   (Vercel Production, d8de4fc)
 *
 * WHAT IT DOES
 *   ENV    — Node/OpenSSL versions, pg + pg-connection-string versions (when
 *            run inside the repository), bundled CA count, and the SET/unset
 *            state of TLS-affecting environment variables (names only,
 *            never values).
 *   DNS    — the OS resolver answer (what an application receives) plus
 *            explicit A (IPv4) and AAAA (IPv6) record lists.
 *   PROBES — for the hostname itself AND for every resolved address
 *            (address-family comparison):
 *      VERIFY MODE  — PostgreSQL SSLRequest → TLS with Node's default secure
 *                     verification (rejectUnauthorized:true, the exact path
 *                     pg 8.20 + pg-connection-string 2.14 take for
 *                     sslmode=require). Records authorized /
 *                     authorizationError / error.code / error.name /
 *                     error.message / cause chain.
 *      CAPTURE MODE — identical handshake with rejectUnauthorized:false to
 *                     RECORD the served chain (leaf-first, with order),
 *                     including per-certificate subject, issuer, SAN, serial,
 *                     validity, SHA-256 fingerprint, self-signed status,
 *                     membership of Node's bundled CA store, leaf-vs-SNI
 *                     hostname match, and a computed trust-failure verdict
 *                     (leaf / intermediate / root + depth).
 *   TIMING — dns / tcp / sslrequest→tls / total, per probe.
 *
 * SAFETY CONTRACT (non-negotiable)
 *   - The ONLY PostgreSQL bytes ever transmitted are the 8-byte SSLRequest.
 *     No startup packet, no username, no password, no SQL: credential-free by
 *     construction. The socket is destroyed immediately after the handshake.
 *   - READ-ONLY: no file in the repository or system is modified.
 *   - Output is a fixed allowlisted field set. It never contains a DSN,
 *     password, username, or any secret (none exists in this process).
 *   - CAVEAT: CAPTURE MODE sets rejectUnauthorized:false INSIDE THIS
 *     DIAGNOSTIC ONLY, to record a chain a strict handshake refuses to
 *     surface. It never transmits application data and is NOT a production
 *     connection configuration. VERIFY MODE is the authoritative result.
 *
 * USAGE
 *   node scripts/forensic-tls-chain-capture.mjs \
 *        [--host aws-0-eu-west-3.pooler.supabase.com] [--port 6543] \
 *        [--also-port 5432] [--no-addresses]
 */
import { createRequire } from "node:module";
import crypto from "node:crypto";
import dns from "node:dns";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";

/* ----------------------------- configuration ----------------------------- */

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const HOST = argValue("--host", "aws-0-eu-west-3.pooler.supabase.com");
const PRIMARY_PORT = Number(argValue("--port", "6543"));
const PROBE_ADDRESSES = !process.argv.includes("--no-addresses");
const ALSO_PORTS = (process.argv.includes("--also-port") ? argValue("--also-port", "") : "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);
const PORTS = [PRIMARY_PORT, ...ALSO_PORTS];

/* ------------------------------- helpers -------------------------------- */

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** SHA-256 set of Node's bundled root CA DERs. */
const NODE_STORE = new Set(
  tls.rootCertificates.map((pem) =>
    sha256Hex(Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64")),
  ),
);

function packageVersionIfAvailable(name) {
  try {
    return createRequire(path.join(process.cwd(), "package.json"))(`${name}/package.json`).version;
  } catch {
    // Packages with an `exports` map (e.g. pg-connection-string) may block
    // ./package.json — fall back to reading the file next to the resolved pg.
    try {
      const req = createRequire(path.join(process.cwd(), "package.json"));
      const pgPath = req.resolve("pg/package.json");
      const candidate = path.join(path.dirname(pgPath), "..", name, "package.json");
      return JSON.parse(fs.readFileSync(candidate, "utf8")).version ?? null;
    } catch {
      return null; // not running inside a repository that has this package
    }
  }
}

function emit(line) {
  console.log(JSON.stringify(line));
}

function certFacts(cert, depth, host) {
  const der = cert.raw ? Buffer.from(cert.raw) : Buffer.alloc(0);
  const fingerprint256 = cert.fingerprint256 ?? sha256Hex(der);
  const selfSigned = JSON.stringify(cert.subject) === JSON.stringify(cert.issuer);
  let hostnameCheck = null;
  if (depth === 0) {
    try {
      const err = tls.checkServerIdentity(host, cert);
      hostnameCheck = err ? `MISMATCH: ${err.message}` : "OK (SAN matches SNI hostname)";
    } catch (e) {
      hostnameCheck = `MISMATCH: ${e.message}`;
    }
  }
  const now = Date.now();
  const from = Date.parse(cert.valid_from);
  const to = Date.parse(cert.valid_to);
  return {
    depth,
    order: depth === 0 ? "leaf (first)" : selfSigned ? "self-signed (root candidate)" : "intermediate",
    role: depth === 0 ? "leaf" : selfSigned ? "self-signed" : "intermediate",
    subject: cert.subject,
    issuer: cert.issuer,
    subjectAltName: cert.subjectaltname ?? null,
    validFrom: cert.valid_from,
    validTo: cert.valid_to,
    validNow: now >= from && now <= to,
    serialNumber: cert.serialNumber ?? null,
    fingerprint256,
    selfSigned,
    inNodeBundledCAStore: NODE_STORE.has(fingerprint256),
    hostnameCheck,
  };
}

/** Flatten getPeerCertificate(true)'s linked chain into an array (leaf first). */
function chainToArray(leafCert) {
  const out = [];
  let cur = leafCert;
  const seen = new Set();
  while (cur && cur.fingerprint256 && !seen.has(cur.fingerprint256)) {
    seen.add(cur.fingerprint256);
    out.push(cur);
    const next = cur.issuerCertificate;
    cur = next && next.fingerprint256 !== cur.fingerprint256 ? next : null;
  }
  return out;
}

/**
 * Classify where trust fails given the SERVED chain (leaf first) and Node's
 * bundled store. Mapping verified empirically against Node/OpenSSL:
 *   untrusted self-signed cert in served chain → SELF_SIGNED_CERT_IN_CHAIN
 *   missing intermediate (leaf only)           → UNABLE_TO_VERIFY_LEAF_SIGNATURE
 *   leaf+int sent, unknown root unsent          → UNABLE_TO_GET_ISSUER_CERT_LOCALLY
 */
function trustAnalysis(chain) {
  if (chain.length === 0) return { servedChainLength: 0, verdict: "NO_CHAIN_CAPTURED" };
  const leaf = chain[0];
  const top = chain[chain.length - 1];
  const leafSelfSigned = JSON.stringify(leaf.subject) === JSON.stringify(leaf.issuer);
  const certIsSelfSigned = (c) => JSON.stringify(c.subject) === JSON.stringify(c.issuer);

  let selfSignedDepth = -1;
  for (let i = 0; i < chain.length; i++) {
    if (certIsSelfSigned(chain[i])) {
      selfSignedDepth = i;
      break;
    }
  }

  let brokenLinkDepth = -1;
  for (let i = 0; i + 1 < chain.length; i++) {
    if (JSON.stringify(chain[i].issuer) !== JSON.stringify(chain[i + 1].subject)) {
      brokenLinkDepth = i;
      break;
    }
  }

  const anyChainCertInStore = chain.some((c) => NODE_STORE.has(c.fingerprint256));

  let verdict;
  if (selfSignedDepth > 0 && !NODE_STORE.has(chain[selfSignedDepth].fingerprint256)) {
    const isChainTerminator = selfSignedDepth === chain.length - 1;
    verdict = {
      classification: "UNTRUSTED_SELF_SIGNED_CERT_IN_SERVED_CHAIN",
      trustFailureLevel: isChainTerminator ? "root (self-signed, served by server, not trusted)" : "intermediate (self-signed, not trusted)",
      atDepth: selfSignedDepth,
      detail: isChainTerminator
        ? "self-signed ROOT terminating the served chain and NOT in Node's bundled CA store — a Node client with rejectUnauthorized:true fails with SELF_SIGNED_CERT_IN_CHAIN at this depth"
        : "self-signed certificate mid-chain and NOT in Node's bundled CA store — reproduces SELF_SIGNED_CERT_IN_CHAIN",
      fingerprint256: chain[selfSignedDepth].fingerprint256,
    };
  } else if (leafSelfSigned) {
    verdict = {
      classification: "LEAF_IS_SELF_SIGNED",
      trustFailureLevel: "leaf",
      atDepth: 0,
      detail: "DEPTH_ZERO_SELF_SIGNED_CERT territory",
    };
  } else if (!anyChainCertInStore && brokenLinkDepth >= 0) {
    verdict = {
      classification: "CHAIN_GAP_NO_STORE_ANCHOR",
      trustFailureLevel: `intermediate (issuer gap after depth ${brokenLinkDepth})`,
      atDepth: brokenLinkDepth,
      detail: "issuer gap the bundled store cannot complete — reproduces UNABLE_TO_GET_ISSUER_CERT_LOCALLY family",
    };
  } else if (!anyChainCertInStore && !certIsSelfSigned(top)) {
    verdict = {
      classification: "ROOT_NOT_SENT_AND_UNKNOWN",
      trustFailureLevel: "root (not served, not in Node's bundled CA store)",
      atDepth: chain.length - 1,
      detail: "served chain is well-linked but terminates at an intermediate whose root was neither sent nor is locally trusted — reproduces UNABLE_TO_GET_ISSUER_CERT_LOCALLY family",
    };
  } else if (!anyChainCertInStore) {
    verdict = {
      classification: "NO_TRUST_ANCHOR_IN_NODE_STORE",
      trustFailureLevel: "chain terminates in an issuer absent from Node's bundled CA set",
      atDepth: 0,
      detail: "reproduces UNABLE_TO_VERIFY_LEAF_SIGNATURE / UNABLE_TO_GET_ISSUER_CERT_LOCALLY family",
    };
  } else {
    verdict = {
      classification: "CHAIN_TRUSTED_BY_NODE_BUNDLED_STORE",
      trustFailureLevel: null,
      atDepth: null,
      detail:
        "this exact chain verifies under this Node build — a client seeing SELF_SIGNED_CERT_IN_CHAIN would be receiving a DIFFERENT chain (path-specific presentation or interception)",
    };
  }
  return { servedChainLength: chain.length, ...verdict };
}

/* ------------------------------ DNS stage -------------------------------- */

function dnsStage() {
  return new Promise((resolve) => {
    const out = { host: HOST };
    const lookup = () =>
      new Promise((done) => {
        dns.lookup(HOST, { all: true, verbatim: true }, (err, addresses) => {
          out.systemResolver = err
            ? `lookup_failed:${err.code}`
            : addresses.map((a) => ({ address: a.address, family: a.family }));
          done();
        });
      });
    const v4 = () =>
      new Promise((done) => {
        dns.resolve4(HOST, (err, a) => {
          out.ipv4 = err ? (err.code === "ENODATA" ? "none" : `error:${err.code}`) : a;
          done();
        });
      });
    const v6 = () =>
      new Promise((done) => {
        dns.resolve6(HOST, (err, a) => {
          out.ipv6 = err ? (err.code === "ENODATA" ? "none" : `error:${err.code}`) : a;
          done();
        });
      });
    Promise.all([lookup(), v4(), v6()]).then(() => resolve(out));
  });
}

/* ------------------------------ TLS probes ------------------------------- */

const T0 = Date.now();

/**
 * The one probe: SSLRequest → TLS. `verify` selects the mode.
 * dial: { host } (hostname or literal address; SNI is ALWAYS the hostname).
 */
function probe(port, verify, dialHost, dialLabel) {
  return new Promise((resolve) => {
    const stages = { dnsMs: null, tcpMs: null, tlsMs: null };
    const out = {
      host: HOST,
      port,
      dial: dialLabel,
      sniHostname: HOST,
      sslEnabled: true,
      verificationMode: verify ? "VERIFY (rejectUnauthorized:true — production path)" : "CAPTURE (rejectUnauthorized:false — record-only, diagnostic)",
    };
    const started = Date.now();
    dns.lookup(dialHost, { family: net.isIP(dialHost) ? dialHost.includes(":") ? 6 : 4 : 0 }, (dnsErr) => {
      if (dnsErr) {
        return resolve({ ...out, stage: "dns", ok: false, errorCode: dnsErr.code ?? null, totalMs: Date.now() - started });
      }
      stages.dnsMs = Date.now() - started;
    const tcpStarted = Date.now();
    const sock = net.connect(port, dialHost);
    sock.setTimeout(15_000);
    let settled = false;
    let gotServerData = false;
    let socket = null;
    const done = (r) => {
      if (settled) return;
      settled = true;
      try {
        socket?.destroy();
      } catch {}
      sock.destroy();
      resolve({ ...out, ...stages, totalMs: Date.now() - started, ...r });
    };
    sock.on("error", (e) => {
      done({
        stage: "tcp",
        ok: false,
        errorCode: e.code ?? null,
        errorName: e.name ?? null,
        errorMessage: "tcp connect failed",
        note: e.code === "EAFNOSUPPORT" || e.code === "ENETUNREACH" || e.code === "EADDRNOTAVAIL" ? "address family not available from this runner" : null,
      });
    });
    sock.on("timeout", () => done({ stage: "tcp", ok: false, errorCode: "ETIMEDOUT", errorName: "Error", errorMessage: "tcp connect timeout" }));
    sock.on("close", () => {
      if (!settled && !gotServerData) {
        done({ stage: "sslrequest", ok: false, errorCode: "NO_SSL_REPLY_CONNECTION_CLOSED", errorMessage: "connection closed before the server answered the SSLRequest" });
      }
    });
      sock.on("connect", () => {
        stages.tcpMs = Date.now() - tcpStarted;
        const req = Buffer.alloc(8);
        req.writeInt32BE(8, 0);
        req.writeInt32BE(80877103, 4); // SSLRequest — the ONLY database bytes sent
        sock.write(req);
      });
      sock.once("data", (chunk) => {
        gotServerData = true;
        const byte = chunk.subarray(0, 1).toString("latin1");
        out.sslResponseByte = byte === "S" ? "S (SSL accepted)" : byte === "N" ? "N (SSL refused)" : `unexpected:${chunk.subarray(0, 1).toString("hex")}`;
        if (byte !== "S") return done({ stage: "sslrequest", ok: false });
        const tlsStarted = Date.now();
        socket = tls.connect({ socket: sock, servername: HOST, rejectUnauthorized: verify }, () => {
          stages.tlsMs = Date.now() - tlsStarted;
          const chain = chainToArray(socket.getPeerCertificate(true));
          done({
            stage: "tls",
            ok: true,
            authorized: verify ? true : "not-evaluated (capture mode)",
            tlsProtocol: socket.getProtocol(),
            cipher: socket.getCipher()?.name ?? null,
            servedChain: chain.map((c, i) => certFacts(c, i, HOST)),
            chainOrder: "leaf-first (order as served by server)",
            trust: trustAnalysis(chain),
          });
        });
        socket.on("error", (e) => {
          stages.tlsMs = Date.now() - tlsStarted;
          const causeChain = [];
          let cur = e?.cause;
          for (let d = 0; d < 4 && cur && typeof cur === "object"; d++) {
            causeChain.push({ name: cur.name ?? null, code: cur.code ?? null, message: cur.message ?? null });
            cur = cur.cause;
          }
          done({
            stage: "tls",
            ok: false,
            authorized: false,
            authorizationError: e.code ?? e.message ?? String(e),
            errorCode: e.code ?? null,
            errorName: e.name ?? null,
            errorMessage: e.message ?? null,
            causeChain: causeChain.length ? causeChain : null,
          });
        });
      });
    });
  });
}

/* --------------------------------- main ---------------------------------- */

emit({
  event: "tls_chain_capture",
  phase: "environment",
  nodeVersion: process.version,
  opensslVersion: process.versions.openssl,
  bundledRootCACount: tls.rootCertificates.length,
  pgVersion: packageVersionIfAvailable("pg"),
  pgConnectionStringVersion: packageVersionIfAvailable("pg-connection-string"),
  NODE_EXTRA_CA_CERTS_set: process.env.NODE_EXTRA_CA_CERTS !== undefined,
  NODE_USE_SYSTEM_CA_set: process.env.NODE_USE_SYSTEM_CA !== undefined,
  NODE_OPTIONS_set: process.env.NODE_OPTIONS !== undefined,
  NODE_TLS_REJECT_UNAUTHORIZED_set: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== undefined,
  platform: `${process.platform}-${process.arch}`,
  runnerUtc: new Date().toISOString(),
});

const dnsInfo = await dnsStage();
emit({ event: "tls_chain_capture", phase: "dns", ...dnsInfo });

const systemAddresses = Array.isArray(dnsInfo.systemResolver) ? dnsInfo.systemResolver : [];
const dialTargets = [
  { label: "hostname (system resolution)", host: HOST },
  ...(PROBE_ADDRESSES
    ? systemAddresses
        .filter((a) => typeof a.address === "string")
        .map((a) => ({ label: `address ${a.address} (family ${a.family})`, host: a.address }))
    : []),
];

for (const port of PORTS) {
  for (const target of dialTargets) {
    const verify = await probe(port, true, target.host, target.label);
    emit({ event: "tls_chain_capture", phase: "verify_rejectUnauthorized_true", ...verify });
    const capture = await probe(port, false, target.host, target.label);
    emit({ event: "tls_chain_capture", phase: "capture_rejectUnauthorized_false_diagnostic_only", ...capture });
  }
}

emit({ event: "tls_chain_capture", phase: "complete", totalRuntimeMs: Date.now() - T0 });
