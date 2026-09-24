/**
 * Holograph device registry — governed lifecycle + honesty (real PostgreSQL).
 *
 * Proves:
 *   • registration is governed (provenance required, canonical class/backend);
 *   • the lifecycle state machine holds (REGISTERED→ACTIVE→SUSPENDED→REVOKED;
 *     REVOKED terminal);
 *   • HONESTY: a FUTURE_HOLOGRAPHIC_DEVICE can only ever be REGISTERED or
 *     NOT_IMPLEMENTED (no physical holographic hardware support is claimed),
 *     and a device cannot reach ACTIVE on a non-IMPLEMENTED backend;
 *   • deep links re-authorize across tenants;
 *   • every mutation writes the EXISTING audit + event chain.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, enterpriseEvents, vizDevices } from "@/db/schema";
import { listDevices, registerDevice, setDeviceStatus, getDevice } from "@/lib/viz/devices";
import { VizDomainError, type VizActor } from "@/lib/viz/service";
import { seededPrincipal } from "../noelia/db-fixtures";

const RUN = `VZDEV${Date.now()}`;

function actorFor(principal: { tenantId: string; userId: string }): VizActor {
  return { tenantId: principal.tenantId, userId: principal.userId, traceId: `TRACEDEV${Date.now()}`, ipAddress: null, userAgent: null };
}

async function eventCount(type: string, subjectId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(enterpriseEvents).where(and(eq(enterpriseEvents.type, type), eq(enterpriseEvents.subjectId, subjectId)));
  return Number(row?.n ?? 0);
}

describe("Holograph device registry — governed lifecycle", () => {
  let admin: Awaited<ReturnType<typeof seededPrincipal>>;
  let ujenziOps: Awaited<ReturnType<typeof seededPrincipal>>;
  let webDeviceId = "";
  let futureDeviceId = "";
  let webglDeviceId = "";

  beforeAll(async () => {
    admin = await seededPrincipal("admin@beyu.os");
    ujenziOps = await seededPrincipal("ujenzi.ops@beyu.os");
  });

  afterAll(async () => {
    await db.delete(vizDevices).where(like(vizDevices.name, `${RUN}%`));
  });

  it("registers a device with provenance in the REGISTERED state (audit + event)", async () => {
    const device = await registerDevice(
      {
        name: `${RUN} web workstation`,
        deviceClass: "WEB",
        renderingBackend: "SVG_2D",
        rationale: "Standard web workstation presenting governed scenes.",
      },
      actorFor(admin),
      admin,
    );
    webDeviceId = device.id;
    expect(device.status).toBe("REGISTERED");
    expect(device.provenance.registeredBy).toBe(admin.userId);
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.objectId, device.id));
    expect(audit?.action).toBe("VIZ_DEVICE_REGISTERED");
    expect(await eventCount("VIZ_DEVICE_REGISTERED", device.id)).toBe(1);
  });

  it("activates a device on an IMPLEMENTED rendering backend", async () => {
    const result = await setDeviceStatus(webDeviceId, "ACTIVE", "Device verified in the controlled environment.", actorFor(admin), admin);
    expect(result.status).toBe("ACTIVE");
    expect(await eventCount("VIZ_DEVICE_STATUS_CHANGED", webDeviceId)).toBe(1);
  });

  it("suspends and re-activates (governed reversibility before revocation)", async () => {
    await setDeviceStatus(webDeviceId, "SUSPENDED", "Scheduled maintenance.", actorFor(admin), admin);
    let device = await getDevice(admin, webDeviceId);
    expect(device?.status).toBe("SUSPENDED");
    await setDeviceStatus(webDeviceId, "ACTIVE", "Maintenance complete.", actorFor(admin), admin);
    device = await getDevice(admin, webDeviceId);
    expect(device?.status).toBe("ACTIVE");
  });

  it("FUTURE_HOLOGRAPHIC_DEVICE registers NOT_IMPLEMENTED and can NEVER be activated (no hardware support is claimed)", async () => {
    const device = await registerDevice(
      {
        name: `${RUN} future holographic display`,
        deviceClass: "FUTURE_HOLOGRAPHIC_DEVICE",
        renderingBackend: "XR",
        rationale: "Reserved registry class; no implementation exists.",
      },
      actorFor(admin),
      admin,
    );
    futureDeviceId = device.id;
    expect(device.status).toBe("NOT_IMPLEMENTED");

    await expect(
      setDeviceStatus(futureDeviceId, "ACTIVE", "must be refused", actorFor(admin), admin),
    ).rejects.toThrow(/FUTURE_HOLOGRAPHIC_DEVICE|only be/i);
    // Even the legal-looking NOT_IMPLEMENTED → REGISTERED move stays honest,
    // and REGISTERED → ACTIVE is still refused by the same guard.
    await setDeviceStatus(futureDeviceId, "REGISTERED", "Holding as declared, not implemented.", actorFor(admin), admin);
    await expect(setDeviceStatus(futureDeviceId, "ACTIVE", "still refused", actorFor(admin), admin)).rejects.toThrow(/FUTURE_HOLOGRAPHIC_DEVICE|only be/i);
  });

  it("a device on a PLANNED renderer (WEBGL_3D) cannot reach ACTIVE — capability is not fabricated", async () => {
    const device = await registerDevice(
      {
        name: `${RUN} webgl station`,
        deviceClass: "DESKTOP",
        renderingBackend: "WEBGL_3D",
        rationale: "Declared for a future WebGL rollout (renderer PLANNED).",
      },
      actorFor(admin),
      admin,
    );
    webglDeviceId = device.id;
    await expect(
      setDeviceStatus(webglDeviceId, "ACTIVE", "must be refused", actorFor(admin), admin),
    ).rejects.toThrow(/not an IMPLEMENTED renderer/i);
  });

  it("REVOKED is terminal", async () => {
    await setDeviceStatus(webglDeviceId, "REVOKED", "Device decommissioned.", actorFor(admin), admin);
    let device = await getDevice(admin, webglDeviceId);
    expect(device?.status).toBe("REVOKED");
    await expect(setDeviceStatus(webglDeviceId, "REGISTERED", "must fail", actorFor(admin), admin)).rejects.toThrow(/terminal/i);
  });

  it("deep links re-authorize: another tenant's device resolves to NOT_FOUND", async () => {
    expect(await getDevice(ujenziOps, webDeviceId)).toBeNull();
  });

  it("rejects unknown device classes and unknown backends", async () => {
    await expect(
      registerDevice({ name: `${RUN} bad class`, deviceClass: "HOLOGRAM_9000", renderingBackend: "SVG_2D", rationale: "must fail" }, actorFor(admin), admin),
    ).rejects.toThrow(VizDomainError);
    await expect(
      registerDevice({ name: `${RUN} bad backend`, deviceClass: "WEB", renderingBackend: "HOLO_BEAM", rationale: "must fail" }, actorFor(admin), admin),
    ).rejects.toThrow(VizDomainError);
  });

  it("list is tenant-scoped", async () => {
    const list = await listDevices(admin);
    for (const d of list) expect(d.tenantId).toBe(admin.tenantId);
    const other = await listDevices(ujenziOps);
    expect(other.some((d) => d.id === webDeviceId)).toBe(false);
  });
});
