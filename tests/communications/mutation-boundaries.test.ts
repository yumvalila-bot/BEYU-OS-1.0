import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Supplement real HTTP tests with catalogue coverage: a new or edited route
// must not silently reintroduce an unbounded read before the idempotency claim.
const paths = ["approval", "broadcasts", "cases", "consent", "contacts", "conversations", "documents", "feedback", "invoice", "journeys", "messages", "providers", "reports", "scheduled", "templates"];
describe("communications idempotent mutation boundaries", () => {
  it("reads bounded strict JSON once and validates before claiming the original payload", () => {
    const root = join(process.cwd(), "src/app/api/v1/communications");
    const existing = readdirSync(root);
    for (const name of paths) {
      expect(existing).toContain(name);
      const source = readFileSync(join(root, name, "route.ts"), "utf8");
      expect(source.match(/readBoundedJson\(request, \{ strict: true \}\)/g), name).toHaveLength(1);
      const bounded = source.indexOf("const payload = await readBoundedJson");
      const validated = source.indexOf(".parse(payload)", bounded);
      const claimed = source.indexOf("return withIdempotency(", validated);
      expect(bounded, name).toBeGreaterThan(-1);
      expect(validated, name).toBeGreaterThan(bounded);
      expect(claimed, name).toBeGreaterThan(validated);
      expect(source.slice(claimed), name).toMatch(/withIdempotency\(ctx, "communications\.[^"]+", payload,/);
      expect(source, name).not.toMatch(/request\.(json|text|formData|arrayBuffer)\(/);
    }
  });
});
