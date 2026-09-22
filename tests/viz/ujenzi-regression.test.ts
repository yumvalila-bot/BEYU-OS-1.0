/**
 * UJENZI OS regression — the Sector OS is never downgraded by the shared
 * visualization capability.
 *
 * Proves: UJENZI OS remains a canonical Sector OS destination for its
 * operators; DOM-UJENZI is untouched; the viz layer consumes UJENZI OS (not
 * the reverse); the Ujenzi adapter is strictly read-only over ujenzi tables
 * and declares BIM/IFC parsing as NOT_IMPLEMENTED instead of faking it; and
 * NO BIM/GIS/Digital-Twin/XR/Graphics "OS" was smuggled into the registry.
 */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { osRegistry, ujenziBoqs, ujenziCostRecords, ujenziProjects } from "@/db/schema";
import { UJENZI_OS_READ_PERMISSIONS, authorizedOperatingSystems } from "@/lib/operating-systems";
import { domainByCode } from "@/lib/interoperability/domains";
import { getAdapter } from "@/lib/viz/adapters";
import { seededPrincipal } from "../noelia/db-fixtures";

async function count(table: PgTable): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return Number(row?.n ?? 0);
}

describe("UJENZI OS stays a canonical Sector OS", () => {
  it("the read permission contract is unchanged", () => {
    expect(UJENZI_OS_READ_PERMISSIONS).toEqual(["ujenzi:data.read"]);
  });

  it("ujenzi.ops still resolves Ujenzi OS as an authorized SECTOR_OS destination (never downgraded)", async () => {
    const ujenziOps = await seededPrincipal("ujenzi.ops@beyu.os");
    const destinations = await authorizedOperatingSystems(ujenziOps);
    const ujenzi = destinations.find((d) => d.code === "UJENZI");
    expect(ujenzi).toBeDefined();
    expect(ujenzi!.level).toBe("SECTOR_OS");
  });

  it("DOM-UJENZI is intact and the VISUALIZATION domain declares UJENZI as a dependency it CONSUMES", () => {
    const ujenzi = domainByCode("UJENZI");
    expect(ujenzi?.domainId).toBe("DOM-UJENZI");
    expect(ujenzi?.status).toBe("PARTIAL");
    expect(ujenzi?.eventContract).toContain("PAYMENT_CERTIFIED");

    const viz = domainByCode("VISUALIZATION");
    expect(viz).not.toBeNull();
    expect(viz?.owner).toMatch(/BEYU OS Kernel/i);
    expect(viz?.owner).not.toMatch(/ujenzi/i);
    expect(viz?.dependencies).toContain("UJENZI");
  });

  it("no BIM / GIS / Digital-Twin / XR / Graphics OS exists in the OS registry", async () => {
    const rows = await db.select({ code: osRegistry.code, name: osRegistry.name }).from(osRegistry);
    for (const row of rows) {
      expect(row.code).not.toMatch(/BIM|DIGITAL_TWIN|GRAPHICS|_XR$|^XR_|GIS_OS/);
      expect(row.name).not.toMatch(/\bBIM OS\b|\bDigital Twin OS\b|\bXR OS\b|\bGraphics OS\b|\bGIS OS\b/i);
    }
  });
});

describe("the Ujenzi adapter consumes — never owns, never mutates", () => {
  it("descriptor: sector consumer, ujenzi system of record, BIM/IFC honestly NOT_IMPLEMENTED", () => {
    const adapter = getAdapter("UJENZI");
    expect(adapter).toBeDefined();
    const descriptor = adapter!.describe();
    expect(descriptor.sector).toBe("UJENZI");
    expect(descriptor.systemOfRecord).toMatch(/ujenzi_/);
    expect(descriptor.suppliedDimensions.length).toBeGreaterThan(0);
    expect(descriptor.notImplemented.join(" ")).toMatch(/IFC|BIM/i);
  });

  it("collect() is strictly read-only over the ujenzi tables", async () => {
    const ujenziOps = await seededPrincipal("ujenzi.ops@beyu.os");
    const adapter = getAdapter("UJENZI")!;
    const before = {
      projects: await count(ujenziProjects),
      boqs: await count(ujenziBoqs),
      costs: await count(ujenziCostRecords),
    };
    const dataset = await adapter.collect(ujenziOps, { dimensions: ["1D", "2D", "4D", "5D", "7D", "8D"], limit: 50 });
    const after = {
      projects: await count(ujenziProjects),
      boqs: await count(ujenziBoqs),
      costs: await count(ujenziCostRecords),
    };
    expect(after).toEqual(before);
    expect(dataset.sector).toBe("UJENZI");
    // Whatever the seeded estate, the dataset is honest: OK with rows, or a
    // declared reason — never fabricated content.
    if (dataset.status === "NOT_AVAILABLE") expect(dataset.reason).toBeTruthy();
  });

  it("an out-of-scope principal collects NOTHING from the Ujenzi adapter (empty, with reason)", async () => {
    const agriOps = await seededPrincipal("agri.ops@beyu.os");
    const dataset = await getAdapter("UJENZI")!.collect(agriOps, { dimensions: ["1D"], limit: 10 });
    expect(dataset.objects).toEqual([]);
    expect(dataset.status).toBe("NOT_AVAILABLE");
    expect(dataset.reason).toMatch(/ujenzi:data\.read/);
  });
});
