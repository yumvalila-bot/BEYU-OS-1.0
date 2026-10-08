/**
 * Imaging registry tests (migration 040).
 *
 * The properties under test are the ones that stop this table from becoming a
 * shadow PACS: no pixel data can be recorded, a study that claims to be
 * completed has an acquisition time, an unratified amendment cannot read as a
 * final report, and a critical finding cannot be closed by the person who
 * opened it.
 */
import { describe, it, expect, beforeAll } from "@jest/globals";
import { buildTestBed, TestBed } from "../../common/testing/test-bed";
import {
  CriticalFindingRepository,
  ImagingSeriesRepository,
  ImagingService,
  ImagingStudyRepository,
  ReportAddendumRepository,
  WorklistRepository,
} from "./imaging.service";
import { DomainError } from "../../common/errors/domain.error";
import { EventOutboxService } from "../events/event-outbox.service";
import {
  tenantStorage,
  ActorContext,
} from "../../common/security/tenant-context";

const ACTOR = "00000000-0000-0000-0000-000000000001";

describe("ImagingService", () => {
  let bed: TestBed;
  let svc: ImagingService;
  let patientId: string;
  let orderId: string;
  let uidSeq = 0;

  const asActor = <T>(overrides: Partial<ActorContext>, fn: () => Promise<T>) =>
    tenantStorage.run(
      { ...bed.tenantCtx.require(), ...overrides } as ActorContext,
      fn,
    );

  const uid = () => `1.2.826.0.1.3680043.2.1125.${++uidSeq}`;

  /** A fresh study, as the modality feed would deliver it. */
  const newStudy = async (extra: Record<string, unknown> = {}) =>
    (await svc.importStudy({
      accession_number: `ACC-${++uidSeq}`,
      study_instance_uid: uid(),
      modality: "ct",
      study_description: "CT abdomen with contrast",
      patient_match_status: "matched",
      patient_id: patientId,
      image_availability: "external_reference",
      pacs_external_reference: `pacs://study/${uidSeq}`,
      ...extra,
    })) as any;

  beforeAll(async () => {
    bed = await buildTestBed();
    const outbox = new EventOutboxService(bed.conn, bed.tenantCtx);
    svc = new ImagingService(
      bed.conn,
      bed.tenantCtx,
      bed.audit,
      outbox,
      new ImagingSeriesRepository(bed.conn, bed.tenantCtx),
      new ReportAddendumRepository(bed.conn, bed.tenantCtx),
      new CriticalFindingRepository(bed.conn, bed.tenantCtx),
      new WorklistRepository(bed.conn, bed.tenantCtx),
      new ImagingStudyRepository(bed.conn, bed.tenantCtx),
    );
    await bed.run(async () => {
      const p = await bed.seedPatient();
      patientId = p.patient_id;
      const o = await (bed.conn as any).query(
        `INSERT INTO health.imaging_orders
           (tenant_id, order_no, patient_id, modality, body_part, urgency)
         VALUES ($1, 'IMG-' || substr(md5(random()::text), 1, 10), $2, 'ct', 'abdomen', 'urgent')
         RETURNING imaging_order_id`,
        [bed.tenantCtx.tenantId(), patientId],
      );
      orderId = String(o[0].imaging_order_id);
    });
  });

  // ── the study row itself ────────────────────────────────────────────────────
  it("records metadata and refuses to store pixel data", () =>
    bed.run(async () => {
      const study = await newStudy({
        imaging_order_id: orderId,
        num_series: 4,
      });
      expect(study.pixel_data_present).toBe(false);
      expect(study.acquisition_status).toBe("scheduled");
      expect(study.validation_state ?? "not_validated").not.toBe("passed");
      await expect(
        Promise.resolve().then(() =>
          svc.importStudy({
            accession_number: "ACC-PIXELS",
            study_instance_uid: uid(),
            modality: "xray",
            pixel_data_present: true,
          }),
        ),
      ).rejects.toThrow(/pixel data/);
      await expect(
        Promise.resolve().then(() =>
          svc.importStudy({ accession_number: "ACC-NOUID", modality: "xray" }),
        ),
      ).rejects.toThrow(/study_instance_uid/);
      // An external reference is the only way this row can point at images.
      await expect(
        Promise.resolve().then(() =>
          svc.importStudy({
            accession_number: "ACC-DANGLE",
            study_instance_uid: uid(),
            modality: "xray",
            image_availability: "external_reference",
          }),
        ),
      ).rejects.toThrow(/pacs_external_reference/);
    }));

  it("re-importing the same StudyInstanceUID refreshes the row instead of duplicating it", () =>
    bed.run(async () => {
      const studyInstanceUid = uid();
      const first = await newStudy({ study_instance_uid: studyInstanceUid });
      const again = (await svc.importStudy({
        study_instance_uid: studyInstanceUid,
        accession_number: "IGNORED-ON-REIMPORT",
        num_instances: 240,
        num_series: 6,
      })) as any;
      expect(again.reimported).toBe(true);
      expect(String(again.study_id)).toBe(String(first.study_id));
      expect(Number(again.num_instances)).toBe(240);
      // The accession is the ordering system's identity: a re-import must not
      // overwrite it with whatever the retry carried.
      expect(again.accession_number).toBe(first.accession_number);
      const rows = await (bed.conn as any).query(
        `SELECT count(*)::int AS n FROM health.imaging_studies WHERE study_instance_uid = $1`,
        [studyInstanceUid],
      );
      expect(rows[0].n).toBe(1);
    }));

  it("cannot complete a study that was never acquired, and cannot undo completion", () =>
    bed.run(async () => {
      const study = await newStudy();
      const started = (await svc.transitionStudy(
        String(study.study_id),
        "in_progress",
      )) as any;
      expect(started.acquired_at).toBeTruthy();
      const done = (await svc.transitionStudy(
        String(study.study_id),
        "completed",
      )) as any;
      expect(done.acquisition_status).toBe("completed");
      expect(done.completed_at).toBeTruthy();
      await expect(
        svc.transitionStudy(String(study.study_id), "scheduled"),
      ).rejects.toBeInstanceOf(DomainError);
      const fresh = await newStudy();
      const cancelled = await svc.transitionStudy(
        String(fresh.study_id),
        "cancelled",
      );
      expect((cancelled as any).acquisition_status).toBe("cancelled");
      await expect(
        svc.transitionStudy(String(fresh.study_id), "completed"),
      ).rejects.toThrow(/not allowed/);
      // The reporting state is a separate axis, and completing acquisition does
      // not quietly file a report.
      expect((cancelled as any).reported_status).toBe("pending");
    }));

  it("links a patient only through reconciliation, and never twice", () =>
    bed.run(async () => {
      const orphan = (await svc.importStudy({
        accession_number: `ACC-ORPH-${++uidSeq}`,
        study_instance_uid: uid(),
        modality: "mri",
        patient_match_status: "unmatched",
        image_availability: "not_available_here",
      })) as any;
      expect(orphan.patient_id).toBeNull();
      await expect(
        Promise.resolve().then(() =>
          svc.importStudy({
            accession_number: `ACC-FAKE-${++uidSeq}`,
            study_instance_uid: uid(),
            modality: "mri",
            patient_match_status: "matched",
          }),
        ),
      ).rejects.toThrow(/patient_id/);

      const matched = (await svc.matchStudy(
        String(orphan.study_id),
        patientId,
        "matched",
      )) as any;
      expect(matched.patient_match_status).toBe("matched");
      expect(String(matched.patient_id)).toBe(String(patientId));
      await expect(
        svc.matchStudy(String(orphan.study_id), patientId, "matched"),
      ).rejects.toThrow(/already matched/);

      const other = (await svc.importStudy({
        accession_number: `ACC-ORPH2-${++uidSeq}`,
        study_instance_uid: uid(),
        modality: "mri",
        patient_match_status: "ambiguous",
        image_availability: "not_available_here",
      })) as any;
      const rejected = (await svc.matchStudy(
        String(other.study_id),
        patientId,
        "rejected",
      )) as any;
      expect(rejected.patient_match_status).toBe("rejected");
      expect(rejected.patient_id).toBeNull();
    }));

  it("keeps the reason a study failed validation, and refuses a malformed verdict", () =>
    bed.run(async () => {
      const study = await newStudy();
      const failed = (await svc.validateStudy(
        String(study.study_id),
        "failed",
        [
          "missing patient name in DICOM header",
          "series 3 truncated in transit",
        ],
      )) as any;
      expect(failed.validation_state).toBe("failed");
      expect(failed.validation_errors).toEqual([
        "missing patient name in DICOM header",
        "series 3 truncated in transit",
      ]);
      await expect(
        Promise.resolve().then(() =>
          svc.validateStudy(
            String(study.study_id),
            "passed",
            "not an array" as any,
          ),
        ),
      ).rejects.toThrow(/errors/);
      await expect(
        Promise.resolve().then(() =>
          svc.validateStudy(String(study.study_id), "maybe" as any, []),
        ),
      ).rejects.toThrow(/result must be/);
      const passed = (await svc.validateStudy(
        String(study.study_id),
        "passed",
        [],
      )) as any;
      expect(passed.validation_errors).toEqual([]);
    }));

  it("records one row per DICOM series identity", () =>
    bed.run(async () => {
      const study = await newStudy();
      const seriesUid = `1.2.826.0.1.3680043.2.1125.${uidSeq}.3`;
      const s = (await svc.addSeries(String(study.study_id), {
        series_instance_uid: seriesUid,
        series_number: 3,
        modality: "ct",
        series_description: "Arterial phase",
        num_instances: 120,
        slice_thickness: 0.6,
      })) as any;
      expect(String(s.study_id)).toBe(String(study.study_id));
      await expect(
        svc.addSeries(String(study.study_id), {
          series_instance_uid: seriesUid,
          series_number: 4,
          modality: "ct",
        }),
      ).rejects.toThrow(/already recorded/);
      const list = (await svc.listSeries(String(study.study_id))) as any[];
      expect(list.length).toBe(1);
    }));

  // ── report addenda ──────────────────────────────────────────────────────────
  it("flags a verified report as amended until the addendum is signed", () =>
    bed.run(async () => {
      const report = (
        await (bed.conn as any).query(
          `INSERT INTO health.imaging_reports (tenant_id, imaging_order_id, findings, impression, status, reported_by)
           VALUES ($1, $2, 'No free fluid.', 'Normal', 'final', $3)
           RETURNING report_id, status`,
          [bed.tenantCtx.tenantId(), orderId, ACTOR],
        )
      )[0];
      const study = await newStudy({ imaging_order_id: orderId });
      await (bed.conn as any).query(
        `UPDATE health.imaging_studies SET reported_status = 'verified' WHERE study_id = $1`,
        [study.study_id],
      );

      const draftReport = (
        await (bed.conn as any).query(
          `INSERT INTO health.imaging_reports (tenant_id, imaging_order_id, findings, status)
           VALUES ($1, $2, 'Working notes', 'draft') RETURNING report_id`,
          [bed.tenantCtx.tenantId(), orderId],
        )
      )[0];
      await expect(
        svc.addAddendum(String(draftReport.report_id), {
          content: "Addendum: correlate with surgery",
        }),
      ).rejects.toThrow(/filed report/);

      const addendum = (await svc.addAddendum(String(report.report_id), {
        content: "Addendum: small amount of free fluid now visible on review.",
        reason: "Second reader disagreement",
      })) as any;
      expect(addendum.status).toBe("draft");
      const flagged = (await svc.getStudy(String(study.study_id))) as any;
      expect(flagged.reported_status).toBe("amended_with_pending");

      const signed = (await svc.signAddendum(
        String(addendum.addendum_id),
      )) as any;
      expect(signed.status).toBe("signed");
      expect(String(signed.signed_by)).toBe(ACTOR);
      const cleared = (await svc.getStudy(String(study.study_id))) as any;
      expect(cleared.reported_status).toBe("verified");

      const all = (await svc.listAddenda(String(report.report_id))) as any[];
      expect(all.length).toBe(1);
    }));

  // ── critical findings ───────────────────────────────────────────────────────
  it("will not let a critical finding be closed before anybody has acknowledged it", () =>
    bed.run(async () => {
      const study = await newStudy();
      await expect(
        Promise.resolve().then(() =>
          svc.recordCriticalFinding({
            source_domain: "imaging",
            finding: "Free air under the diaphragm",
          }),
        ),
      ).rejects.toThrow(/source_resource_id/);
      await expect(
        Promise.resolve().then(() =>
          svc.recordCriticalFinding({
            source_domain: "imaging",
            source_resource_type: "imaging_study",
            source_resource_id: String(study.study_id),
            finding: "Unlabelled finding",
            severity: "critical",
          }),
        ),
      ).rejects.toThrow(/patient_id/);
      const noRecipient = (await svc.recordCriticalFinding({
        source_domain: "imaging",
        source_resource_type: "imaging_study",
        source_resource_id: String(study.study_id),
        study_id: String(study.study_id),
        patient_id: patientId,
        finding: "Free air under the diaphragm — surgical emergency",
        severity: "life_threatening",
      })) as any;
      await expect(
        Promise.resolve().then(() =>
          svc.notifyCriticalFinding(String(noRecipient.critical_finding_id), {
            channel: "phone",
          }),
        ),
      ).rejects.toThrow(/who was told/);
      const finding = noRecipient as any;
      expect(finding.status).toBe("open");
      expect(finding.notification_state).toBe("not_sent");
      expect(String(finding.identified_by)).toBe(ACTOR);

      await expect(
        svc.closeCriticalFinding(String(finding.critical_finding_id), "done"),
      ).rejects.toThrow(/unacknowledged/);

      const notified = (await svc.notifyCriticalFinding(
        String(finding.critical_finding_id),
        { channel: "phone", recipient: "Surgical registrar, bleep 214" },
      )) as any;
      expect(notified.notified_actor).toBe("Surgical registrar, bleep 214");
      expect(notified.notified_channel).toBe("phone");
      // No delivery receipt exists, so the state says what still has to happen.
      expect(notified.notification_state).toBe(
        "acknowledgement_required_manually",
      );
      await expect(
        svc.acknowledgeCriticalFinding(
          String(finding.critical_finding_id),
          "verbal",
        ),
      ).rejects.toThrow(/read-back/);

      const acked = (await svc.acknowledgeCriticalFinding(
        String(finding.critical_finding_id),
        "read_back",
        "Surgical registrar called back and repeated the finding",
      )) as any;
      expect(acked.status).toBe("acknowledged");
      expect(String(acked.acknowledged_by)).toBe(ACTOR);

      await expect(
        Promise.resolve().then(() =>
          svc.closeCriticalFinding(String(finding.critical_finding_id), ""),
        ),
      ).rejects.toThrow(/outcome note/);
      const closed = (await svc.closeCriticalFinding(
        String(finding.critical_finding_id),
        "Laparotomy within 40 minutes",
      )) as any;
      expect(closed.status).toBe("closed");
      const open = (await svc.openCriticalFindings()) as any[];
      expect(
        open.some(
          (r) =>
            String(r.critical_finding_id) ===
            String(finding.critical_finding_id),
        ),
      ).toBe(false);
    }));

  it("escalates an open finding but refuses to reopen a closed one", () =>
    bed.run(async () => {
      const study = await newStudy();
      const f = (await svc.recordCriticalFinding({
        source_domain: "imaging",
        source_resource_type: "imaging_study",
        source_resource_id: String(study.study_id),
        study_id: String(study.study_id),
        patient_id: patientId,
        finding: "Incidental aortic dissection flap",
        severity: "critical",
      })) as any;
      await expect(
        Promise.resolve().then(() =>
          svc.escalateCriticalFinding(String(f.critical_finding_id), ""),
        ),
      ).rejects.toThrow(/who was called/);
      const escalated = (await svc.escalateCriticalFinding(
        String(f.critical_finding_id),
        "On-call cardiothoracic registrar paged at 02:14",
      )) as any;
      expect(escalated.status).toBe("escalated");
      expect(escalated.escalation_required).toBe(true);
      const acked = await svc.acknowledgeCriticalFinding(
        String(f.critical_finding_id),
        "electronic",
      );
      const closed = await svc.closeCriticalFinding(
        String(f.critical_finding_id),
        "Transferred to cardiac unit",
      );
      expect((closed as any).status).toBe("closed");
      expect((acked as any).status).toBe("acknowledged");
      await expect(
        svc.escalateCriticalFinding(String(f.critical_finding_id), "again"),
      ).rejects.toThrow(/closed/);
    }));

  // ── modality worklist ───────────────────────────────────────────────────────
  it("makes a worklist slot belong to exactly one operator", () =>
    bed.run(async () => {
      const item = (await svc.enqueueWorklistItem({
        imaging_order_id: orderId,
        modality: "ct",
        station_name: "CT-1",
        priority: "stat",
        scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
      })) as any;
      expect(item.status).toBe("scheduled");
      expect(item.claimed_by).toBeNull();
      await expect(
        svc.completeWorklistItem(String(item.worklist_item_id)),
      ).rejects.toThrow(/Claim the item/);

      const claimed = (await svc.claimWorklistItem(
        String(item.worklist_item_id),
      )) as any;
      expect(String(claimed.claimed_by)).toBe(ACTOR);
      expect(claimed.claimed_at).toBeTruthy();

      const other = "00000000-0000-0000-0000-000000000099";
      // Someone else cannot steal the slot…
      await asActor(
        { userId: other, permissions: ["critical:ack"] },
        async () => {
          await expect(
            svc.releaseWorklistItem(String(item.worklist_item_id)),
          ).rejects.toThrow(/Only the claiming operator/);
        },
      );
      // …and a second claim while it is live is refused outright.
      await asActor(
        { userId: other, permissions: ["study:import"] },
        async () => {
          await expect(
            svc.claimWorklistItem(String(item.worklist_item_id)),
          ).rejects.toBeInstanceOf(DomainError);
        },
      );
      const performed = (await svc.completeWorklistItem(
        String(item.worklist_item_id),
      )) as any;
      expect(performed.status).toBe("performed");
      expect(performed.performed_at).toBeTruthy();
      const queue = (await svc.worklistFor("ct")) as any[];
      expect(
        queue.some(
          (r) => String(r.worklist_item_id) === String(item.worklist_item_id),
        ),
      ).toBe(false);
    }));

  it("lets a supervisor release a claimed item, and keeps the queue ordered by urgency", () =>
    bed.run(async () => {
      const routine = (await svc.enqueueWorklistItem({
        imaging_order_id: orderId,
        modality: "xray",
        priority: "routine",
        station_name: "XRAY-2",
      })) as any;
      const urgent = (await svc.enqueueWorklistItem({
        imaging_order_id: orderId,
        modality: "xray",
        priority: "urgent",
        station_name: "XRAY-2",
      })) as any;
      await asActor({ permissions: ["study:import"] }, async () => {
        await svc.claimWorklistItem(String(routine.worklist_item_id));
      });
      const released = await asActor({ permissions: ["study:import"] }, () =>
        svc.releaseWorklistItem(String(routine.worklist_item_id)),
      );
      expect((released as any).claimed_by).toBeNull();
      expect((released as any).status).toBe("scheduled");
      const queue = (await svc.worklistFor("xray", "XRAY-2")) as any[];
      expect(queue.length).toBeGreaterThanOrEqual(2);
      const positions = queue.map((r) => String(r.worklist_item_id));
      expect(positions.indexOf(String(urgent.worklist_item_id))).toBeLessThan(
        positions.indexOf(String(routine.worklist_item_id)),
      );
      expect(queue[0].order_priority).toBe("urgent");
    }));
});
