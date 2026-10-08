/**
 * Continuity-of-care domain tests (migration 034).
 *
 * The behaviours under test are the ones that make the difference between a
 * record that reflects care and a record that merely records:
 *   * attribution — a completion names the actor from the credential, and a
 *     skip names a reason, both enforced at the database as well as here;
 *   * supersession — a signed discharge summary is never edited in place;
 *   * honesty of the document registry — a row may not claim an object exists;
 *   * due-ness computed from database time, never from a client clock.
 */
import { describe, it, expect, beforeAll } from "@jest/globals";
import { buildTestBed, TestBed } from "../../common/testing/test-bed";
import { ContinuityService } from "./continuity.service";
import {
  CarePlanRepository,
  CareTaskRepository,
  ClinicalDocumentRepository,
  DischargeSummaryRepository,
  FollowupRepository,
} from "./continuity.repository";
import { DomainError } from "../../common/errors/domain.error";
import { EventOutboxService } from "../events/event-outbox.service";

describe("ContinuityService", () => {
  let bed: TestBed;
  let svc: ContinuityService;

  const newPatient = () => bed.seedPatient();

  const newEncounter = async (patientId: string) => {
    const rows = await (bed.conn as any).query(
      `INSERT INTO health.encounters (tenant_id, encounter_no, patient_id, kind)
       VALUES ($1, 'ENC-' || substr(md5(random()::text), 1, 10), $2, 'inpatient')
       RETURNING encounter_id`,
      [bed.tenantCtx.tenantId(), patientId],
    );
    return String(rows[0].encounter_id);
  };

  const plan = async (patientId: string, encounterId?: string) =>
    (await svc.createPlan({
      patient_id: patientId,
      encounter_id: encounterId ?? null,
      title: "Post-op recovery",
      category: "wound_care",
      goal: "Wound clean at day 5",
    })) as any;

  beforeAll(async () => {
    bed = await buildTestBed();
    const events = new EventOutboxService(bed.conn, bed.tenantCtx);
    svc = new ContinuityService(
      bed.conn,
      bed.tenantCtx,
      bed.audit,
      events,
      new CareTaskRepository(bed.conn, bed.tenantCtx),
      new DischargeSummaryRepository(bed.conn, bed.tenantCtx),
      new FollowupRepository(bed.conn, bed.tenantCtx),
      new ClinicalDocumentRepository(bed.conn, bed.tenantCtx),
      new CarePlanRepository(bed.conn, bed.tenantCtx),
    );
  });

  it("creates a plan, replays on the idempotency key, and drives its state machine", () =>
    bed.run(async () => {
      const p = await newPatient();
      const created = (await svc.createPlan({
        patient_id: p.patient_id,
        title: "Community care",
        idempotency_key: "plan-idem-1",
      })) as any;
      expect(created.status).toBe("active");
      const replay = (await svc.createPlan({
        patient_id: p.patient_id,
        title: "Community care",
        idempotency_key: "plan-idem-1",
      })) as any;
      expect(replay.plan_id).toBe(created.plan_id);

      // `active` is the default; a draft must be created explicitly as draft.
      const draft = (await svc.createPlan({
        patient_id: p.patient_id,
        title: "Draft plan",
        status: "draft",
      })) as any;
      expect(draft.status).toBe("draft");
      const activated = (await svc.transitionPlan(
        draft.plan_id,
        "active",
      )) as any;
      expect(activated.status).toBe("active");
      await expect(
        svc.transitionPlan(draft.plan_id, "completed"),
      ).resolves.toBeTruthy();
      await expect(
        svc.transitionPlan(draft.plan_id, "active"),
      ).rejects.toBeInstanceOf(DomainError);
    }));

  it("rejects an unknown plan category with a 400 rather than a database error", () =>
    bed.run(async () => {
      const p = await newPatient();
      await expect(
        Promise.resolve().then(() =>
          svc.createPlan({
            patient_id: p.patient_id,
            title: "Bad category",
            category: "astrology",
          }),
        ),
      ).rejects.toThrow(/category/);
    }));

  it("inherits patient and encounter from the plan, not the request body", () =>
    bed.run(async () => {
      const owner = await newPatient();
      const other = await newPatient();
      const enc = await newEncounter(owner.patient_id);
      const cp = await plan(owner.patient_id, enc);
      const task = (await svc.addTask(cp.plan_id, {
        title: "Dressing change",
        task_type: "wound_care",
        priority: "urgent",
        due_at: new Date(Date.now() + 3600_000).toISOString(),
        // Attempted spoof: must be ignored in favour of the plan's patient.
        patient_id: other.patient_id,
        encounter_id: null,
      })) as any;
      expect(task.patient_id).toBe(owner.patient_id);
      expect(task.encounter_id).toBe(enc);
      expect(task.status).toBe("open");
    }));

  it("completing a task names the actor, and a recurring task schedules one successor", () =>
    bed.run(async () => {
      const p = await newPatient();
      const cp = await plan(p.patient_id);
      const due = new Date(Date.now() - 60_000).toISOString();
      const task = (await svc.addTask(cp.plan_id, {
        title: "Observations",
        task_type: "observation",
        recurrence: "qds",
        due_at: due,
      })) as any;
      // The database CHECK forbids `done` without completed_at + completed_by;
      // this must satisfy it from the authenticated actor.
      const done = (await svc.completeTask(task.task_id, "Wound dry")) as any;
      expect(done.status).toBe("done");
      expect(done.completed_by).toBe(bed.tenantCtx.require().userId);
      expect(done.completed_at).toBeTruthy();
      expect(done.previous_status).toBe("open");

      const tasks = (await svc.listTasksForPlan(cp.plan_id)) as any[];
      expect(tasks).toHaveLength(2);
      const next = tasks.find((t) => t.status === "open");
      expect(next).toBeTruthy();
      expect(new Date(next.due_at).getTime() - new Date(due).getTime()).toBe(
        360 * 60_000,
      );
      // Exactly one successor, never a generated series.
      expect(tasks.filter((t) => t.status === "open")).toHaveLength(1);
    }));

  it("cannot complete a task twice, and cannot skip without a reason", () =>
    bed.run(async () => {
      const p = await newPatient();
      const cp = await plan(p.patient_id);
      const task = (await svc.addTask(cp.plan_id, {
        title: "Check drain",
      })) as any;
      await svc.completeTask(task.task_id);
      await expect(svc.completeTask(task.task_id)).rejects.toBeInstanceOf(
        DomainError,
      );
      const t2 = (await svc.addTask(cp.plan_id, { title: "Physio" })) as any;
      await expect(
        Promise.resolve().then(() => svc.skipTask(t2.task_id, "")),
      ).rejects.toThrow(/skip_reason/);
      const skipped = (await svc.skipTask(
        t2.task_id,
        "Patient refused",
      )) as any;
      expect(skipped.status).toBe("skipped");
      expect(skipped.skip_reason).toBe("Patient refused");
    }));

  it("flags overdue work from database time and exposes a role worklist", () =>
    bed.run(async () => {
      const p = await newPatient();
      const cp = await plan(p.patient_id);
      const past = await svc.addTask(cp.plan_id, {
        title: "Late obs",
        due_at: new Date(Date.now() - 7200_000).toISOString(),
        assigned_role: "nurse",
      });
      const future = await svc.addTask(cp.plan_id, {
        title: "Future obs",
        due_at: new Date(Date.now() + 86400_000).toISOString(),
        assigned_role: "nurse",
      });
      const sweep = (await svc.sweepOverdueTasks()) as any;
      expect(sweep.marked_overdue).toBeGreaterThanOrEqual(1);
      const list = (await svc.taskWorklist({ role: "nurse" })) as any[];
      const overdue = list.find((t) => t.task_id === (past as any).task_id);
      const ok = list.find((t) => t.task_id === (future as any).task_id);
      expect(overdue.is_overdue).toBe(true);
      expect(overdue.status).toBe("overdue");
      expect(ok.is_overdue).toBe(false);
      // Only open work appears on a worklist.
      expect(
        list.every((t) =>
          ["open", "in_progress", "overdue"].includes(t.status),
        ),
      ).toBe(true);
    }));

  it("keeps one live discharge summary per encounter and amends by supersession", () =>
    bed.run(async () => {
      const p = await newPatient();
      const enc = await newEncounter(p.patient_id);
      const created = (await svc.createSummary({
        encounter_id: enc,
        patient_id: p.patient_id,
        diagnosis_summary: "Appendicitis, appendectomy",
        condition_at_discharge: "stable",
        disposition: "discharged",
      })) as any;
      expect(created.status).toBe("draft");

      await expect(
        svc.createSummary({
          encounter_id: enc,
          patient_id: p.patient_id,
          diagnosis_summary: "duplicate",
        }),
      ).rejects.toThrow(/already has summary/);

      // Editing after attestation is refused; supersession is the only path.
      await svc.signSummary(created.summary_id);
      await expect(
        svc.updateSummary(created.summary_id, {
          diagnosis_summary: "rewritten",
        }),
      ).rejects.toThrow(/cannot be edited/i);

      const signed = (await svc.getSummary(created.summary_id)) as any;
      expect(signed.status).toBe("signed");
      expect(signed.signed_by).toBe(bed.tenantCtx.require().userId);
      expect(signed.signed_at).toBeTruthy();

      const amended = (await svc.amendSummary(created.summary_id, {
        condition_at_discharge: "stable, wound reviewed",
      })) as any;
      expect(amended.superseded).toBe(created.summary_id);
      expect(amended.replacement.status).toBe("draft");
      expect(amended.replacement.parent_summary_id).toBe(created.summary_id);
      expect(amended.replacement.diagnosis_summary).toBe(
        "Appendicitis, appendectomy",
      );

      const versions = (await svc.summaryVersions(enc)) as any[];
      expect(versions).toHaveLength(2);
      const old = versions.find((v) => v.summary_id === created.summary_id);
      expect(old.status).toBe("amended");
      expect(old.voided_at).toBeTruthy();
      // The superseded text is still retrievable for the record.
      expect(old.diagnosis_summary).toBe("Appendicitis, appendectomy");

      // …and a second live summary for the same encounter is still impossible.
      await expect(
        svc.createSummary({
          encounter_id: enc,
          patient_id: p.patient_id,
          diagnosis_summary: "third",
        }),
      ).rejects.toBeInstanceOf(DomainError);
    }));

  it("follow-up state machine and due detection use the database calendar", () =>
    bed.run(async () => {
      const p = await newPatient();
      const due = (await svc.scheduleFollowup({
        patient_id: p.patient_id,
        source: "discharge",
        channel: "phone",
        reason: "Post-discharge call",
        due_date: new Date(Date.now() - 3 * 86400_000)
          .toISOString()
          .slice(0, 10),
      })) as any;
      const future = (await svc.scheduleFollowup({
        patient_id: p.patient_id,
        due_date: new Date(Date.now() + 30 * 86400_000)
          .toISOString()
          .slice(0, 10),
      })) as any;

      const list = (await svc.dueFollowups()) as any[];
      const mine = list.find((f) => f.followup_id === due.followup_id);
      expect(mine).toBeTruthy();
      expect(mine.is_overdue).toBe(true);
      expect(Number(mine.days_overdue)).toBeGreaterThanOrEqual(3);
      expect(list.some((f) => f.followup_id === future.followup_id)).toBe(
        false,
      );

      await expect(
        svc.transitionFollowup(
          due.followup_id,
          "completed",
          "Reached, took meds",
        ),
      ).resolves.toBeTruthy();
      const completed = (await svc.listFollowupsForPatient(
        p.patient_id,
      )) as any[];
      const row = completed.find((f) => f.followup_id === due.followup_id);
      expect(row.status).toBe("completed");
      expect(row.completed_at).toBeTruthy();
      // A completed follow-up cannot be re-scheduled directly.
      await expect(
        svc.transitionFollowup(due.followup_id, "scheduled"),
      ).rejects.toBeInstanceOf(DomainError);
    }));

  it("refuses a document row that claims an object it cannot point at", () =>
    bed.run(async () => {
      const p = await newPatient();
      await expect(
        Promise.resolve().then(() =>
          svc.registerDocument({
            patient_id: p.patient_id,
            title: "Referral letter",
            doc_type: "referral_letter",
            available: true,
          }),
        ),
      ).rejects.toThrow(/storage_ref/);
      await expect(
        Promise.resolve().then(() =>
          svc.registerDocument({
            patient_id: p.patient_id,
            title: "Bad hash",
            storage_ref: "obj/123",
            content_sha256: "abc",
          }),
        ),
      ).rejects.toThrow(/sha256/);

      const meta = (await svc.registerDocument({
        patient_id: p.patient_id,
        title: "Scanned consent (not yet uploaded)",
        doc_type: "consent",
        available: false,
      })) as any;
      expect(meta.available).toBe(false);
      expect(meta.status).toBe("filed");
    }));

  it("revising a document supersedes the parent instead of replacing its bytes", () =>
    bed.run(async () => {
      const p = await newPatient();
      const hash = "a".repeat(64);
      const v1 = (await svc.registerDocument({
        patient_id: p.patient_id,
        title: "Discharge summary scan",
        doc_type: "discharge_summary",
        storage_ref: "obj/v1",
        content_sha256: hash,
        mime_type: "application/pdf",
        size_bytes: 1234,
      })) as any;
      const v2 = (await svc.reviseDocument(v1.document_id, {
        title: "Discharge summary scan (re-typed)",
        storage_ref: "obj/v2",
        content_sha256: "b".repeat(64),
      })) as any;
      expect(v2.supersedes).toBe(v1.document_id);
      expect(v2.encounter_id).toBe(v1.encounter_id);

      const list = (await svc.documentsForPatient(p.patient_id)) as any[];
      const parent = list.find((d) => d.document_id === v1.document_id);
      const child = list.find((d) => d.document_id === v2.document_id);
      expect(parent.is_current).toBe(false);
      expect(parent.available).toBe(false);
      expect(child.is_current).toBe(true);

      // Voiding keeps the metadata row: it can be listed, and its hash retained.
      await svc.voidDocument(
        v2.document_id,
        "uploaded to the wrong patient chart",
      );
      const after = (await svc.documentsForPatient(p.patient_id)) as any[];
      expect(after.find((d) => d.document_id === v2.document_id).status).toBe(
        "voided",
      );
      expect(
        after.find((d) => d.document_id === v2.document_id).content_sha256,
      ).toBe("b".repeat(64));
    }));

  it("counts plan progress on the server so two views cannot disagree", () =>
    bed.run(async () => {
      const p = await newPatient();
      const cp = await plan(p.patient_id);
      const t1 = (await svc.addTask(cp.plan_id, { title: "A" })) as any;
      const t2 = (await svc.addTask(cp.plan_id, { title: "B" })) as any;
      const t3 = (await svc.addTask(cp.plan_id, { title: "C" })) as any;
      await svc.completeTask(t1.task_id);
      await svc.skipTask(t2.task_id, "not applicable");
      const board = (await svc.planBoard(p.patient_id)) as any[];
      const row = board.find((b) => b.plan_id === cp.plan_id);
      expect(row.tasks).toBe(3);
      expect(row.tasks_done).toBe(1);
      expect(row.tasks_skipped).toBe(1);
      expect(t3.status).toBe("open");
    }));
});
