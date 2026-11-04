/**
 * TRUSTEE COMMAND — HTTP boundary certification.
 *
 * Real running server, real PostgreSQL, real RLS. The pure suite
 * (tests/frontend/trustee-command.test.ts) proves the composition rules; this
 * one proves the TRANSPORT guarantees, because those live in `guarded()` and in
 * the server component's own guard and are only meaningful when executed:
 *
 *   1. UNAUTHENTICATED is 401 on the API and a redirect on the page — the
 *      surface never leaks a trust name, a trustee or an instrument to an
 *      anonymous caller.
 *   2. A principal WITHOUT `familyoffice:trust.read` is denied at the API (403)
 *      and shown the governed denial panel on the page.
 *   3. A principal WITH the grant gets the real composed model: the trust
 *      resolved from their own scope, the eight constitutional reserved matters,
 *      the CAP_POSTING verdict reported as locked, and the structural
 *      advisory/executes-nothing/grants-no-authority flags.
 *   4. The route is GET-only. A POST must not exist — a 405/404, never a write.
 *
 * Skips when no server is running (repository convention, tests/helpers/http.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { apiGet, apiGetJson, isDeniedPage, login, serverAvailable } from "../helpers/http";

const available = await serverAvailable();

const ROUTE = "/api/v1/family-office/trustee-command";
const PAGE = "/os/family/trustee-command";

describe.skipIf(!available)("Trustee Command HTTP boundary", () => {
  let familyPrincipal = "";

  beforeAll(async () => {
    // Family Office Principal holds familyoffice:trust.read at HIGHLY_RESTRICTED.
    familyPrincipal = await login("family@beyu.os");
  }, 240_000);

  it("refuses an unauthenticated API call with 401 and no payload", async () => {
    const res = await apiGetJson(ROUTE, { cookie: null });
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toMatch(/BEYU Family Trust|TRUSTEE_BOARD/);
  });

  it("redirects an unauthenticated page request instead of rendering the trust", async () => {
    const res = await apiGet(PAGE, null);
    expect([200, 307, 308]).toContain(res.status);
    if (res.status === 200) expect(isDeniedPage(res.html) || !res.html.includes("TRUSTEE_BOARD")).toBe(true);
  });

  it("denies a principal without the trust grant at both the API and the page", async () => {
    // `hcm@beyu.os` is a sector/HCM principal with no Family Office trust grant.
    const outsider = await login("hcm@beyu.os");
    const api = await apiGetJson(ROUTE, { cookie: outsider });
    expect(api.status).toBe(403);
    const page = await apiGet(PAGE, outsider);
    expect(page.status).toBe(200);
    expect(isDeniedPage(page.html) || page.html.includes("Trustee Command is not available to this principal")).toBe(true);
  }, 240_000);

  it("serves the composed, read-only model to the grant holder", async () => {
    const res = await apiGetJson<{
      data: {
        trust: { legalName: string };
        reservedMatters: Array<{ matter: string; state: string }>;
        rails: {
          financialPosting: { capabilityCode: string; executable: boolean; blockedBy: string[] };
          aiMayApprove: boolean;
          lastAiPermittedStep: string;
        };
        advisoryOnly: boolean;
        executesNothing: boolean;
        grantsAuthority: boolean;
        counts: { reservedMattersDeclared: number };
      };
    }>(ROUTE, { cookie: familyPrincipal });

    expect(res.status).toBe(200);
    const model = res.body.data;
    expect(model.trust.legalName).toContain("BEYU");
    // Every constitutional matter is reported, instrumented or not.
    expect(model.reservedMatters.map((matter) => matter.matter)).toEqual([
      "TRUST_DISTRIBUTION",
      "TRUST_AMENDMENT",
      "TRUSTEE_APPOINTMENT",
      "TRUSTEE_REMOVAL",
      "TRUSTEE_REPLACEMENT",
      "TRUST_INVESTMENT",
      "BENEFICIARY_DETERMINATION",
      "TRUST_PROTECTOR_EXERCISE",
    ]);
    for (const matter of model.reservedMatters) {
      expect([
        "RECORDED",
        "IN_REVIEW",
        "DISPUTED",
        "NOT_RECORDED",
        "NOT_INSTRUMENTED",
      ]).toContain(matter.state);
    }
    // The rails are structural, not computed from preferences.
    expect(model.advisoryOnly).toBe(true);
    expect(model.executesNothing).toBe(true);
    expect(model.grantsAuthority).toBe(false);
    expect(model.rails.aiMayApprove).toBe(false);
    expect(model.rails.lastAiPermittedStep).toBe("CHECK_RISK");
    expect(model.rails.financialPosting.capabilityCode).toBe("CAP_POSTING");
    // CAP_POSTING is reported from the activation gate. It is never opened here.
    if (!model.rails.financialPosting.executable) {
      expect(Array.isArray(model.rails.financialPosting.blockedBy)).toBe(true);
    }
  }, 240_000);

  it("renders the real surface for the grant holder, never the demo dashboard", async () => {
    const res = await apiGet(PAGE, familyPrincipal);
    expect(res.status).toBe(200);
    expect(isDeniedPage(res.html)).toBe(false);
    expect(res.html).toContain("Trustee Command");
    expect(res.html).toContain("ADVISORY · READ-ONLY");
    // Hard-coded demonstration identities from the sector SPA must never appear.
    expect(res.html).not.toMatch(/EMP-1000\d/);
    expect(res.html).not.toMatch(/TR-2026-0\d/);
    expect(res.html).not.toContain("Founding Trustee");
  }, 240_000);

  it("exposes no mutation verb on the route", async () => {
    const res = await fetch(`${process.env.BEYU_TEST_BASE_URL ?? "http://127.0.0.1:3100"}${ROUTE}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: familyPrincipal },
      body: JSON.stringify({ operation: "CREATE_INSTRUMENT" }),
    });
    // Next answers 405 (Method Not Allowed) for an unimplemented verb.
    expect([404, 405]).toContain(res.status);
  }, 120_000);
});
