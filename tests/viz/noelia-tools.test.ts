/**
 * Noelia/HIVE governed visualization tools.
 *
 * The tools extend the canonical Noelia identity — they are NOT a second AI
 * system. Both are sideEffects NONE (no scene creation, no twin registration,
 * no export, no sector mutation has a tool path). The registry RBAC gate runs
 * first; the handlers then re-authorize through the SAME governed adapter
 * path the UI uses, so a tool response can never be wider than the screen —
 * and a sector refusal is reported honestly, never papered over with an
 * empty "OK".
 */
import { describe, expect, it } from "vitest";
import { createDefaultNoeliaToolRegistry } from "@/lib/noelia/default-tools";
import { requestedNoeliaTarget, resolveNoeliaAuthorizedScope } from "@/lib/noelia/scope-service";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { seededPrincipal } from "../noelia/db-fixtures";
import type { Principal } from "@/lib/authz";

const registry = createDefaultNoeliaToolRegistry();

async function invoke(principal: Principal, tool: string, input: unknown) {
  return withTenantDatabaseContext(principal, async () => {
    const scope = await resolveNoeliaAuthorizedScope(principal);
    const target = requestedNoeliaTarget(principal, null);
    return registry.invoke(tool, { principal, traceId: `TRACEVZN${Date.now()}`, target, scope }, input);
  });
}

describe("governed tool contracts", () => {
  it("both viz tools are registered, declared and sideEffects NONE", () => {
    for (const name of ["viz.dimensions.explain", "viz.scene.summarize"]) {
      const definition = registry.definition(name);
      expect(definition, `${name} must be declared`).not.toBeNull();
      expect(definition!.metadata.sideEffects).toBe("NONE");
      expect(definition!.metadata.domain).toBe("VISUALIZATION");
      expect(definition!.metadata.idempotent).toBe(true);
      expect(definition!.metadata.auditRequirements?.event).toBe("NOELIA_TOOL_INVOKED");
    }
    expect(registry.definition("viz.dimensions.explain")!.permission).toBe("viz:registry.read");
    expect(registry.definition("viz.scene.summarize")!.permission).toBe("viz:scene.read");
  });

  it("no viz tool exists for scene creation, twin registration or export (human-governed only)", () => {
    const names = registry.list().map((t) => t.name);
    expect(names.some((n) => n.startsWith("viz.") && /create|register|export|archive|mutate|post/i.test(n))).toBe(false);
  });
});

describe("viz.dimensions.explain", () => {
  it("explains the registry for an authorized principal", async () => {
    const admin = await seededPrincipal("admin@beyu.os");
    const result = await invoke(admin, "viz.dimensions.explain", {});
    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    expect(result.output.headline).toMatch(/Universal Dimension Registry/i);
    expect((result.output.findings ?? []).length).toBeGreaterThanOrEqual(9);
    expect(result.output.humanReviewRequired).toBe(false);
  });

  it("names the sector adapter supply honestly when a sector is given", async () => {
    const admin = await seededPrincipal("admin@beyu.os");
    const result = await invoke(admin, "viz.dimensions.explain", { sector: "HEALTH" });
    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    const adapterFinding = (result.output.findings ?? []).find((f) => f.label === "HEALTH adapter");
    expect(adapterFinding).toBeDefined();
    // Health is federation-governed and PARTIALLY_IMPLEMENTED — the tool says so.
    expect(adapterFinding!.value).toMatch(/PARTIALLY_IMPLEMENTED|NOT_IMPLEMENTED|PLANNED/);
  });

  it("is denied for a principal without viz:registry.read (family)", async () => {
    const family = await seededPrincipal("family@beyu.os");
    const result = await invoke(family, "viz.dimensions.explain", {});
    expect(result.allowed).toBe(false);
  });
});

describe("viz.scene.summarize", () => {
  it("summarizes the authorized UJENZI scene shape for ujenzi.ops", async () => {
    const ujenziOps = await seededPrincipal("ujenzi.ops@beyu.os");
    const result = await invoke(ujenziOps, "viz.scene.summarize", { sector: "UJENZI", dimensions: ["1D", "5D"] });
    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    const labels = (result.output.findings ?? []).map((f) => f.label);
    expect(labels).toContain("Objects");
    expect(labels).toContain("Dimensions activated");
    // Shape/status metadata only — never row-level values.
    expect(result.output.headline).toMatch(/UJENZI scene: \d+ governed object/i);
  });

  it("refuses a cross-sector summary HONESTLY (registry RBAC passes, sector boundary holds)", async () => {
    const ujenziOps = await seededPrincipal("ujenzi.ops@beyu.os");
    const result = await invoke(ujenziOps, "viz.scene.summarize", { sector: "FOUNDATION", dimensions: ["1D"] });
    expect(result.allowed).toBe(true); // tool-level RBAC: ujenzi.ops holds viz:scene.read
    if (!result.allowed) return;
    // …but the sector boundary refuses: the output declares the refusal,
    // it never fabricates an empty authorized-looking summary.
    expect(result.output.headline).toMatch(/refused/i);
    expect((result.output.limitations ?? []).length).toBeGreaterThan(0);
    expect(result.output.findings ?? []).toEqual([]);
  });

  it("is denied for a principal without viz:scene.read (family)", async () => {
    const family = await seededPrincipal("family@beyu.os");
    const result = await invoke(family, "viz.scene.summarize", { sector: "UJENZI" });
    expect(result.allowed).toBe(false);
  });

  it("invalid input is rejected by the declared contract before any service is reached", async () => {
    const admin = await seededPrincipal("admin@beyu.os");
    const result = await invoke(admin, "viz.scene.summarize", { sector: "NOT_A_SECTOR" });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.decision.code).toBe("INPUT_INVALID");
  });
});
