import { sql } from "drizzle-orm";
import { db } from "@/db";
import { policies } from "@/db/schema";
import { apiOk, guarded } from "@/lib/api";
import { verifyAuditChain } from "@/lib/audit";
import { detectHierarchyConflicts, evaluatePolicy } from "@/lib/policy";
import { runWaterfall } from "@/lib/waterfall";
import { assessTaxStrategy } from "@/lib/tax";
import { can } from "@/lib/authz";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/system/self-test
 * Continuous assurance: deterministic control tests executed against the live
 * system (audit integrity, policy hierarchy, tenant isolation, AI boundary,
 * financial determinism, tax jurisdiction gating).
 */
export async function GET(request: Request) {
  return guarded(
    request,
    { permission: "audit:log.read", action: "system.self_test", audit: { objectType: "SYSTEM" } },
    async (ctx) => {
      const results: { control: string; area: string; expectation: string; passed: boolean; detail: string }[] = [];

      // 1. Audit chain integrity
      const chain = await verifyAuditChain();
      results.push({
        control: "CTL-AUD-001",
        area: "AUDIT",
        expectation: "Audit ledger hash chain is unbroken, complete, head-matched and fork-free",
        passed: chain.verified,
        detail: chain.verified
          ? `${chain.records} records verified; duplicate parents ${chain.duplicateParents}; head matched ${chain.headMatches}`
          : `chain broken at ${chain.brokenAt}; duplicate parents ${chain.duplicateParents}; head matched ${chain.headMatches}`,
      });

      // 2. Policy hierarchy integrity
      const all = await db.select({ code: policies.code, level: policies.level, rules: policies.rules }).from(policies);
      const conflicts = detectHierarchyConflicts(all);
      results.push({
        control: "CTL-GOV-002",
        area: "GOVERNANCE",
        expectation: "No lower-level policy contradicts a higher-level policy",
        passed: conflicts.length === 0,
        detail: conflicts.length === 0 ? `${all.length} policies consistent` : JSON.stringify(conflicts),
      });

      // 3. Tenant isolation
      const foreign = can(ctx.principal, "organization:entity.read", { tenantId: "TEN_FOREIGN_TENANT" });
      results.push({
        control: "CTL-SEC-003",
        area: "SECURITY",
        expectation: "Cross-tenant read is denied without explicit authorization",
        passed: !foreign.allowed,
        detail: foreign.reason,
      });

      // 4. Classification ceiling (ABAC)
      const overClearance = can(ctx.principal, "documents:registry.read", { classification: "HIGHLY_RESTRICTED" });
      results.push({
        control: "CTL-SEC-004",
        area: "SECURITY",
        expectation: "Clearance below data classification blocks access",
        passed: ctx.principal.clearance === "HIGHLY_RESTRICTED" ? overClearance.allowed : !overClearance.allowed,
        detail: `clearance=${ctx.principal.clearance}; decision=${overClearance.reason}`,
      });

      // 5. Waterfall determinism & reconciliation
      const a = runWaterfall({
        grossAmount: 1_000_000,
        currency: "USD",
        tiers: [
          { sequence: 1, code: "TAX", name: "Tax", tierType: "PERCENTAGE_OF_GROSS", rate: 0.3, beneficiaryType: "TAX_AUTHORITY" },
          { sequence: 2, code: "OWNER", name: "Residual", tierType: "RESIDUAL", beneficiaryType: "OWNER" },
        ],
      });
      const b = runWaterfall({
        grossAmount: 1_000_000,
        currency: "USD",
        tiers: [
          { sequence: 1, code: "TAX", name: "Tax", tierType: "PERCENTAGE_OF_GROSS", rate: 0.3, beneficiaryType: "TAX_AUTHORITY" },
          { sequence: 2, code: "OWNER", name: "Residual", tierType: "RESIDUAL", beneficiaryType: "OWNER" },
        ],
      });
      results.push({
        control: "CTL-FIN-005",
        area: "FINANCE",
        expectation: "Waterfall is deterministic and fully reconciles",
        passed: a.checksum === b.checksum && a.totalAllocated + a.residual === a.grossAmount && a.warnings.length === 0,
        detail: `checksum ${a.checksum.slice(0, 12)}…, allocated ${a.totalAllocated}, residual ${a.residual}`,
      });

      // 6. Tax engine hard-blocks unlawful positions
      const blocked = assessTaxStrategy({
        strategy: {
          code: "TEST-PROHIBITED",
          title: "Prohibited",
          jurisdictionCode: "TZ",
          position: "PROHIBITED_EVASION",
          authorityStatus: "REJECTED",
          effectiveFrom: "2024-01-01",
          reviewDate: "2026-01-01",
          benefitRate: 1,
          complianceRisk: 5,
          auditRisk: 5,
          legalRisk: 5,
          reputationalRisk: 5,
          requiredApprovals: [],
          eligibilityCriteria: [],
          economicBenefitBasis: "n/a",
        },
        taxpayerJurisdiction: "TZ",
        facts: {},
        baseAmount: 100000,
      });
      results.push({
        control: "CTL-TAX-006",
        area: "TAX",
        expectation: "Unlawful tax positions are hard-blocked with no benefit computed",
        passed: blocked.blocked && blocked.estimatedBenefit === null,
        detail: blocked.blockReason ?? "",
      });

      // 7. Jurisdiction gating
      const crossJurisdiction = assessTaxStrategy({
        strategy: {
          code: "TEST-TZ",
          title: "TZ only",
          jurisdictionCode: "TZ",
          position: "LEGAL_TAX_PLANNING",
          authorityStatus: "AUTHORITATIVE",
          effectiveFrom: "2024-01-01",
          reviewDate: "2026-01-01",
          benefitRate: 0.05,
          complianceRisk: 1,
          auditRisk: 1,
          legalRisk: 1,
          reputationalRisk: 1,
          requiredApprovals: [],
          eligibilityCriteria: [],
          economicBenefitBasis: "n/a",
        },
        taxpayerJurisdiction: "GB",
        facts: {},
        baseAmount: 100000,
      });
      results.push({
        control: "CTL-TAX-007",
        area: "TAX",
        expectation: "A national rule is never generalised to another jurisdiction",
        passed: crossJurisdiction.eligibility === "INELIGIBLE",
        detail: crossJurisdiction.riskSummary,
      });

      // 8. AI authority boundary (policy denies AI-initiated ownership change)
      const aiOwnershipPolicy = await evaluatePolicy({
        action: "organization:ownership.manage",
        tenantId: ctx.principal.tenantId,
        roles: ctx.principal.roles,
        aiInitiated: true,
      });
      results.push({
        control: "CTL-AI-008",
        area: "AI",
        expectation: "AI-initiated ownership mutation is denied by constitutional policy",
        passed: aiOwnershipPolicy.effect === "DENY" && aiOwnershipPolicy.denials.some((d) => d.policyCode === "CONST-AI-001"),
        detail: aiOwnershipPolicy.denials.map((d) => `${d.policyCode}: ${d.message}`).join(" | ") || "No denial returned",
      });

      // 9. Database referential integrity probe
      const [orphans] = await db.execute<{ count: string }>(sql`
        select count(*)::text as count
        from employees e
        left join parties p on p.id = e.party_id
        where p.id is null
      `).then((r) => r.rows as { count: string }[]);
      results.push({
        control: "CTL-DAT-009",
        area: "DATA",
        expectation: "No orphaned employee master records",
        passed: Number(orphans?.count ?? 0) === 0,
        detail: `${orphans?.count ?? 0} orphan(s)`,
      });

      const passed = results.filter((r) => r.passed).length;
      return apiOk(
        {
          summary: { total: results.length, passed, failed: results.length - passed, executedAt: new Date().toISOString() },
          results,
        },
        ctx.traceId,
      );
    },
  );
}
