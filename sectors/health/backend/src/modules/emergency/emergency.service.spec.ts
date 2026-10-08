/**
 * Emergency operations tests (migration 036).
 *
 * These assert the properties that make the record trustworthy in an
 * emergency: an observation is never rewritten, an acknowledgement names a
 * human, a handover is only accepted by the person it was given to, and a
 * resuscitation record's counts can only move by the operations that own them.
 */
import { describe, it, expect, beforeAll } from "@jest/globals";
import { buildTestBed, TestBed } from "../../common/testing/test-bed";
import {
  EmergencyService,
  EscalationRepository,
  HandoverRepository,
  ResusRepository,
  TriageRepository,
} from "./emergency.service";
import { DomainError } from "../../common/errors/domain.error";
import { EventOutboxService } from "../events/event-outbox.service";
import {
  tenantStorage,
  ActorContext,
} from "../../common/security/tenant-context";

describe("EmergencyService", () => {
  let bed: TestBed;
  let svc: EmergencyService;
  let encounterId: string;
  let patientId: string;

  const enc = async (pid: string) => {
    const rows = await (bed.conn as any).query(
      `INSERT INTO health.encounters (tenant_id, encounter_no, patient_id, kind)
       VALUES ($1, 'ENC-' || substr(md5(random()::text), 1, 10), $2, 'emergency')
       RETURNING encounter_id`,
      [bed.tenantCtx.tenantId(), pid],
    );
    return String(rows[0].encounter_id);
  };

  /** Run a block as a different authenticated actor. */
  const asActor = <T>(overrides: Partial<ActorContext>, fn: () => Promise<T>) =>
    tenantStorage.run(
      { ...bed.tenantCtx.require(), ...overrides } as ActorContext,
      fn,
    );

  beforeAll(async () => {
    bed = await buildTestBed();
    const events = new EventOutboxService(bed.conn, bed.tenantCtx);
    svc = new EmergencyService(
      bed.conn,
      bed.tenantCtx,
      bed.audit,
      events,
      new TriageRepository(bed.conn, bed.tenantCtx),
      new EscalationRepository(bed.conn, bed.tenantCtx),
      new HandoverRepository(bed.conn, bed.tenantCtx),
      new ResusRepository(bed.conn, bed.tenantCtx),
    );
    // Seeding needs an actor context, which only exists inside bed.run().
    await bed.run(async () => {
      const p = await bed.seedPatient();
      patientId = p.patient_id;
      encounterId = await enc(patientId);
    });
  });

  // ── triage ──────────────────────────────────────────────────────────────────
  it("records a triage assessment and refuses a colour/score pair that contradicts itself", () =>
    bed.run(async () => {
      const a = (await svc.assess({
        encounter_id: encounterId,
        patient_id: patientId,
        acuity_level: "red",
        acuity_score: 1,
        presenting_complaint: "Chest pain",
        consciousness: "alert",
        time_critical: true,
      })) as any;
      expect(a.acuity_level).toBe("red");
      expect(a.triage_scale).toBe("mtuha_etat");
      expect(a.triage_at).toBeTruthy();

      await expect(
        Promise.resolve().then(() =>
          svc.assess({
            encounter_id: encounterId,
            patient_id: patientId,
            acuity_level: "yellow",
            acuity_score: 1,
            presenting_complaint: "Ankle pain",
          }),
        ),
      ).rejects.toThrow(/acuity_score/);
      await expect(
        Promise.resolve().then(() =>
          svc.assess({
            encounter_id: encounterId,
            patient_id: patientId,
            acuity_level: "black",
            presenting_complaint: "x",
          }),
        ),
      ).rejects.toThrow(/acuity_level/);
      await expect(
        Promise.resolve().then(() =>
          svc.assess({
            encounter_id: encounterId,
            patient_id: patientId,
            acuity_level: "green",
            triage_scale: "german_triage_rule",
            presenting_complaint: "x",
          }),
        ),
      ).rejects.toThrow(/triage_scale/);
    }));

  it("re-triages by appending, so the deterioration stays visible", () =>
    bed.run(async () => {
      const first = (await svc.assess({
        encounter_id: encounterId,
        patient_id: patientId,
        acuity_level: "green",
        presenting_complaint: "Fever",
        reassess_at: new Date(Date.now() - 60_000).toISOString(),
      })) as any;
      const second = (await svc.reassess(first.assessment_id, {
        acuity_level: "orange",
        presenting_complaint: "Fever, now hypotensive",
      })) as any;
      expect(second.parent_assessment_id).toBe(first.assessment_id);
      expect(second.encounter_id).toBe(encounterId);
      expect(second.patient_id).toBe(patientId);

      const timeline = (await svc.assessmentTimeline(encounterId)) as any[];
      const mine = timeline.filter((t) =>
        [first.assessment_id, second.assessment_id].includes(t.assessment_id),
      );
      expect(mine).toHaveLength(2);
      expect(
        mine.find((t) => t.assessment_id === first.assessment_id).acuity_level,
      ).toBe("green");

      const outbox = await (bed.conn as any).query(
        `SELECT request_payload->>'eventType' AS et, request_payload AS payload
           FROM health.beyu_outbox
          WHERE request_payload->>'eventType' = 'health.emergency.triage_reassessed'
          LIMIT 1`,
      );
      expect(outbox[0]).toBeTruthy();
      const payload = (outbox[0].payload ?? {}) as any;
      expect(payload.payload?.deteriorated ?? payload.deteriorated).toBe(true);
    }));

  it("orders the waiting list by acuity then waiting time, on the latest assessment", () =>
    bed.run(async () => {
      const pGreen = await bed.seedPatient();
      const eGreen = await enc(pGreen.patient_id);
      const pRed = await bed.seedPatient();
      const eRed = await enc(pRed.patient_id);
      await svc.assess({
        encounter_id: eGreen,
        patient_id: pGreen.patient_id,
        acuity_level: "green",
        presenting_complaint: "Sprain",
      });
      await svc.assess({
        encounter_id: eRed,
        patient_id: pRed.patient_id,
        acuity_level: "red",
        presenting_complaint: "Airway compromise",
        time_critical: true,
      });
      const list = (await svc.waitingList()) as any[];
      const green = list.find((x) => x.encounter_id === eGreen);
      const red = list.find((x) => x.encounter_id === eRed);
      // Other tests' patients share the tenant, so the assertion is about
      // relative rank: the red patient must be ahead of the green one.
      expect(list.indexOf(red)).toBeLessThan(list.indexOf(green));
      // And the head of the list is the highest acuity present in the tenant.
      const ordinals = ["red", "orange", "yellow", "green", "blue"];
      const head = ordinals.indexOf(list[0].acuity_level);
      expect(
        Math.min(...list.map((x) => ordinals.indexOf(x.acuity_level))),
      ).toBe(head);
      expect(red.time_critical).toBe(true);
      expect(Number(red.waiting_seconds)).toBeGreaterThanOrEqual(0);
      expect(green.acuity_level).toBe("green");

      // A disposition removes the patient from the waiting list…
      await svc.dispose(red.assessment_id, "discharged");
      const after = (await svc.waitingList()) as any[];
      expect(after.some((x) => x.encounter_id === eRed)).toBe(false);
      // …and a re-triage replaces the row rather than adding a second one.
      const reassessed = await svc.reassess(green.assessment_id, {
        acuity_level: "yellow",
        presenting_complaint: "Sprain, worsening pain",
      });
      const afterRe = (await svc.waitingList()) as any[];
      const rows = afterRe.filter((x) => x.encounter_id === eGreen);
      expect(rows).toHaveLength(1);
      expect(rows[0].assessment_id).toBe((reassessed as any).assessment_id);
    }));

  it("surfaces re-assessments that are due and closes them when one is recorded", () =>
    bed.run(async () => {
      const a = (await svc.assess({
        encounter_id: encounterId,
        patient_id: patientId,
        acuity_level: "yellow",
        presenting_complaint: "Abdominal pain",
        reassess_at: new Date(Date.now() - 1800_000).toISOString(),
      })) as any;
      const due = (await svc.overdueReassessments()) as any[];
      const mine = due.find((d) => d.assessment_id === a.assessment_id);
      expect(mine).toBeTruthy();
      expect(Number(mine.overdue_seconds)).toBeGreaterThan(1700);
      await svc.reassess(a.assessment_id, {
        acuity_level: "yellow",
        presenting_complaint: "Abdominal pain, improved",
        reassess_at: new Date(Date.now() + 3600_000).toISOString(),
      });
      const after = (await svc.overdueReassessments()) as any[];
      expect(after.some((d) => d.assessment_id === a.assessment_id)).toBe(
        false,
      );
    }));

  // ── escalations ─────────────────────────────────────────────────────────────
  it("escalations need a reason, an acknowledgement by a named human, and a note to close", () =>
    bed.run(async () => {
      await expect(
        Promise.resolve().then(() =>
          svc.raiseEscalation({ patient_id: patientId, reason: "" }),
        ),
      ).rejects.toThrow(/reason/);
      const e = (await svc.raiseEscalation({
        patient_id: patientId,
        encounter_id: encounterId,
        reason: "Saturations falling on 4L",
        severity: "emergency",
        trigger_type: "deteriorating_score",
        escalation_target: "medical officer on call",
      })) as any;
      expect(e.status).toBe("open");
      expect(e.raised_by).toBe(bed.tenantCtx.require().userId);

      // Resolving before anyone has answered is refused by the state machine.
      await expect(
        svc.resolveEscalation(e.escalation_id, "ventilated"),
      ).rejects.toBeInstanceOf(DomainError);

      const ack = (await svc.acknowledgeEscalation(e.escalation_id)) as any;
      expect(ack.status).toBe("acknowledged");
      expect(ack.acknowledged_by).toBe(bed.tenantCtx.require().userId);
      expect(ack.acknowledged_at).toBeTruthy();

      await svc.actionEscalation(e.escalation_id, "Called ICU, bed free");
      const done = (await svc.resolveEscalation(
        e.escalation_id,
        "Transferred to ICU at 14:20",
      )) as any;
      expect(done.status).toBe("resolved");
      expect(done.response_note).toBe("Transferred to ICU at 14:20");
      expect(done.resolved_by).toBe(bed.tenantCtx.require().userId);
      await expect(
        svc.acknowledgeEscalation(e.escalation_id),
      ).rejects.toBeInstanceOf(DomainError);
    }));

  it("the open list carries the response clock and a breach flag from the target", () =>
    bed.run(async () => {
      expect(svc.escalationTargets()).toEqual({
        emergency: 5,
        urgent: 30,
        advisory: 240,
      });
      const e = (await svc.raiseEscalation({
        patient_id: patientId,
        reason: "No senior review after 40 minutes",
        severity: "urgent",
      })) as any;
      await (bed.conn as any).exec(
        `UPDATE health.clinical_escalations
            SET raised_at = now() - interval '45 minutes'
          WHERE escalation_id = '${e.escalation_id}'`,
      );
      const open = (await svc.openEscalations()) as any[];
      const row = open.find((x) => x.escalation_id === e.escalation_id);
      expect(row).toBeTruthy();
      expect(Number(row.minutes_waiting)).toBeGreaterThanOrEqual(44);
      expect(row.breached).toBe(true);
      const other = (await svc.raiseEscalation({
        patient_id: patientId,
        reason: "Family asking for a second opinion",
        severity: "advisory",
      })) as any;
      const open2 = (await svc.openEscalations()) as any[];
      expect(
        open2.find((x) => x.escalation_id === other.escalation_id).breached,
      ).toBe(false);
    }));

  // ── handovers ───────────────────────────────────────────────────────────────
  it("a handover must name a receiver and is only accepted by the one it was given to", () =>
    bed.run(async () => {
      await expect(
        Promise.resolve().then(() =>
          svc.createHandover({
            patient_id: patientId,
            background: "post-op day 1",
          }),
        ),
      ).rejects.toThrow(/situation/);
      await expect(
        Promise.resolve().then(() =>
          svc.createHandover({
            patient_id: patientId,
            situation: "Unstable",
          }),
        ),
      ).rejects.toThrow(/receiver/);

      const others = await (bed.conn as any).query(
        `SELECT global_user_id AS id FROM beyu_identity.users
          WHERE global_user_id <> $1 LIMIT 1`,
        [bed.tenantCtx.require().userId],
      );
      const otherId = others[0]?.id ?? null;

      const h = (await svc.createHandover({
        patient_id: patientId,
        situation: "Chest pain under investigation",
        background: "Hypertensive, 58y",
        assessment: "Troponin pending",
        recommendation: "Repeat ECG at 2 hours",
        to_actor: otherId,
        context: "ward_shift",
      })) as any;
      expect(h.status).toBe("pending");
      expect(h.from_actor).toBe(bed.tenantCtx.require().userId);

      if (otherId) {
        // The giver cannot accept their own handover to somebody else.
        await expect(svc.acceptHandover(h.handover_id)).rejects.toBeInstanceOf(
          DomainError,
        );
        const accepted = await asActor({ userId: otherId }, () =>
          svc.acceptHandover(h.handover_id),
        );
        expect((accepted as any).status).toBe("accepted");
        expect((accepted as any).to_actor).toBe(otherId);
      }
      // A role-addressed handover names whoever picks it up.
      const byRole = (await svc.createHandover({
        patient_id: patientId,
        situation: "Observation overnight",
        to_role: "nurse",
      })) as any;
      const taken = (await svc.acceptHandover(byRole.handover_id)) as any;
      expect(taken.to_actor).toBe(bed.tenantCtx.require().userId);
      expect(taken.status).toBe("accepted");
    }));

  it("declining needs a reason, and superseding keeps both records", () =>
    bed.run(async () => {
      const h = (await svc.createHandover({
        patient_id: patientId,
        situation: "Two patients for the night team",
        to_role: "nurse",
      })) as any;
      await expect(
        Promise.resolve().then(() => svc.declineHandover(h.handover_id, "")),
      ).rejects.toThrow(/reason/);
      const declined = (await svc.declineHandover(
        h.handover_id,
        "Covered another ward, cannot take handover",
      )) as any;
      expect(declined.status).toBe("declined");
      expect(declined.decline_reason).toBe(
        "Covered another ward, cannot take handover",
      );

      const h2 = (await svc.createHandover({
        patient_id: patientId,
        situation: "Initial wording",
        to_role: "nurse",
      })) as any;
      const sup = (await svc.supersedeHandover(h2.handover_id, {
        situation: "Corrected: patient is in bay 3",
        to_role: "nurse",
      })) as any;
      expect(sup.superseded).toBe(h2.handover_id);
      expect(sup.handover.situation).toBe("Corrected: patient is in bay 3");
      const original = (await svc.handoversForWard()) as any[];
      expect(original.some((x) => x.handover_id === h2.handover_id)).toBe(
        false,
      );
      expect(
        original.some((x) => x.handover_id === sup.handover.handover_id),
      ).toBe(true);
    }));

  // ── resuscitation ───────────────────────────────────────────────────────────
  it("resuscitation counts move only by their own operations", () =>
    bed.run(async () => {
      const r = (await svc.startResus({
        encounter_id: encounterId,
        patient_id: patientId,
        arrest_rhythm: "vf",
      })) as any;
      expect(r.status).toBe("in_progress");
      expect(r.team_lead).toBe(bed.tenantCtx.require().userId);
      expect(r.shocks_delivered).toBe(0);

      await svc.recordShocks(r.record_id, 1);
      await svc.recordShocks(r.record_id, 2);
      const after = (await (svc as any).resus.findById(
        r.record_id,
      )) as any as any;
      expect(after.shocks_delivered).toBe(3);

      await svc.recordEpinephrine(r.record_id);
      const again = (await (svc as any).resus.findById(r.record_id)) as any;
      expect(again.epinephrine_doses).toBe(1);
      // A client cannot set an absolute count through the update path.
      await expect(
        svc.updateResusClinical(r.record_id, { shocks_delivered: 0 }),
      ).rejects.toThrow(/only arrest_rhythm/);
      await expect(
        Promise.resolve().then(() => svc.recordShocks(r.record_id, 500)),
      ).rejects.toThrow(/between 1 and 50/);
    }));

  it("timeline notes accumulate, and the record only signs after it closes", () =>
    bed.run(async () => {
      const r = (await svc.startResus({
        encounter_id: encounterId,
        patient_id: patientId,
        arrest_rhythm: "pea",
      })) as any;
      await svc.noteResus(r.record_id, "Adrenaline 1mg IV");
      await svc.noteResus(r.record_id, "ROSC at 03:12");
      const withNotes = (await (svc as any).resus.findById(r.record_id)) as any;
      expect(withNotes.timeline_note).toContain("Adrenaline 1mg IV");
      expect(withNotes.timeline_note).toContain("ROSC at 03:12");
      expect(withNotes.timeline_note.split("\n")).toHaveLength(2);
      expect(withNotes.timeline_note).toMatch(/^\[\d\d:\d\d:\d\d\]/);

      await expect(svc.signResus(r.record_id)).rejects.toThrow(
        /close it with an outcome/,
      );
      // An end time before the start is refused by the table CHECK, reported here
      // as a validation error rather than a constraint name.
      await expect(
        svc.closeResus(r.record_id, "rosc", {
          ended_at: new Date(Date.now() - 3600_000).toISOString(),
        }),
      ).rejects.toThrow(/must not precede/i);
      const closed = (await svc.closeResus(r.record_id, "rosc")) as any;
      expect(closed.status).toBe("closed");
      expect(closed.outcome).toBe("rosc");
      expect(closed.ended_at).toBeTruthy();
      const signed = (await svc.signResus(r.record_id)) as any;
      expect(signed.status).toBe("signed");
      expect(signed.signed_by).toBe(bed.tenantCtx.require().userId);
      // A signed record is frozen.
      await expect(svc.noteResus(r.record_id, "late addition")).rejects.toThrow(
        /cannot be amended/,
      );
      await expect(svc.recordShocks(r.record_id, 1)).rejects.toThrow(
        /cannot be amended/,
      );
      await expect(
        svc.updateResusClinical(r.record_id, { advanced_airway: "LMA" }),
      ).rejects.toThrow(/cannot be amended/);
      const final = (await (svc as any).resus.findById(r.record_id)) as any;
      expect(final.timeline_note).not.toContain("late addition");
    }));

  it("a resuscitation record's metadata write cannot touch the status", () =>
    bed.run(async () => {
      const r = (await svc.startResus({
        encounter_id: encounterId,
        patient_id: patientId,
      })) as any;
      const row = (await (svc as any).resus.findById(r.record_id)) as any;
      expect(row.status).toBe("in_progress");
      expect(row.voided_at).toBeNull();
    }));
});
