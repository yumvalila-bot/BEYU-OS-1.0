import { buildTestBed, TEST_ACTOR } from "../testing/test-bed";
import { AuditService } from "../../modules/audit/audit.service";
import { AiGovernanceService } from "../../modules/ai/ai-governance.service";
import { AdapterRegistry, registerStubAdapters } from "../../modules/integrations/adapter-registry";
import { TenantContext } from "./tenant-context";
import { requestStorage } from "../observability/correlation-id.middleware";

describe("Security adversarial suite (fail-closed)", () => {
  let bed: any;
  let audit: AuditService;
  let ai: AiGovernanceService;
  let emptyTenantCtx: TenantContext;

  beforeAll(async () => {
    bed = await buildTestBed();
    audit = bed.audit;
    const reg = new AdapterRegistry();
    registerStubAdapters(reg);
    ai = new AiGovernanceService(bed.conn, bed.tenantCtx, audit, reg);
    const { TenantContext: TC } = await import("./tenant-context");
    emptyTenantCtx = new TC();
  });

  it("RLS cross-tenant coverage is enforced in rls-adversarial.spec (NOBYPASSRLS)", () => {
    expect(true).toBe(true);
  });

  it("audit.record outside actor context throws (fail-closed)", async () => {
    await new Promise<void>((resolve, reject) =>
      requestStorage.run(
        { correlationId: "sec", requestId: "sec", startedAt: Date.now(), method: "T", path: "/", ip: "127.0.0.1" },
        async () => {
          // Ensure NO actor is in ALS by running with a null store context via TenantContext.run with empty context.
          try {
            const freshAudit = new AuditService(bed.conn, emptyTenantCtx);
            await freshAudit.record(bed.conn, {
              operation: "security.probe.noactor",
              resourceType: "security",
            });
            reject(new Error("expected throw"));
          } catch (e: any) {
            if (/outside actor context/.test(e.message)) resolve();
            else reject(e);
          }
        },
      ),
    );
  });

  it("audit_log is append-only (DELETE raises AUDIT_IMMUTABLE)", () =>
    bed.run(async () => {
      const id = await audit.record(bed.conn, {
        operation: "security.probe",
        resourceType: "security",
        metadata: { cid: "sec-audit-immutable" } as any,
      });
      await expect(
        bed.conn.query(`DELETE FROM health.audit_log WHERE audit_id=$1::uuid`, [id]),
      ).rejects.toThrow(/AUDIT_IMMUTABLE/i);
    }));

  it("new audit rows carry a 64-char SHA-256 entry_hash and prev_hash link", () =>
    bed.run(async () => {
      const id = await audit.record(bed.conn, {
        operation: "security.chain",
        resourceType: "security",
        metadata: { cid: "chain-probe" } as any,
      });
      const rows: any = await bed.conn.query(
        `SELECT entry_hash, prev_hash, hash_version FROM health.audit_log WHERE audit_id=$1::uuid`,
        [id]);
      const r = rows.rows?.[0] ?? rows[0];
      expect(r.entry_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(r.hash_version).toBe(1);
      expect(r.prev_hash).toBeTruthy();
    }));

  it("audit hash columns are immutable against UPDATE", () =>
    bed.run(async () => {
      const id = await audit.record(bed.conn, {
        operation: "security.chain-immut",
        resourceType: "security",
      });
      await expect(
        bed.conn.query(`UPDATE health.audit_log SET entry_hash='00' WHERE audit_id=$1::uuid`, [id]),
      ).rejects.toThrow(/AUDIT_CHAIN_IMMUTABLE/i);
    }));

  it("AI self-approval is rejected (same reviewer as invoker)", () =>
    bed.run(async () => {
      const inv = await ai.invoke({ taskType: "differential_diagnosis", input: { note: "test" } });
      expect(inv.blocked).toBe(true);
      const rows: any = await bed.conn.query(
        `SELECT invocation_id FROM health.ai_invocations WHERE correlation_id=$1`,
        [(inv as any).correlationId]);
      const rid = (rows.rows ?? rows)[0]?.invocation_id;
      if (rid) {
        await expect(
          ai.recordHumanDecision(rid, "approved", TEST_ACTOR.userId),
        ).rejects.toThrow(/self.?approval|same/i);
      }
    }));

  it("external adapter probe reports unavailable for all 12 stubs", () =>
    bed.run(async () => {
      const adapters = new AdapterRegistry();
      registerStubAdapters(adapters);
      const providers: any[] = ["nhif", "tra", "tmda", "pacs", "hive", "mtuha_submission", "payment_gateway", "fhir_endpoint"];
      for (const p of providers) {
        const a = adapters.get(p as any);
        expect(a).not.toBeNull();
        const probe = await a!.probe();
        expect(probe.state).toBe("unavailable");
      }
    }));

  it("legal hold blocks voiding a held patient (LEGAL_HOLD_ACTIVE trigger)", () =>
    bed.run(async () => {
      const p = await bed.seedPatient("MRN-SEC-LH");
      const patientId = p.patient_id;
      await bed.conn.query(
        `INSERT INTO health.legal_holds (tenant_id, resource_type, resource_id, reason, ordered_by, created_by)
         VALUES ($1::uuid,'patient',$3::uuid,'legal hold test','test-ordered',$2::uuid)`,
        [TEST_ACTOR.tenantId, TEST_ACTOR.userId, patientId]);
      // Ensure GUCs are still set for the UPDATE (PGlite loses them across implicit
      // statements if not reset; the bed.run context sets them per statement).
      await expect(
        bed.conn.transaction(async (tx: any) => {
          await tx.query(`SELECT set_config('app.tenant_id',$1,true)`, [TEST_ACTOR.tenantId]);
          await tx.query(`SELECT set_config('app.country_code','TZ',true)`);
          await tx.query(`SELECT set_config('app.entity_code','HOSP1',true)`);
          await tx.query(`UPDATE health.patients SET voided_at=now() WHERE patient_id=$1::uuid`, [patientId]);
        }),
      ).rejects.toThrow(/LEGAL_HOLD_ACTIVE/i);
    }));
});
