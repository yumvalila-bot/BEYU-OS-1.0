import { describe, expect, it } from "vitest";
import {
  getEnactedTaxAuthorities,
  getVerifiedTaxAuthorities,
} from "@/lib/finance/verified-tax-authorities";

describe("Tanzania verified tax authority register", () => {
  const records = getVerifiedTaxAuthorities();

  it("distinguishes the enacted Finance Act 2026 from the earlier Bill", () => {
    const act = records.find((record) => record.code === "TZ_FINANCE_ACT_2026_NO_2");
    const bill = records.find((record) => record.code === "TZ_FINANCE_BILL_2026_NO_3");

    expect(act).toMatchObject({
      instrumentKind: "ACT",
      status: "ENACTED",
      enactmentNumber: "2 of 2026",
      enactmentDate: "2026-06-25",
      publicationDate: "2026-06-30",
      commencementDate: "2026-07-01",
    });
    expect(bill).toMatchObject({
      instrumentKind: "BILL",
      status: "BILL_NOT_LAW",
      publicationDate: "2026-06-15",
      supersededBy: "TZ_FINANCE_ACT_2026_NO_2",
    });
  });

  it("never treats source discovery as knowledge ingestion or NOELIA authority", () => {
    expect(records.every((record) => record.ingestionStatus === "SOURCE_LINKED_NOT_INGESTED")).toBe(true);
    expect(records.every((record) => record.noeliaReliance === "BLOCKED_PENDING_GOVERNED_INGESTION_AND_REVIEW")).toBe(true);
  });

  it("only returns the enacted instrument from the enacted-authority selector", () => {
    expect(getEnactedTaxAuthorities().map((record) => record.code)).toEqual([
      "TZ_FINANCE_ACT_2025_NO_11",
      "TZ_FINANCE_ACT_2026_NO_2",
    ]);
  });

  it("preserves the 2025 forest-produce provision as an earlier legal version", () => {
    const act2025 = records.find((record) => record.code === "TZ_FINANCE_ACT_2025_NO_11");
    expect(act2025).toMatchObject({
      instrumentKind: "ACT",
      status: "ENACTED",
      enactmentNumber: "11 of 2025",
      enactmentDate: "2025-06-25",
      commencementDate: "2025-07-01",
    });
    expect(act2025?.notes.join(" ")).toContain("1 January 2026");
    expect(act2025?.notes.join(" ")).toContain("repealed and replaced");
  });

  it("records the enacted presumptive and VAT-withholding amendments", () => {
    const act = records.find((record) => record.code === "TZ_FINANCE_ACT_2026_NO_2")!;
    const notes = act.notes.join(" ");
    expect(notes).toContain("4.0% above TZS 11m");
    expect(notes).toContain("fifteen percent for goods and twelve percent for services");
    expect(notes).toContain("within ten days");
  });

  it("uses official government and parliamentary source hosts", () => {
    const act = records.find((record) => record.code === "TZ_FINANCE_ACT_2026_NO_2")!;
    const act2025 = records.find((record) => record.code === "TZ_FINANCE_ACT_2025_NO_11")!;
    const bill = records.find((record) => record.code === "TZ_FINANCE_BILL_2026_NO_3")!;
    expect(act.officialMetadataUri).toMatch(/^https:\/\/oagmis\.oag\.go\.tz\//);
    expect(act2025.officialMetadataUri).toMatch(/^https:\/\/oagmis\.oag\.go\.tz\//);
    expect(act2025.officialDocumentUri).toMatch(/^https:\/\/oagmis\.oag\.go\.tz\//);
    expect(act.officialDocumentUri).toMatch(/^https:\/\/elibrary\.osg\.go\.tz\/bitstreams\//);
    expect(bill.officialMetadataUri).toMatch(/^https:\/\/oagmis\.oag\.go\.tz\//);
    expect(bill.officialDocumentUri).toMatch(/^https:\/\/polis\.parliament\.go\.tz\//);
  });
});
