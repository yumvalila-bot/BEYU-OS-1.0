import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { users } from "../../src/db/schema";
import { decryptSecret, generateTotpCode } from "../../src/lib/mfa";

/**
 * End-to-end HTTP harness.
 *
 * Findings A-04/A-05: several controls (401, the 422 forgery guards, 429, and the
 * whole idempotency layer) live in the route/`lib/api.ts` boundary and were only
 * covered by assertions on SOURCE TEXT. Those pass whenever the string exists,
 * even if behaviour regresses. These helpers drive the real running server so the
 * transport-level guarantees are asserted by execution rather than by grep.
 *
 * Requires a server started by the caller (see `globalThis.__BEYU_BASE_URL__`).
 */

export function baseUrl(): string {
  return process.env.BEYU_TEST_BASE_URL ?? "http://127.0.0.1:3100";
}

/**
 * Probe the running server.
 *
 * SKIP vs FAIL. The HTTP suites are guarded with `it.skipIf(!serverAvailable())`
 * so `npm test` still works for a contributor who has no server running. That
 * convenience has a dangerous failure mode: if a caller EXPLICITLY configures
 * `BEYU_TEST_BASE_URL` (as CI does) and the server is down or unhealthy, every
 * transport-level assertion silently SKIPS and the run still exits green — the
 * 401 boundary, the 422 forgery guards, the 429 limiter and the whole
 * idempotency layer would all be reported as verified while executing nothing.
 *
 * So: when a base URL was explicitly configured, an unavailable or unhealthy
 * server is a hard failure, not a skip. Without it, the historical skip
 * behaviour is preserved.
 */
export async function serverAvailable(): Promise<boolean> {
  const explicitlyConfigured = Boolean(process.env.BEYU_TEST_BASE_URL);
  let detail = "unknown";
  try {
    const res = await fetch(`${baseUrl()}/api/health`, { signal: AbortSignal.timeout(2500) });
    if (res.ok) return true;
    detail = `HTTP ${res.status}`;
  } catch (e) {
    detail = e instanceof Error ? e.message : String(e);
  }
  if (explicitlyConfigured) {
    throw new Error(
      `BEYU_TEST_BASE_URL is set to ${baseUrl()} but the server is not ready (${detail}). ` +
        `Refusing to skip the HTTP/E2E suites: an explicitly configured server that is unreachable is a ` +
        `failure, not a skip. Start the application (npx next start -p 3100) or unset BEYU_TEST_BASE_URL.`,
    );
  }
  return false;
}

/**
 * Authenticate against the real login endpoint and return the session cookie.
 *
 * TOTP replay prevention rejects a step already consumed by this identity, so a
 * fresh step is awaited when a code is refused.
 */
export async function login(email: string): Promise<string> {
  const password = process.env.BEYU_BOOTSTRAP_PASSWORD;
  if (!password) throw new Error("BEYU_BOOTSTRAP_PASSWORD is required for HTTP tests");

  for (let attempt = 0; attempt < 3; attempt++) {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) throw new Error(`seed user ${email} is missing — run npm run seed`);

    const mfaCode = user.mfaSecretEncrypted
      ? generateTotpCode(decryptSecret(user.mfaSecretEncrypted), Date.now())
      : undefined;

    const res = await fetch(`${baseUrl()}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, mfaCode }),
    });

    if (res.status === 200) {
      return res.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    }
    // Replayed TOTP step — wait for the next 30s window.
    await new Promise((r) => setTimeout(r, 31_000));
  }
  throw new Error(`could not authenticate ${email}`);
}

export type ApiResponse<T = unknown> = {
  status: number;
  body: T;
  headers: Headers;
};

export async function apiPost<T = Record<string, unknown>>(
  path: string,
  payload: unknown,
  options: { cookie?: string | null; idempotencyKey?: string } = {},
): Promise<ApiResponse<T>> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
    },
    body: JSON.stringify(payload),
  });
  return {
    status: res.status,
    body: (await res.json().catch(() => null)) as T,
    headers: res.headers,
  };
}

export async function apiGet(path: string, cookie?: string | null): Promise<{ status: number; html: string }> {
  const res = await fetch(`${baseUrl()}${path}`, { headers: cookie ? { cookie } : {} });
  return { status: res.status, html: await res.text() };
}

/**
 * GET a JSON API route.
 *
 * Separate from `apiGet`, which returns raw text for page-rendering assertions;
 * this mirrors `apiPost`'s options shape for JSON endpoints.
 */
export async function apiGetJson<T = Record<string, unknown>>(
  path: string,
  options: { cookie?: string | null } = {},
): Promise<ApiResponse<T>> {
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: options.cookie ? { cookie: options.cookie } : {},
  });
  return {
    status: res.status,
    body: (await res.json().catch(() => null)) as T,
    headers: res.headers,
  };
}

/**
 * The governed denial panel rendered by `Denied` in src/components/brand.tsx.
 *
 * MATCH THE <h1>, NOT THE BARE PHRASE.
 *   The literal string "Authorisation denied" also appears in
 *   src/app/os/governance/propose.tsx as a client-side error-status label. A
 *   bare-phrase match therefore reports the Governance page as "denied" even
 *   when it rendered successfully — a false positive that silently INVERTS any
 *   authorization assertion built on it (and would make the negative form,
 *   `not.toMatch(/Authorisation denied/)`, fail on a legitimately authorized
 *   page). Anchoring on the panel's heading makes the detector unambiguous.
 */
export const DENIED_PANEL = /<h1[^>]*>Authorisation denied<\/h1>/;

/** True when the rendered page is the governed denial panel. */
export function isDeniedPage(html: string): boolean {
  return DENIED_PANEL.test(html);
}

/** A valid proposal payload; override fields per test. */
export function proposalPayload(overrides: Record<string, unknown> = {}) {
  return {
    bodyId: "GOV_GROUP_BOARD",
    title: "HTTP suite — adopt the group data retention standard",
    category: "POLICY",
    summary: "Adopt the enterprise data retention standard across all country holdings.",
    rationale: "Regulatory divergence between TZ DPA 2022 and GDPR requires one baseline.",
    dataBasis: "Compliance obligation register OBL-TZ-DPA; retention inventory 2025.",
    consequences: "All sector OSs must align retention schedules within two quarters.",
    classification: "RESTRICTED",
    ...overrides,
  };
}
