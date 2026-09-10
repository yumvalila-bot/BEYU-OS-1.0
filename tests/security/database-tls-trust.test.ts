/**
 * BEYU OS — database TLS trust: positive and negative security tests.
 *
 * These tests protect the remediation of the production incident
 *   {"classification":"DATABASE_TLS_FAILURE","code":"SELF_SIGNED_CERT_IN_CHAIN"}
 *
 * They prove three things that must never silently regress:
 *
 *   1. POSITIVE — the pinned Supabase trust anchors load, their recomputed
 *      SHA-256 fingerprints equal the approved allowlist, and the produced pg
 *      configuration verifies the chain AND the hostname.
 *   2. THE pg TRAP — passing an explicit `ssl` alongside a `connectionString`
 *      that carries `sslmode` makes pg DISCARD the ssl object
 *      (connection-parameters.js merges the parsed DSN over the options). The
 *      configuration builder must strip `sslmode` so the CA survives. Without
 *      this guard a future refactor can "fix" nothing and still ship a pool
 *      with no CA.
 *   3. NEGATIVE / FAIL-CLOSED — substituted, altered, unexpected or missing CA
 *      material, insecure sslmodes, `uselibpqcompat`, IP-literal hosts and a
 *      weakened process TLS posture all THROW rather than connect. A real TLS
 *      handshake against a non-Supabase certificate is refused when only the
 *      pinned Supabase roots are trusted.
 *
 * No test here contacts the production database and none needs credentials.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import net from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "pg";

import {
  DatabaseTlsTrustError,
  REQUIRED_SSLMODE,
  SUPABASE_TRUST_ANCHOR_FINGERPRINTS,
  assertDatabaseDsnIsVerified,
  assertNoVerificationBypass,
  buildPgConnectionConfig,
  certificateFingerprintSha256,
  describeDsnEndpoint,
  describeTrustConfiguration,
  isLoopbackDsn,
  isProductionEnvironment,
  loadSupabaseTrustAnchors,
  requiresVerifiedTls,
  resolveDatabaseTls,
} from "@/db/tls";

const PRODUCTION_DSN =
  "postgresql://beyu_runtime.siyzygezdmlxbvwttrdz:not-a-real-password" +
  "@aws-0-eu-west-3.pooler.supabase.com:6543/postgres?sslmode=verify-full&pgbouncer=true";

const PRODUCTION_ADMIN_DSN =
  "postgresql://postgres.siyzygezdmlxbvwttrdz:not-a-real-password" +
  "@aws-0-eu-west-3.pooler.supabase.com:5432/postgres?sslmode=verify-full";

/** Non-production, loopback: the CI embedded Postgres / local dev shape. */
const LOCAL_DSN = "postgresql://postgres:postgres@127.0.0.1:5432/beyu_os";

const NON_PROD_ENV: NodeJS.ProcessEnv = { NODE_ENV: "test" };
const PROD_ENV: NodeJS.ProcessEnv = { NODE_ENV: "production", BEYU_ENV: "production" };

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "beyu-ca-"));
}

function opensslAvailable(): boolean {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Issue a throwaway self-signed CA/leaf with openssl, for the real-handshake
 * tests. It carries a SAN for 127.0.0.1 so that Node's OWN hostname
 * verification passes naturally — these tests never override
 * checkServerIdentity, in either the positive or the negative case.
 */
function issueThrowawayChain(dir: string, cn: string) {
  const key = path.join(dir, "ca.key");
  const crt = path.join(dir, "ca.crt");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", key, "-out", crt, "-days", "1",
    "-subj", `/CN=${cn}`,
    "-addext", "basicConstraints=critical,CA:TRUE",
    "-addext", "keyUsage=critical,digitalSignature,keyCertSign,cRLSign",
    "-addext", "extendedKeyUsage=serverAuth",
    "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ], { stdio: "ignore" });
  return { key, crt, pem: fs.readFileSync(crt, "utf8") };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

/* ====================================================================== */
/* POSITIVE                                                                */
/* ====================================================================== */

describe("pinned Supabase trust anchors", () => {
  it("loads exactly the approved anchors and no others", () => {
    const anchors = loadSupabaseTrustAnchors();
    expect(anchors.map((a) => a.label).sort()).toEqual(
      (Object.keys(SUPABASE_TRUST_ANCHOR_FINGERPRINTS) as string[]).sort(),
    );
  });

  it("recomputes each fingerprint and it equals the approved allowlist value", () => {
    for (const anchor of loadSupabaseTrustAnchors()) {
      const recomputed = certificateFingerprintSha256(anchor.pem);
      expect(recomputed).toBe(SUPABASE_TRUST_ANCHOR_FINGERPRINTS[anchor.label]);
      expect(recomputed).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("pins the 2021 and 2025 roots as DIFFERENT certificates sharing one CN", () => {
    // Supabase rotated the root KEY on 2025-09-03 and reused the subject name,
    // so name-based trust is worthless and the fingerprints must differ.
    const anchors = loadSupabaseTrustAnchors();
    const byLabel = Object.fromEntries(anchors.map((a) => [a.label, a]));
    expect(byLabel["prod-ca-2021"].fingerprintSha256).not.toBe(
      byLabel["prod-ca-2025"].fingerprintSha256,
    );
    expect(byLabel["prod-ca-2021"].fingerprintSha256).toBe(
      "807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa",
    );
    expect(byLabel["prod-ca-2025"].fingerprintSha256).toBe(
      "5f9b77951a7aa1303f9b58eea9bfa89e358cfdc15f9786ff10d4930a722c9ae2",
    );
  });

  it("supplies every anchor as PEM so Node can build the trust store", () => {
    const { tls: config } = resolveDatabaseTls(PRODUCTION_DSN, "DATABASE_URL");
    expect(config.ca).toHaveLength(Object.keys(SUPABASE_TRUST_ANCHOR_FINGERPRINTS).length);
    for (const pem of config.ca) {
      expect(pem).toContain("-----BEGIN CERTIFICATE-----");
      expect(pem).toContain("-----END CERTIFICATE-----");
    }
  });
});

describe("production runtime TLS configuration", () => {
  it("verifies the chain and never disables rejectUnauthorized", () => {
    const { tls: config } = resolveDatabaseTls(PRODUCTION_DSN, "DATABASE_URL");
    expect(config.rejectUnauthorized).toBe(true);
    expect(JSON.stringify(config)).not.toContain('"rejectUnauthorized":false');
  });

  it("preserves hostname verification by never setting checkServerIdentity", () => {
    const { tls: config } = resolveDatabaseTls(PRODUCTION_DSN, "DATABASE_URL");
    expect(config).not.toHaveProperty("checkServerIdentity");
    expect(Object.keys(config).sort()).toEqual(["ca", "rejectUnauthorized"]);
  });

  it("identifies the exact production endpoint", () => {
    const { endpoint } = resolveDatabaseTls(PRODUCTION_DSN, "DATABASE_URL");
    expect(endpoint).toMatchObject({
      host: "aws-0-eu-west-3.pooler.supabase.com",
      port: 6543,
      database: "postgres",
      sslmode: "verify-full",
    });
  });

  it("exposes only labels/fingerprints in its log summary — never the DSN", () => {
    const resolved = resolveDatabaseTls(PRODUCTION_DSN, "DATABASE_URL");
    const summary = describeTrustConfiguration(resolved);
    expect(summary).toContain("sslmode=verify-full");
    expect(summary).toContain("rejectUnauthorized=true");
    expect(summary).toContain("hostname-verification=on");
    expect(summary).not.toContain("not-a-real-password");
    expect(summary).not.toContain("BEGIN CERTIFICATE");
  });

  it("does not leak the password through describeDsnEndpoint", () => {
    const facts = describeDsnEndpoint(PRODUCTION_DSN);
    expect(JSON.stringify(facts)).not.toContain("not-a-real-password");
  });
});

/* ====================================================================== */
/* THE pg CONNECTIONSTRING TRAP                                            */
/* ====================================================================== */

describe("pg must actually receive the pinned CA", () => {
  it("strips sslmode so pg's DSN merge cannot discard the ssl object", () => {
    const built = buildPgConnectionConfig(PRODUCTION_DSN, "DATABASE_URL", NON_PROD_ENV);
    expect(built.connectionString).not.toContain("sslmode");
    // every other parameter is preserved verbatim
    expect(built.connectionString).toContain("pgbouncer=true");
    expect(built.localDevelopment).toBe(false);
  });

  /**
   * `connectionParameters` is pg's internal, undocumented config holder and is
   * absent from @types/pg — but it is precisely what pg hands to the TLS
   * socket, so it is the only place the trap can be observed.
   */
  function sslOf(client: Client): Record<string, unknown> {
    return (client as unknown as { connectionParameters: { ssl: Record<string, unknown> } })
      .connectionParameters.ssl;
  }

  it("results in a pg client whose ssl carries the CA and rejects unauthorised", () => {
    const built = buildPgConnectionConfig(PRODUCTION_DSN, "DATABASE_URL", NON_PROD_ENV);
    const client = new Client({ connectionString: built.connectionString, ssl: built.ssl });
    const ssl = sslOf(client);
    expect(ssl).toBeDefined();
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(Array.isArray(ssl.ca)).toBe(true);
    expect((ssl.ca as unknown[]).length).toBeGreaterThan(0);
    expect(ssl.checkServerIdentity).toBeUndefined();
  });

  it("regression: a DSN that KEEPS sslmode would make pg throw the CA away", () => {
    // Documents WHY the strip is load-bearing. If pg ever changes this merge
    // order, this assertion flips and the comment in src/db/tls.ts must be
    // revisited — either way the shipped configuration above stays correct.
    const probe = new Client({
      connectionString: PRODUCTION_DSN,
      ssl: { ca: ["-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n"], rejectUnauthorized: true },
    });
    const ssl = sslOf(probe);
    expect(ssl.ca).toBeUndefined();
    expect(Object.keys(ssl)).toHaveLength(0);
  });
});

/* ====================================================================== */
/* ENVIRONMENT SCOPING                                                     */
/* ====================================================================== */

describe("environment scoping", () => {
  it("exempts only loopback in a non-production environment", () => {
    expect(isLoopbackDsn(LOCAL_DSN)).toBe(true);
    expect(isLoopbackDsn(PRODUCTION_DSN)).toBe(false);
    expect(requiresVerifiedTls(LOCAL_DSN, NON_PROD_ENV)).toBe(false);
    expect(requiresVerifiedTls(PRODUCTION_DSN, NON_PROD_ENV)).toBe(true);
  });

  it("keeps production strict even for a loopback DSN", () => {
    expect(isProductionEnvironment(PROD_ENV)).toBe(true);
    expect(requiresVerifiedTls(LOCAL_DSN, PROD_ENV)).toBe(true);
    expect(() => buildPgConnectionConfig(LOCAL_DSN, "DATABASE_URL", PROD_ENV)).toThrow(
      DatabaseTlsTrustError,
    );
  });

  it("passes a local non-production DSN through without TLS", () => {
    const built = buildPgConnectionConfig(LOCAL_DSN, "DATABASE_URL", NON_PROD_ENV);
    expect(built.localDevelopment).toBe(true);
    expect(built.ssl).toBeUndefined();
    expect(built.connectionString).toBe(LOCAL_DSN);
  });
});

/* ====================================================================== */
/* NEGATIVE — FAIL CLOSED                                                  */
/* ====================================================================== */

describe("fail-closed: insecure DSN directives", () => {
  const insecureModes = ["disable", "no-verify", "allow", "prefer", "verify-ca"];

  for (const mode of insecureModes) {
    it(`rejects sslmode=${mode}`, () => {
      const dsn = `postgresql://u:p@aws-0-eu-west-3.pooler.supabase.com:6543/postgres?sslmode=${mode}`;
      expect(() => buildPgConnectionConfig(dsn, "DATABASE_URL", NON_PROD_ENV)).toThrow(
        DatabaseTlsTrustError,
      );
      expect(() => assertNoVerificationBypass(dsn, "DATABASE_URL")).toThrow(DatabaseTlsTrustError);
    });
  }

  it("rejects a missing sslmode on a remote host", () => {
    const dsn = "postgresql://u:p@aws-0-eu-west-3.pooler.supabase.com:6543/postgres";
    expect(() => buildPgConnectionConfig(dsn, "DATABASE_URL", NON_PROD_ENV)).toThrow(
      /must set sslmode=verify-full/,
    );
  });

  it("rejects uselibpqcompat, which disables verification in pg-connection-string", () => {
    const dsn =
      "postgresql://u:p@aws-0-eu-west-3.pooler.supabase.com:6543/postgres?sslmode=verify-full&uselibpqcompat=true";
    expect(() => buildPgConnectionConfig(dsn, "DATABASE_URL", NON_PROD_ENV)).toThrow(
      /uselibpqcompat/,
    );
  });

  it("rejects an IP-literal host, which would drop hostname verification", () => {
    const dsn = "postgresql://u:p@13.39.246.141:6543/postgres?sslmode=verify-full";
    expect(() => assertDatabaseDsnIsVerified(dsn, "DATABASE_URL")).toThrow(/DNS hostname/);
    expect(() => buildPgConnectionConfig(dsn, "DATABASE_URL", NON_PROD_ENV)).toThrow(
      DatabaseTlsTrustError,
    );
  });

  it("rejects a weakened process TLS posture", () => {
    vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "0");
    expect(() => buildPgConnectionConfig(PRODUCTION_DSN, "DATABASE_URL", NON_PROD_ENV)).toThrow(
      /NODE_TLS_REJECT_UNAUTHORIZED/,
    );
  });

  it("accepts NODE_TLS_REJECT_UNAUTHORIZED=1 (verification still on)", () => {
    vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "1");
    expect(() => buildPgConnectionConfig(PRODUCTION_DSN, "DATABASE_URL", NON_PROD_ENV)).not.toThrow();
  });

  it("rejects a non-postgres scheme", () => {
    expect(() => describeDsnEndpoint("mysql://u:p@host:3306/db")).toThrow(
      /Unsupported database protocol/,
    );
  });
});

describe("fail-closed: CA material integrity", () => {
  function withCaDir(dir: string, fn: () => void) {
    vi.stubEnv("BEYU_SUPABASE_CA_DIR", dir);
    try {
      fn();
    } finally {
      vi.unstubAllEnvs();
    }
  }

  it("rejects an ALTERED certificate under an approved filename", () => {
    const dir = tempDir();
    const real = fs.readFileSync("config/tls/supabase/prod-ca-2021.crt", "utf8");
    // Flip one base64 character: still parses as PEM, fingerprint changes.
    const altered = real.replace("MIIDxDCCAqyg", "MIIDxDCCAqyh");
    fs.writeFileSync(path.join(dir, "prod-ca-2021.crt"), altered);
    fs.copyFileSync("config/tls/supabase/prod-ca-2025.crt", path.join(dir, "prod-ca-2025.crt"));

    withCaDir(dir, () => {
      expect(() => loadSupabaseTrustAnchors()).toThrow(/does not match its approved fingerprint/);
      expect(() => resolveDatabaseTls(PRODUCTION_DSN, "DATABASE_URL")).toThrow(
        DatabaseTlsTrustError,
      );
    });
  });

  it("rejects an UNAPPROVED certificate added to the bundle (e.g. the staging root)", () => {
    const dir = tempDir();
    fs.copyFileSync("config/tls/supabase/prod-ca-2021.crt", path.join(dir, "prod-ca-2021.crt"));
    fs.copyFileSync("config/tls/supabase/prod-ca-2025.crt", path.join(dir, "prod-ca-2025.crt"));
    // Supabase's staging root: same shape, wrong trust domain.
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", path.join(dir, "s.key"), "-out", path.join(dir, "staging-ca-2021.crt"),
      "-days", "1", "-subj", "/CN=Supabase Staging Root 2021 CA"], { stdio: "ignore" });

    withCaDir(dir, () => {
      expect(() => loadSupabaseTrustAnchors()).toThrow(/not an approved Supabase trust anchor/);
    });
  });

  it("rejects a MISSING approved anchor", () => {
    const dir = tempDir();
    fs.copyFileSync("config/tls/supabase/prod-ca-2021.crt", path.join(dir, "prod-ca-2021.crt"));
    withCaDir(dir, () => {
      expect(() => loadSupabaseTrustAnchors()).toThrow(/missing from/);
    });
  });

  it("rejects an empty bundle directory", () => {
    withCaDir(tempDir(), () => {
      expect(() => loadSupabaseTrustAnchors()).toThrow(/contains no certificates/);
    });
  });

  it("rejects an override that does not exist instead of silently falling back", () => {
    // A mis-deployed BEYU_SUPABASE_CA_DIR must not quietly fall through to the
    // repository bundle: that would change which CA material is in force.
    withCaDir(path.join(tempDir(), "nope"), () => {
      expect(() => loadSupabaseTrustAnchors()).toThrow(/does not point at a directory/);
    });
  });

  it("rejects malformed PEM in an approved file", () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, "prod-ca-2021.crt"), "-----BEGIN CERTIFICATE-----\n!!!!\n-----END CERTIFICATE-----\n");
    fs.copyFileSync("config/tls/supabase/prod-ca-2025.crt", path.join(dir, "prod-ca-2025.crt"));
    withCaDir(dir, () => {
      expect(() => loadSupabaseTrustAnchors()).toThrow(/not valid X\.509 PEM/);
    });
  });

  it("rejects a bundle holding two certificates in one file", () => {
    const dir = tempDir();
    const a = fs.readFileSync("config/tls/supabase/prod-ca-2021.crt", "utf8");
    fs.writeFileSync(path.join(dir, "prod-ca-2021.crt"), `${a}${a}`);
    fs.copyFileSync("config/tls/supabase/prod-ca-2025.crt", path.join(dir, "prod-ca-2025.crt"));
    withCaDir(dir, () => {
      expect(() => loadSupabaseTrustAnchors()).toThrow(/exactly one PEM block/);
    });
  });
});

/* ====================================================================== */
/* REAL HANDSHAKE — pinning is enforced, not decorative                     */
/* ====================================================================== */

describe.skipIf(!opensslAvailable())("real TLS handshake against the pinned trust store", () => {
  /**
   * Serve `leafPem` over TLS and attempt a verified handshake whose ONLY trust
   * anchors are `caPems`. Returns the outcome without ever disabling
   * verification.
   */
  async function attempt(caPems: string[], serverCert: string, serverKey: string) {
    const server = tls.createServer({ cert: serverCert, key: serverKey }, (socket) => socket.end());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as net.AddressInfo).port;
    try {
      return await new Promise<{ ok: boolean; code?: string }>((resolve) => {
        const socket = tls.connect(
          {
            host: "127.0.0.1",
            port,
            ca: caPems,
            rejectUnauthorized: true,
            // Node's default checkServerIdentity runs against this name. The
            // leaf carries SAN IP:127.0.0.1, so verification is real here.
            servername: "127.0.0.1",
          },
          () => {
            socket.end();
            resolve({ ok: true });
          },
        );
        socket.on("error", (e: NodeJS.ErrnoException) => resolve({ ok: false, code: e.code }));
      });
    } finally {
      server.close();
    }
  }

  /**
   * Issue a CA + leaf, and return the served chain as [leaf, CA] — the shape
   * that produces OpenSSL error #19 (SELF_SIGNED_CERT_IN_CHAIN), i.e. the exact
   * production signature, because the served chain itself carries an untrusted
   * self-signed root.
   */
  function issueChainWithRootInServedChain(dir: string, leafCn: string) {
    const ca = issueThrowawayChain(dir, `${leafCn} Test Root`);
    const leafKey = path.join(dir, "leaf.key");
    const leafCsr = path.join(dir, "leaf.csr");
    const leafCrt = path.join(dir, "leaf.crt");
    const ext = path.join(dir, "leaf.ext");
    execFileSync("openssl", ["req", "-new", "-newkey", "rsa:2048", "-nodes",
      "-keyout", leafKey, "-out", leafCsr, "-subj", `/CN=${leafCn}`], { stdio: "ignore" });
    fs.writeFileSync(ext, "subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n");
    execFileSync("openssl", ["x509", "-req", "-in", leafCsr, "-CA", ca.crt, "-CAkey", ca.key,
      "-CAcreateserial", "-out", leafCrt, "-days", "1", "-extfile", ext], { stdio: "ignore" });
    const leafPem = fs.readFileSync(leafCrt, "utf8");
    return {
      servedChain: `${leafPem}${ca.pem}`,
      caPem: ca.pem,
      leafKey: fs.readFileSync(leafKey, "utf8"),
    };
  }

  it("refuses a served chain whose root is not a pinned Supabase anchor — error #19", async () => {
    const dir = tempDir();
    const chain = issueChainWithRootInServedChain(dir, "aws-0-eu-west-3.pooler.supabase.com");
    const pinned = loadSupabaseTrustAnchors().map((a) => a.pem);

    const result = await attempt(pinned, chain.servedChain, chain.leafKey);
    expect(result.ok).toBe(false);
    // The exact production signature: an untrusted SELF-SIGNED root inside the
    // served chain. This is what Vercel reported for the incident.
    expect(result.code).toBe("SELF_SIGNED_CERT_IN_CHAIN");
  });

  it("accepts the same chain when its root IS the supplied trust anchor", async () => {
    const dir = tempDir();
    const chain = issueChainWithRootInServedChain(dir, "aws-0-eu-west-3.pooler.supabase.com");
    const result = await attempt([chain.caPem], chain.servedChain, chain.leafKey);
    // Same chain, same hostname, same code path — only the trust anchor
    // differs. Proves the pinning verifies rather than blanket-rejects, and
    // that adding the correct anchor is a sufficient fix.
    expect(result.ok).toBe(true);
  });

  it("the pinned anchors are not in Node's bundled store (why the incident happened)", () => {
    const bundled = new Set(
      tls.rootCertificates.map((pem) =>
        crypto.createHash("sha256")
          .update(Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64"))
          .digest("hex"),
      ),
    );
    for (const fingerprint of Object.values(SUPABASE_TRUST_ANCHOR_FINGERPRINTS)) {
      expect(bundled.has(fingerprint)).toBe(false);
    }
  });
});

/* ====================================================================== */
/* HEALTH CLASSIFICATION                                                   */
/* ====================================================================== */

describe("health classification of a trust misconfiguration", () => {
  it("is reported distinctly from a peer-side TLS failure", async () => {
    const { classifyConnectionError } = await import("@/lib/db-health");
    const trustError = new DatabaseTlsTrustError(
      'Supabase CA bundle directory not found (looked in config/tls/supabase)',
    );
    expect(classifyConnectionError(trustError)).toBe("DATABASE_TLS_TRUST_MISCONFIGURED");

    const peerTlsError = Object.assign(new Error("self-signed certificate in certificate chain"), {
      code: "SELF_SIGNED_CERT_IN_CHAIN",
    });
    expect(classifyConnectionError(peerTlsError)).toBe("DATABASE_TLS_FAILURE");
  });
});

/* ====================================================================== */
/* NO INSECURE CONSTRUCT ANYWHERE IN THE SHIPPED TLS PATH                  */
/* ====================================================================== */

describe("shipped TLS path contains no verification bypass", () => {
  const files = ["src/db/tls.ts", "src/db/index.ts", "src/db/admin.ts"];

  /**
   * src/db/tls.ts *documents* the forbidden constructs in prose (that is the
   * point of the file header), so the scan strips comments and examines only
   * executable code.
   */
  function executableSource(file: string): string {
    return fs
      .readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  }

  it("never sets rejectUnauthorized to false", () => {
    for (const file of files) {
      expect(executableSource(file)).not.toMatch(/rejectUnauthorized\s*[:=]\s*false/);
    }
  });

  it("never overrides checkServerIdentity", () => {
    for (const file of files) {
      expect(executableSource(file)).not.toMatch(/checkServerIdentity\s*[:=]/);
    }
  });

  it("requires verify-full as the documented sslmode", () => {
    expect(REQUIRED_SSLMODE).toBe("verify-full");
  });
});
