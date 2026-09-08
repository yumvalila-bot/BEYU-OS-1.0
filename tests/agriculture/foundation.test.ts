/**
 * Agriculture OS — Foundation Test Suite
 *
 * Tests the foundational agriculture schema and operations:
 * - Farm management
 * - Crop cycle tracking
 * - Harvest recording
 * - Livestock herd management
 *
 * STATUS: SCAFFOLDED (basic operations only)
 */
import { describe, expect, it, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";

describe("Agriculture OS — Foundation", () => {
  const RUN = `AGRI_TEST_${Date.now()}`;
  let tenantId: string;
  let legalEntityId: string;

  beforeAll(async () => {
    // Get a test tenant and legal entity
    const [tenant] = await db.select().from(s.tenants).limit(1);
    tenantId = tenant.id;

    const [entity] = await db
      .select()
      .from(s.legalEntities)
      .where(eq(s.legalEntities.tenantId, tenantId))
      .limit(1);
    legalEntityId = entity?.id;
  });

  it("agriculture tables exist", async () => {
    const result = await db.execute<{ table_name: string }>(sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name like 'agriculture_%'
      order by table_name
    `);

    const tables = Array.isArray(result) ? result : result.rows ?? [];
    const names = tables.map((t: any) => t.table_name);
    expect(names).toContain("agriculture_farms");
    expect(names).toContain("agriculture_fields");
    expect(names).toContain("agriculture_crop_types");
    expect(names).toContain("agriculture_crop_cycles");
    expect(names).toContain("agriculture_inputs");
    expect(names).toContain("agriculture_input_applications");
    expect(names).toContain("agriculture_harvests");
    expect(names).toContain("agriculture_livestock_types");
    expect(names).toContain("agriculture_livestock_herds");
    expect(names).toContain("agriculture_livestock_events");
  });

  it("agriculture tables have RLS enabled", async () => {
    const result = await db.execute<{ relname: string }>(sql`
      select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname like 'agriculture_%'
        and c.relrowsecurity = true
      order by c.relname
    `);

    const rls = Array.isArray(result) ? result : result.rows ?? [];
    expect(rls.length).toBe(77); // 0031 foundation (10) + 0034 production (67)
  });

  it("can create a farm", async () => {
    if (!legalEntityId) return; // Skip if no legal entity
    const farmId = `${RUN}_FARM_1`;
    await db.insert(s.farms).values({
      id: farmId,
      tenantId,
      legalEntityId,
      code: `${RUN}_F1`,
      name: "Test Farm",
      countryCode: "TZ",
      totalAreaHa: "100.00",
      arableAreaHa: "80.00",
      soilType: "LOAM",
      waterSource: "BOREHOLE",
      status: "ACTIVE",
    });

    const [farm] = await db.select().from(s.farms).where(eq(s.farms.id, farmId));
    expect(farm).toBeDefined();
    expect(farm.code).toBe(`${RUN}_F1`);
    expect(farm.name).toBe("Test Farm");
    expect(farm.tenantId).toBe(tenantId);

    // Cleanup
    await db.delete(s.farms).where(eq(s.farms.id, farmId));
  });

  it("can create a field within a farm", async () => {
    if (!legalEntityId) return; // Skip if no legal entity
    // Create farm first
    const farmId = `${RUN}_FARM_2`;
    await db.insert(s.farms).values({
      id: farmId,
      tenantId,
      legalEntityId,
      code: `${RUN}_F2`,
      name: "Test Farm with Field",
      countryCode: "TZ",
      status: "ACTIVE",
    });

    // Create field
    const fieldId = `${RUN}_FIELD_1`;
    await db.insert(s.fields).values({
      id: fieldId,
      tenantId,
      farmId,
      code: `${RUN}_FL1`,
      name: "North Field",
      areaHa: "25.50",
      soilType: "CLAY",
      irrigationType: "DRIP",
      status: "ACTIVE",
    });

    const [field] = await db.select().from(s.fields).where(eq(s.fields.id, fieldId));
    expect(field).toBeDefined();
    expect(field.farmId).toBe(farmId);
    expect(field.areaHa).toBe("25.50");

    // Cleanup
    await db.delete(s.fields).where(eq(s.fields.id, fieldId));
    await db.delete(s.farms).where(eq(s.farms.id, farmId));
  });

  it("enforces tenant isolation on farms", async () => {
    // This test verifies that RLS policies are in place
    const result = await db.execute<{ policyname: string }>(sql`
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'agriculture_farms'
    `);

    const policies = Array.isArray(result) ? result : result.rows ?? [];
    expect(policies.length).toBeGreaterThan(0);
    expect(policies.some((p: any) => p.policyname.includes("tenant"))).toBe(true);
  });
});
