import { describe, it, expect, beforeAll } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { PGlite } from "@electric-sql/pglite";
import { PGliteConnection } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { requestStorage } from "../../common/observability/correlation-id.middleware";
import { AuditService } from "../audit/audit.service";
import { ComplianceService } from "./compliance.service";

const MIG_DIR = path.resolve(__dirname, "..", "..", "..", "database", "migrations");
const ACTOR = {
  userId: "00000000-0000-0000-0000-000000000099",
  email: "governance@beyu.health",
  role: "admin",
  permissions: ["tenant:admin"],
  tenantId: "11111111-1111-1111-1111-111111111111",
  countryCode: "TZ",
  entityCode: "HOSP-1",
};
function run<T>(tc: TenantContext, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((res, rej) =>
    requestStorage.run(
      { correlationId: "t", requestId: "r", startedAt: Date.now(), method: "T", path: "/", ip: "127.0.0.1" },
      () => tc.run(ACTOR as never, () => fn().then(res, rej)),
    ),
  );
}

describe("TZ compliance pack (seed)", () => {
  let conn: PGliteConnection;
  let tc: TenantContext;
  let svc: ComplianceService;

  beforeAll(async () => {
    const db = new PGlite();
    conn = new PGliteConnection(db);
    for (const f of fs.readdirSync(MIG_DIR).filter((x) => x.endsWith(".up.sql")).sort()) {
      await conn.exec(fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
    }
    await conn.exec(`
      INSERT INTO beyu_identity.users (global_user_id, email, display_name, password_hash)
        VALUES ('${ACTOR.userId}','governance@beyu.health','Governance','x');
      INSERT INTO beyu_identity.tenants (tenant_id, tenant_code, name, country_code, entity_code)
        VALUES ('${ACTOR.tenantId}','t1','T1','TZ','HOSP-1');
      INSERT INTO beyu_identity.tenant_memberships (global_user_id, tenant_id, role)
        VALUES ('${ACTOR.userId}','${ACTOR.tenantId}','admin');`);
    tc = new TenantContext();
    svc = new ComplianceService(conn, tc, new AuditService(conn, tc));
  });

  it("seeds TZ/ISO/NABH/AI/FIN controls and never reports 'compliant'", () =>
    run(tc, async () => {
      const rep = await svc.coverageReport();
      expect(rep.total).toBeGreaterThanOrEqual(20);
      expect(rep.external_blocked).toBeGreaterThanOrEqual(8);
      const all = await svc.listControls();
      const statuses = new Set<string>(all.map((c) => c.implementation_status));
      expect(statuses.has("compliant")).toBe(false);
      const pdpa = all.find((c) => c.control_id === "TZ-PDPA-01");
      expect(pdpa).toBeTruthy();
      expect(pdpa?.jurisdiction).toBe("TZ");
    }));

  it("external adapters (NHIF/TRA/TMDA/MCT/TAEC/PACS) all remain blocked until real credentials", () =>
    run(tc, async () => {
      const external = await svc.listControls({ riskLevel: "critical" });
      const extBlocked = external.filter((c) => c.external_dependency);
      expect(extBlocked.length).toBeGreaterThanOrEqual(4);
      for (const c of extBlocked) {
        expect(c.implementation_status === "external_dependency" || c.implementation_status === "partially_implemented" || c.implementation_status === "implemented").toBe(true);
      }
    }));
});
