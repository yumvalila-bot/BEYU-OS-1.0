/**
 * Locks in a load-bearing security property of the endpoint tier model.
 *
 * `classifyEndpoint()` accepts four trailing flags — hasGovernance, hasHcm,
 * hasMfa, hasClinicalSafety — and DELIBERATELY does not consult them. They are
 * supplied by endpoint-tier-matrix.spec.ts from decorators it parsed out of the
 * controller source, i.e. they describe what the code ALREADY does.
 *
 * The tier model must describe what the code is REQUIRED to do, derived only
 * from method + path + controller. The matrix then compares the two:
 *
 *     if (r.governanceAuthorization && !p.hasGovernance) -> gap
 *
 * If `classifyEndpoint` consumed those flags, `required` would become a copy of
 * `observed` and every such comparison would collapse to
 * `observed && !observed` === false. The audit would still run, still pass, and
 * would never again report a missing @RequiresGovernance,
 * @RequireHcmPractitioner, @RequiresMfaStepUp or @RequiresClinicalSafety.
 *
 * These tests exist so that "helpfully" wiring the parameters in fails CI
 * instead of silently disarming the control.
 */
import {
  classifyEndpoint,
  EndpointClassification,
} from "./endpoint-tier.classification";

/** Representative endpoint per tier, chosen to exercise each required control. */
const CASES: Array<{
  label: string;
  method: string;
  path: string;
  controller: string;
}> = [
  {
    label: "PUBLIC health",
    method: "GET",
    path: "/health",
    controller: "health",
  },
  {
    label: "FINANCIAL payment",
    method: "POST",
    path: "/billing/payments",
    controller: "billing",
  },
  {
    label: "CLINICAL prescription",
    method: "POST",
    path: "/clinical/prescriptions",
    controller: "clinical",
  },
  {
    label: "EXTERNAL_INTEGRATION",
    method: "POST",
    path: "/integrations/sync",
    controller: "integrations",
  },
  {
    label: "ADMINISTRATIVE",
    method: "POST",
    path: "/tenants/settings",
    controller: "tenants",
  },
  {
    label: "unknown path (conservative default)",
    method: "DELETE",
    path: "/something/unclassified",
    controller: "misc",
  },
];

describe("endpoint tier model is independent of observed decorators", () => {
  it.each(CASES)(
    "$label: classification is identical whether the observed flags are false or true",
    ({ method, path, controller }) => {
      const noneObserved = classifyEndpoint(
        method,
        path,
        controller,
        [],
        false,
        false,
        false,
        false,
        false,
      );
      const allObserved = classifyEndpoint(
        method,
        path,
        controller,
        [],
        false,
        true,
        true,
        true,
        true,
      );
      expect(allObserved).toEqual(noneObserved);
    },
  );

  it("derives governance/HCM/MFA/clinical-safety requirements from the path, not from the flags", () => {
    const cls = classifyEndpoint(
      "POST",
      "/billing/payments",
      "billing",
      [],
      false,
      false,
      false,
      false,
      false,
    );
    expect(cls.tier).toBe("FINANCIAL");
    expect(cls.required.governanceAuthorization).toBe(true);
    expect(cls.required.idempotency).toBe(true);
    expect(cls.required.audit).toBe(true);
  });

  it("still reports a gap when a required decorator is absent (the audit is not vacuous)", () => {
    // Mirrors the comparison in endpoint-tier-matrix.spec.ts assess().
    const cls: EndpointClassification = classifyEndpoint(
      "POST",
      "/billing/payments",
      "billing",
      [],
      false,
      false, // @RequiresGovernance NOT present on the endpoint
      false,
      false,
      false,
    );
    const observedHasGovernance = false;
    const gapReported =
      cls.required.governanceAuthorization && !observedHasGovernance;
    expect(gapReported).toBe(true);
  });

  it("reports no governance gap once the decorator is present", () => {
    const cls = classifyEndpoint(
      "POST",
      "/billing/payments",
      "billing",
      [],
      false,
      true, // @RequiresGovernance present
      false,
      false,
      false,
    );
    const observedHasGovernance = true;
    expect(cls.required.governanceAuthorization && !observedHasGovernance).toBe(
      false,
    );
  });
});
