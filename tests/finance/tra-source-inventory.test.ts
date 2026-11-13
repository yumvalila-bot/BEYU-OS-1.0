import { describe, expect, it } from "vitest";
import {
  getTraSourceCollectionCounts,
  getTraSourceInventory,
} from "@/lib/finance/tra-source-inventory";

describe("FINANCE_OS TRA source inventory", () => {
  const sources = getTraSourceInventory();

  it("registers all eight owner-supplied knowledge collections", () => {
    const collections = getTraSourceCollectionCounts();
    expect(collections.map((entry) => entry.code)).toEqual([
      "PRIMARY_LEGISLATION",
      "REGULATIONS_ORDERS",
      "INCOME_TAX_TABLES",
      "INTERNATIONAL_TREATIES",
      "TAX_CASE_LAW",
      "AUDIT_REPORTS",
      "CUSTOMS_DOMESTIC_FORMS",
      "PRACTICE_NOTICES",
    ]);
    expect(collections.every((entry) => entry.count > 0)).toBe(true);
  });

  it("uses stable unique inventory codes", () => {
    const codes = sources.map((source) => source.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("does not promote archive titles into ingested or authoritative law", () => {
    expect(sources.length).toBeGreaterThan(100);
    expect(sources.every((source) => source.ingestionStatus === "SOURCE_REQUIRED")).toBe(true);
    expect(sources.every((source) => source.authorityStatus === "UNVERIFIED")).toBe(true);
    expect(sources.every((source) => source.sourceAuthority === "TRA_ARCHIVE_LISTING")).toBe(true);
  });

  it("includes the supplied Tanzania primary statutes and Finance Act range", () => {
    expect(sources.some((source) => source.code === "INCOME_TAX_ACT_CAP_332")).toBe(true);
    expect(sources.some((source) => source.code === "VAT_ACT_CAP_148")).toBe(true);
    expect(sources.some((source) => source.code === "FINANCE_ACT_2007")).toBe(true);
    expect(sources.some((source) => source.code === "FINANCE_ACT_2023")).toBe(true);
  });

  it("keeps the supplied practice notices and customs form families discoverable", () => {
    expect(sources.some((source) => source.code === "TRA_PRACTICE_NOTICE_15")).toBe(true);
    expect(sources.some((source) => source.code === "TRA_CUSTOMS_FORM_001")).toBe(true);
    expect(sources.some((source) => source.code === "TRA_DOMESTIC_FORM_001")).toBe(true);
  });

  it("keeps treaty and case-law entries explicitly unverified pending original authorities", () => {
    const treaty = sources.filter((source) => source.collection === "INTERNATIONAL_TREATIES");
    const cases = sources.filter((source) => source.collection === "TAX_CASE_LAW");
    expect(treaty.length).toBeGreaterThanOrEqual(9);
    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect([...treaty, ...cases].every((source) => source.authorityStatus === "UNVERIFIED")).toBe(true);
  });
});
