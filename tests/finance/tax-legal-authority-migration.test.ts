import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "drizzle", "0080_tax_legal_authority_metadata.sql");
const journalPath = join(process.cwd(), "drizzle", "meta", "_journal.json");

describe("FINANCE_OS tax legal-authority metadata migration", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: Array<{ idx: number; tag: string }>;
  };

  it("is registered as the next additive migration", () => {
    // 0080 is the tax legal-authority metadata migration; 0081 (tenant-isolated
    // tax return drafts) is the NEXT additive migration. Both follow the MCM
    // range 0076-0079, which reached main first.
    //
    // These are addressed BY TAG rather than as the journal TAIL: the tail moves
    // every time any later migration is added (0082 added the canonical namespace
    // alignment), and pinning an absolute tail made this suite fail for a reason
    // unrelated to tax. What actually matters — and is asserted here — is that
    // both are present, in order, with their recorded metadata unchanged.
    const at = (tag: string) => journal.entries.findIndex((e) => e.tag === tag);
    expect(at("0080_tax_legal_authority_metadata")).toBeGreaterThan(-1);
    expect(at("0081_tax_return_drafts")).toBe(at("0080_tax_legal_authority_metadata") + 1);
    expect(journal.entries[at("0081_tax_return_drafts")]).toEqual({
      idx: 81,
      version: "7",
      when: 1794570192389,
      tag: "0081_tax_return_drafts",
      breakpoints: true,
    });
    expect(journal.entries[at("0080_tax_legal_authority_metadata")]).toEqual({
      idx: 80,
      version: "7",
      when: 1794570191389,
      tag: "0080_tax_legal_authority_metadata",
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
