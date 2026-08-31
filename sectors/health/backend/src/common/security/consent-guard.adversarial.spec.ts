/**
 * consent-guard.adversarial.spec.ts
 *
 * Adversarial coverage for ConsentGuard:
 *   - routes without @RequiresConsent pass through (no consent check)
 *   - routes with @RequiresConsent deny (403) when ConsentService.assert returns false
 *   - routes with @RequiresConsent proceed (200) when consent asserted
 *   - missing patient id returns CONSENT_PATIENT_REQUIRED (422)
 *   - custom patientIdParam resolves from query string
 */
import { Test, TestingModule } from "@nestjs/testing";
import { ExecutionContext, ForbiddenException, UnprocessableEntityException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConsentGuard, RequiresConsent } from "./consent.guard";
import { ConsentService } from "../../modules/consent/consent.service";

describe("ConsentGuard adversarial", () => {
  let guard: ConsentGuard;
  let consentService: { assert: jest.Mock };

  beforeEach(async () => {
    consentService = { assert: jest.fn() };
    const m: TestingModule = await Test.createTestingModule({
      providers: [
        ConsentGuard,
        Reflector,
        { provide: ConsentService, useValue: consentService },
      ],
    }).compile();
    guard = m.get(ConsentGuard);
  });

  const ctxWith = (handler: any, request: any): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
    }) as any;

  it("PASS: route without @RequiresConsent proceeds without calling assert", async () => {
    class C { @RequiresConsent("a","b") marked(){} unmarked(){} }
    consentService.assert.mockResolvedValue(false);
    const ok = await guard.canActivate(ctxWith(new C().unmarked, { params: {}, query: {}, body: {}, user: { tenantId: "t1" } }));
    expect(ok).toBe(true);
    expect(consentService.assert).not.toHaveBeenCalled();
  });

  it("BLOCK: @RequiresConsent on route but ConsentService returns false → ForbiddenException (CONSENT_DENIED)", async () => {
    class C { @RequiresConsent("clinical:read", "observations") get(){} }
    consentService.assert.mockResolvedValue(false);
    await expect(
      guard.canActivate(ctxWith(new C().get, { params: { patientId: "p1" }, query: {}, body: {}, user: { tenantId: "t1" } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("PASS: @RequiresConsent with consent asserted → proceeds", async () => {
    class C { @RequiresConsent("clinical:read", "observations") get(){} }
    consentService.assert.mockResolvedValue(true);
    const ok = await guard.canActivate(ctxWith(new C().get, { params: { patientId: "p1" }, query: {}, body: {}, user: { tenantId: "t1" } }));
    expect(ok).toBe(true);
    expect(consentService.assert).toHaveBeenCalledWith("p1", "clinical:read", "observations", "t1");
  });

  it("BLOCK: @RequiresConsent missing patient id in params/query/body → UnprocessableEntityException", async () => {
    class C { @RequiresConsent("clinical:read", "observations") get(){} }
    await expect(
      guard.canActivate(ctxWith(new C().get, { params: {}, query: {}, body: {}, user: { tenantId: "t1" } })),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("PASS: @RequiresConsent with custom patientIdParam (query param) is resolved", async () => {
    class C { @RequiresConsent("fhir:read", "conditions", "patient") get(){} }
    consentService.assert.mockResolvedValue(true);
    const ok = await guard.canActivate(ctxWith(new C().get, { params: {}, query: { patient: "p2" }, body: {}, user: { tenantId: "t1" } }));
    expect(ok).toBe(true);
    expect(consentService.assert).toHaveBeenCalledWith("p2", "fhir:read", "conditions", "t1");
  });
});
