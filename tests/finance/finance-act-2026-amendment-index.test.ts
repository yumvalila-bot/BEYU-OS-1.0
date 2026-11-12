import { describe, expect, it } from "vitest";
import {
  getFinanceAct2026ChangeIndex,
  getFinanceAct2026ChangesByDomain,
} from "@/lib/finance/finance-act-2026-amendment-index";

describe("Finance Act No. 2 of 2026 tax amendment index", () => {
  const changes = getFinanceAct2026ChangeIndex();

  it("indexes selected enacted amendments across the tax and customs domains", () => {
    expect(changes.length).toBeGreaterThanOrEqual(18);
    expect(new Set(changes.map((change) => change.domain))).toEqual(new Set([
      "INCOME_TAX",
      "TAX_ADMINISTRATION",
      "VAT",
      "EXCISE",
      "CUSTOMS_AND_IMPORTS",
    ]));
  });

  it("uses unique stable codes and retains precise principal-Act and Finance Act citations", () => {
    expect(new Set(changes.map((change) => change.code)).size).toBe(changes.length);
    expect(changes.every((change) => change.principalAct.length > 0)).toBe(true);
    expect(changes.every((change) => change.principalProvision.length > 0)).toBe(true);
    expect(changes.every((change) => change.financeActProvision.includes("Finance Act No. 2 of 2026"))).toBe(true);
    expect(changes.every((change) => change.sourcePages.startsWith("Printed page"))).toBe(true);
  });

  it("does not convert legislative summaries into executable tax rules", () => {
    expect(changes.every((change) => change.operationalStatus === "INDEX_ONLY_NOT_A_TAX_RULE")).toBe(true);
    expect(changes.every((change) => change.reviewGate === "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED")).toBe(true);
    expect(changes.every((change) => change.caveat.length > 0)).toBe(true);
  });

  it("captures critical provisions without broadening their legal scope", () => {
    const forest = changes.find((change) => change.code === "FA2026_IT_S116A_FOREST_PRODUCE");
    const withholdingVat = changes.find((change) => change.code === "FA2026_VAT_S5_WITHHOLDING");
    const digitalIntermediary = changes.find((change) => change.code === "FA2026_VAT_S51_DIGITAL_INTERMEDIARY");
    const frameworkExcise = changes.find((change) => change.code === "FA2026_EXCISE_S146B_FRAMEWORK");

    expect(forest?.summary).toContain("not a corporation");
    expect(forest?.caveat).toContain("Regulations");
    expect(forest?.caveat).toContain("Finance Act No. 11 of 2025");
    expect(forest?.caveat).toContain("1 January 2026");
    expect(withholdingVat?.caveat).toContain("not the general VAT rate");
    expect(digitalIntermediary?.summary).toContain("unregistered person in Mainland Tanzania");
    expect(frameworkExcise?.caveat).toContain("Gazette order");
  });

  it("groups records by domain without losing any item", () => {
    const groups = getFinanceAct2026ChangesByDomain();
    expect(groups.reduce((sum, group) => sum + group.changes.length, 0)).toBe(changes.length);
  });
});
