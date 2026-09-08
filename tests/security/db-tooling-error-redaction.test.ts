import { describe, expect, it } from "vitest";
import { sanitizeError } from "../../scripts/lib/sanitize-error";

/**
 * F-NEW-2 regression — database tooling must not leak infrastructure topology.
 *
 * `scripts/db-release.ts`, `scripts/migrate.ts` and `scripts/setup-db-role.ts`
 * run in GitHub Actions holding the production admin DSN. They previously
 * serialised `String(e)` into stdout and into the uploaded
 * `db-live-preflight-<run_id>` / `db-deploy-verification-<run_id>` artifacts.
 *
 * GitHub masks a secret only on an EXACT match, and a driver error does not
 * reproduce the DSN verbatim — it reproduces a fragment. A failed connection
 * emits `getaddrinfo ENOTFOUND db.<project-ref>.supabase.co`, disclosing the
 * production hostname and Supabase project ref unmasked in a public log.
 *
 * These tests assert the sanitiser keeps the diagnostic class and drops every
 * identifying detail.
 */

const HOST = "db.someprojectref.supabase.co";
const USER = "postgres.someprojectref";
const PASSWORD = "hunter2-not-a-real-password";
const DSN = `postgresql://${USER}:${PASSWORD}@${HOST}:5432/postgres`;

/** Every identifying fragment that must never survive sanitisation. */
const FORBIDDEN = [HOST, USER, PASSWORD, DSN, "someprojectref", "supabase.co", "5432", "10.0.0.7"];

function assertClean(out: string) {
  for (const secret of FORBIDDEN) {
    expect(out).not.toContain(secret);
  }
}

describe("database tooling error redaction (F-NEW-2)", () => {
  it("classifies DNS failure without leaking the hostname", () => {
    const out = sanitizeError(new Error(`getaddrinfo ENOTFOUND ${HOST}`));
    expect(out).toBe("DNS_RESOLUTION_FAILED");
    assertClean(out);
  });

  it("classifies a refused connection without leaking host or port", () => {
    const out = sanitizeError(new Error(`connect ECONNREFUSED 10.0.0.7:5432`));
    expect(out).toBe("CONNECTION_REFUSED");
    assertClean(out);
  });

  it("classifies authentication failure and surfaces only the public SQLSTATE", () => {
    const e = Object.assign(new Error(`password authentication failed for user "${USER}"`), { code: "28P01" });
    const out = sanitizeError(e);
    expect(out).toBe("AUTHENTICATION_FAILED (SQLSTATE 28P01)");
    assertClean(out);
  });

  it("classifies TLS failure without leaking the endpoint", () => {
    const out = sanitizeError(new Error(`self signed certificate in certificate chain for ${HOST}`));
    expect(out).toBe("TLS_FAILURE");
    assertClean(out);
  });

  it("classifies timeouts", () => {
    expect(sanitizeError(new Error("Connection terminated due to connection timeout"))).toBe("CONNECTION_TIMEOUT");
  });

  it("classifies permission denial with SQLSTATE 42501", () => {
    const e = Object.assign(new Error("permission denied for table governance_capability_registry"), { code: "42501" });
    expect(sanitizeError(e)).toBe("PERMISSION_DENIED (SQLSTATE 42501)");
  });

  it("never passes through an unrecognised message containing a DSN", () => {
    const out = sanitizeError(new Error(`bizarre driver failure while dialing ${DSN}`));
    expect(out).toBe("UNCLASSIFIED_DATABASE_ERROR");
    assertClean(out);
  });

  it("handles non-Error throwables safely", () => {
    assertClean(sanitizeError(DSN));
    expect(sanitizeError(DSN)).toBe("UNCLASSIFIED_DATABASE_ERROR");
    expect(sanitizeError(null)).toBe("UNCLASSIFIED_DATABASE_ERROR");
    expect(sanitizeError(undefined)).toBe("UNCLASSIFIED_DATABASE_ERROR");
  });

  it("ignores a non-conforming code field rather than echoing it", () => {
    const e = Object.assign(new Error("ECONNRESET"), { code: `weird-${PASSWORD}` });
    const out = sanitizeError(e);
    expect(out).toBe("CONNECTION_RESET");
    assertClean(out);
  });
});
