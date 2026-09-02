import "reflect-metadata";
import { buildTestBed, TEST_ACTOR } from "../../common/testing/test-bed";
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
        bed.audit,
        bed.tenantCtx,
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
        bed.audit,
        bed.tenantCtx,
      );
      expect(r.submissionStatus).toBe("BLOCKED");
      expect(r.missingMappings).toContain("opd:opd_encounters_total");
    });
  });

  /**
   * The engine used to write its audit row with raw SQL naming `actor_type`,
   * `actor_id` and `action` and `RETURNING id`. Those columns were taken from
   * the ROOT BEYU OS audit_log schema (drizzle/0000_kernel_v1_baseline.sql has
   * actor_type/action); Health's health.audit_log has none of them — its actor
   * column is actor_global_user_id, its action column is operation and its key
   * is audit_id. Every insert failed and an empty catch discarded it, so
   * auditRecordId was permanently null and no MTUHA run was ever audited.
   */
  it("records its run in the canonical health.audit_log and returns the real audit id", async () => {
    await bed.run(async () => {
      const reg = new MtuhaMappingRegistry();
      const r = await buildMtuhaReport(
        bed.conn,
        TEST_ACTOR.tenantId,
        "HOSP-1",
        "TZ",
        null,
        { startInclusive: "2024-01-01", endExclusive: "2024-02-01" },
        reg,
        TEST_ACTOR.globalUserId,
        bed.audit,
        bed.tenantCtx,
      );

      // No silent audit loss: the compliance-evidence reference is populated.
      expect(r.auditRecordId).toBeTruthy();
      expect(r.auditRecordId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );

      const rows: any = await bed.conn.query(
        `SELECT operation, resource_type, resource_id, tenant_id,
                entity_code, country_code, actor_global_user_id,
                entry_hash, metadata
           FROM health.audit_log WHERE audit_id=$1::uuid`,
        [r.auditRecordId],
      );
      const row = (rows.rows ?? rows)[0];
      expect(row).toBeTruthy();
      expect(row.operation).toBe("mtuha.report.generate");
      expect(row.resource_type).toBe("mtuha_report");
      expect(row.resource_id).toBe("2024-01-01:2024-02-01");

      // Full context preserved, and the actor is a real GlobalUserID — the
      // 'user'/actor_id pair maps exactly onto actor_global_user_id.
      expect(row.tenant_id).toBe(TEST_ACTOR.tenantId);
      expect(row.entity_code).toBe(TEST_ACTOR.entityCode);
      expect(row.country_code).toBe(TEST_ACTOR.countryCode);
      expect(row.actor_global_user_id).toBe(TEST_ACTOR.globalUserId);

      // It participates in the tamper-evident chain like every other entry.
      expect(row.entry_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.metadata.mappingStatus).toBe("incomplete");
      expect(row.metadata.submissionStatus).toBe("BLOCKED");
    });
  });

  it("does not fabricate an actor: a caller-supplied actor that differs from the authenticated one is refused", async () => {
    await bed.run(async () => {
      const reg = new MtuhaMappingRegistry();
      await expect(
        buildMtuhaReport(
          bed.conn,
          TEST_ACTOR.tenantId,
          "HOSP-1",
          "TZ",
          null,
          { startInclusive: "2024-01-01", endExclusive: "2024-02-01" },
          reg,
          "99999999-9999-4999-9999-999999999999", // not the authenticated actor
          bed.audit,
          bed.tenantCtx,
        ),
      ).rejects.toThrow(/MTUHA actor mismatch/);

      const rows: any = await bed.conn.query(
        `SELECT count(*)::int AS n FROM health.audit_log
          WHERE operation='mtuha.report.generate'
            AND actor_global_user_id='99999999-9999-4999-9999-999999999999'::uuid`,
      );
      expect((rows.rows ?? rows)[0].n).toBe(0);
    });
  });

  it("writes no MTUHA audit row to any non-canonical table (no parallel audit architecture)", async () => {
    const rows: any = await bed.conn.query(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_name IN ('audit_events')`,
    );
    expect((rows.rows ?? rows)[0].n).toBe(0);
  });
});
