/**
 * Adapter contract tests — fail-closed behavior for every registered external
 * adapter when no credentials/endpoints are configured. Constructs adapters
 * directly with a ConfigService returning undefined (NOT_CONFIGURED), so
 * Nest DI is not required.
 */
import "reflect-metadata";
import { buildTestBed, TEST_ACTOR } from "../../common/testing/test-bed";
import { AdapterRegistry, registerStubAdapters } from "./adapter-registry";
import { GovernanceAdapter } from "../../integrations/beyu/governance/governance.adapter";
import { HcmAdapter } from "../../integrations/beyu/hcm/hcm.adapter";
import { FinanceAdapter } from "../../integrations/beyu/finance/finance.adapter";
import { TaxAdapter } from "../../integrations/beyu/tax/tax.adapter";
import { NoeliaAdapter } from "../../integrations/beyu/noelia/noelia.adapter";
import { CircuitBreaker } from "./circuit-breaker";

describe("External adapter contracts — fail-closed when not configured", () => {
  let bed: any;
  let reg: AdapterRegistry;
  let gov: GovernanceAdapter;
  let hcm: HcmAdapter;
  let fin: FinanceAdapter;
  let tax: TaxAdapter;
  let noelia: NoeliaAdapter;

  beforeAll(async () => {
    bed = await buildTestBed();
    const cfg = { get: () => undefined } as any;
    const cb = new CircuitBreaker(bed.conn, bed.tenantCtx);
    reg = new AdapterRegistry();
    registerStubAdapters(reg);
    gov = new GovernanceAdapter(bed.conn, bed.tenantCtx, cb, cfg);
    hcm = new HcmAdapter(bed.conn, bed.tenantCtx, cb, cfg);
    fin = new FinanceAdapter(bed.conn, bed.tenantCtx, cb, cfg);
    tax = new TaxAdapter(bed.conn, bed.tenantCtx, cb, cfg);
    noelia = new NoeliaAdapter(bed.conn, bed.tenantCtx, cb, cfg);
  });

  it("every stub adapter reports unavailable and call() throws BLOCKED", async () => {
    const statuses = await reg.probeAll();
    expect(statuses.length).toBe(12);
    for (const s of statuses) {
      expect(s.state).toBe("unavailable");
      expect(s.missing_fields.length).toBeGreaterThan(0);
    }
    for (const a of ["nhif", "tra", "tmda", "pacs", "video_provider", "fhir_endpoint",
                     "mtuha_submission", "finance_os", "payment_gateway", "sms_gateway",
                     "email_gateway", "hive"] as const) {
      const adapter = reg.get(a);
      expect(adapter).not.toBeNull();
      await expect(adapter!.call({})).rejects.toThrow(/BLOCKED|not configured|unavailable/i);
    }
  });

  it("Governance returns DENY for high-risk with no config", async () => {
    const d = await gov.decideOrFailClosed({
      actor: mkActor(), propagation: mkProp(),
      action: "pharmacy.dispense.controlled", resourceType: "pharmacy.dispense", riskLevel: "high",
    });
    expect(d.decision).toBe("DENY");
  });

  it("Finance emits BLOCKED event with no financeEventId", async () => {
    await bed.run(async () => {
      const r = await fin.emitEvent({
        actor: mkActor(), propagation: mkProp(),
        eventType: "charge", healthResourceType: "enc", healthResourceId: null,
        facilityId: null, amount: { value: "1000", currency: "TZS" },
      });
      expect(r.accepted).toBe(false);
      expect(r.status).toBe("blocked");
      expect(r.financeEventId).toBeNull();
    });
  });

  it("Tax returns blocked with no fabricated lines/total", async () => {
    await bed.run(async () => {
      const r = await tax.determine({
        actor: mkActor(), propagation: mkProp(),
        taxableEventType: "charge", jurisdiction: "TZ", entityCode: null,
        taxpayerReference: null, amount: { value: "1000", currency: "TZS" },
        taxCategory: "medical_service", effectiveDate: new Date().toISOString(),
      });
      expect(r.determined).toBe(false);
      expect(r.status).toBe("blocked");
      expect(r.totalTax).toBeNull();
    });
  });

  it("Noelia returns blocked with no fabricated output", async () => {
    await bed.run(async () => {
      const r = await noelia.invoke({
        actor: mkActor(), propagation: mkProp(),
        capability: "clinical_decision_support", inputRef: "ref:1", riskLevel: "medium",
      });
      expect(r.blocked).toBe(true);
      expect(r.outputRef).toBeNull();
    });
  });

  it("HCM high-risk action fails closed without verified licence", async () => {
    await bed.run(async () => {
      const res = await hcm.authorizeClinicalActor({
        action: "pharmacy.dispense.controlled", facilityId: null, requiredScope: [],
      });
      expect(res.authorized).toBe(false);
    });
  });
});

function mkActor() {
  return {
    globalUserId: TEST_ACTOR.userId,
    email: "doc@beyu.health",
    tenantId: TEST_ACTOR.tenantId,
    entityCode: null, countryCode: "TZ", licenceNumber: null, practitionerId: null,
    facilityId: null, sessionId: "sess1", role: "doctor", permissions: ["rx:dispense"],
    timezone: "Africa/Dar_es_Salaam", sourceService: "health-os" as const,
  };
}
function mkProp() {
  return {
    correlationId: "cid-1", causationId: null, requestId: "rid-1",
    idempotencyKey: "idem-1", timestamp: new Date().toISOString(),
  };
}
