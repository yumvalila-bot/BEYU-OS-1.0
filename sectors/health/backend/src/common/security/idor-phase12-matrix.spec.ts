/**
 * idor-phase12-matrix.spec.ts — Phase 12 Wave 2.
 *
 * Builds a machine-readable IDOR / authorization matrix across every sensitive
 * resource (discovered from the ACTUAL bootstrapped PGlite catalog — never
 * fabricated) and the 20 Phase 12 isolation axes, classifying each resource ×
 * axis cell into the eight-state vocabulary strictly from repository evidence:
 *
 *   - RLS axes (wrong tenant/entity/country/facility + cross-tenant search) are
 *     ENGINEERING_READY when the table has RLS enabled (pg_class.relrowsecurity)
 *     with ≥1 policy (pg_policies), because rls-adversarial-matrix.spec.ts
 *     behaviourally probes EVERY health.* table for those exact cases.
 *   - Behavioural axes (wrong role/permission/practitioner, UUID enumeration,
 *     deleted resource, consent, legal hold, MFA, governance, HCM scope,
 *     financial/administrative/AI scope, destructive op) are ENGINEERING_READY
 *     only where a dedicated test exercises them (today: the patients resource
 *     via the HTTP 18-axis IDOR matrix); otherwise PARTIALLY_IMPLEMENTED
 *     (guard/permission/RBAC enforcement exists but no per-resource behavioural
 *     test) or EXTERNAL_BLOCKED (canonical-domain or external dependency).
 *
 * Writes coverage/idor-phase12-matrix.json. No fabricated authorization results.
 */
import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import { buildTestBed } from "../../common/testing/test-bed";

const OUT = path.resolve(__dirname, "..", "..", "..", "..", "coverage"); // sectors/health/coverage

const AXES = [
  "wrong_tenant",
  "wrong_entity",
  "wrong_country",
  "wrong_facility",
  "wrong_practitioner",
  "wrong_role",
  "wrong_permission",
  "uuid_enumeration",
  "deleted_resource",
  "legal_hold",
  "consent",
  "mfa",
  "governance",
  "hcm_scope",
  "patient_scope",
  "financial_scope",
  "administrative_scope",
  "ai_high_risk_scope",
  "destructive_operation",
  "cross_tenant_search",
] as const;

type State =
  | "ENGINEERING_READY"
  | "PARTIALLY_IMPLEMENTED"
  | "MISSING"
  | "EXTERNAL_BLOCKED"
  | "NOT_APPLICABLE";

const RLS_AXES = new Set([
  "wrong_tenant",
  "wrong_entity",
  "wrong_country",
  "wrong_facility",
  "cross_tenant_search",
]);

// Resources whose behavioural IDOR axes are exercised by the HTTP 18-axis matrix.
const HTTP_IDOR_COVERED = new Set(["patients"]);

// Tables owned by the canonical BEYU Identity domain (not Health OS scope).
const BEYU_IDENTITY = new Set([
  "users",
  "tenants",
  "tenant_memberships",
  "roles",
  "permissions",
  "role_permissions",
  "sessions",
  "auth_events",
  "beyu_identity_links",
]);

// Resources for which a given axis is not meaningful.
function axisApplicable(table: string, axis: string): boolean {
  if (axis === "patient_scope")
    return ![
      "facilities",
      "departments",
      "vehicles",
      "imaging_equipment",
      "lab_analyzers",
      "dialysis_machines",
      "optical_devices",
    ].includes(table);
  if (axis === "financial_scope")
    return [
      "invoices",
      "invoice_items",
      "payments",
      "payment_allocations",
      "billable_services",
      "finance_events",
      "stock_ledger",
      "pharmacy_items",
      "pharmacy_batches",
    ].includes(table);
  if (axis === "administrative_scope")
    return [
      "audit_log",
      "compliance_evidence",
      "compliance_controls",
      "retention_policies",
      "legal_holds",
      "integration_status",
      "queue_jobs",
    ].includes(table);
  if (axis === "ai_high_risk_scope") return table === "ai_invocations";
  if (axis === "destructive_operation")
    return (
      table === "audit_log" ||
      table === "legal_holds" ||
      table === "idempotency_ledger"
    );
  return true;
}

function classifyCell(
  table: string,
  schema: string,
  axis: string,
  rls: boolean,
  policies: number,
): State {
  if (BEYU_IDENTITY.has(table)) {
    // Canonical BEYU Identity owns these; Health OS must not create competing
    // authorization. RLS is still enforced (Identity OS migrations) but the
    // behavioural authority is external.
    return RLS_AXES.has(axis) && rls && policies > 0
      ? "ENGINEERING_READY"
      : "EXTERNAL_BLOCKED";
  }
  if (RLS_AXES.has(axis)) {
    if (rls && policies > 0) return "ENGINEERING_READY";
    return "MISSING";
  }
  if (!axisApplicable(table, axis)) return "NOT_APPLICABLE";
  if (axis === "governance") return "EXTERNAL_BLOCKED"; // Governance OS not connected (fail-closed adapter)
  if (axis === "hcm_scope") return "EXTERNAL_BLOCKED"; // HCM OS not connected (fail-closed adapter)
  if (axis === "mfa" || axis === "consent" || axis === "legal_hold")
    return "PARTIALLY_IMPLEMENTED"; // guards present; per-resource tests partial
  if (HTTP_IDOR_COVERED.has(table)) return "ENGINEERING_READY";
  return "PARTIALLY_IMPLEMENTED";
}

describe("IDOR / authorization matrix (Phase 12 Wave 2)", () => {
  let bed: Awaited<ReturnType<typeof buildTestBed>>;
  let resources: Array<{
    name: string;
    schema: string;
    rls: boolean;
    policies: number;
    axes: Record<string, State>;
  }> = [];
  let summary: Record<string, number> = {};

  beforeAll(async () => {
    bed = await buildTestBed();
    const rows: Array<{ t: string; s: string; rls: boolean }> =
      (await bed.conn.query(
        `SELECT c.relname AS t, n.nspname AS s, c.relrowsecurity AS rls
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('health','beyu_identity') AND c.relkind='r'
        ORDER BY n.nspname, c.relname`,
      )) as any;
    const policyRows: Array<{
      tablename: string;
      schemaname: string;
      n: number;
    }> = (await bed.conn.query(
      `SELECT tablename, schemaname, count(*)::int AS n FROM pg_policies
        WHERE schemaname IN ('health','beyu_identity') GROUP BY tablename, schemaname`,
    )) as any;
    const policyCount = new Map<string, number>();
    for (const pr of policyRows)
      policyCount.set(`${pr.schemaname}.${pr.tablename}`, pr.n);

    resources = rows.map((r) => {
      const policies = policyCount.get(`${r.s}.${r.t}`) ?? 0;
      const axes: Record<string, State> = {} as any;
      for (const a of AXES)
        axes[a] = classifyCell(r.t, r.s, a, r.rls, policies);
      return { name: r.t, schema: r.s, rls: r.rls, policies, axes };
    });

    summary = {};
    for (const r of resources) {
      for (const a of AXES) {
        const st = r.axes[a];
        if (st === "NOT_APPLICABLE") continue;
        summary[st] = (summary[st] ?? 0) + 1;
      }
    }

    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(
      path.join(OUT, "idor-phase12-matrix.json"),
      JSON.stringify(
        {
          generated: new Date().toISOString(),
          schema: "idor-phase12-matrix-v1",
          methodology:
            "resource x 20-axis isolation matrix derived from the bootstrapped PGlite catalog (pg_class.relrowsecurity + pg_policies) + existing test coverage; eight-state classification; no fabricated results",
          axes: AXES,
          summary,
          resources,
        },
        null,
        2,
      ),
    );
  }, 120000);

  afterAll(async () => {
    await bed?.conn?.close?.();
  });

  it("discovers all sensitive resources from the live schema (>= 60 tables)", () => {
    expect(resources.length).toBeGreaterThanOrEqual(60);
  });

  it("every health.* resource has RLS enabled (relrowsecurity=true)", () => {
    const missing = resources
      .filter((r) => r.schema === "health" && !r.rls)
      .map((r) => r.name);
    expect(missing).toEqual([]);
  });

  it("every health.* resource has at least one RLS policy", () => {
    const missing = resources
      .filter((r) => r.schema === "health" && r.policies === 0)
      .map((r) => r.name);
    expect(missing).toEqual([]);
  });

  it("RLS isolation axes are ENGINEERING_READY for every health.* table", () => {
    const gaps = resources
      .filter((r) => r.schema === "health")
      .filter((r) =>
        (
          [
            "wrong_tenant",
            "wrong_entity",
            "wrong_country",
            "wrong_facility",
          ] as const
        ).some((a) => r.axes[a] !== "ENGINEERING_READY"),
      )
      .map((r) => r.name);
    expect(gaps).toEqual([]);
  });

  it("writes coverage/idor-phase12-matrix.json", () => {
    expect(fs.existsSync(path.join(OUT, "idor-phase12-matrix.json"))).toBe(
      true,
    );
  });
});
