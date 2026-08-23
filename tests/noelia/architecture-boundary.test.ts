import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("Noelia architectural boundary", () => {
  it("keeps the intelligence facade and runtime free of direct database access", () => {
    for (const path of [
      "src/lib/noelia.ts",
      "src/lib/noelia/runtime.ts",
      "src/lib/noelia/tool-registry.ts",
    ]) {
      const value = source(path);
      expect(value, path).not.toMatch(/from ["']@\/db["']/);
      expect(value, path).not.toContain("new Pool(");
      expect(value, path).not.toContain("drizzle(");
    }
  });

  it("permits DB access only inside named BEYU service adapters", () => {
    const facade = source("src/lib/noelia.ts");
    expect(facade).toContain("createDefaultNoeliaToolRegistry");
    expect(facade).toContain("withTenantDatabaseContext");
    expect(source("src/lib/noelia/read-services.ts")).toContain("hasDatabaseTransactionContext");
    expect(source("src/lib/noelia/memory.ts")).toContain("hasDatabaseTransactionContext");
  });

  it("binds HTTP to the shared guarded identity and authorization boundary", () => {
    const route = source("src/app/api/v1/ai/noelia/route.ts");
    expect(route).toContain("guarded(");
    expect(route).toContain('permission: "ai:noelia.query"');
    expect(route).toContain("parseBody");
  });

  it("keeps approval and execution actor semantics separate", () => {
    const actions = source("src/lib/noelia/actions.ts");
    expect(actions).toContain('actorType: "HUMAN"');
    expect(actions).toContain('actorType: "AI"');
    expect(actions).toContain("requestingHuman");
    expect(actions).toContain("executingAi");
    expect(actions).toContain("approvingHuman");
  });

  it("uses transaction-local context and no Noelia-specific database client", () => {
    const files = [
      "src/lib/noelia/actions.ts",
      "src/lib/noelia/memory.ts",
      "src/lib/noelia/platform-services.ts",
      "src/lib/noelia/read-services.ts",
      "src/lib/noelia/scope-service.ts",
    ];
    for (const path of files) {
      const value = source(path);
      expect(value, path).not.toContain("new Pool(");
      expect(value, path).not.toContain("drizzle(");
    }
    expect(source("src/lib/noelia/actions.ts")).toContain("withTenantDatabaseContext");
  });
});
