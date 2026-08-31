import { describe, it, expect, beforeAll } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { PGlite } from "@electric-sql/pglite";
import { PGliteConnection } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { requestStorage } from "../../common/observability/correlation-id.middleware";
import { AuditService } from "../audit/audit.service";
import { IncidentsService } from "./incidents.service";

const MIG_DIR = path.resolve(__dirname, "..", "..", "..", "database", "migrations");
const ACTOR = {
  userId: "00000000-0000-0000-0000-0000000000c1",
  email: "safety@beyu.health",
  role: "nurse",
  permissions: ["phi:read", "phi:write"],
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

describe("IncidentsService", () => {
  let conn: PGliteConnection;
  let tc: TenantContext;
  let svc: IncidentsService;

  beforeAll(async () => {
    const db = new PGlite();
    conn = new PGliteConnection(db);
    for (const f of fs.readdirSync(MIG_DIR).filter((x) => x.endsWith(".up.sql")).sort()) {
      await conn.exec(fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
    }
    await conn.exec(`
      INSERT INTO beyu_identity.users (global_user_id, email, display_name, password_hash)
        VALUES ('${ACTOR.userId}','safety@beyu.health','Safety','x');
      INSERT INTO beyu_identity.tenants (tenant_id, tenant_code, name, country_code, entity_code)
        VALUES ('${ACTOR.tenantId}','t1','T1','TZ','HOSP-1');
      INSERT INTO beyu_identity.tenant_memberships (global_user_id, tenant_id, role)
        VALUES ('${ACTOR.userId}','${ACTOR.tenantId}','nurse');`);
    tc = new TenantContext();
    svc = new IncidentsService(conn, tc, new AuditService(conn, tc));
  });

  it("reports an incident and enforces state machine + CAPA attachment", () =>
    run(tc, async () => {
      const r = await svc.report({
        category: "medication",
        severity: "severe",
        description: "Wrong medication dose administered; patient observed.",
      });
      expect(r.incident_id).toBeTruthy();
      expect(r.incident_no).toMatch(/^INC-/);
      await expect(svc.transition(r.incident_id, "investigating")).rejects.toThrow(/cannot transition/);
      await svc.transition(r.incident_id, "triaged");
      await svc.transition(r.incident_id, "investigating");
      await svc.transition(r.incident_id, "resolved", {
        rca_summary: "Calculation error at double-check; second clinician overrode.",
        capa: { actions: ["dual-signoff high-alert meds", "retraining"], owner: "pharmacy" },
      });
      const open = await svc.listOpen();
      expect(open.find((x) => x.incident_id === r.incident_id)?.status).toBe("resolved");
    }));
});
