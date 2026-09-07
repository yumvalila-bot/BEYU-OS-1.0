import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { users } from "../../src/db/schema";
import { hashPassword } from "../../src/lib/crypto";
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpCode,
  generateTotpSecret,
  hashRecoveryCode,
} from "../../src/lib/mfa";
import { baseUrl, serverAvailable } from "../helpers/http";
import { makeEnrollableOnly, resetBootstrap } from "./helpers";

/**
 * End-to-end HTTP surface for the administrator enrollment ceremony.
 *
 * Drives the real running server so the transport-level guarantees are asserted
 * by execution: routing, generic auth errors, validation, the httpOnly cookie,
 * MFA verification and the final seal. Because the ceremony seals and rewrites
 * the shared `admin@beyu.os` credential that other suites authenticate with,
 * `afterAll` fully restores the seeded admin and resets bootstrap state.
 */
const available = await serverAvailable();
const secretConfigured = Boolean(process.env.BEYU_BOOTSTRAP_SECRET);
const runnable = available && secretConfigured;

const ADMIN_EMAIL = "admin@beyu.os";
const ADMIN_USER_ID = "USR_PLATFORM_ADMIN";
const STRONG_PASSWORD = "Tr0ub4dour&3xplorer-Vault-2026";
const ENROLL_COOKIE = "beyu_os_admin_enrollment";

function cookieHeaderFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function post(path: string, body?: unknown, cookie?: string) {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { res, json: (await res.json().catch(() => null)) as { data?: Record<string, unknown>; error?: { message?: string } } | null };
}

beforeAll(async () => {
  if (!runnable) return;
  await makeEnrollableOnly(ADMIN_USER_ID);
  await resetBootstrap(ADMIN_USER_ID);
});

afterAll(async () => {
  if (available) {
    // Restore the seeded admin so other suites' login("admin@beyu.os") works:
    // shared bootstrap password + a fresh valid MFA secret.
    const password = process.env.BEYU_BOOTSTRAP_PASSWORD;
    if (password) {
      const totp = generateTotpSecret();
      const recovery = generateRecoveryCodes();
      await db
        .update(users)
        .set({
          passwordHash: hashPassword(password),
          passwordAlgo: "scrypt",
          passwordMustChange: true,
          mfaEnrolled: true,
          mfaMethod: "TOTP",
          mfaSecretEncrypted: encryptSecret(totp),
          mfaRecoveryCodesHash: recovery.map(hashRecoveryCode),
          mfaLastAcceptedStep: null,
          mfaFailedAttempts: 0,
          mfaLockedUntil: null,
        })
        .where(eq(users.id, ADMIN_USER_ID));
    }
    await resetBootstrap(ADMIN_USER_ID);
  }
  await pool.end().catch(() => undefined);
});

describe.skipIf(!runnable)("administrator enrollment — HTTP/E2E", () => {
  it("GET status returns coarse lifecycle JSON without secrets", async () => {
    const res = await fetch(`${baseUrl()}/api/v1/auth/bootstrap/status`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { state: string; secretConfigured: boolean; enrollable: boolean } };
    expect(["AVAILABLE", "IN_PROGRESS", "SEALED", "NOT_PREPARED"]).toContain(json.data.state);
    expect(typeof json.data.secretConfigured).toBe("boolean");
  });

  it("rejects an invalid bootstrap secret with a generic 401", async () => {
    const { res, json } = await post("/api/v1/auth/bootstrap/begin", {
      bootstrapSecret: "definitely-the-wrong-secret-value-1234567890",
      password: STRONG_PASSWORD,
    });
    expect(res.status).toBe(401);
    expect(json?.error?.message ?? "").not.toMatch(/secret/i);
  });

  it("rejects a weak password with 422", async () => {
    const { res } = await post("/api/v1/auth/bootstrap/begin", {
      bootstrapSecret: process.env.BEYU_BOOTSTRAP_SECRET,
      password: "admin",
    });
    expect(res.status).toBe(422);
  });

  it("verify-mfa without an enrollment cookie is refused", async () => {
    const { res } = await post("/api/v1/auth/bootstrap/verify-mfa", { code: "123456" });
    expect(res.status).toBe(409);
  });

  it("completes the ceremony end to end and seals the bootstrap", async () => {
    // begin
    const beginRes = await fetch(`${baseUrl()}/api/v1/auth/bootstrap/begin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bootstrapSecret: process.env.BEYU_BOOTSTRAP_SECRET, password: STRONG_PASSWORD }),
    });
    expect(beginRes.status).toBe(201);
    const cookie = cookieHeaderFrom(beginRes);
    expect(cookie).toContain(ENROLL_COOKIE);
    const beginJson = (await beginRes.json()) as { data: { mfa: { secret: string }; recoveryCodes: string[] } };
    const mfaSecret = beginJson.data.mfa.secret;
    expect(beginJson.data.recoveryCodes.length).toBeGreaterThanOrEqual(8);

    // The enrollment cookie must be httpOnly.
    const setCookie = beginRes.headers.getSetCookie().find((c) => c.startsWith(ENROLL_COOKIE));
    expect(setCookie?.toLowerCase()).toContain("httponly");

    // verify-mfa
    const code = generateTotpCode(mfaSecret);
    const verify = await post("/api/v1/auth/bootstrap/verify-mfa", { code }, cookie);
    expect(verify.res.status).toBe(200);

    // complete
    const complete = await post("/api/v1/auth/bootstrap/complete", undefined, cookie);
    expect(complete.res.status).toBe(200);
    expect(complete.json?.data?.bootstrapSealed).toBe(true);

    // Sealed now.
    const statusRes = await fetch(`${baseUrl()}/api/v1/auth/bootstrap/status`);
    const statusJson = (await statusRes.json()) as { data: { state: string; enrollable: boolean } };
    expect(statusJson.data.state).toBe("SEALED");
    expect(statusJson.data.enrollable).toBe(false);

    // A second begin is refused (sealed).
    const second = await post("/api/v1/auth/bootstrap/begin", {
      bootstrapSecret: process.env.BEYU_BOOTSTRAP_SECRET,
      password: STRONG_PASSWORD,
    });
    expect(second.res.status).toBe(409);

    // The admin can now authenticate with the self-chosen credential + MFA.
    // The enrollment consumed a TOTP step (replay protection), so a login code
    // from the same 30s window is correctly rejected; retry across windows.
    const [admin] = await db.select().from(users).where(eq(users.id, ADMIN_USER_ID)).limit(1);
    const secret = decryptSecret(admin.mfaSecretEncrypted as string);
    let loginStatus = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      const loginRes = await fetch(`${baseUrl()}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: STRONG_PASSWORD, mfaCode: generateTotpCode(secret) }),
      });
      loginStatus = loginRes.status;
      if (loginStatus === 200) break;
      await new Promise((r) => setTimeout(r, 31_000));
    }
    expect(loginStatus).toBe(200);
  }, 120_000);
});
