import { and, eq, inArray, sql } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { employees, employmentEvents } from "@/db/schema";
import {
  assessWorkforceQuality,
  listOrganizations,
  observeWorkforce,
} from "@/lib/hcm-observe";
import { canonicalStatus, metric } from "./epistemics";
import type { NoeliaToolOutput, ToolInvocationContext } from "./types";

/**
 * HCM intelligence adapters (section 10 of the Noelia capability target).
 *
 * HCM remains the only workforce master. No second employee master is
 * created; compensation stays clearance-gated inside the canonical service;
 * employment-consequence recommendations require human authority. Turnover
 * and succession signals are reported ONLY where the underlying event/org
 * data exists — never invented.
 */
export class BeyuNoeliaWorkforceService {
  private requireContext(): void {
    if (!hasDatabaseTransactionContext()) {
      throw new Error("Noelia HCM service requires canonical transaction-scoped tenant context");
    }
  }

  async observe(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    this.requireContext();
    const observation = await observeWorkforce(context.principal);
    const unavailable = observation.basis === "DATA_NOT_AVAILABLE";
    return {
      headline: unavailable
        ? "Workforce observation is UNAVAILABLE: no employee master records in scope."
        : "Workforce observation assembled from the canonical HCM employee master.",
      findings: unavailable
        ? [{ label: "Headcount", value: "DATA_NOT_AVAILABLE", kind: "INFERENCE", status: "UNAVAILABLE" }]
        : [
            {
              label: "Headcount",
              value: String(observation.headcount),
              kind: "FACT",
              status: "OBSERVED",
              confidence: 0.95,
            },
            {
              label: "Active headcount",
              value: String(observation.active),
              kind: "INFERENCE",
              status: "DERIVED",
            },
            ...(observation.byEntity ?? []).map((e) => ({
              label: `Headcount · ${e.name}`,
              value: `${e.active} active of ${e.n}`,
              kind: "INFERENCE" as const,
              status: "DERIVED" as const,
            })),
            ...(observation.byStatus ?? []).map((s) => ({
              label: `By status · ${s.status}`,
              value: String(s.n),
              kind: "INFERENCE" as const,
              status: "DERIVED" as const,
            })),
          ],
      metrics: [
        metric({
          code: "WORKFORCE_HEADCOUNT",
          label: "Headcount",
          value: observation.headcount === null ? "DATA_NOT_AVAILABLE" : String(observation.headcount),
          status: canonicalStatus(observation.basis),
          confidence: observation.headcount === null ? null : 0.95,
          source: "HCM_EMPLOYEE_MASTER",
        }),
      ],
      narrative: observation.explanation?.join(" ") ?? "",
      confidence: unavailable ? 0.3 : 0.92,
    };
  }

  async organization(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    this.requireContext();
    const org = await listOrganizations(context.principal);
    const unavailable = org.basis === "DATA_NOT_AVAILABLE";
    return {
      headline: unavailable
        ? "Organizational structure is UNAVAILABLE in the authorized scope."
        : "Organizational structure assembled from the canonical org-unit registry.",
      findings: unavailable
        ? [{ label: "Org units", value: "DATA_NOT_AVAILABLE", kind: "INFERENCE", status: "UNAVAILABLE" }]
        : org.records.map((record) => ({
            label: `${record.code} · ${record.name}`,
            value: `${record.unitType}${record.parentUnitId ? ` · under ${record.parentUnitId}` : " · root"}`,
            kind: "FACT",
            status: "OBSERVED",
          })),
      metrics: [
        metric({
          code: "WORKFORCE_ORG_UNITS",
          label: "Org units",
          value: String(org.records.length),
          status: canonicalStatus(org.basis),
          source: "core.org_units",
        }),
      ],
      confidence: unavailable ? 0.3 : 0.9,
    };
  }

  async quality(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    this.requireContext();
    const assessment = await assessWorkforceQuality(context.principal);
    return {
      headline: assessment.findings.length
        ? `${assessment.findings.length} workforce data-quality finding(s).`
        : "No workforce data-quality findings in the scanned master.",
      findings: assessment.findings.map((finding) => ({
        label: `${finding.code} · ${finding.basis}`,
        value: finding.detail,
        kind: "INFERENCE",
        status: canonicalStatus(finding.basis),
      })),
      narrative: `Scanned ${assessment.scanned} master record(s); source ${assessment.source}.`,
      confidence: 0.85,
      humanReviewRequired: assessment.findings.some((f) => f.basis === "DATA_CONFLICT"),
    };
  }

  async turnover(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    this.requireContext();
    const rows = await db
      .select({
        type: employmentEvents.eventType,
        count: sql<number>`count(*)::int`,
        latest: sql<string>`max(${employmentEvents.effectiveFrom})`,
      })
      .from(employmentEvents)
      .innerJoin(employees, eq(employees.id, employmentEvents.employeeId))
      .where(and(
        inArray(employees.tenantId, context.scope.tenantIds),
        context.target.legalEntityId
          ? eq(employees.legalEntityId, context.target.legalEntityId)
          : sql`true`,
      ))
      .groupBy(employmentEvents.eventType);
    if (rows.length === 0) {
      return {
        headline: "Turnover analysis is UNAVAILABLE: no employment-event history exists in scope.",
        findings: [{
          label: "Turnover",
          value: "DATA_NOT_AVAILABLE",
          kind: "INFERENCE",
          status: "UNAVAILABLE",
        }],
        narrative: "A turnover rate computed from no events would be fabrication.",
        confidence: 0.3,
      };
    }
    const terminations = rows.find((r) => r.type === "TERMINATION")?.count ?? 0;
    const hires = rows.find((r) => r.type === "HIRE")?.count ?? 0;
    return {
      headline: "Employment-event history exists; turnover metrics are DERIVED from events.",
      findings: rows.map((row) => ({
        label: `Events · ${row.type}`,
        value: String(row.count),
        kind: "FACT",
        status: "OBSERVED",
      })),
      metrics: [
        metric({
          code: "WORKFORCE_TERMINATIONS",
          label: "Terminations",
          value: String(terminations),
          status: "OBSERVED",
          source: "people.employment_events",
        }),
        metric({
          code: "WORKFORCE_HIRES",
          label: "Hires",
          value: String(hires),
          status: "OBSERVED",
          source: "people.employment_events",
        }),
      ],
      narrative: "Rates require a ratified denominator policy; counts are reported, rates are not invented.",
      confidence: 0.85,
    };
  }

  async successionSignals(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    this.requireContext();
    const observation = await observeWorkforce(context.principal);
    if (observation.basis === "DATA_NOT_AVAILABLE") {
      return {
        headline: "Succession signals are UNAVAILABLE: no workforce data in scope.",
        findings: [{
          label: "Succession",
          value: "DATA_NOT_AVAILABLE",
          kind: "INFERENCE",
          status: "UNAVAILABLE",
        }],
        confidence: 0.3,
      };
    }
    const vacant = (observation.occupancy ?? []).filter((o) => o.vacancy > 0);
    const managerSpan = observation.managerSpanBasis === "OBSERVED" ? "OBSERVED" : "DATA_NOT_AVAILABLE";
    return {
      headline: vacant.length
        ? `${vacant.length} budgeted position(s) are vacant; succession-relevant signal.`
        : "No budgeted-position vacancies in the observed structure.",
      findings: [
        ...vacant.slice(0, 10).map((o) => ({
          label: `Vacancy · ${o.title}`,
          value: `${o.vacancy} of budget ${o.budget}`,
          kind: "FACT" as const,
          status: "OBSERVED" as const,
        })),
        {
          label: "Manager span",
          value: managerSpan,
          kind: "INFERENCE",
          status: canonicalStatus(managerSpan),
        },
      ],
      narrative: "Vacancy is an organizational fact; readiness and successor identity require human assessment and are never invented.",
      confidence: 0.8,
    };
  }
}
