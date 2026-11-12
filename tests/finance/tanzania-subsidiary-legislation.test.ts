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
