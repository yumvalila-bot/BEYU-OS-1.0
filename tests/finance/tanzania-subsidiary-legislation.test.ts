import { describe, expect, it } from "vitest";
import {
  getForestProduceRegulationControls,
  getTanzaniaTaxSubsidiaryInstruments,
} from "@/lib/finance/tanzania-subsidiary-legislation";

describe("Tanzania 2026 tax subsidiary legislation verification", () => {
  const instruments = getTanzaniaTaxSubsidiaryInstruments();
  const controls = getForestProduceRegulationControls();

  it("records GN 158F as reproduced-copy-only until official Gazette matching is complete", () => {
    const forest = instruments.find((item) => item.code === "TZ_GN_158F_2026_FOREST_PRODUCE");
    expect(forest).toMatchObject({
      governmentNotice: "158F of 2026",
      publicationDate: "2026-06-30",
      commencementDate: "2026-07-01",
      sourceStatus: "REPRODUCED_COPY_ONLY_OFFICIAL_GAZETTE_MATCH_PENDING",
    });
    expect(forest?.officialMetadataUri).toBeUndefined();
    expect(forest?.notes.join(" ")).toContain("not an authenticated official Gazette copy");
  });

  it("records the three other OAG-confirmed 2026 instruments without claiming text ingestion", () => {
    const vat = instruments.find((item) => item.code === "TZ_GN_158A_2026_VAT_TRAILER_DEFERMENT");
    const payments = instruments.find((item) => item.code === "TZ_GN_158C_2026_MANDATORY_EPAYMENTS");
    const customs = instruments.find((item) => item.code === "TZ_GN_158D_2026_CUSTOMS_PROCESSING_FEE");
    expect(vat).toMatchObject({ governmentNotice: "158A of 2026", sourceStatus: "OFFICIAL_METADATA_CONFIRMED_TEXT_NOT_ACQUIRED" });
    expect(payments).toMatchObject({ governmentNotice: "158C of 2026", sourceStatus: "OFFICIAL_METADATA_CONFIRMED_TEXT_NOT_ACQUIRED" });
    expect(customs).toMatchObject({ governmentNotice: "158D of 2026", sourceStatus: "OFFICIAL_METADATA_CONFIRMED_TEXT_NOT_ACQUIRED" });
  });

  it("records GN 158B and GN 158E as reproduced-source leads, not authenticated official copies", () => {
    const presumptive = instruments.find((item) => item.code === "TZ_GN_158B_2026_PRESUMPTIVE_NEW_TRADERS");
    const excise = instruments.find((item) => item.code === "TZ_GN_158E_2026_EXCISE_NON_RESIDENT");
    expect(presumptive).toMatchObject({ governmentNotice: "158B of 2026", sourceStatus: "REPRODUCED_COPY_ONLY_OFFICIAL_GAZETTE_MATCH_PENDING" });
    expect(excise).toMatchObject({ governmentNotice: "158E of 2026", sourceStatus: "REPRODUCED_COPY_ONLY_OFFICIAL_GAZETTE_MATCH_PENDING" });
  });

  it("records GN 158G using official OAG metadata without claiming text ingestion", () => {
    const taxAdmin = instruments.find((item) => item.code === "TZ_GN_158G_2026_TAX_ADMIN_GENERAL");
    expect(taxAdmin).toMatchObject({
      governmentNotice: "158G of 2026",
      publicationDate: "2026-06-30",
      commencementDate: "2026-07-01",
      sourceStatus: "OFFICIAL_METADATA_CONFIRMED_TEXT_NOT_ACQUIRED",
      officialMetadataUri: "https://oagmis.oag.go.tz/portal/legislation/4648",
    });
  });

  it("keeps all subsidiary instruments outside governed ingestion and NOELIA authority", () => {
    expect(instruments.every((item) => item.ingestionStatus === "SOURCE_LINKED_NOT_INGESTED")).toBe(true);
    expect(instruments.every((item) => item.noeliaReliance === "BLOCKED_PENDING_OFFICIAL_SOURCE_ACQUISITION_AND_SPECIALIST_REVIEW")).toBe(true);
  });

  it("covers the eight reproduced GN 158F clauses with legal cross-checks", () => {
    expect(instruments.map((item) => item.governmentNotice).sort()).toEqual([
      "158A of 2026", "158B of 2026", "158C of 2026", "158D of 2026",
      "158E of 2026", "158F of 2026", "158G of 2026",
    ]);
    expect(controls.map((control) => control.regulation)).toEqual(["3", "4", "5", "6", "7", "8", "9", "10"]);
    expect(controls.every((control) => control.verificationStatus === "PROVISIONAL_TRANSCRIPTION_NOT_OFFICIAL_GAZETTE_VERIFIED")).toBe(true);
    expect(controls.every((control) => control.legalCrossCheck.length > 0)).toBe(true);
  });

  it("does not treat regulation 3 wording as narrowing statutory section 116A triggers", () => {
    const assessment = controls.find((control) => control.regulation === "3");
    expect(assessment?.legalCrossCheck).toContain("forest-cess payment");
    expect(assessment?.legalCrossCheck).toContain("must not be read as narrowing");
  });

  it("does not convert 100 currency points into an assumed TZS amount", () => {
    const penalty = controls.find((control) => control.regulation === "10");
    expect(penalty?.legalCrossCheck).toContain("Do not convert currency points to TZS");
  });
});
