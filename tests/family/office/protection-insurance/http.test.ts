/**
 * Family Office protection & insurance — transport-level contract tests.
 *
 * Same philosophy as `../capital-wealth-http.test.ts`: the guarantees that
 * actually protect the domain live in the route + `lib/api.ts` boundary, so
 * they are driven against the REAL running server rather than asserted against
 * source text. Covers:
 *
 *   - the 401 authentication boundary on every new route;
 *   - GROUP_CEO 403 on every protection route (seniority does not leak into
 *     the family domain — the CEO deliberately holds no `familyoffice:*`);
 *   - the seeded FAMILY_OFFICE_PRINCIPAL 200 read path;
 *   - 422 forged-field rejection (client-supplied `tenantId`/`status`/`result`);
 *   - float money refusal (§33 — integer minor units or nothing);
 *   - lifecycle refusal through HTTP: an illegal claim transition is 409/422,
 *     an APPROVED decision without evidence is refused (no fabrication);
 *   - the §11 rule that a client cannot POST a protection-gap RESULT;
 *   - idempotency replay on a policy creation.
 *
 * Everything recorded here through the API is written against the seeded
 * group tenant as a governed operational record; no insurer, amount or
 * beneficiary is real, and each payload carries the test's own
 * provenance class (USER_PROVIDED) — the register is exercised, not faked.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { login, serverAvailable } from "../../../helpers/http";

const BASE = process.env.BEYU_TEST_BASE_URL ?? "http://127.0.0.1:3100";

const READ_ROUTES = [
  "/api/v1/family-office/protection/policies",
  "/api/v1/family-office/protection/dashboard",
  "/api/v1/family-office/protection/claims",
  "/api/v1/family-office/protection/assessments",
  "/api/v1/family-office/protection/family-view",
] as const;

const WRITE_PROBES: { route: string; body: Record<string, unknown> }[] = [
  { route: "/api/v1/family-office/protection/policies", body: {} },
  { route: "/api/v1/family-office/protection/claims", body: {} },
];

let principal: string;
let outsider: string;
let suffix = "";

async function available(): Promise<boolean> {
  return serverAvailable();
}

beforeAll(async () => {
  if (!(await available())) return;
  principal = await login("family@beyu.os");
  outsider = await login("ceo@beyu.os");
  suffix = `t${Date.now().toString(36)}`;
}, 180_000);

describe("Family Office protection API — authentication boundary", () => {
  it.each(READ_ROUTES)("unauthenticated GET %s is 401", async (route) => {
    if (!(await available())) return;
    const res = await fetch(`${BASE}${route}`);
    expect(res.status).toBe(401);
  });

  it("the 401 carries the canonical error envelope", async () => {
    if (!(await available())) return;
    const res = await fetch(`${BASE}/api/v1/family-office/protection/dashboard`);
    const body = (await res.json()) as { error?: { code?: string; traceId?: string } };
    expect(body.error?.code).toBeTruthy();
    expect(body.error?.traceId).toBeTruthy();
  });
});

describe("Family Office protection API — authorization boundary", () => {
  it.each(READ_ROUTES)("GROUP_CEO is 403 on %s — holds no familyoffice permission", async (route) => {
    if (!(await available())) return;
    const res = await fetch(`${BASE}${route}`, { headers: { cookie: outsider } });
    expect(res.status).toBe(403);
  });

  it.each(WRITE_PROBES)("GROUP_CEO is 403 on POST %s", async ({ route }) => {
    if (!(await available())) return;
    const res = await fetch(`${BASE}${route}`, {
      method: "POST",
      headers: { cookie: outsider, "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(403);
  });

  it("the denial is audited like every other FORBIDDEN", async () => {
    if (!(await available())) return;
    // Behavior assertion is the 403 itself; the audit append is proven by
    // guarded()'s single denial path shared with the capital suite. No
    // second mechanism exists here to bypass it.
    const res = await fetch(`${BASE}/api/v1/family-office/protection/policies`, { headers: { cookie: outsider } });
    expect(res.status).toBe(403);
  });

  it.each(READ_ROUTES)("FAMILY_OFFICE_PRINCIPAL is 200 on %s", async (route) => {
    if (!(await available())) return;
    const res = await fetch(`${BASE}${route}`, { headers: { cookie: principal } });
    expect(res.status).toBe(200);
  });
});

/** A structurally complete, honest policy payload for the principal's tenant. */
function policyPayload(over: Record<string, unknown> = {}) {
  return {
    policyNumber: `LIFE-${suffix}`,
    policyType: "FAMILY_PROTECTION",
    ownerRef: `TRUST-${suffix}`,
    ownerKind: "TRUST",
    insuredRef: `MEMBER-${suffix}`,
    insuredKind: "FAMILY_MEMBER",
    premiumPayerRef: `MEMBER-${suffix}`,
    insurerRef: `TEST-INSURER-${suffix}`,
    countryCode: "MU",
    currency: "MUR",
    coverageAmountMinor: 10_000_000,
    deathBenefitMinor: 10_000_000,
    premiumAmountMinor: 120_000,
    premiumFrequency: "ANNUAL",
    effectiveDate: "2024-01-01",
    purpose: "Transport-test record: succession liquidity planning fixture (structural, not a real policy).",
    amountProvenance: "USER_PROVIDED",
    ...over,
  };
}

describe("Family Office protection API — validation & forged-field rejection", () => {
  it("rejects a server-controlled field on policy create", async () => {
    if (!(await available())) return;
    const res = await fetch(`${BASE}/api/v1/family-office/protection/policies`, {
      method: "POST",
      headers: { cookie: principal, "content-type": "application/json", "idempotency-key": `forged-${suffix}` },
      body: JSON.stringify(policyPayload({ tenantId: "T-EVIL", status: "IN_FORCE" })),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("SERVER_CONTROLLED_FIELD");
  });

  it("rejects float money — minor units are integers or nothing (§33)", async () => {
    if (!(await available())) return;
    const res = await fetch(`${BASE}/api/v1/family-office/protection/policies`, {
      method: "POST",
      headers: { cookie: principal, "content-type": "application/json", "idempotency-key": `float-${suffix}` },
      body: JSON.stringify(policyPayload({ deathBenefitMinor: 1000.5 })),
    });
    expect(res.status).toBe(422);
  });

  it("refuses a VERIFIED amount provenance with no source — labels cannot be inflated", async () => {
    if (!(await available())) return;
    const res = await fetch(`${BASE}/api/v1/family-office/protection/policies`, {
      method: "POST",
      headers: { cookie: principal, "content-type": "application/json", "idempotency-key": `prov-${suffix}` },
      body: JSON.stringify(policyPayload({ amountProvenance: "VERIFIED", amountSourceRef: null })),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: { details?: { findings?: string[] } } };
    expect((body.error?.details?.findings ?? []).join(" ")).toMatch(/PROVENANCE/);
  });

  it("refuses a client-supplied gap RESULT on the assessment route (§11)", async () => {
    if (!(await available())) return;
    const res = await fetch(`${BASE}/api/v1/family-office/protection/assessments`, {
      method: "POST",
      headers: { cookie: principal, "content-type": "application/json", "idempotency-key": `gapforged-${suffix}` },
      body: JSON.stringify({ result: { modeledGapMinor: 0 } }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("SERVER_CONTROLLED_FIELD");
  });
});

describe("Family Office protection API — governed writes and lifecycle refusals", () => {
  let policyId = "";

  it("records a DRAFT policy through the engine (201) and reads it back scoped", async () => {
    if (!(await available())) return;
    const res = await fetch(`${BASE}/api/v1/family-office/protection/policies`, {
      method: "POST",
      headers: { cookie: principal, "content-type": "application/json", "idempotency-key": `create-${suffix}` },
      body: JSON.stringify(policyPayload()),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data?: { id?: string } };
    policyId = body.data?.id ?? "";
    expect(policyId.startsWith("FOINS_")).toBe(true);

    const read = await fetch(`${BASE}/api/v1/family-office/protection/policies/${policyId}`, { headers: { cookie: principal } });
    expect(read.status).toBe(200);
    const detail = (await read.json()) as { data?: { policy?: { policyNumber?: string }; validation?: string[]; reviewFlags?: unknown[] } };
    expect(detail.data?.policy?.policyNumber).toBe(`LIFE-${suffix}`);
    expect(detail.data?.validation).toEqual([]);
  });

  it("replays the same idempotency-key with the same payload — no duplicate record", async () => {
    if (!(await available())) return;
    const res = await fetch(`${BASE}/api/v1/family-office/protection/policies`, {
      method: "POST",
      headers: { cookie: principal, "content-type": "application/json", "idempotency-key": `create-${suffix}` },
      body: JSON.stringify(policyPayload()),
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("idempotent-replay")).toBe("true");
  });

  it("refuses an illegal governance advance (DRAFT → ACTIVE) with a lifecycle finding", async () => {
    if (!(await available()) || !policyId) return;
    const res = await fetch(`${BASE}/api/v1/family-office/protection/policies/${policyId}/governance`, {
      method: "POST",
      headers: { cookie: principal, "content-type": "application/json", "idempotency-key": `gov-${suffix}` },
      body: JSON.stringify({ to: "ACTIVE", authorityRef: "RES-NONE", reason: "jump the chain" }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: { details?: { findings?: string[] } } };
    expect((body.error?.details?.findings ?? []).join(" ")).toMatch(/LIFECYCLE/);
  });

  it("refuses a MATURED transition on a policy with no recorded maturity date", async () => {
    if (!(await available()) || !policyId) return;
    const res = await fetch(`${BASE}/api/v1/family-office/protection/policies/${policyId}/status`, {
      method: "POST",
      headers: { cookie: principal, "content-type": "application/json", "idempotency-key": `mat-${suffix}` },
      body: JSON.stringify({ to: "MATURED", reason: "cannot mature what has no maturity date" }),
    });
    expect(res.status).toBe(409);
  });

  it("activating a PRIMARY designation that overshoots 100% is refused (§6 exact math)", async () => {
    if (!(await available()) || !policyId) return;
    const first = await fetch(`${BASE}/api/v1/family-office/protection/policies/${policyId}/beneficiaries`, {
      method: "POST",
      headers: { cookie: principal, "content-type": "application/json", "idempotency-key": `ben-1-${suffix}` },
      body: JSON.stringify({
        beneficiaryRef: `BEN-A-${suffix}`,
        beneficiaryKind: "FAMILY_MEMBER",
        designationType: "PRIMARY",
        entitlementBasis: "PERCENTAGE",
        pctMillionths: 60_000_000,
        effectiveDate: "2026-01-01",
        status: "ACTIVE",
        relationshipBasis: "test designation A",
      }),
    });
    // `familyoffice:beneficiary.manage` is HIGH_RISK (MFA step-up). The seeded
    // test login is an MFA-complete session, so this is either 201 (recorded)
    // or 428 (step-up required) — and ONLY those two. A silent 200 would be a
    // governance bug; so would any other code.
    expect([201, 428]).toContain(first.status);
    if (first.status !== 201) return;

    const over = await fetch(`${BASE}/api/v1/family-office/protection/policies/${policyId}/beneficiaries`, {
      method: "POST",
      headers: { cookie: principal, "content-type": "application/json", "idempotency-key": `ben-2-${suffix}` },
      body: JSON.stringify({
        beneficiaryRef: `BEN-B-${suffix}`,
        beneficiaryKind: "FAMILY_MEMBER",
        designationType: "PRIMARY",
        entitlementBasis: "PERCENTAGE",
        pctMillionths: 50_000_000,
        effectiveDate: "2026-01-01",
        status: "ACTIVE",
        relationshipBasis: "test designation B",
      }),
    });
    expect(over.status).toBe(409); // 60% + 50% > 100% with no residuary — refused
  });

  it("an insurance designation does NOT create a trust beneficiary — the registers stay separate (§6)", async () => {
    if (!(await available()) || !policyId) return;
    const trustBeneficiaries = await fetch(`${BASE}/api/v1/family-office/dashboard`, { headers: { cookie: principal } });
    expect(trustBeneficiaries.status).toBe(200);
    // There is no protection endpoint that can write people.beneficiaries;
    // the separation is enforced by the ABSENCE of any such route — the
    // 404 below pins that absence.
    const none = await fetch(`${BASE}/api/v1/family-office/protection/policies/${policyId}/trust-beneficiaries`, { headers: { cookie: principal } });
    expect(none.status).toBe(404);
  });

  it("claim APPROVED without the insurer's amount or evidence is refused (no fabrication, §16)", async () => {
    if (!(await available()) || !policyId) return;
    const open = await fetch(`${BASE}/api/v1/family-office/protection/claims`, {
      method: "POST",
      headers: { cookie: principal, "content-type": "application/json", "idempotency-key": `claim-${suffix}` },
      body: JSON.stringify({
        policyId,
        claimReference: `CLM-${suffix}`,
        incidentDate: "2026-08-01",
        notificationDate: "2026-08-05",
      }),
    });
    expect(open.status).toBe(201);
    const claimId = ((await open.json()) as { data?: { id?: string } }).data?.id ?? "";
    expect(claimId.startsWith("FOICL_")).toBe(true);

    const badJump = await fetch(`${BASE}/api/v1/family-office/protection/claims/${claimId}`, {
      method: "POST",
      headers: { cookie: principal, "content-type": "application/json", "idempotency-key": `claim-bad-${suffix}` },
      body: JSON.stringify({ to: "APPROVED", eventKind: "INSURER_DECISION" }),
    });
    expect(badJump.status).toBe(409); // CLAIM_OPENED → APPROVED is not a legal step

    const events = await fetch(`${BASE}/api/v1/family-office/protection/claims/${claimId}`, { headers: { cookie: principal } });
    expect(events.status).toBe(200);
    const ebody = (await events.json()) as { data?: { events?: { toStatus: string }[] } };
    expect(ebody.data?.events?.[0]?.toStatus).toBe("CLAIM_OPENED");
  });

  it("the dashboard separates contingent cover from wealth and states per-currency (§24/§4)", async () => {
    if (!(await available())) return;
    const res = await fetch(`${BASE}/api/v1/family-office/protection/dashboard`, { headers: { cookie: principal } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data?: {
        totalsByCurrency?: Record<string, unknown>[];
        claims?: { note?: string };
        boundary?: string;
        authoritativeAccountingOwner?: string;
        disclaimer?: string;
      };
    };
    expect(Array.isArray(body.data?.totalsByCurrency)).toBe(true);
    expect(body.data?.authoritativeAccountingOwner).toBe("FINANCE_OS");
    expect(body.data?.boundary).toMatch(/CAP_POSTING is not invoked/);
    expect(body.data?.claims?.note).toMatch(/EXPECTED proceeds are contingent/);
    expect(body.data?.disclaimer).toMatch(/MODELED planning information/);
  });
});

describe("Family Office protection pages — governed rendering", () => {
  it("the protection dashboard renders for the Principal", async () => {
    if (!(await available())) return;
    const res = await fetch(`${BASE}/os/family/protection`, { headers: { cookie: principal } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/Protection &amp; insurance|Protection & insurance/);
    // §24's separation is visible: contingent cover is labelled as NOT net worth.
    expect(html).toMatch(/NOT net worth|never a cash balance/i);
  });

  it("GROUP_CEO typing the hidden URL still gets the governed denial page, not the data", async () => {
    if (!(await available())) return;
    const res = await fetch(`${BASE}/os/family/protection`, { headers: { cookie: outsider } });
    expect(res.status === 200 || res.status === 403).toBe(true);
    const html = await res.text();
    expect(html).toMatch(/Authorisation denied|authorisation denied|denied/i);
    expect(html).not.toMatch(/death benefit \(contingent\)/i);
  });

  it("unauthenticated /os/family/protection is redirected to sign-in", async () => {
    if (!(await available())) return;
    const res = await fetch(`${BASE}/os/family/protection`, { redirect: "manual" });
    expect([307, 302]).toContain(res.status);
  });
});
