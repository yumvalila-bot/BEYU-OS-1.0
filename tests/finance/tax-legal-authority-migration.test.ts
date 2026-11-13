import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "drizzle", "0076_tax_legal_authority_metadata.sql");
const journalPath = join(process.cwd(), "drizzle", "meta", "_journal.json");

describe("FINANCE_OS tax legal-authority metadata migration", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: Array<{ idx: number; tag: string }>;
  };

  it("is registered as the next additive migration", () => {
    // 0076 is the tax legal-authority metadata migration; 0077 (tenant-isolated
    // tax return drafts) is the NEXT additive migration and is the journal tail.
    expect(journal.entries.at(-1)).toEqual({
      idx: 77,
      version: "7",
      when: 1794510961000,
      tag: "0077_tax_return_drafts",
      breakpoints: true,
    });
    expect(journal.entries.at(-2)).toEqual({
      idx: 76,
      version: "7",
      when: 1794510960000,
      tag: "0076_tax_legal_authority_metadata",
      breakpoints: true,
    });
  });

  it("extends the canonical knowledge_sources registry instead of creating a duplicate tax store", () => {
    expect(migration).toContain('ALTER TABLE "knowledge_sources"');
    expect(migration).not.toMatch(/CREATE TABLE\s+"?tax_/i);
    expect(migration).toContain('"original_document_id" text REFERENCES "documents"("id")');
    expect(migration).toContain('"original_source_sha256"');
    expect(migration).toContain('"published_on"');
    expect(migration).toContain('"commenced_on"');
    expect(migration).toContain('"effective_to"');
  });

  it("requires original document, checksum, official source and named review evidence before authority promotion", () => {
    expect(migration).toContain('"source_type" <> \'TAX_LEGAL_AUTHORITY\'');
    expect(migration).toContain('"authority_status" <> \'AUTHORITATIVE\'');
    expect(migration).toContain('"original_document_id" IS NOT NULL');
    expect(migration).toContain('"original_source_sha256" ~');
    expect(migration).toContain('"official_source_host" IS NOT NULL');
    expect(migration).toContain('"text_validated_by" IS NOT NULL');
    expect(migration).toContain('"specialist_reviewer_id" IS NOT NULL');
    expect(migration).toContain('jsonb_array_length("provision_references") > 0');
  });
});
