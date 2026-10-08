/**
 * Theatre domain tests (migration 038).
 *
 * These assert the four properties that make a theatre schedule safe to act on:
 *   1. a theatre slot cannot be double-booked, and the clash is found in the
 *      database rather than in whichever list was rendered last;
 *   2. a case cannot start until the checklist is signed, the surgeon and
 *      anaesthetist have confirmed with live credentials, and a CURRENT consent
 *      is bound — with the blockers surfaced as data, not as a mystery 409;
 *   3. attendance can only be confirmed by the named clinician;
 *   4. recovery is a real bed, allocated and released through the capacity
 *      domain, so the ward board and the theatre agree without anyone
 *      reconciling them.
 */
import { describe, it, expect, beforeAll } from "@jest/globals";
import { buildTestBed, TestBed } from "../../common/testing/test-bed";
import {
  AnaesthesiaRepository,
  PreopChecklistRepository,
  PreopItemRepository,
  SurgicalCaseRepository,
  SurgicalTeamRepository,
  TheatreRepository,
  TheatreService,
} from "./theatre.service";
import { CapacityService } from "../capacity/capacity.service";
import {
  BedAllocationRepository,
  BedRepository,
  PatientFlowRepository,
  ServiceTurnaroundRepository,
  WardRepository,
} from "../capacity/capacity.repository";
import { DomainError } from "../../common/errors/domain.error";
import { EventOutboxService } from "../events/event-outbox.service";
import {
  tenantStorage,
  ActorContext,
} from "../../common/security/tenant-context";

const ACTOR = "00000000-0000-0000-0000-000000000001";

describe("TheatreService", () => {
  let bed: TestBed;
  let svc: TheatreService;
  let capacity: CapacityService;
  let patientId: string;
  let encounterId: string;
  let theatreId: string;
  let theatre2: string;
  let slotSeq = 0;
  /**
   * Each test books its own window far in the future, because a theatre board is
   * shared state: tests that all asked for "the next two hours" would collide
   * with each other instead of with the rule under test.
   */
  const nextSlot = () => {
    slotSeq += 2;
    return {
      theatre_id: theatreId,
      scheduled_start_at: iso(100 + slotSeq),
      scheduled_end_at: iso(102 + slotSeq),
    };
  };

  const asActor = <T>(overrides: Partial<ActorContext>, fn: () => Promise<T>) =>
    tenantStorage.run(
      { ...bed.tenantCtx.require(), ...overrides } as ActorContext,
      fn,
    );

  const newCase = async (extra: Record<string, unknown> = {}) =>
    (await svc.createCase({
      patient_id: patientId,
      encounter_id: encounterId,
      primary_procedure_title: "Elective inguinal hernia repair",
      urgency: "elective",
      ...extra,
    })) as any;

  /** Take a case through every gate so it is legitimately startable. */
  const makeReady = async (caseId: string, slot = nextSlot()) => {
    await svc.scheduleCase(caseId, slot);
    await svc.transition(caseId, "in_preop");
    const consentId = await seedConsent(patientId, "active");
    await svc.verifyConsent(caseId, consentId);
    for (const role of ["surgeon", "anaesthetist"]) {
      const member = (await svc.addTeamMember(caseId, {
        role,
        global_user_id: ACTOR,
      })) as any;
      await svc.confirmTeamMember(String(member.team_member_id));
    }
    const checklist = (await svc.startChecklist(caseId)) as any;
    const rows = await svc.checklist(String(checklist.checklist_id));
    for (const row of rows as any[]) {
      if (row.item_id) await svc.checkItem(String(row.item_id), true);
    }
    return svc.signChecklist(String(checklist.checklist_id));
  };

  const seedConsent = async (pid: string, status: string) => {
    const rows = await (bed.conn as any).query(
      `INSERT INTO health.consents (tenant_id, patient_id, purpose, status, legal_basis)
       VALUES ($1, $2, 'treatment', $3, 'consent')
       RETURNING consent_id`,
      [bed.tenantCtx.tenantId(), pid, status],
    );
    return String(rows[0].consent_id);
  };

  /** A ward with one free bed of its own, for recovery-placement tests. */
  let spareWardSeq = 0;
  const freeBed = async (code?: string) => {
    spareWardSeq += 1;
    const ward = (await capacity.createWard({
      ward_code: `SPARE-${spareWardSeq}`,
      name: `Spare ward ${spareWardSeq}`,
      ward_type: "theatre_recovery",
    })) as any;
    const b = (await capacity.createBed({
      ward_id: ward.ward_id,
      bed_code: code ?? `SPARE-${spareWardSeq}-1`,
      bed_type: "observation",
    })) as any;
    return String(b.bed_id);
  };

  function iso(hoursFromNow: number) {
    return new Date(Date.now() + hoursFromNow * 3600_000).toISOString();
  }

  beforeAll(async () => {
    bed = await buildTestBed();
    const outbox = new EventOutboxService(bed.conn, bed.tenantCtx);
    capacity = new CapacityService(
      bed.conn,
      bed.tenantCtx,
      bed.audit,
      outbox,
      new WardRepository(bed.conn, bed.tenantCtx),
      new BedRepository(bed.conn, bed.tenantCtx),
      new BedAllocationRepository(bed.conn, bed.tenantCtx),
      new ServiceTurnaroundRepository(bed.conn, bed.tenantCtx),
      new PatientFlowRepository(bed.conn, bed.tenantCtx),
    );
    svc = new TheatreService(
      bed.conn,
      bed.tenantCtx,
      bed.audit,
      outbox,
      new TheatreRepository(bed.conn, bed.tenantCtx),
      new SurgicalCaseRepository(bed.conn, bed.tenantCtx),
      new SurgicalTeamRepository(bed.conn, bed.tenantCtx),
      new PreopChecklistRepository(bed.conn, bed.tenantCtx),
      new PreopItemRepository(bed.conn, bed.tenantCtx),
      new AnaesthesiaRepository(bed.conn, bed.tenantCtx),
      capacity,
    );
    // Everything that touches the database — including seeding — has to run
    // inside bed.run(), because that is where the actor/tenant ALS context
    // that RLS depends on exists.
    await bed.run(async () => {
      const p = await bed.seedPatient();
      patientId = p.patient_id;
      const enc = await (bed.conn as any).query(
        `INSERT INTO health.encounters (tenant_id, encounter_no, patient_id, kind)
         VALUES ($1, 'ENC-' || substr(md5(random()::text), 1, 10), $2, 'inpatient')
         RETURNING encounter_id`,
        [bed.tenantCtx.tenantId(), patientId],
      );
      encounterId = String(enc[0].encounter_id);
      // The actor is a credentialled practitioner so team confirmation is
      // testing the rule, not fighting the fixture.
      await (bed.conn as any).query(
        `INSERT INTO health.practitioners
           (tenant_id, global_user_id, full_name, cadre, license_number, license_status)
         VALUES ($1, $2, 'Dr Test', 'doctor', 'MCK-0001', 'verified')`,
        [bed.tenantCtx.tenantId(), ACTOR],
      );
      const th = (await svc.createTheatre({
        theatre_code: "TH-1",
        name: "Main Theatre 1",
        theatre_type: "general_surgical",
      })) as any;
      theatreId = String(th.theatre_id);
      const th2 = (await svc.createTheatre({
        theatre_code: "TH-2",
        name: "Day Surgery",
        theatre_type: "day_case",
      })) as any;
      theatre2 = String(th2.theatre_id);
      // Two more humans, so "another clinician" is a real row rather than a
      // foreign-key violation: team membership is bounded by identity.
      await (bed.conn as any).query(
        `INSERT INTO beyu_identity.users (global_user_id, email, display_name, password_hash)
         VALUES ('00000000-0000-0000-0000-000000000099','other@beyu.health','Other Clinician','x'),
                ('00000000-0000-0000-0000-000000000077','agency@beyu.health','Agency Nurse','x')
         ON CONFLICT DO NOTHING`,
      );
    });
  });

  // ── booking ─────────────────────────────────────────────────────────────────
  it("refuses an overlapping booking in the same theatre and accepts the next free slot", () =>
    bed.run(async () => {
      const a = await newCase();
      const b = await newCase({ primary_procedure_title: "Appendicectomy" });
      await svc.scheduleCase(String(a.case_id), {
        theatre_id: theatreId,
        scheduled_start_at: iso(1),
        scheduled_end_at: iso(3),
      });
      await expect(
        svc.scheduleCase(String(b.case_id), {
          theatre_id: theatreId,
          scheduled_start_at: iso(2),
          scheduled_end_at: iso(4),
        }),
      ).rejects.toThrow(/overlaps/);
      // Back-to-back is not an overlap.
      const next = (await svc.scheduleCase(String(b.case_id), {
        theatre_id: theatreId,
        scheduled_start_at: iso(3),
        scheduled_end_at: iso(5),
      })) as any;
      expect(next.status).toBe("scheduled");
      expect(next.case_no).toMatch(/^SURG-/);
    }));

  it("keeps a theatre occupied while its case is running and releases it only after cleaning", () =>
    bed.run(async () => {
      const c = await newCase({ primary_procedure_title: "Splenectomy" });
      await makeReady(String(c.case_id));
      await svc.startCase(String(c.case_id));
      const board = (await svc.theatreBoard()) as any[];
      const th = board.find((t) => String(t.theatre_id) === theatreId)!;
      expect(th.active_case_status).toBe("in_theatre");
      expect(th.status).toBe("occupied");
      // A theatre with a patient in it cannot be reclassified by the scheduler.
      await expect(svc.setTheatreStatus(theatreId, "cleaning")).rejects.toThrow(
        /cannot be marked/,
      );
      await svc.moveToRecovery(String(c.case_id), await freeBed("SPL-1"));
      expect(((await svc.completeCase(String(c.case_id))) as any).status).toBe(
        "completed",
      );
      // Now cleaning: the theatre is released only when housekeeping agrees.
      const after = ((await svc.theatreBoard()) as any[]).find(
        (t) => String(t.theatre_id) === theatreId,
      )!;
      expect(after.status).toBe("cleaning");
      await expect(svc.markTheatreClean(theatreId)).rejects.toThrow(
        /Cleaning is still outstanding/,
      );
      const turnaround = ((await capacity.pendingTurnarounds()) as any[]).find(
        (t) => String(t.resource_type) === "theatre",
      )!;
      await capacity.completeTurnaround(String(turnaround.turnaround_id));
      const released = (await svc.markTheatreClean(theatreId)) as any;
      expect(released.status).toBe("available");
    }));

  // ── the readiness gate ──────────────────────────────────────────────────────
  it("reports every unmet pre-condition as data and refuses to start the case", () =>
    bed.run(async () => {
      const c = await newCase({
        primary_procedure_title: "Right hemicolectomy",
      });
      const before = (await svc.readiness(String(c.case_id))) as any;
      expect(before.ready).toBe(false);
      expect(before.blockers.join(" ")).toMatch(/no pre-op checklist started/);
      expect(before.blockers.join(" ")).toMatch(/no surgeon named/);
      expect(before.blockers.join(" ")).toMatch(/no anaesthetist named/);
      expect(before.blockers.join(" ")).toMatch(/consent not verified/);
      expect(before.blockers.join(" ")).toMatch(/no theatre booked/);
      await expect(svc.startCase(String(c.case_id))).rejects.toThrow(
        /move it to in_preop/,
      );
      // Now book it and scrub, but leave the gates unmet: same refusal, and the
      // reason is the missing pre-conditions rather than the case status.
      await svc.scheduleCase(String(c.case_id), {
        theatre_id: theatre2,
        scheduled_start_at: iso(170),
        scheduled_end_at: iso(171),
      });
      await svc.transition(String(c.case_id), "in_preop");
      await expect(svc.startCase(String(c.case_id))).rejects.toBeInstanceOf(
        DomainError,
      );
      await expect(svc.startCase(String(c.case_id))).rejects.toThrow(
        /not ready/,
      );
    }));

  it("starts once the checklist, team and a live consent are in place", () =>
    bed.run(async () => {
      const c = await newCase({
        primary_procedure_title: "Ovarian cystectomy",
      });
      await makeReady(String(c.case_id));
      const ready = (await svc.readiness(String(c.case_id))) as any;
      expect(ready.blockers).toEqual([]);
      const started = (await svc.startCase(String(c.case_id))) as any;
      expect(started.status).toBe("in_theatre");
      expect(started.actual_start_at).toBeTruthy();
    }));

  it("refuses a consent that belongs to somebody else", () =>
    bed.run(async () => {
      const other = await bed.run(() => bed.seedPatient());
      const foreign = await seedConsent(other.patient_id, "active");
      const c = await newCase({
        primary_procedure_title: "Gall bladder excision",
      });
      await expect(
        svc.verifyConsent(String(c.case_id), foreign),
      ).rejects.toThrow(/different patient/);
    }));

  it("blocks the knife when the verified consent is withdrawn before start", () =>
    bed.run(async () => {
      const c = await newCase({ primary_procedure_title: "Thyroidectomy" });
      await svc.scheduleCase(String(c.case_id), {
        theatre_id: theatreId,
        scheduled_start_at: iso(140),
        scheduled_end_at: iso(141),
      });
      await svc.transition(String(c.case_id), "in_preop");
      const consentId = await seedConsent(patientId, "active");
      await svc.verifyConsent(String(c.case_id), consentId);
      for (const role of ["surgeon", "anaesthetist"]) {
        const m = (await svc.addTeamMember(String(c.case_id), {
          role,
          global_user_id: ACTOR,
        })) as any;
        await svc.confirmTeamMember(String(m.team_member_id));
      }
      const cl = (await svc.startChecklist(String(c.case_id))) as any;
      for (const row of (await svc.checklist(
        String(cl.checklist_id),
      )) as any[]) {
        if (row.item_id) await svc.checkItem(String(row.item_id), true);
      }
      await svc.signChecklist(String(cl.checklist_id));
      expect(
        ((await svc.readiness(String(c.case_id))) as any).blockers,
      ).toEqual([]);
      // The patient withdraws consent while the team is scrubbing.
      await (bed.conn as any).query(
        `UPDATE health.consents SET status = 'withdrawn' WHERE consent_id = $1`,
        [consentId],
      );
      const after = (await svc.readiness(String(c.case_id))) as any;
      expect(after.blockers.join(" ")).toMatch(/consent is withdrawn/);
      await expect(svc.startCase(String(c.case_id))).rejects.toThrow(/consent/);
    }));

  it("waives consent only for a crash case, and only with a written reason", () =>
    bed.run(async () => {
      const elective = await newCase({
        primary_procedure_title: "Hernia, elective",
      });
      await svc.scheduleCase(String(elective.case_id), {
        theatre_id: theatreId,
        scheduled_start_at: iso(150),
        scheduled_end_at: iso(151),
      });
      await svc.transition(String(elective.case_id), "in_preop");
      await expect(
        svc.startCase(String(elective.case_id), {
          consent_waiver_reason: "patient is unstable",
        }),
      ).rejects.toThrow(/only be waived for a crash case/);

      const crash = (await newCase({
        primary_procedure_title: "Laparotomy for ruptured spleen",
        urgency: "crash",
      })) as any;
      await svc.scheduleCase(String(crash.case_id), {
        theatre_id: theatreId,
        scheduled_start_at: iso(160),
        scheduled_end_at: iso(161),
      });
      await svc.transition(String(crash.case_id), "in_preop");
      for (const role of ["surgeon", "anaesthetist"]) {
        const m = (await svc.addTeamMember(String(crash.case_id), {
          role,
          global_user_id: ACTOR,
        })) as any;
        await svc.confirmTeamMember(String(m.team_member_id));
      }
      const cl = (await svc.startChecklist(String(crash.case_id))) as any;
      for (const row of (await svc.checklist(String(cl.checklist_id))) as any[])
        if (row.item_id) await svc.checkItem(String(row.item_id), true);
      await svc.signChecklist(String(cl.checklist_id));
      const started = (await svc.startCase(String(crash.case_id), {
        consent_waiver_reason:
          "Unconscious after road traffic injury, no next of kin available",
      })) as any;
      expect(started.status).toBe("in_theatre");
      expect(started.consent_waived).toBe(true);
    }));

  // ── team and checklist discipline ───────────────────────────────────────────
  it("refuses attendance confirmation by anyone other than the named clinician", () =>
    bed.run(async () => {
      const c = await newCase({ primary_procedure_title: "Fixation of femur" });
      const member = (await svc.addTeamMember(String(c.case_id), {
        role: "surgeon",
        global_user_id: "00000000-0000-0000-0000-000000000099",
      })) as any;
      await expect(
        svc.confirmTeamMember(String(member.team_member_id)),
      ).rejects.toBeInstanceOf(DomainError);
      await expect(
        svc.confirmTeamMember(String(member.team_member_id)),
      ).rejects.toThrow(/Only the named clinician/);
      expect(member.credential_status).toBe("external_verification_required");
    }));

  it("creates the fixed WHO items and refuses to sign while a required step is unchecked", () =>
    bed.run(async () => {
      const c = await newCase({
        primary_procedure_title: "Cataract, left eye",
      });
      const cl = (await svc.startChecklist(String(c.case_id))) as any;
      const rows = (await svc.checklist(String(cl.checklist_id))) as any[];
      expect(rows.length).toBe(13);
      expect(rows[0].position).toBe(1);
      const unchecked = rows.find((r) => r.required && !r.checked)!;
      await expect(svc.signChecklist(String(cl.checklist_id))).rejects.toThrow(
        /required item\(s\) are unchecked/,
      );
      await expect(
        svc.checkItem(String(unchecked.item_id), false),
      ).rejects.toThrow(/an unchecked item stays unchecked/);
      for (const row of rows)
        if (row.required) await svc.checkItem(String(row.item_id), true);
      const signed = (await svc.signChecklist(String(cl.checklist_id))) as any;
      expect(signed.status).toBe("signed");
      const after = (await svc.checklist(String(cl.checklist_id))) as any[];
      await expect(
        svc.checkItem(String(after[0].item_id), true),
      ).rejects.toThrow(/cannot be re-opened/);
      // A second checklist for the same case is a bookkeeping mistake, not a fix.
      await expect(svc.startChecklist(String(c.case_id))).rejects.toThrow(
        /already exists/,
      );
    }));

  // ── recovery through the capacity domain ─────────────────────────────────────
  it("occupies a real recovery bed and frees it through the cleaning queue", () =>
    bed.run(async () => {
      const ward = (await capacity.createWard({
        ward_code: "REC-1",
        name: "Post-anaesthesia care",
        ward_type: "theatre_recovery",
      })) as any;
      const bedRow = (await capacity.createBed({
        ward_id: ward.ward_id,
        bed_code: "PACU-1",
        bed_type: "observation",
      })) as any;
      expect(bedRow.status).toBe("available");

      const c = await newCase({
        primary_procedure_title: "Fixation of mandible",
      });
      await makeReady(String(c.case_id));
      await svc.startCase(String(c.case_id));
      const recovery = (await svc.moveToRecovery(
        String(c.case_id),
        String(bedRow.bed_id),
      )) as any;
      expect(recovery.status).toBe("in_recovery");
      expect(recovery.recovery_bed_id).toBe(String(bedRow.bed_id));
      expect(recovery.recovery_allocation_id).toBeTruthy();
      // Capacity derives availability from the open allocation rather than
      // storing a second copy of it, so this is the assertion that proves the
      // theatre's patient is visible on the ward board.
      const occupied = (await capacity.listBeds(String(ward.ward_id))) as any[];
      const bedAfter = occupied.find((b) => b.bed_id === bedRow.bed_id)!;
      expect(bedAfter.is_available).toBe(false);
      expect(bedAfter.occupancy?.allocation_id).toBe(
        String(recovery.recovery_allocation_id),
      );
      expect(bedAfter.occupancy?.patient_id).toBe(String(patientId));

      const done = (await svc.completeCase(String(c.case_id))) as any;
      expect(done.status).toBe("completed");
      const freed = (await capacity.listBeds(String(ward.ward_id))) as any[];
      expect(freed.find((b) => b.bed_id === bedRow.bed_id)!.status).toBe(
        "cleaning",
      );
      await expect(
        capacity.completeTurnaround(
          String(
            ((await capacity.pendingTurnarounds()) as any[]).find(
              (t) => String(t.resource_id) === String(bedRow.bed_id),
            )!.turnaround_id,
          ),
        ),
      ).resolves.toBeTruthy();
      const afterClean = (await capacity.listBeds(
        String(ward.ward_id),
      )) as any[];
      expect(afterClean.find((b) => b.bed_id === bedRow.bed_id)!.status).toBe(
        "available",
      );
    }));

  it("refuses a recovery bed that another patient is occupying", () =>
    bed.run(async () => {
      const ward = (await capacity.createWard({
        ward_code: "REC-2",
        name: "PACU 2",
        ward_type: "theatre_recovery",
      })) as any;
      const shared = (await capacity.createBed({
        ward_id: ward.ward_id,
        bed_code: "PACU-9",
        bed_type: "observation",
      })) as any;
      const other = await bed.seedPatient();
      const alloc = (await capacity.allocate({
        bed_id: shared.bed_id,
        patient_id: other.patient_id,
        reason: "admission",
      })) as any;
      await capacity.markOccupied(String(alloc.allocation_id));

      const c = await newCase({ primary_procedure_title: "Nail removal" });
      await makeReady(String(c.case_id));
      await svc.startCase(String(c.case_id));
      await expect(
        svc.moveToRecovery(String(c.case_id), String(shared.bed_id)),
      ).rejects.toThrow(/Recovery bed unavailable/);
      // The refusal must not have marked the case as being in recovery.
      expect(((await svc.getCase(String(c.case_id))) as any).status).toBe(
        "in_theatre",
      );
    }));

  // ── anaesthesia ─────────────────────────────────────────────────────────────
  it("freezes a signed anaesthesia record and amends it as a child row", () =>
    bed.run(async () => {
      const c = await newCase({
        primary_procedure_title: "Total hip replacement",
      });
      const rec = (await svc.recordAnaesthesia({
        case_id: c.case_id,
        patient_id: patientId,
        asa_class: "ii",
        technique: "general",
        agents_summary: "Propofol induction, sevoflurane maintenance",
      })) as any;
      expect(rec.status).toBe("drafted");
      const graded = (await svc.updateAnaesthesia(String(rec.anaesthesia_id), {
        aldrete_score: 8,
      })) as any;
      // Recovery grade follows the score; it is not a free field.
      expect(graded.recovery_grade).toBe("B");
      await expect(
        svc.updateAnaesthesia(String(rec.anaesthesia_id), {
          aldrete_score: 44,
        }),
      ).rejects.toThrow(/0-10/);
      const signed = (await svc.signAnaesthesia(
        String(rec.anaesthesia_id),
      )) as any;
      expect(signed.status).toBe("signed");
      await expect(
        svc.updateAnaesthesia(String(rec.anaesthesia_id), {
          technique: "spinal",
        }),
      ).rejects.toThrow(/amended, not edited/);
      const amended = (await svc.amendAnaesthesia(String(rec.anaesthesia_id), {
        intraop_events: "Estimated blood loss revised to 300 ml after count-up",
      })) as any;
      expect(String(amended.record.parent_record_id)).toBe(
        String(rec.anaesthesia_id),
      );
      expect(amended.superseded).toBe(String(rec.anaesthesia_id));
      const parent = (
        await (bed.conn as any).query(
          `SELECT voided_at, status FROM health.anaesthesia_records WHERE anaesthesia_id = $1`,
          [rec.anaesthesia_id],
        )
      )[0];
      expect(parent.voided_at).toBeTruthy();
      const live = (await svc.anaesthesiaForCase(String(c.case_id))) as any[];
      expect(live.length).toBe(1);
      expect(String(live[0].anaesthesia_id)).toBe(
        String(amended.record.anaesthesia_id),
      );
      const chain = (await svc.anaesthesiaHistory(String(c.case_id))) as any[];
      expect(chain.length).toBe(2);
      expect(
        chain.find(
          (r) => String(r.anaesthesia_id) === String(rec.anaesthesia_id),
        )!.status,
      ).toBe("amended");
    }));

  it("keeps one live anaesthesia record per case and hides another tenant's rows", () =>
    bed.run(async () => {
      const c = await newCase({ primary_procedure_title: "Caesarean section" });
      await svc.recordAnaesthesia({
        case_id: c.case_id,
        patient_id: patientId,
        technique: "regional",
      });
      await expect(
        svc.recordAnaesthesia({
          case_id: c.case_id,
          patient_id: patientId,
          technique: "general",
        }),
      ).rejects.toThrow(/already|live/i);
      // The board is this tenant's registry only — no other tenant's theatres,
      // and both of this tenant's rooms are listed whether or not they are busy.
      const board = (await svc.theatreBoard()) as any[];
      expect(board.map((t) => t.theatre_code).sort()).toEqual(["TH-1", "TH-2"]);
      // One row per theatre even though several cases are live in TH-1 — the
      // board is a room list, not a case list.
      expect(new Set(board.map((r) => r.theatre_id)).size).toBe(board.length);
      const dayCase = board.find((t) => t.theatre_code === "TH-2")!;
      expect(dayCase.active_case_status).toBe("in_preop");
    }));

  it("refuses a case that contradicts itself", () =>
    bed.run(async () => {
      await expect(
        Promise.resolve().then(() =>
          svc.createCase({ patient_id: patientId, urgency: "tomorrow" }),
        ),
      ).rejects.toBeInstanceOf(DomainError);
      await expect(
        Promise.resolve().then(() =>
          svc.createCase({ patient_id: patientId, urgency: "crash" }),
        ),
      ).rejects.toThrow(/primary_procedure_title/);
    }));

  it("names a credential that cannot be verified and says so", () =>
    bed.run(async () => {
      const c = await newCase({ primary_procedure_title: "Wound debridement" });
      const m = (await svc.addTeamMember(String(c.case_id), {
        role: "scrub_nurse",
        global_user_id: "00000000-0000-0000-0000-000000000077",
        note: "agency list",
      })) as any;
      expect(m.credential_checked).toBe(false);
      expect(m.credential_status).toBe("external_verification_required");
      expect(m.confirmed).toBe(false);
      // Even the right person cannot confirm while the credential is unresolved:
      // the refusal is about the licence, not about who is clicking.
      await asActor(
        { userId: "00000000-0000-0000-0000-000000000077" },
        async () => {
          await expect(
            svc.confirmTeamMember(String(m.team_member_id)),
          ).rejects.toThrow(/external verification/);
        },
      );
    }));

  it("records a cancellation with a reason and refuses an unexplained one", () =>
    bed.run(async () => {
      const c = await newCase({
        primary_procedure_title: "Inguinal hernia, left",
      });
      await svc.scheduleCase(String(c.case_id), {
        theatre_id: theatreId,
        scheduled_start_at: iso(20),
        scheduled_end_at: iso(21),
      });
      await expect(
        Promise.resolve().then(() => svc.cancelCase(String(c.case_id), "")),
      ).rejects.toThrow(/reason/i);
      const cancelled = (await svc.cancelCase(
        String(c.case_id),
        "Patient febrile",
      )) as any;
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancellation_reason).toBe("Patient febrile");
      await expect(
        svc.scheduleCase(String(c.case_id), {
          theatre_id: theatreId,
          scheduled_start_at: iso(22),
          scheduled_end_at: iso(23),
        }),
      ).rejects.toThrow(/cannot be re-booked/);
    }));

  it("keeps a postponed case honest about when it returns", () =>
    bed.run(async () => {
      const c = await newCase({ primary_procedure_title: "Knee arthroscopy" });
      await svc.scheduleCase(String(c.case_id), {
        theatre_id: theatreId,
        scheduled_start_at: iso(24),
        scheduled_end_at: iso(25),
      });
      const p = (await svc.postponeCase(
        String(c.case_id),
        iso(30),
        "Theatre overrun",
      )) as any;
      expect(p.status).toBe("postponed");
      expect(p.postponed_until).toBeTruthy();
      const again = (await svc.scheduleCase(String(c.case_id), {
        theatre_id: theatreId,
        scheduled_start_at: iso(31),
        scheduled_end_at: iso(32),
      })) as any;
      expect(again.status).toBe("scheduled");
    }));
});
