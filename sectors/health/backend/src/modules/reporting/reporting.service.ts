import { Injectable } from "@nestjs/common";
import { ReportingRepository } from "./reporting.repository";
import { DomainError } from "../../common/errors/domain.error";
import { AuditService } from "../audit/audit.service";

/**
 * MTUHA (Tanzania) reporting service.
 *
 * CRITICAL: We do NOT invent MTUHA book codes, line numbers, or submission
 * endpoints. The aggregation layer produces deterministic, structured totals
 * for a reporting period. Mapping to specific MTUHA book cells is deferred to
 * an explicit, typed configuration (`MtuhaBookMapping`) and external adapters.
 *
 * - `generatePeriodReport()` returns all aggregations for a period without
 *   submitting anything.
 * - `markSubmitted()` records that a report file/reference has been delivered
 *   (via an external channel) so re-submission can be detected. Live
 *   electronic submission to MOH/M-TUHA endpoints is BLOCKED until official
 *   endpoint specifications + credentials are available.
 *
 * Missing mappings cause the report to be returned with `mapping_status:
 * 'incomplete'` rather than fabricating codes.
 */
export interface PeriodReport {
  period_start: string;
  period_end: string;
  opd: Record<string, unknown>;
  lab: any[];
  imaging: any[];
  pharmacy: any[];
  ambulance: any[];
  mapping_status: "complete" | "incomplete";
  missing_mappings: string[];
}

@Injectable()
export class ReportingService {
  constructor(
    private readonly repo: ReportingRepository,
    private readonly audit: AuditService,
  ) {}

  async generatePeriodReport(
    periodStart: string,
    periodEnd: string,
  ): Promise<PeriodReport> {
    if (!periodStart || !periodEnd)
      throw DomainError.validation("period_start / period_end required");
    if (new Date(periodEnd) <= new Date(periodStart))
      throw DomainError.validation("period_end must be after period_start");
    return this.repo.withIsolation(async (tx) => {
      const opd = await this.repo.opdHeadcount(periodStart, periodEnd, tx);
      const lab = await this.repo.labVolume(periodStart, periodEnd, tx);
      const imaging = await this.repo.imagingVolume(periodStart, periodEnd, tx);
      const pharmacy = await this.repo.pharmacyDispenses(
        periodStart,
        periodEnd,
        tx,
      );
      const ambulance = await this.repo.ambulanceVolume(
        periodStart,
        periodEnd,
        tx,
      );
      // MTUHA book-code mapping is intentionally empty; integrator must supply.
      // Failing closed — no invented codes.
      const missing = ["mtuha.book30_mapping", "mtuha.book50_mapping"];
      const report: PeriodReport = {
        period_start: periodStart,
        period_end: periodEnd,
        opd: opd ?? {},
        lab,
        imaging,
        pharmacy,
        ambulance,
        mapping_status: "incomplete",
        missing_mappings: missing,
      };
      await this.audit.record(tx, {
        operation: "reporting.mtuha.generate",
        resourceType: "mtuha_report",
        resourceId: `${periodStart}:${periodEnd}`,
        after: { period_start: periodStart, period_end: periodEnd },
      });
      return report;
    });
  }

  async markSubmitted(input: {
    period_start: string;
    period_end: string;
    book_code: string;
    file_ref?: string;
  }) {
    return this.repo.withIsolation(async (tx) => {
      const rec = await this.repo.recordReport(
        { ...input, status: "submitted" },
        tx,
      );
      await this.audit.record(tx, {
        operation: "reporting.mtuha.submitted",
        resourceType: "mtuha_report",
        resourceId: rec.report_id,
        after: rec,
      });
      return rec;
    });
  }

  listReports(periodStart: string, periodEnd: string) {
    return this.repo.listReports(periodStart, periodEnd);
  }
}
