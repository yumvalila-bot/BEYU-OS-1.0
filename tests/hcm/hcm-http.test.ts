/**
 * Phase 12 — HCM consumption API over HTTP.
 *
 * skipIf during collection: HTTP suites require the running server. When the
 * server is up they must not skip.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { apiGetJson, login, serverAvailable } from "../helpers/http";

const available = await serverAvailable();

let hcmCookie = "";
let cfoCookie = "";
let sectorCookie = "";

beforeAll(async () => {
  if (!available) return;
  hcmCookie = await login("hcm@beyu.os");
  cfoCookie = await login("cfo@beyu.os");
  sectorCookie = await login("health.ops@beyu.os");
}, 240_000);

describe.skipIf(!available)("HCM employees API over HTTP", () => {
  it("unauthenticated GET is 401", async () => {
    const res = await apiGetJson("/api/v1/hcm/employees");
    expect(res.status).toBe(401);
  });

  it("CFO is 403 — Finance consumes HCM, it does not own the read grant", async () => {
    const res = await apiGetJson("/api/v1/hcm/employees", { cookie: cfoCookie });
    expect(res.status).toBe(403);
  });

  it("POSITIVE: HCM director reads the master; pay is present at RESTRICTED", async () => {
    const res = await apiGetJson("/api/v1/hcm/employees", { cookie: hcmCookie });
    expect(res.status).toBe(200);
    const data = (
      res.body as {
        data: {
          records: Array<{ employeeNo: string; baseSalary: string | null; globalUserId: string | null }>;
          source: string;
          suppressedCompensation: boolean;
        };
      }
    ).data;
    expect(data.source).toBe("people.employees");
    expect(data.suppressedCompensation).toBe(false);
    expect(data.records.length).toBe(7);
    expect(data.records.every((r) => r.globalUserId?.startsWith("USR_"))).toBe(true);
    expect(data.records.some((r) => r.baseSalary !== null)).toBe(true);
  });

  it("sector operator does not receive group Holdings employees", async () => {
    const res = await apiGetJson("/api/v1/hcm/employees", { cookie: sectorCookie });
    expect(res.status).toBe(200);
    const data = (
      res.body as {
        data: { records: Array<{ employeeNo: string; baseSalary: string | null }>; suppressedCompensation: boolean };
      }
    ).data;
    expect(data.records.every((r) => r.employeeNo === "BEYU-EMP-00006")).toBe(true);
    expect(data.records.length).toBe(1);
    expect(data.suppressedCompensation).toBe(true);
    expect(data.records.every((r) => r.baseSalary === null)).toBe(true);
  });

  it("GET :id returns one employee; forged id is 404 not 403", async () => {
    const ok = await apiGetJson("/api/v1/hcm/employees/EMP_ASHA_NDULU", { cookie: hcmCookie });
    expect(ok.status).toBe(200);
    const data = (ok.body as { data: { employee: { employeeId: string }; employment: { source: string } } }).data;
    expect(data.employee.employeeId).toBe("EMP_ASHA_NDULU");
    expect(data.employment.source).toBe("people.employees + people.employment_events");

    const hidden = await apiGetJson("/api/v1/hcm/employees/EMP_AMANI_BEYU", { cookie: sectorCookie });
    const missing = await apiGetJson("/api/v1/hcm/employees/EMP_NOPE", { cookie: sectorCookie });
    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect((hidden.body as { error?: { code?: string } }).error?.code).toBe("NOT_FOUND");
    expect((missing.body as { error?: { code?: string } }).error?.code).toBe("NOT_FOUND");
  });
});
