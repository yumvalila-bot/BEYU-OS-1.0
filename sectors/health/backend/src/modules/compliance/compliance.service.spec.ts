import { describe, it, expect, beforeAll } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { PGlite } from "@electric-sql/pglite";
import { PGliteConnection } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { requestStorage } from "../../common/observability/correlation-id.middleware";
import { AuditService } from "../audit/audit.service";
import { ComplianceService } from "./compliance.service";

const MIG_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "database",
  "migrations",
);
const ACTOR = {
  userId: "00000000-0000-0000-0000-00000000000c",
  email: "admin@beyu.health",
  role: "admin",
  permissions: ["tenant:admin"],
  tenantId: "11111111-1111-1111-1111-111111111111",
  countryCode: "TZ",
  entityCode: "HOSP-1",
  timezone: "Africa/Dar_es_Salaam",
};

function run<T>(tc: TenantContext, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((res, rej) =>
    requestStorage.run(
      {
        correlationId: "t",
        requestId: "r",
        startedAt: Date.now(),
        method: "T",
        path: "/",
        ip: "127.0.0.1",
      },
      () => tc.run(ACTOR as never, () => fn().then(res, rej)),
    ),
  );
}

describe("ComplianceService", () => {
  let conn: PGliteConnection;
  let tc: TenantContext;
  let svc: ComplianceService;

  beforeAll(async () => {
    const db = new PGlite();
    conn = new PGliteConnection(db);
    for (const f of fs
      .readdirSync(MIG_DIR)
      .filter((x) => x.endsWith(".up.sql"))
      .sort()) {
      await conn.exec(fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
    }
    await conn.exec(`
      INSERT INTO beyu_identity.users (global_user_id, email, display_name, password_hash)
        VALUES ('${ACTOR.userId}','admin@beyu.health','Admin','x');
      INSERT INTO beyu_identity.tenants (tenant_id, tenant_code, name, country_code, entity_code)
        VALUES ('${ACTOR.tenantId}','t1','T1','TZ','HOSP-1');
      INSERT INTO beyu_identity.tenant_memberships (global_user_id, tenant_id, role)
        VALUES ('${ACTOR.userId}','${ACTOR.tenantId}','admin');`);
    tc = new TenantContext();
    svc = new ComplianceService(conn, tc, new AuditService(conn, tc));
  });

  it("never reports a status of 'compliant' (engineering vs accreditation separation)", () =>
    run(tc, async () => {
      const controls = await svc.listControls();
      const statuses = new Set<string>(
        controls.map((c) => c.implementation_status),
      );
      expect(statuses.has("compliant" as string)).toBe(false);
    }));

  it("registers controls and surfaces external blockers + approval requirements", () =>
    run(tc, async () => {
      await svc.upsertControl({
        control_id: "TZ-PDPA-AUD-01",
        authority: "Tanzania PDPA 2022",
        jurisdiction: "TZ",
        category: "privacy",
        requirement: "Access to PHI must be audited for 7 years.",
        implementation_status: "implemented",
        evidence_reference: "audit.service.spec",
        risk_level: "high",
        applicability: "all",
        external_dependency: false,
        approval_required: false,
      });
      await svc.upsertControl({
        control_id: "TZ-NHIF-CLAIM-01",
        authority: "NHIF TZ",
        jurisdiction: "TZ",
        category: "billing",
        requirement:
          "Claims must be submitted to NHIF with provider credentials.",
        implementation_status: "external_dependency",
        risk_level: "critical",
        applicability: "billing",
        external_dependency: true,
        approval_required: true,
        notes:
          "Requires real NHIF credentials; adapter stub reports UNAVAILABLE.",
      });
      const rep = await svc.coverageReport();
      expect(rep.total).toBeGreaterThanOrEqual(2);
      expect(rep.external_blocked).toBeGreaterThanOrEqual(1);
      expect(rep.requires_human_approval).toBeGreaterThanOrEqual(1);
      expect(rep.by_status.implemented).toBeGreaterThanOrEqual(1);
    }));

  it("adds evidence tied to a control; rejects unknown controls", () =>
    run(tc, async () => {
      const r = await svc.addEvidence({
        control_id: "TZ-PDPA-AUD-01",
        evidence_type: "test",
        reference: "compliance.service.spec::audit-envelope",
        metadata: { suite: "jest", result: "pass" },
      });
      expect(r.evidence_id).toBeTruthy();
      await expect(
        svc.addEvidence({
          control_id: "NO-SUCH-00",
          evidence_type: "test",
          reference: "x",
        }),
      ).rejects.toThrow(/unknown control/);
    }));
});
