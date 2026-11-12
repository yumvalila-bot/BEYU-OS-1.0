import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("FINANCE_OS tax return draft persistence migration", () => {
  const migration = readFileSync(join(process.cwd(), "drizzle", "0077_tax_return_drafts.sql"), "utf8");
  const journal = JSON.parse(readFileSync(join(process.cwd(), "drizzle", "meta", "_journal.json"), "utf8")) as {
    entries: Array<{ idx: number; tag: string }>;
  };

  it("is registered as migration 0077", () => {
    expect(journal.entries.at(-1)).toMatchObject({ idx: 77, tag: "0077_tax_return_drafts" });
  });

  it("persists only scoped working papers with evidence-gated submission states", () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "tax_return_drafts"');
    expect(migration).toContain('"tenant_id" text NOT NULL');
    expect(migration).toContain('"legal_entity_id" text NOT NULL');
    expect(migration).toContain('"calculation_payload" jsonb NOT NULL');
    expect(migration).toContain('"filing_pack" jsonb NOT NULL');
    expect(migration).toContain("'VAT_WITHHOLDING'");
    expect(migration).toContain("'APPROVED_FOR_SUBMISSION'");
    expect(migration).toContain('"specialist_reviewer_id" IS NOT NULL');
    expect(migration).toContain('"external_reference" IS NOT NULL');
    expect(migration).toContain('"submitted_by" text');
    expect(migration).toContain('"receipt_document_id" text REFERENCES "documents"("id")');
    expect(migration).toContain('"receipt_document_id" IS NOT NULL');
    expect(migration).toContain("beyu_validate_tax_return_receipt_document");
    expect(migration).toContain("'TAX_FILING_RECEIPT'");
    expect(migration).toContain("'AUTHORITATIVE'");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("beyu_tenant_ids()");
    expect(migration).toContain("beyu.governance_classifications");
  });

  it("does not grant runtime delete or permit accepted returns without an external receipt", () => {
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE");
    expect(migration).not.toContain("GRANT SELECT, INSERT, UPDATE, DELETE");
    expect(migration).toContain('"status" <> \'ACCEPTED\' OR ("accepted_at" IS NOT NULL AND "external_reference" IS NOT NULL)');
  });
});
