import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("FINANCE_OS tax-return RLS", () => {
  const migration = readFileSync(join(process.cwd(), "drizzle", "0077_tax_return_drafts.sql"), "utf8");

  it("uses tenant, classification and legal-entity scope for both visibility and writes", () => {
    const policy = migration.slice(migration.indexOf('CREATE POLICY "tax_return_drafts_scope"'));
    expect(policy).toContain('"tenant_id" = ANY (beyu_tenant_ids())');
    expect(policy).toContain('"classification"::text = ANY (string_to_array(current_setting');
    expect(policy).toContain('EXISTS (');
    expect(policy).toContain('e."tenant_id" = "tax_return_drafts"."tenant_id"');
    expect(policy).toContain('WITH CHECK (');
    expect(policy.match(/"classification"::text = ANY/g)).toHaveLength(2);
  });

  it("forces row-level security and does not grant runtime DELETE", () => {
    expect(migration).toContain('ALTER TABLE "tax_return_drafts" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE "tax_return_drafts" FORCE ROW LEVEL SECURITY');
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE ON \"tax_return_drafts\" TO beyu_runtime");
    expect(migration).not.toContain("GRANT DELETE ON \"tax_return_drafts\" TO beyu_runtime");
  });
});
