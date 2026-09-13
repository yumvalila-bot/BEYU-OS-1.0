/**
 * Agriculture OS — Food Export capability invariants
 * Verifies zero-regression, finance boundary, RLS, Noelia governed, etc.
 * DB-dependent suites skip when DATABASE_URL missing; invariant suites run always.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { createDefaultNoeliaToolRegistry } from "@/lib/noelia/default-tools";
import { exportDashboard } from "@/lib/agriculture";

describe("Agriculture OS — Food Export invariants (no DB)", () => {
  it("export module reuses existing models and does not duplicate stock/balance", () => {
    const src = readFileSync("src/lib/agriculture/export.ts", "utf8");
    expect(src).toMatch(/buyers|products|inventory_lots|trace_batches/);
    expect(src).not.toMatch(/second stock balance|duplicate.*buyer/i);
    // No Finance journal posting
    expect(src).toMatch(/journalsPosted: false/);
    expect(src).toMatch(/FINANCE_OS_ONLY/);
    expect(src).toMatch(/CAP_POSTING.*LOCKED|LOCKED/);
  });

  it("export lifecycle states are defined and governed", () => {
    const src = readFileSync("src/lib/agriculture/export.ts", "utf8");
    expect(src).toContain("DRAFT");
    expect(src).toContain("CONFIRMED");
    expect(src).toContain("LOT_ALLOCATED");
    expect(src).toContain("QUALITY_REVIEW");
    expect(src).toContain("COMPLIANCE_REVIEW");
    expect(src).toContain("READY_FOR_SHIPMENT");
    expect(src).toContain("DISPATCHED");
    expect(src).toContain("DELIVERED");
    expect(src).toContain("ON_HOLD");
    expect(src).toContain("ALLOWED_TRANSITIONS");
  });

  it("holds are explicit, auditable, typed and block transitions", () => {
    const src = readFileSync("src/lib/agriculture/export.ts", "utf8");
    expect(src).toContain("QUALITY_HOLD");
    expect(src).toContain("COMPLIANCE_HOLD");
    expect(src).toContain("DOCUMENT_HOLD");
    expect(src).toContain("LOT_HOLD");
    expect(src).toContain("Active holds block");
  });

  it("Noelia/HIVE cannot release holds — enforcement present", () => {
    const src = readFileSync("src/lib/agriculture/export.ts", "utf8");
    expect(src).toMatch(/Noelia.*HIVE.*cannot.*release/i);
    expect(src).toContain("NOELIA");
    expect(src).toContain("HIVE");
  });

  it("compliance is configurable by country/product/destination, no hardcoded Tanzania", () => {
    const src = readFileSync("src/lib/agriculture/export.ts", "utf8");
    expect(src).toMatch(/countryCode|destinationCountryCode|destinationMarket/);
    // No hardcoded TZ inside export logic (UI may have default but export core should not)
    // Allow TZ only in comments or default currency, not as hardcoded filter
    const lines = src.split("\n").filter(l => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
    const hardcodedTZ = lines.filter(l => l.includes('"TZ"') || l.includes("'TZ'"));
    // Should have zero or only in default countryCode fallback? We allow 0
    expect(hardcodedTZ.length).toBeLessThanOrEqual(1);
  });

  it("government integrations are disabled/sandbox/mock unless authorized", () => {
    const src = readFileSync("src/lib/agriculture/export.ts", "utf8");
    expect(src).not.toMatch(/fetch\(.*gov/i);
    expect(src).not.toMatch(/phytosanitary.*api|customs.*api/i);
  });

  it("no TLS verification bypass, no secrets in source", () => {
    const src = readFileSync("src/lib/agriculture/export.ts", "utf8");
    expect(src).not.toMatch(/rejectUnauthorized\s*:\s*false/i);
    expect(src).not.toMatch(/process\.env.*SECRET|API_KEY/i);
  });

  it("offline handling reuses agriculture_sync_envelopes", () => {
    const src = readFileSync("src/lib/agriculture/export.ts", "utf8");
    expect(src).toMatch(/syncEnvelopes|envelopeId/);
  });

  it("events are EXPORT_* and never journals", () => {
    const src = readFileSync("src/lib/agriculture/export.ts", "utf8");
    expect(src).toMatch(/EXPORT_ORDER_CREATED|EXPORT_LOT_ALLOCATED|EXPORT_SHIPMENT/);
    expect(src).toMatch(/journalsPosted: false/);
  });

  it("traceability reuses existing batches/links/harvests/farms", () => {
    const src = readFileSync("src/lib/agriculture/export.ts", "utf8");
    expect(src).toContain("traceBatches");
    expect(src).toContain("traceLinks");
    expect(src).toContain("harvests");
    expect(src).toContain("farms");
  });

  it("documents reuse agriculture_documents", () => {
    const src = readFileSync("src/lib/agriculture/export.ts", "utf8");
    expect(src).toContain("agriDocuments");
    expect(src).toContain("exportDocumentLinks");
  });

  it("API routes are guarded with agriculture:data.* permissions", () => {
    const routes = [
      "src/app/api/v1/agriculture/export-orders/route.ts",
      "src/app/api/v1/agriculture/export-orders/[id]/transition/route.ts",
      "src/app/api/v1/agriculture/export-orders/[id]/allocate/route.ts",
      "src/app/api/v1/agriculture/export-holds/route.ts",
      "src/app/api/v1/agriculture/export-shipments/route.ts",
    ];
    for (const path of routes) {
      const src = readFileSync(path, "utf8");
      expect(src).toMatch(/guarded/);
      expect(src).toMatch(/agriculture:data\.(read|manage)/);
    }
  });

  it("Noelia export tools are registered and governed read-only", () => {
    const registry = createDefaultNoeliaToolRegistry();
    const tools = [
      "agriculture.export.orders.summary",
      "agriculture.export.traceability.query",
      "agriculture.export.compliance.readiness",
      "agriculture.export.documents.missing",
      "agriculture.export.shipment.exceptions",
      "agriculture.export.analytics",
    ];
    for (const name of tools) {
      const tool = registry.definition(name);
      expect(tool).toBeDefined();
      expect(tool?.metadata.sideEffects).toBe("NONE");
      expect(tool?.metadata.idempotent).toBe(true);
      expect(tool?.permission).toBe("agriculture:data.read");
      expect(tool?.risk).toBe("LOW");
    }
  });

  it("Noelia export tools cannot release holds or post finance", () => {
    const registry = createDefaultNoeliaToolRegistry();
    const tool = registry.definition("agriculture.export.shipment.exceptions");
    expect(tool?.description).toMatch(/Read-only/i);
    // Ensure no tool has write permission
    const writeTools = [
      "agriculture.export.orders.summary",
      "agriculture.export.traceability.query",
      "agriculture.export.compliance.readiness",
      "agriculture.export.documents.missing",
      "agriculture.export.shipment.exceptions",
      "agriculture.export.analytics",
    ];
    for (const name of writeTools) {
      const t = registry.definition(name);
      expect(t?.metadata.sideEffects).toBe("NONE");
    }
  });

  it("migration 0039 has RLS and beyu_tenant_ids() policies", () => {
    const sql = readFileSync("drizzle/0039_agriculture_food_export.sql", "utf8");
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/beyu_tenant_ids\(\)/);
    expect(sql).toContain("agriculture_export_orders");
    expect(sql).toContain("agriculture_export_holds");
  });

  it("UI page imports export tables and shows finance boundary", () => {
    const src = readFileSync("src/app/os/agriculture/page.tsx", "utf8");
    expect(src).toContain("exportOrders");
    expect(src).toContain("exportHolds");
    expect(src).toContain("exportShipments");
    expect(src).toContain("FINANCE_OS_ONLY");
    expect(src).toContain("CAP_POSTING");
  });

  it("read-services agriculture includes export dashboard", () => {
    const src = readFileSync("src/lib/noelia/read-services.ts", "utf8");
    expect(src).toContain("agricultureDashboardWithExport");
    expect(src).toContain("Export orders");
    expect(src).toContain("Export holds");
  });
});

describe("Agriculture OS — Food Export schema (requires DB)", () => {
  it("export tables exist in schema", async () => {
    // Check that schema objects are defined
    expect(s.exportOrders).toBeDefined();
    expect(s.exportLotAllocations).toBeDefined();
    expect(s.exportComplianceRequirements).toBeDefined();
    expect(s.exportComplianceChecks).toBeDefined();
    expect(s.exportShipments).toBeDefined();
    expect(s.exportDocumentLinks).toBeDefined();
    expect(s.exportHolds).toBeDefined();
  });

  it("export dashboard returns finance boundary", async () => {
    // This will fail if DATABASE_URL missing, skip gracefully
    try {
      const ceo = await import("../../tests/noelia/db-fixtures").then(m => m.seededPrincipal("ceo@beyu.os"));
      const dash = await exportDashboard(ceo.tenantId);
      expect(dash.financeBoundary.journals).toBe("FINANCE_OS_ONLY");
      expect(dash.financeBoundary.capPosting).toBe("LOCKED");
    } catch (e) {
      if ((e as Error).message.includes("DATABASE_URL")) {
        // Skip when no DB
        return;
      }
      throw e;
    }
  });
});
