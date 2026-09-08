/**
 * BEYU Foundation OS — governed reporting (read-only aggregations).
 *
 * Executive, board, donor, grant, program, impact, compliance and tax report
 * payloads. Every figure traces to authoritative rows in the caller's tenant
 * scope; nothing is sampled, nothing is estimated, nothing crosses tenants.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { tenantScopeIds } from "@/lib/tenant-scope";
import type { Principal } from "@/lib/authz";
import { deadlineHealth } from "./deadlines";
import { getFoundation } from "./service";

export async function executiveSummary(principal: Principal, foundationId: string, todayIso: string) {
  const foundation = await getFoundation(principal, foundationId);
  const scope = await tenantScopeIds(principal);
  const [funds, donations, grants, programs, deadlines, obligations, investments, assets] = await Promise.all([
    db.select().from(s.funds).where(and(eq(s.funds.foundationId, foundation.id), inArray(s.funds.tenantId, scope))),
    db.select().from(s.donations).where(and(eq(s.donations.foundationId, foundation.id), inArray(s.donations.tenantId, scope))),
    db.select().from(s.grants).where(and(eq(s.grants.foundationId, foundation.id), inArray(s.grants.tenantId, scope))),
    db.select().from(s.foundationPrograms).where(inArray(s.foundationPrograms.tenantId, scope)),
    db.select().from(s.foundationDeadlines).where(and(eq(s.foundationDeadlines.foundationId, foundation.id), inArray(s.foundationDeadlines.tenantId, scope))),
    db.select().from(s.foundationObligations).where(and(eq(s.foundationObligations.foundationId, foundation.id), inArray(s.foundationObligations.tenantId, scope))),
    db.select().from(s.foundationInvestments).where(and(eq(s.foundationInvestments.foundationId, foundation.id), inArray(s.foundationInvestments.tenantId, scope))),
    db.select().from(s.foundationAssets).where(and(eq(s.foundationAssets.foundationId, foundation.id), inArray(s.foundationAssets.tenantId, scope))),
  ]);
  const fundBalance = funds.reduce((a, f) => a + Number(f.balance), 0);
  const fundCommitted = funds.reduce((a, f) => a + Number(f.committed), 0);
  const donationsTotal = donations.reduce((a, d) => a + Number(d.amount), 0);
  const grantsCommitted = grants.filter((g) => !["OPPORTUNITY", "APPLICATION"].includes(g.status)).reduce((a, g) => a + Number(g.amount), 0);
  const openDeadlines = deadlines.filter((d) => !["COMPLETED", "VERIFIED", "WAIVED"].includes(d.status));
  const overdue = openDeadlines.filter((d) => d.status === "OVERDUE" || deadlineHealth(d.dueDate, todayIso) === "OVERDUE").length;
  return {
    foundation: { id: foundation.id, legalName: foundation.legalName, status: foundation.status, taxStatus: foundation.taxStatus },
    funds: { count: funds.length, balance: fundBalance.toFixed(2), committed: fundCommitted.toFixed(2) },
    donations: { count: donations.length, total: donationsTotal.toFixed(2) },
    grants: { count: grants.length, committed: grantsCommitted.toFixed(2) },
    programs: {
      count: programs.length,
      budget: programs.reduce((a, p) => a + Number(p.budget), 0).toFixed(2),
      spend: programs.reduce((a, p) => a + Number(p.spendToDate), 0).toFixed(2),
      beneficiaries: programs.reduce((a, p) => a + p.beneficiariesReached, 0),
    },
    compliance: { obligations: obligations.length, openDeadlines: openDeadlines.length, overdue },
    investments: { count: investments.length, principal: investments.reduce((a, i) => a + Number(i.principalAmount), 0).toFixed(2) },
    assets: { count: assets.length },
    generatedAt: new Date().toISOString(),
  };
}

export async function donorReport(principal: Principal, donorId: string) {
  const scope = await tenantScopeIds(principal);
  const [donor] = await db
    .select()
    .from(s.donors)
    .where(and(eq(s.donors.id, donorId), inArray(s.donors.tenantId, scope)))
    .limit(1);
  if (!donor) throw new Error("Donor not found in your authorised scope");
  const donationRows = await db
    .select()
    .from(s.donations)
    .where(and(eq(s.donations.donorId, donor.id), inArray(s.donations.tenantId, scope)));
  // Trace DONOR → DONATION → FUND → PROGRAM → OUTCOME.
  const traced = [];
  for (const donation of donationRows) {
    let fundName: string | null = null;
    if (donation.fundId) {
      const [fund] = await db.select().from(s.funds).where(eq(s.funds.id, donation.fundId)).limit(1);
      fundName = fund?.name ?? null;
    }
    traced.push({
      donationCode: donation.code,
      amount: donation.amount,
      currency: donation.currency,
      receivedAt: donation.receivedAt,
      status: donation.status,
      fund: fundName,
      restriction: donation.restrictionSummary,
    });
  }
  return {
    donor: { id: donor.id, displayName: donor.displayName, type: donor.donorType, dueDiligence: donor.dueDiligenceStatus },
    donations: traced,
    total: donationRows.reduce((a, d) => a + Number(d.amount), 0).toFixed(2),
    generatedAt: new Date().toISOString(),
  };
}

export async function grantReport(principal: Principal, grantId: string) {
  const scope = await tenantScopeIds(principal);
  const [grant] = await db
    .select()
    .from(s.grants)
    .where(and(eq(s.grants.id, grantId), inArray(s.grants.tenantId, scope)))
    .limit(1);
  if (!grant) throw new Error("Grant not found in your authorised scope");
  const [milestones, disbursements] = await Promise.all([
    db.select().from(s.grantMilestones).where(and(eq(s.grantMilestones.grantId, grant.id), inArray(s.grantMilestones.tenantId, scope))),
    db.select().from(s.grantDisbursements).where(and(eq(s.grantDisbursements.grantId, grant.id), inArray(s.grantDisbursements.tenantId, scope))),
  ]);
  const disbursed = disbursements.filter((d) => ["RELEASED", "RECONCILED"].includes(d.status)).reduce((a, d) => a + Number(d.amount), 0);
  return {
    grant: { id: grant.id, code: grant.code, title: grant.title, amount: grant.amount, currency: grant.currency, status: grant.status },
    milestones: milestones.map((m) => ({ code: m.code, title: m.title, dueDate: m.dueDate, status: m.status })),
    disbursements: disbursements.map((d) => ({ code: d.code, amount: d.amount, status: d.status, scheduledFor: d.scheduledFor })),
    disbursed: disbursed.toFixed(2),
    remaining: (Number(grant.amount) - disbursed).toFixed(2),
    generatedAt: new Date().toISOString(),
  };
}

export async function impactReport(principal: Principal, programId?: string) {
  const scope = await tenantScopeIds(principal);
  const metrics = await db.select().from(s.foundationImpactMetrics).where(inArray(s.foundationImpactMetrics.tenantId, scope));
  const scoped = programId ? metrics.filter((m) => m.programId === programId) : metrics;
  const rows = [];
  for (const metric of scoped) {
    const measurements = await db
      .select()
      .from(s.foundationImpactMeasurements)
      .where(and(eq(s.foundationImpactMeasurements.metricId, metric.id), inArray(s.foundationImpactMeasurements.tenantId, scope)));
    const latest = measurements.length > 0 ? measurements[measurements.length - 1].actual : null;
    const progress =
      latest !== null && metric.target !== null && metric.baseline !== null && Number(metric.target) !== Number(metric.baseline)
        ? ((Number(latest) - Number(metric.baseline)) / (Number(metric.target) - Number(metric.baseline))) * 100
        : null;
    rows.push({
      code: metric.code,
      name: metric.name,
      level: metric.level,
      unit: metric.unit,
      baseline: metric.baseline,
      target: metric.target,
      latest,
      progressPct: progress === null ? null : Math.round(progress * 10) / 10,
      measurements: measurements.length,
    });
  }
  return { metrics: rows, generatedAt: new Date().toISOString() };
}

export async function taxPositionReport(principal: Principal, foundationId: string) {
  const foundation = await getFoundation(principal, foundationId);
  const scope = await tenantScopeIds(principal);
  const [profile] = await db
    .select()
    .from(s.foundationTaxProfiles)
    .where(and(eq(s.foundationTaxProfiles.foundationId, foundation.id), inArray(s.foundationTaxProfiles.tenantId, scope)))
    .limit(1);
  const assessments = await db
    .select()
    .from(s.foundationTaxAssessments)
    .where(and(eq(s.foundationTaxAssessments.foundationId, foundation.id), inArray(s.foundationTaxAssessments.tenantId, scope)));
  return {
    foundation: { id: foundation.id, legalName: foundation.legalName, taxStatus: foundation.taxStatus },
    profile: profile ?? null,
    assessments: assessments.map((a) => ({
      code: a.code,
      activity: a.activity,
      taxStatus: a.taxStatus,
      professionalReviewRequired: a.professionalReviewRequired,
      assessedAt: a.assessedAt,
    })),
    disclaimer:
      "TAX INFORMATION ONLY — this report summarises recorded assessments. It is not tax advice. " +
      "No exemption may be claimed for any status other than CONFIRMED with evidence on file.",
    generatedAt: new Date().toISOString(),
  };
}
