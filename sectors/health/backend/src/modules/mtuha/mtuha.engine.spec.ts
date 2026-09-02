import "reflect-metadata";
import { buildTestBed } from "../../common/testing/test-bed";
import { buildMtuhaReport, MtuhaMappingRegistry } from "./mtuha.engine";

describe("MTUHA engine — no invented national codes, submission BLOCKED without mappings", () => {
  let bed: any;
  beforeAll(async () => {
    bed = await buildTestBed();
  });

  it("produces a DRAFT/BLOCKED report when mappings are absent", async () => {
    await bed.run(async () => {
      const reg = new MtuhaMappingRegistry();
      const r = await buildMtuhaReport(
        bed.conn,
        bed.tenantCtx.current?.tenantId ??
          "11111111-1111-1111-1111-111111111111",
        "HOSP-1",
        "TZ",
        null,
        { startInclusive: "2024-01-01", endExclusive: "2024-02-01" },
        reg,
        bed.tenantCtx.current?.globalUserId ??
          "00000000-0000-0000-0000-000000000001",
      );
      expect(r.submissionStatus).toBe("BLOCKED");
      expect(r.mappingStatus).toBe("incomplete");
      expect(r.submissionBlockedReason).toBe("MTUHA_MAPPINGS_INCOMPLETE");
      expect(r.missingMappings.length).toBe(0); // because no metrics are even registered yet; below we add one
    });
  });

  it("when a metric is registered without a national code, it is reported as missing and blocks submission", async () => {
    await bed.run(async () => {
      const reg = new MtuhaMappingRegistry();
      reg.registerMapping(
        "opd",
        "opd_encounters_total",
        null,
        "OPD total encounters — national code pending authoritative source",
      );
      const r = await buildMtuhaReport(
        bed.conn,
        bed.tenantCtx.current?.tenantId ??
          "11111111-1111-1111-1111-111111111111",
        "HOSP-1",
        "TZ",
        null,
        { startInclusive: "2024-01-01", endExclusive: "2024-02-01" },
        reg,
        bed.tenantCtx.current?.globalUserId ??
          "00000000-0000-0000-0000-000000000001",
      );
      expect(r.submissionStatus).toBe("BLOCKED");
      expect(r.missingMappings).toContain("opd:opd_encounters_total");
    });
  });
});
