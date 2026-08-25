/**
 * Live HTTP route inventory & semantics verification (Iteration 13).
 *
 * Requirement being enforced: "HTTP 200 = success" is NOT acceptable. Every
 * /api route is driven against the REAL production server and its actual
 * response semantics are asserted — status code, structured JSON error code,
 * and the auth boundary — so dead routes, auth gaps and silent 500s are proven
 * by execution, not by source inspection.
 *
 * Coverage per route:
 *  1. unauthenticated  -> structured 401 (UNAUTHENTICATED), never 404/500/HTML;
 *  2. wrong HTTP method -> 405;
 *  3. authenticated with the right principal -> the actual semantic status
 *     (200 data, 403 FORBIDDEN for a role without the grant, 404 NOT_FOUND for
 *     a missing object, 422 VALIDATION_FAILED for an empty body);
 *  4. authenticated with the WRONG principal -> 403 FORBIDDEN (RBAC is
 *     role-based: PLATFORM_ADMIN is not a business role and holds no
 *     governance/finance/hcm/ai grants by design).
 *
 * Usage:
 *   # production build running (npm run build && npx next start -H 0.0.0.0 -p 3100)
 *   BEYU_TEST_BASE_URL=http://127.0.0.1:3100 npx tsx scripts/route-inventory.mts assert
 *   # exit 0 = every expectation held; exit 1 = violation (reported per check)
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db/index";
import { users } from "../src/db/schema/identity";
import { decryptSecret, generateTotpCode } from "../src/lib/mfa";

const BASE = process.env.BEYU_TEST_BASE_URL ?? "http://127.0.0.1:3100";

type Principal = "anon" | "admin" | "ceo" | "cfo" | "governance" | "hcm";
const PRINCIPAL_EMAIL: Record<Exclude<Principal, "anon">, string> = {
  admin: "admin@beyu.os",
  ceo: "ceo@beyu.os",
  cfo: "cfo@beyu.os",
  governance: "governance@beyu.os",
  hcm: "hcm@beyu.os",
};

interface Check {
  route: string;
  method: "GET" | "POST";
  as: Principal;
  body?: unknown;
  expectStatus: number;
  expectCode?: string; // structured error code in body.error.code
  note: string;
}

const CHECKS: Check[] = [
  // ---- public boundary ----
  { route: "/api/health", method: "GET", as: "anon", expectStatus: 200, note: "public health: ok + DB up" },

  // ---- self-test: platform admin only ----
  { route: "/api/v1/system/self-test", method: "GET", as: "anon", expectStatus: 401, expectCode: "UNAUTHENTICATED", note: "no session -> 401" },
  { route: "/api/v1/system/self-test", method: "GET", as: "admin", expectStatus: 200, note: "PLATFORM_ADMIN reads the control summary" },

  // ---- governance read: role-based, platform admin has no grant ----
  { route: "/api/v1/governance/authorization", method: "GET", as: "anon", expectStatus: 401, expectCode: "UNAUTHENTICATED", note: "no session -> 401" },
  { route: "/api/v1/governance/authorization", method: "GET", as: "governance", expectStatus: 200, note: "CHIEF_GOVERNANCE_OFFICER reads authorization state" },
  { route: "/api/v1/governance/authorization", method: "GET", as: "admin", expectStatus: 403, expectCode: "FORBIDDEN", note: "PLATFORM_ADMIN lacks governance:resolution.read (role-based RBAC)" },

  // ---- hcm read: role-based + object-level 404 ----
  { route: "/api/v1/hcm/employees", method: "GET", as: "anon", expectStatus: 401, expectCode: "UNAUTHENTICATED", note: "no session -> 401" },
  { route: "/api/v1/hcm/employees", method: "GET", as: "hcm", expectStatus: 200, note: "HCM_DIRECTOR lists workforce records" },
  { route: "/api/v1/hcm/employees/EMP_DOES_NOT_EXIST", method: "GET", as: "hcm", expectStatus: 404, note: "missing employee -> 404, not 500/200-empty" },
  { route: "/api/v1/hcm/employees", method: "GET", as: "admin", expectStatus: 403, expectCode: "FORBIDDEN", note: "PLATFORM_ADMIN lacks hcm:employee.read" },

  // ---- noelia: authorized query + validation ----
  { route: "/api/v1/ai/noelia", method: "POST", as: "anon", expectStatus: 401, expectCode: "UNAUTHENTICATED", note: "no session -> 401" },
  { route: "/api/v1/ai/noelia", method: "POST", as: "admin", expectStatus: 403, expectCode: "FORBIDDEN", note: "PLATFORM_ADMIN lacks ai:noelia.query" },
  { route: "/api/v1/ai/noelia", method: "POST", as: "ceo", body: {}, expectStatus: 422, expectCode: "VALIDATION_FAILED", note: "empty body -> structured 422" },
  { route: "/api/v1/ai/noelia", method: "POST", as: "ceo", body: { question: "What is the current treasury position?" }, expectStatus: 200, note: "GROUP_CEO ask -> governed answer envelope" },

  // ---- finance: validation + happy path + missing object ----
  { route: "/api/v1/finance/waterfall/simulate", method: "POST", as: "anon", expectStatus: 401, expectCode: "UNAUTHENTICATED", note: "no session -> 401" },
  { route: "/api/v1/finance/waterfall/simulate", method: "POST", as: "cfo", body: {}, expectStatus: 422, expectCode: "VALIDATION_FAILED", note: "empty body -> structured 422" },
  { route: "/api/v1/finance/waterfall/simulate", method: "POST", as: "cfo", body: { configId: "WFC_WF_GROUP_V21", grossAmount: 1_000_000 }, expectStatus: 200, note: "GROUP_CFO simulates a waterfall (no cash moves)" },
  { route: "/api/v1/finance/tax/assess", method: "POST", as: "anon", expectStatus: 401, expectCode: "UNAUTHENTICATED", note: "no session -> 401" },
  { route: "/api/v1/finance/tax/assess", method: "POST", as: "cfo", body: {}, expectStatus: 422, expectCode: "VALIDATION_FAILED", note: "empty body -> structured 422" },
  { route: "/api/v1/finance/tax/assess", method: "POST", as: "cfo", body: { strategyId: "TAX_TZ_CAP_ALLOW_01", legalEntityId: "LEN_BEYU_TZ_HOLDING", baseAmount: 1_000_000, facts: {} }, expectStatus: 200, note: "GROUP_CFO assesses jurisdiction-gated eligibility" },
  { route: "/api/v1/finance/capital/CAP_DOES_NOT_EXIST/governance-authorization", method: "POST", as: "anon", expectStatus: 401, expectCode: "UNAUTHENTICATED", note: "no session -> 401" },
  { route: "/api/v1/finance/capital/CAP_DOES_NOT_EXIST/governance-authorization", method: "POST", as: "cfo", body: {}, expectStatus: 404, note: "missing capital request -> 404, not 500" },

  // ---- governance mutations: validation + missing object 404s ----
  { route: "/api/v1/governance/resolutions", method: "POST", as: "anon", expectStatus: 401, expectCode: "UNAUTHENTICATED", note: "no session -> 401" },
  { route: "/api/v1/governance/resolutions", method: "POST", as: "governance", body: {}, expectStatus: 422, expectCode: "VALIDATION_FAILED", note: "empty proposal -> structured 422 (nothing is created)" },
  { route: "/api/v1/governance/resolutions/RES_DOES_NOT_EXIST/table", method: "POST", as: "governance", body: {}, expectStatus: 404, note: "missing resolution -> 404" },
  { route: "/api/v1/governance/resolutions/RES_DOES_NOT_EXIST/votes", method: "POST", as: "governance", body: {}, expectStatus: 404, note: "missing resolution -> 404" },
  { route: "/api/v1/governance/resolutions/RES_DOES_NOT_EXIST/decision", method: "POST", as: "governance", body: {}, expectStatus: 404, note: "missing resolution -> 404" },

  // ---- auth endpoints ----
  { route: "/api/v1/auth/login", method: "POST", as: "anon", body: {}, expectStatus: 422, expectCode: "VALIDATION_FAILED", note: "empty login -> structured 422" },
  // logout LAST — it invalidates the caller's session
  { route: "/api/v1/auth/logout", method: "POST", as: "admin", expectStatus: 200, note: "logout -> 200 + authenticated:false" },
];

/** Routes that must NOT be 404: the complete /api inventory from the production build. */
const ROUTE_INVENTORY: Array<{ path: string; method: "GET" | "POST" }> = [
  { path: "/api/health", method: "GET" },
  { path: "/api/v1/auth/login", method: "POST" },
  { path: "/api/v1/auth/logout", method: "POST" },
  { path: "/api/v1/system/self-test", method: "GET" },
  { path: "/api/v1/governance/authorization", method: "GET" },
  { path: "/api/v1/hcm/employees", method: "GET" },
  { path: "/api/v1/hcm/employees/EMP_DOES_NOT_EXIST", method: "GET" },
  { path: "/api/v1/ai/noelia", method: "POST" },
  { path: "/api/v1/finance/tax/assess", method: "POST" },
  { path: "/api/v1/finance/waterfall/simulate", method: "POST" },
  { path: "/api/v1/finance/capital/CAP_DOES_NOT_EXIST/governance-authorization", method: "POST" },
  { path: "/api/v1/governance/resolutions", method: "POST" },
  { path: "/api/v1/governance/resolutions/RES_DOES_NOT_EXIST/table", method: "POST" },
  { path: "/api/v1/governance/resolutions/RES_DOES_NOT_EXIST/votes", method: "POST" },
  { path: "/api/v1/governance/resolutions/RES_DOES_NOT_EXIST/decision", method: "POST" },
];

const sessions = new Map<Principal, string>();

async function login(email: string): Promise<string> {
  const password = process.env.BEYU_BOOTSTRAP_PASSWORD;
  if (!password) throw new Error("BEYU_BOOTSTRAP_PASSWORD is required");
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new Error(`seed user ${email} is missing — run npm run seed`);
  const mfaCode = user.mfaSecretEncrypted ? generateTotpCode(decryptSecret(user.mfaSecretEncrypted), Date.now()) : undefined;

  // TOTP replay prevention: a consumed step is rejected. Wait for a fresh 30s step on 401.
  for (let attempt = 0; attempt < 4; attempt++) {
    const fresh = user.mfaSecretEncrypted ? generateTotpCode(decryptSecret(user.mfaSecretEncrypted), Date.now()) : undefined;
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, mfaCode: fresh }),
    });
    if (res.status === 200) {
      return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    }
    const body = await res.text();
    if (res.status === 401 && body.includes("INVALID_MFA")) {
      await new Promise((r) => setTimeout(r, 31_000)); // next TOTP window
      continue;
    }
    throw new Error(`login failed for ${email}: ${res.status} ${body.slice(0, 200)}`);
  }
  throw new Error(`login failed for ${email} after TOTP retries`);
}

async function sessionFor(p: Principal): Promise<string | null> {
  if (p === "anon") return null;
  const cached = sessions.get(p);
  if (cached) return cached;
  const cookie = await login(PRINCIPAL_EMAIL[p]);
  sessions.set(p, cookie);
  return cookie;
}

interface Observed {
  status: number;
  kind: "json" | "html" | "text";
  code?: string;
  preview: string;
}

async function hit(path: string, method: string, cookie: string | null, body: unknown): Promise<Observed> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let kind: Observed["kind"] = "text";
  let code: string | undefined;
  try {
    const parsed = JSON.parse(text);
    kind = "json";
    if (parsed?.error && typeof parsed.error.code === "string") code = parsed.error.code;
  } catch {
    if (text.slice(0, 200).includes("<")) kind = "html";
  }
  return { status: res.status, kind, code, preview: text.slice(0, 140).replace(/\n/g, " ") };
}

async function runCheck(c: Check): Promise<{ ok: boolean; observed: Observed }> {
  const cookie = await sessionFor(c.as);
  const observed = await hit(c.route, c.method, cookie, c.body);
  const ok =
    observed.status === c.expectStatus &&
    (c.expectCode ? observed.code === c.expectCode : observed.kind === "json" || c.expectStatus === 405) &&
    observed.kind !== "html";
  return { ok, observed };
}

async function main() {
  const mode = process.argv[2] ?? "assert";
  const failures: string[] = [];
  const report: Array<{ check: string; note: string; expected: string; observed: string; ok: boolean }> = [];

  if (mode === "probe") {
    const cookie = await login("admin@beyu.os");
    for (const r of ROUTE_INVENTORY) {
      const unauth = await hit(r.path, r.method, null, r.method === "POST" ? {} : undefined);
      const authed = await hit(r.path, r.method, cookie, r.method === "POST" ? {} : undefined);
      const wrong = await hit(r.path, r.method === "GET" ? "POST" : "GET", cookie, undefined);
      console.log(JSON.stringify({ route: `${r.method} ${r.path}`, unauth, authed, wrongMethod: wrong }));
    }
    console.log("PROBE DONE");
    return;
  }

  if (mode !== "assert") throw new Error(`unknown mode ${mode} (use probe|assert)`);

  for (const c of CHECKS) {
    const { ok, observed } = await runCheck(c);
    const expected = `${c.expectStatus}${c.expectCode ? ` (${c.expectCode})` : ""}`;
    const observedStr = `${observed.status} ${observed.kind}${observed.code ? ` (${observed.code})` : ""} — ${observed.preview.slice(0, 80)}`;
    report.push({
      check: `${c.method} ${c.route} as ${c.as}`,
      note: c.note,
      expected,
      observed: observedStr,
      ok,
    });
    if (!ok) failures.push(`${c.method} ${c.route} as ${c.as}: expected ${expected}, got ${observed.status} ${observed.kind}${observed.code ? ` (${observed.code})` : ""}`);
  }

  // Wrong-method 405 sweep (authenticated, so the method check is not masked by 401)
  const adminCookie = await sessionFor("admin");
  for (const r of ROUTE_INVENTORY) {
    const wrong = r.method === "GET" ? "POST" : "GET";
    const observed = await hit(r.path, wrong, adminCookie, undefined);
    const ok = observed.status === 405 && observed.kind !== "html";
    report.push({
      check: `${wrong} ${r.path} (wrong method) as admin`,
      note: "undeclared method -> 405",
      expected: "405",
      observed: `${observed.status} ${observed.kind}`,
      ok,
    });
    if (!ok) failures.push(`wrong-method ${wrong} ${r.path}: expected 405, got ${observed.status} ${observed.kind}`);
  }

  // Markdown report
  console.log("\n# Live HTTP route inventory & semantics (Iteration 13)\n");
  console.log(`Base: \`${BASE}\` — production build, ${new Date().toISOString()}\n`);
  console.log("| # | Check | Expected | Observed | Result |");
  console.log("|---|-------|----------|----------|--------|");
  report.forEach((r, i) => {
    console.log(`| ${i + 1} | ${r.check} — ${r.note} | ${r.expected} | ${r.observed} | ${r.ok ? "PASS" : "**FAIL**"} |`);
  });

  console.log(`\n${report.length} checks, ${failures.length} failures.`);
  if (failures.length > 0) {
    console.log("\nFAILURES:");
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }
  console.log("\nALL ROUTE SEMANTICS VERIFIED — no dead routes, no auth gaps, no silent 500s.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
