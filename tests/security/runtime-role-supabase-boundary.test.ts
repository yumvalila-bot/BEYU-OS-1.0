/**
 * Supabase privilege-boundary regression — runtime role re-provisioning.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Production incident (2026-09-08..10): the `deploy` job of db-release.yml
 * failed at "Provision / constrain the NOSUPERUSER runtime role" with
 * PERMISSION_DENIED (SQLSTATE 42501) on EVERY run after `beyu_runtime` first
 * existed, while migrations and the read-only preflight stayed green.
 *
 * Root cause: on Supabase the customer-facing `postgres` administrative role
 * is NOT a PostgreSQL superuser (Supabase removed customer superuser access),
 * and PostgreSQL requires SUPERUSER merely to SPECIFY the SUPERUSER attribute
 * in ALTER ROLE — including its NO-form. `scripts/setup-db-role.ts` used to
 * re-enter an existing role with an unconditional
 *
 *     alter role beyu_runtime nosuperuser nobypassrls nocreaterole nocreatedb noreplication
 *
 * which a CREATEROLE-but-not-SUPERUSER administrator can never execute.
 *
 * This suite models the production privilege boundary on a REAL PostgreSQL:
 * a non-superuser CREATEROLE admin (mirroring Supabase's `postgres`) that owns
 * the database and created the runtime role (exactly what the governed
 * pipeline did in production). It proves:
 *   - the legacy attribute re-assertion is genuinely impossible for that admin
 *     (the root cause, pinned so it cannot be "fixed" by reverting);
 *   - the remediated script provisions AND re-provisions the runtime role
 *     successfully through that admin, converging the governed credential;
 *   - an ELEVATED runtime role fails CLOSED with a sanitized error naming the
 *     invariant, before any credential, grant or ownership mutation.
 *
 * The suite is deliberately inert against anything that is not a local
 * disposable database: it only runs when the admin DSN host is loopback, so it
 * can never touch a real Supabase project. All credentials below are ephemeral
 * CI literals, never production secrets.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";

const execFileAsync = promisify(execFile);

const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
const GOVERNED_PASSWORD = process.env.BEYU_RUNTIME_DB_PASSWORD;

const BOUNDARY_ROLE = "beyu_boundary_admin";
const BOUNDARY_PASSWORD = "ci_boundary_admin_password_not_secret";
const BOUNDARY_DB = "beyu_boundary";
const PROBE_ROLE = "beyu_runtime_probe";
const DRIFTED_PASSWORD = "drifted_probe_credential_not_governed";

function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

const loopback = Boolean(ADMIN_URL && isLoopback(ADMIN_URL));
const available = Boolean(ADMIN_URL && GOVERNED_PASSWORD && loopback);

/** The non-superuser CREATEROLE admin DSN — the Supabase `postgres` model. */
function boundaryUrl(): string {
  const u = new URL(ADMIN_URL!);
  return `postgresql://${BOUNDARY_ROLE}:${BOUNDARY_PASSWORD}@${u.hostname}:${u.port || 5432}/${BOUNDARY_DB}`;
}

interface RunResult {
  ok: boolean;
  code?: number;
  stdout: string;
  stderr: string;
}

/** Spawn the governed provisioning script as a chosen admin identity. */
async function runSetupDbRole(adminUrl: string): Promise<RunResult> {
  try {
    const { stdout } = await execFileAsync("npx", ["tsx", "scripts/setup-db-role.ts"], {
      env: {
        ...process.env,
        BEYU_ADMIN_DATABASE_URL: adminUrl,
        BEYU_RUNTIME_DB_PASSWORD: GOVERNED_PASSWORD,
        BEYU_RUNTIME_DB_ROLE: PROBE_ROLE,
      },
    });
    return { ok: true, stdout, stderr: "" };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { ok: false, code: err.code, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

/** Connect as the probe runtime role and report the server-side identity. */
async function loginAsProbe(password: string): Promise<string | null> {
  const u = new URL(ADMIN_URL!);
  const probe = new Client({
    host: u.hostname,
    port: Number(u.port || 5432),
    database: BOUNDARY_DB,
    user: PROBE_ROLE,
    password,
  });
  try {
    await probe.connect();
    const r = await probe.query("select current_user as u");
    return r.rows[0].u as string;
  } catch {
    return null;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

describe.skipIf(!available)("runtime role provisioning — Supabase privilege boundary", () => {
  let superuser: Client;

  beforeAll(async () => {
    // The suite needs a true superuser ONLY to stage the boundary (create the
    // non-superuser admin, its database, and to simulate out-of-band elevation
    // for the fail-closed cases) — exactly the roles the Supabase platform and
    // an incident responder would play.
    superuser = new Client({ connectionString: ADMIN_URL! });
    await superuser.connect();
    await superuser.query(`drop database if exists ${BOUNDARY_DB} with (force)`);
    await superuser.query(`drop role if exists ${PROBE_ROLE}`);
    await superuser.query(`drop role if exists ${BOUNDARY_ROLE}`);
    await superuser.query(
      `create role ${BOUNDARY_ROLE} login password '${BOUNDARY_PASSWORD}' createrole nosuperuser nobypassrls nocreatedb noreplication`,
    );
    await superuser.query(`create database ${BOUNDARY_DB} owner ${BOUNDARY_ROLE}`);
    const admin = await superuser.query(
      `select rolsuper, rolcreaterole, rolcreatedb from pg_roles where rolname = $1`,
      [BOUNDARY_ROLE],
    );
    // The boundary itself is a precondition of everything below.
    expect(admin.rows[0]).toMatchObject({ rolsuper: false, rolcreaterole: true, rolcreatedb: false });
  }, 60_000);

  afterAll(async () => {
    try {
      await superuser.query(`drop database if exists ${BOUNDARY_DB} with (force)`);
      await superuser.query(`drop role if exists ${PROBE_ROLE}`);
      await superuser.query(`drop role if exists ${BOUNDARY_ROLE}`);
    } finally {
      await superuser.end().catch(() => undefined);
    }
  }, 60_000);

  it(
    "CREATE branch works under a non-superuser CREATEROLE admin (the Supabase model)",
    async () => {
      const r = await runSetupDbRole(boundaryUrl());
      expect(r.ok).toBe(true);
      expect(r.stdout).toContain(`created role ${PROBE_ROLE}`);
      // The governed credential must work immediately after creation.
      expect(await loginAsProbe(GOVERNED_PASSWORD!)).toBe(PROBE_ROLE);
      // And nothing sensitive may reach the log.
      expect(r.stdout).not.toContain(GOVERNED_PASSWORD!);
      expect(r.stderr).not.toContain(GOVERNED_PASSWORD!);
    },
    120_000,
  );

  it(
    "ROOT CAUSE PIN: a non-superuser CREATEROLE admin cannot execute the legacy NOSUPERUSER re-assertion",
    async () => {
      const boundary = new Client({ connectionString: boundaryUrl() });
      await boundary.connect();
      try {
        // The exact statement the pre-remediation script issued whenever the
        // role already existed. On the Supabase privilege model this MUST be
        // rejected — pinning the root cause so the fix cannot be reverted.
        await expect(
          boundary.query(
            `alter role ${PROBE_ROLE} nosuperuser nobypassrls nocreaterole nocreatedb noreplication`,
          ),
        ).rejects.toMatchObject({ code: "42501" });
      } finally {
        await boundary.end().catch(() => undefined);
      }
    },
    60_000,
  );

  it(
    "REMEDIATION: the role-exists branch re-provisions through the non-superuser admin (catalog verification + credential re-assert)",
    async () => {
      // Drift the credential first so the re-assert is proven to converge it.
      await superuser.query(`alter role ${PROBE_ROLE} password '${DRIFTED_PASSWORD}'`);
      expect(await loginAsProbe(GOVERNED_PASSWORD!)).toBeNull();

      const r = await runSetupDbRole(boundaryUrl());
      expect(r.ok).toBe(true);
      expect(r.stdout).toContain("catalog attributes verified safe");
      expect(r.stdout).toContain("login credential re-asserted");

      // Credential converged to the governed secret.
      expect(await loginAsProbe(GOVERNED_PASSWORD!)).toBe(PROBE_ROLE);
      // Drifted credential stops working.
      expect(await loginAsProbe(DRIFTED_PASSWORD)).toBeNull();
      // No secret in the log.
      expect(r.stdout).not.toContain(GOVERNED_PASSWORD!);
      expect(r.stderr).not.toContain(GOVERNED_PASSWORD!);
    },
    120_000,
  );

  it("the reconciled runtime role is fully constrained and owns nothing", async () => {
    const attrs = await superuser.query(
      `select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication, rolcanlogin
         from pg_roles where rolname = $1`,
      [PROBE_ROLE],
    );
    expect(attrs.rows[0]).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolreplication: false,
      rolcanlogin: true,
    });
    const owned = await superuser.query(
      `select count(*)::int as n from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and pg_get_userbyid(c.relowner) = $1`,
      [PROBE_ROLE],
    );
    expect(owned.rows[0].n).toBe(0);
  });

  const elevatedCases: Array<{ attribute: string; grant: string; revoke: string }> = [
    { attribute: "SUPERUSER", grant: "superuser", revoke: "nosuperuser" },
    { attribute: "BYPASSRLS", grant: "bypassrls", revoke: "nobypassrls" },
    { attribute: "REPLICATION", grant: "replication", revoke: "noreplication" },
    { attribute: "CREATEROLE", grant: "createrole", revoke: "nocreaterole" },
    { attribute: "CREATEDB", grant: "createdb", revoke: "nocreatedb" },
  ];

  for (const { attribute, grant, revoke } of elevatedCases) {
    it(
      `ELEVATED ${attribute}: fail closed before any credential, grant or ownership mutation`,
      async () => {
        // Out-of-band elevation (only a true superuser can do this — the
        // incident this suite models): drift the credential too, so that a
        // successful run would be observable via a working governed login.
        await superuser.query(`alter role ${PROBE_ROLE} password '${DRIFTED_PASSWORD}'`);
        await superuser.query(`alter role ${PROBE_ROLE} ${grant}`);

        const r = await runSetupDbRole(boundaryUrl());
        expect(r.ok).toBe(false);
        expect(r.code).toBe(1);

        const output = `${r.stdout}\n${r.stderr}`;
        // Sanitized fail-closed error names the exact violated invariant and
        // demands the human/authorized path — never a silent downgrade.
        expect(output).toContain(`ELEVATED (${attribute})`);
        expect(output).toContain("authorized administrative path");
        expect(output).toContain("No password, grant or ownership change was made");
        // No secret leakage in the failure output.
        expect(output).not.toContain(GOVERNED_PASSWORD!);
        // Fail-closed happened BEFORE credential reconciliation: the governed
        // password must still NOT work (the drifted one is still in place).
        expect(await loginAsProbe(GOVERNED_PASSWORD!)).toBeNull();
        // And the elevation itself must be untouched — no silent downgrade.
        const attrs = await superuser.query(
          `select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication
             from pg_roles where rolname = $1`,
          [PROBE_ROLE],
        );
        const elevatedNow: Record<string, boolean> = {
          SUPERUSER: attrs.rows[0].rolsuper,
          BYPASSRLS: attrs.rows[0].rolbypassrls,
          REPLICATION: attrs.rows[0].rolreplication,
          CREATEROLE: attrs.rows[0].rolcreaterole,
          CREATEDB: attrs.rows[0].rolcreatedb,
        };
        expect(elevatedNow[attribute]).toBe(true);

        // Restore the safe state for the following cases (superuser only).
        await superuser.query(`alter role ${PROBE_ROLE} ${revoke}`);
      },
      120_000,
    );
  }

  it(
    "idempotent re-run under the boundary admin after all fail-closed cases (re-converges the credential)",
    async () => {
      const r = await runSetupDbRole(boundaryUrl());
      expect(r.ok).toBe(true);
      expect(await loginAsProbe(GOVERNED_PASSWORD!)).toBe(PROBE_ROLE);
      const attrs = await superuser.query(
        `select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication, rolcanlogin
           from pg_roles where rolname = $1`,
        [PROBE_ROLE],
      );
      expect(attrs.rows[0]).toEqual({
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolreplication: false,
        rolcanlogin: true,
      });
    },
    120_000,
  );
});
