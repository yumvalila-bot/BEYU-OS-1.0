/**
 * Locks in the fail-closed contract of AI governance.
 *
 * `AiGovernanceService.invoke()` never returns model output in this build. Every
 * branch of its HIVE routing sets blocked = true:
 *
 *   - hive adapter not registered          -> blocked
 *   - probe().state !== "available"        -> blocked
 *   - probe available but no credentials   -> blocked ("Real call would go here")
 *   - any thrown error                     -> blocked, status = "failed"
 *
 * The registered hive adapter is a stub whose probe() always reports
 * "unavailable" and whose call() always throws, so no model is ever invoked.
 * Consequently `output` is always null and `confidence` is always null — that is
 * the intended "not evaluated" state, not a wiring defect.
 *
 * The schema says so explicitly (011_domain_governance.up.sql):
 *     confidence numeric,  -- NULL if model does not produce calibrated confidence
 *     CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
 *
 * These tests guard against someone "fixing" the permanent nulls by inventing a
 * value. Fabricated confidence or fabricated model output would be a clinical
 * safety defect, so null must stay null until a real HIVE call exists.
 */
import "reflect-metadata";
import { buildTestBed } from "../../common/testing/test-bed";
import { AiGovernanceService } from "./ai-governance.service";
import {
  AdapterRegistry,
  registerStubAdapters,
} from "../integrations/adapter-registry";

describe("AI governance never fabricates output or confidence (fail-closed)", () => {
  let bed: any;
  let ai: AiGovernanceService;

  beforeAll(async () => {
    bed = await buildTestBed();
    const reg = new AdapterRegistry();
    registerStubAdapters(reg);
    ai = new AiGovernanceService(bed.conn, bed.tenantCtx, bed.audit, reg);
  });

  it.each(["low", "medium", "high", "critical"] as const)(
    "risk=%s: invocation is blocked and returns null output",
    async (riskClass) => {
      await bed.run(async () => {
        const inv = await ai.invoke({
          taskType: "differential_diagnosis",
          input: { note: `probe-${riskClass}` },
          riskClass,
        });
        expect(inv.blocked).toBe(true);
        expect(inv.output).toBeNull();
        expect(typeof inv.reason).toBe("string");
        expect(inv.reason).toMatch(/HIVE/i);
      });
    },
  );

  it("persists NULL confidence and no fabricated output payload", async () => {
    await bed.run(async () => {
      const inv = await ai.invoke({
        taskType: "radiology_summary",
        input: { note: "persisted-state-probe" },
        riskClass: "critical",
      });
      const rows: any = await bed.conn.query(
        `SELECT status, output, confidence, human_approval_status, error_code
           FROM health.ai_invocations
          WHERE invocation_id = $1`,
        [inv.invocation_id],
      );
      const row = (rows.rows ?? rows)[0];
      expect(row).toBeDefined();
      expect(row.status).toBe("blocked");
      // null confidence is the schema-sanctioned "not evaluated" state.
      expect(row.confidence).toBeNull();
      // No model output was invented: the payload is an empty object.
      const parsed =
        typeof row.output === "string" ? JSON.parse(row.output) : row.output;
      expect(parsed).toEqual({});
      expect(row.error_code).toMatch(/HIVE/i);
      // Critical risk must land in human review, never auto-approved.
      expect(row.human_approval_status).toBe("pending");
    });
  });

  it("records the invocation before blocking, so the attempt is auditable", async () => {
    await bed.run(async () => {
      const inv = await ai.invoke({
        taskType: "triage_suggestion",
        input: { note: "audit-probe" },
      });
      expect(inv.invocation_id).toBeTruthy();
      const rows: any = await bed.conn.query(
        `SELECT count(*)::int AS n FROM health.audit_log
          WHERE resource_type='ai_invocation' AND resource_id=$1`,
        [inv.invocation_id],
      );
      expect((rows.rows ?? rows)[0].n).toBeGreaterThan(0);
    });
  });
});
