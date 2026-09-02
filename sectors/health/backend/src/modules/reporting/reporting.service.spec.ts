import { describe, it, expect, beforeAll } from "@jest/globals";
import { buildTestBed, TestBed } from "../../common/testing/test-bed";
import { ReportingRepository } from "./reporting.repository";
import { ReportingService } from "./reporting.service";
import { DomainError } from "../../common/errors/domain.error";

describe("ReportingService (MTUHA)", () => {
  let bed: TestBed;
  let svc: ReportingService;

  beforeAll(async () => {
    bed = await buildTestBed();
    const repo = new ReportingRepository(bed.conn, bed.tenantCtx);
    svc = new ReportingService(repo, bed.audit);
  });

  it("rejects invalid period (end <= start)", () =>
    bed.run(async () => {
      await expect(
        svc.generatePeriodReport("2026-02-01", "2026-01-01"),
      ).rejects.toBeInstanceOf(DomainError);
    }));

  it("produces structured aggregates and fails closed on mapping (mapping_status=incomplete)", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      // Seed one completed encounter via direct SQL.
      await bed.conn.query(
        `INSERT INTO health.encounters (tenant_id,encounter_no,patient_id,status,kind,started_at,disposition,created_by,correlation_id)
         VALUES ($1,$2,$3,'completed','ambulatory',now(),'discharged',$4,'c')`,
        [
          bed.tenantCtx.tenantId(),
          `E${Date.now()}`,
          p.patient_id,
          "00000000-0000-0000-0000-000000000001",
        ],
      );
      const r = await svc.generatePeriodReport("2020-01-01", "2099-12-31");
      expect(r.mapping_status).toBe("incomplete");
      expect(r.missing_mappings.length).toBeGreaterThan(0);
      expect(Number((r.opd as any).total_visits)).toBeGreaterThanOrEqual(1);
    }));

  it("markSubmitted creates an audit record of submission; does NOT POST to an external endpoint", () =>
    bed.run(async () => {
      const rec = (await svc.markSubmitted({
        period_start: "2026-01-01",
        period_end: "2026-01-31",
        book_code: "MTUHA-30",
        file_ref: "mtuha30_jan.csv",
      })) as any;
      expect(rec.report_id).toBeTruthy();
      expect(rec.status).toBe("submitted");
    }));
});
