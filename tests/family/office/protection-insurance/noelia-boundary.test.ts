/**
 * Family Office protection — Noelia/HIVE boundary tests (§27).
 *
 * Noelia may summarize policies, prepare review packages and read gaps.
 * It may not bind coverage, change beneficiaries, approve claims or post
 * money. Here that boundary is asserted mechanically against the REAL tool
 * registry rather than by prose: every registered protection tool must be
 * side-effect-free, must read only through a permission a human principal
 * also needs, and no permission that can WRITE the protection domain may be
 * bound to any tool at all.
 */
import { describe, expect, it } from "vitest";
import { createDefaultNoeliaToolRegistry } from "../../../../src/lib/noelia/default-tools";

const WRITE_PERMISSIONS = [
  "familyoffice:protection.manage",
  "familyoffice:beneficiary.manage",
  "familyoffice:claim.manage",
] as const;

describe("Noelia protection boundary — read/summarize only (§27)", () => {
  const registry = createDefaultNoeliaToolRegistry();
  const tools = registry.list().filter((t) => t.registered);

  it("the protection read tools are registered and side-effect-free", () => {
    const names = tools.filter((t) => t.name.startsWith("family.protection."));
    expect(names.map((t) => t.name).sort()).toEqual(["family.protection.policies", "family.protection.review-package"]);
    for (const tool of names) {
      expect(tool.metadata.sideEffects).toBe("NONE");
      expect(tool.permission).toBe("familyoffice:protection.read");
      expect(tool.metadata.approvalRequirements).toBeNull();
      expect(tool.metadata.auditRequirements?.event).toBe("NOELIA_TOOL_INVOKED");
    }
  });

  it("no tool in the registry can write the protection domain — directly or by permission", () => {
    for (const permission of WRITE_PERMISSIONS) {
      const bound = tools.filter((t) => t.permission === permission);
      expect(bound.map((t) => t.name), `permission ${permission} bound to a tool`).toEqual([]);
    }
  });

  it("the MFA-gated designation permission exists and is HIGH_RISK (Noelia cannot step up)", async () => {
    const { HIGH_RISK_PERMISSIONS, PERMISSIONS } = await import("../../../../src/lib/constants");
    expect(Object.keys(PERMISSIONS)).toContain("familyoffice:beneficiary.manage");
    expect(HIGH_RISK_PERMISSIONS).toContain("familyoffice:beneficiary.manage");
    // ...and it stays unbound to any tool (re-asserted here because it is the
    // single permission whose silent binding would let an AI edit who receives
    // a death benefit).
    const bound = tools.filter((t) => t.permission === "familyoffice:beneficiary.manage");
    expect(bound).toEqual([]);
  });

  it("no AI-tool path reaches the Finance posting engine from this domain (§22/§32)", async () => {
    // Capability-locked by design: this module never imports the posting
    // engine, and no protection tool declares a finance permission. Pin both.
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const service = readFileSync(resolve(process.cwd(), "src/lib/family-office-protection-service.ts"), "utf8");
    // Prose mentions of CAP_POSTING are documentation; pin the absence of any
    // import or invocation of the posting machinery instead.
    expect(service).not.toMatch(/from "@\/lib\/finance\/posting-engine"/);
    expect(service).not.toMatch(/requireCapability\s*\(/);
    const financeBound = tools.filter((t) => String(t.permission).startsWith("finance:") && String(t.name).startsWith("family."));
    expect(financeBound).toEqual([]);
  });
});
