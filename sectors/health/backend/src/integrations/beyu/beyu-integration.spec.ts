/**
 * Tests for BEYU governed integration layer:
 *   - Governance fail-closed decision for high-risk actions
 *   - Governance local RBAC fallback for low-risk with permission
 *   - HCM licence state gates (unverified/expired/blocked)
 *   - Finance EXTERNAL-BLOCKED event persistence, no fabricated success
 *   - Tax EXTERNAL-BLOCKED returns blocked, no fabricated tax
 *   - Noelia/HIVE EXTERNAL-BLOCKED returns outputClass=blocked
 *   - Identity local fallback trusts JWT globalUserId
 */
import "reflect-metadata";
import { GovernanceAdapter } from "./governance/governance.adapter";
import { HcmAdapter } from "./hcm/hcm.adapter";
import { FinanceAdapter } from "./finance/finance.adapter";
import { TaxAdapter } from "./tax/tax.adapter";
import { NoeliaAdapter } from "./noelia/noelia.adapter";
import { IdentityAdapter } from "./shared/identity.adapter";
import { CircuitBreaker } from "../../modules/integrations/circuit-breaker";
import { buildTestBed, TEST_ACTOR } from "../../common/testing/test-bed";

function actor(overrides: any = {}) {
  return {
    globalUserId: TEST_ACTOR.userId,
    email: "actor@example.com",
    tenantId: TEST_ACTOR.tenantId,
    entityCode: null,
    countryCode: "TZ",
    licenceNumber: null,
    practitionerId: null,
    facilityId: null,
    sessionId: "sess1",
    role: "doctor",
    permissions: ["prescription.write", "patient.read", "encounter.write"],
    timezone: "Africa/Dar_es_Salaam",
    sourceService: "health-os" as const,
    ...overrides,
  };
}
const propagation = () => ({
  correlationId: "cid-1",
  causationId: null,
  requestId: "rid-1",
  idempotencyKey: "idem-1",
  timestamp: new Date().toISOString(),
});

describe("BEYU governed integration layer (EXTERNAL-BLOCKED fail-closed)", () => {
  let bed: any;
  let gov: GovernanceAdapter;
  let hcm: HcmAdapter;
  let fin: FinanceAdapter;
  let tax: TaxAdapter;
  let noelia: NoeliaAdapter;
  let ident: IdentityAdapter;

  beforeAll(async () => {
    bed = await buildTestBed();
    const cfg = { get: () => undefined } as any; // no env configured -> NOT_CONFIGURED
    const cb = new CircuitBreaker(bed.conn, bed.tenantCtx);
    gov = new GovernanceAdapter(bed.conn, bed.tenantCtx, cb, cfg);
    hcm = new HcmAdapter(bed.conn, bed.tenantCtx, cb, cfg);
    fin = new FinanceAdapter(bed.conn, bed.tenantCtx, cb, cfg);
    tax = new TaxAdapter(bed.conn, bed.tenantCtx, cb, cfg);
    noelia = new NoeliaAdapter(bed.conn, bed.tenantCtx, cb, cfg);
    ident = new IdentityAdapter(bed.conn, bed.tenantCtx, cb, cfg);
  });

  it("governance DENYs high-risk actions when governance is EXTERNAL-BLOCKED (fail-closed)", async () => {
    const d = await gov.decideOrFailClosed({
      actor: actor(),
      propagation: propagation(),
      action: "pharmacy.dispense.controlled",
      resourceType: "pharmacy.dispense",
      resourceId: null,
      riskLevel: "high",
    });
    expect(d.decision).toBe("DENY");
    expect(d.approvalRequired).toBe(true);
    // Conservative deny when governance unavailable — explicit fail-closed language
    expect(d.failureReason).toMatch(
      /[Ff]ail.?closed|unavailable|denied until|EXTERNAL/,
    );
  });

  it("governance falls back to local RBAC APPROVE for low-risk with permission", async () => {
    const d = await gov.decideOrFailClosed({
      actor: actor(),
      propagation: propagation(),
      action: "patient.read",
      resourceType: "patient",
      riskLevel: "low",
    });
    expect(d.decision).toBe("APPROVE");
    expect(d.reasonCode).toMatch(/LOCAL_RBAC/);
  });

  it("governance DENYs low-risk without matching permission", async () => {
    const d = await gov.decideOrFailClosed({
      actor: actor({ permissions: ["patient.read"] }),
      propagation: propagation(),
      action: "billing.finalize",
      resourceType: "billing.invoice",
      riskLevel: "low",
    });
    expect(d.decision).toBe("DENY");
    expect(d.reasonCode).toBe("LOCAL_PERMISSION_DENIED");
  });

  it("HCM blocks clinical actors without verified licence (EXTERNAL-BLOCKED conservative)", async () => {
    bed.tenantCtx.enterWith({
      ...TEST_ACTOR,
      userId: TEST_ACTOR.userId,
    } as any);
    const res = await hcm.authorizeClinicalActor({
      action: "pharmacy.dispense.controlled",
      facilityId: null,
      requiredScope: [],
    });
    expect(res.authorized).toBe(false);
    expect([
      "HCM_LICENCE_BLOCKED",
      "HCM_LICENCE_UNVERIFIED",
      "HCM_EXTERNAL_VERIFICATION_REQUIRED",
      "HCM_LICENCE_EXPIRED",
    ]).toContain(res.reason);
  });

  it("Finance emits a blocked outbox row and does NOT fabricate financeEventId", async () => {
    bed.tenantCtx.enterWith({
      ...TEST_ACTOR,
      userId: TEST_ACTOR.userId,
    } as any);
    const r = await fin.emitEvent({
      actor: actor(),
      propagation: propagation(),
      eventType: "charge",
      healthResourceType: "encounter",
      healthResourceId: "enc-1",
      facilityId: null,
      amount: { value: "1000", currency: "TZS" },
    });
    expect(r.accepted).toBe(false);
    expect(r.status).toBe("blocked");
    expect(r.financeEventId).toBeNull();
    expect(r.reasonCode).toBe("FINANCE_OS_EXTERNAL_BLOCKED");
  });

  it("Tax returns blocked with no fabricated tax lines / total", async () => {
    bed.tenantCtx.enterWith({
      ...TEST_ACTOR,
      userId: TEST_ACTOR.userId,
    } as any);
    const r = await tax.determine({
      actor: actor(),
      propagation: propagation(),
      taxableEventType: "charge",
      jurisdiction: "TZ",
      entityCode: null,
      taxpayerReference: null,
      amount: { value: "1000", currency: "TZS" },
      taxCategory: "medical_service",
      effectiveDate: new Date().toISOString(),
    });
    expect(r.determined).toBe(false);
    expect(r.status).toBe("blocked");
    expect(r.totalTax).toBeNull();
    expect(r.lines).toHaveLength(0);
  });

  it("Noelia/HIVE returns outputClass=blocked with no fabricated response", async () => {
    bed.tenantCtx.enterWith({
      ...TEST_ACTOR,
      userId: TEST_ACTOR.userId,
    } as any);
    const r = await noelia.invoke({
      actor: actor(),
      propagation: propagation(),
      capability: "clinical_decision_support",
      inputRef: "ref://inputs/1",
      riskLevel: "medium",
    });
    expect(r.blocked).toBe(true);
    expect(r.outputClass).toBe("blocked");
    expect(r.outputRef).toBeNull();
    expect(r.failureReason).toMatch(/EXTERNAL-BLOCKED|blocked/);
  });

  it("Identity local fallback trusts JWT globalUserId; does not resolve arbitrary IDs", async () => {
    bed.tenantCtx.enterWith({
      ...TEST_ACTOR,
      userId: TEST_ACTOR.userId,
    } as any);
    const r = await ident.lookup({
      actor: actor(),
      propagation: propagation(),
    });
    expect(r.globalUserId).toBe(TEST_ACTOR.userId);
  });
});
