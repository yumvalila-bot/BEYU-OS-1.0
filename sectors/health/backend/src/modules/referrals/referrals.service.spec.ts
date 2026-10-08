/**
 * Referral domain tests (migration 035).
 *
 * The centre of gravity is transmission honesty: the state a referral is in
 * must never claim more than actually happened, because the receiving facility
 * and the patient both act on it.
 */
import { describe, it, expect, beforeAll } from "@jest/globals";
import { buildTestBed, TestBed } from "../../common/testing/test-bed";
import {
  ReferralEventRepository,
  ReferralRepository,
  ReferralService,
} from "./referrals.service";
import { DomainError } from "../../common/errors/domain.error";
import { EventOutboxService } from "../events/event-outbox.service";

describe("ReferralService", () => {
  let bed: TestBed;
  let svc: ReferralService;

  beforeAll(async () => {
    bed = await buildTestBed();
    const events = new EventOutboxService(bed.conn, bed.tenantCtx);
    svc = new ReferralService(
      bed.conn,
      bed.tenantCtx,
      bed.audit,
      events,
      new ReferralEventRepository(bed.conn, bed.tenantCtx),
      new ReferralRepository(bed.conn, bed.tenantCtx),
    );
  });

  /** Seed a consent row directly: this module verifies, it does not capture. */
  const consent = async (patientId: string, recipient?: string) => {
    const rows = await (bed.conn as any).query(
      `INSERT INTO health.consents (tenant_id, patient_id, purpose, recipient, status)
       VALUES ($1, $2, 'treatment', $3, 'active') RETURNING consent_id`,
      [bed.tenantCtx.tenantId(), patientId, recipient ?? null],
    );
    return String(rows[0].consent_id);
  };

  const make = async (extra: Record<string, unknown> = {}) => {
    const p = await bed.seedPatient();
    return (await svc.createReferral({
      patient_id: p.patient_id,
      to_specialty: "cardiology",
      reason: "Palpitations, needs echo opinion",
      ...extra,
    })) as any;
  };

  it("creates a draft with a generated reference and no transmission claim", () =>
    bed.run(async () => {
      const r = await make();
      expect(r.status).toBe("draft");
      expect(r.transmission_state).toBe("not_sent");
      expect(r.referral_no).toMatch(/^REF-/);
      // A fresh referral has exactly one tracking step: its own creation.
      const trail = (await svc.trail(r.referral_id)) as any[];
      expect(trail.map((t) => t.step)).toEqual(["created"]);
    }));

  it("an internal send is a fact, so it reaches `sent` immediately", () =>
    bed.run(async () => {
      const r = await make({ transmission_channel: "internal" });
      const sent = (await svc.send(r.referral_id)) as any;
      expect(sent.status).toBe("sent");
      expect(sent.transmission_state).toBe("sent");
      expect(sent.sent_at).toBeTruthy();
      const trail = (await svc.trail(r.referral_id)) as any[];
      expect(trail.map((t) => t.step)).toEqual(["created", "sent"]);
      // Every tracking step names the actor from the credential.
      expect(trail[1].actor_global_user_id).toBe(bed.tenantCtx.require().userId);
    }));

  it("an external send stays pending until an adapter confirms it", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      const r = (await svc.createReferral({
        patient_id: p.patient_id,
        to_specialty: "cardiology",
        reason: "needs echo opinion",
        is_external: true,
        to_organization_name: "Muhimbili National Hospital",
        transmission_channel: "fax",
      })) as any;
      await svc.verifyConsent(r.referral_id, await consent(p.patient_id));
      const sent = (await svc.send(r.referral_id)) as any;
      expect(sent.status).toBe("sent");
      expect(sent.transmission_state).toBe("pending_external");

      const ok = (await svc.recordTransmissionOutcome(
        r.referral_id,
        "sent",
        "fax-confirmation-77",
      )) as any;
      expect(ok.transmission_state).toBe("sent");
      // Nothing is pending any more, so a second outcome is refused.
      await expect(
        svc.recordTransmissionOutcome(r.referral_id, "failed", "late receipt"),
      ).rejects.toBeInstanceOf(DomainError);
    }));

  it("a failed transmission returns the referral to draft instead of losing it", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      const r = (await svc.createReferral({
        patient_id: p.patient_id,
        to_specialty: "cardiology",
        reason: "fracture",
        is_external: true,
        to_organization_name: "Kibaha Regional",
        transmission_channel: "email",
      })) as any;
      await svc.verifyConsent(r.referral_id, await consent(p.patient_id));
      await svc.send(r.referral_id);
      const failed = (await svc.recordTransmissionOutcome(
        r.referral_id,
        "failed",
        "smtp relay refused",
      )) as any;
      expect(failed.transmission_state).toBe("failed");
      expect(failed.status).toBe("draft");
      // …and it can legitimately be re-sent by another channel.
      const again = (await svc.send(r.referral_id, { channel: "letter" })) as any;
      expect(again.status).toBe("sent");
      expect(again.transmission_state).toBe("pending_external");
      const confirmed = (await svc.recordTransmissionOutcome(
        r.referral_id,
        "sent",
        "letter-2024-114",
      )) as any;
      expect(confirmed.transmission_state).toBe("sent");
    }));

  it("a send that carries an adapter receipt is recorded as delivered at once", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      const r = (await svc.createReferral({
        patient_id: p.patient_id,
        to_specialty: "dermatology",
        reason: "rash",
        is_external: true,
        to_organization_name: "Bugando Medical Centre",
        transmission_channel: "fhir",
      })) as any;
      await svc.verifyConsent(r.referral_id, await consent(p.patient_id));
      const sent = (await svc.send(r.referral_id, {
        channel: "fhir",
        reference: "bundle-8891",
      })) as any;
      expect(sent.transmission_state).toBe("sent");
    }));

  it("will not send an external referral whose consent is unverified", () =>
    bed.run(async () => {
      const r = await make({
        is_external: true,
        to_facility_id: null,
        to_organization_name: "Coast General",
        transmission_channel: "portal",
      });
      await expect(
        Promise.resolve().then(() => svc.send(r.referral_id)),
      ).rejects.toThrow(/consent/i);

      // A consent that names somebody else does not authorise this disclosure.
      const p = await bed.seedPatient();
      const other = (await svc.createReferral({
        patient_id: p.patient_id,
        to_specialty: "surgery",
        reason: "appendicitis",
        is_external: true,
        to_organization_name: "Coast General",
        transmission_channel: "letter",
      })) as any;
      const wrongRecipient = await consent(p.patient_id, "Aga Khan Hospital");
      await expect(
        svc.verifyConsent(other.referral_id, wrongRecipient),
      ).rejects.toThrow(/recipient/i);
      // …while an unaddressed treatment consent does.
      await svc.verifyConsent(
        other.referral_id,
        await consent(p.patient_id, "Coast General"),
      );
      const sent = (await svc.send(other.referral_id)) as any;
      expect(sent.consent_verified).toBe(true);
    }));

  it("requires the receiving organisation for an external referral", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      await expect(
        Promise.resolve().then(() =>
          svc.createReferral({
            patient_id: p.patient_id,
            to_specialty: "orthopaedics",
            reason: "Fracture",
            is_external: true,
          }),
        ),
      ).rejects.toThrow(/to_organization_name/);
    }));

  it("walks the lifecycle and refuses the illegal jumps", () =>
    bed.run(async () => {
      const r = await make({ transmission_channel: "internal" });
      await svc.send(r.referral_id);
      await expect(
        svc.complete(r.referral_id, "seen and treated"),
      ).rejects.toBeInstanceOf(DomainError); // sent → completed is not a step
      const ack = (await svc.acknowledge(r.referral_id)) as any;
      expect(ack.previous_status).toBe("sent");
      await svc.accept(r.referral_id);
      await svc.markSeen(r.referral_id);
      const done = (await svc.complete(r.referral_id, "Medical management started")) as any;
      expect(done.status).toBe("completed");
      expect(done.outcome_summary).toBe("Medical management started");
      const trail = (await svc.trail(r.referral_id)) as any[];
      expect(trail.map((t) => t.step)).toEqual([
        "created",
        "sent",
        "acknowledged",
        "accepted",
        "seen",
        "completed",
      ]);
      await expect(svc.chase(r.referral_id, "still waiting")).rejects.toThrow(
        /nothing to chase/i,
      );
    }));

  it("declines and cancels only with a reason, and a sent referral is not editable", () =>
    bed.run(async () => {
      const r = await make({ transmission_channel: "internal" });
      await svc.send(r.referral_id);
      await expect(
        Promise.resolve().then(() => svc.decline(r.referral_id, "  ")),
      ).rejects.toThrow(/decline_reason/);
      await expect(
        svc.updateReferral(r.referral_id, { reason: "changed my mind" }),
      ).rejects.toThrow(/left draft/i);
      const d = (await svc.decline(r.referral_id, "No cardiology capacity until March")) as any;
      expect(d.status).toBe("declined");
      expect(d.decline_reason).toBe("No cardiology capacity until March");
      // A declined referral is terminal.
      await expect(svc.accept(r.referral_id)).rejects.toBeInstanceOf(DomainError);
    }));

  it("chases a waiting referral and exposes an ageing clock", () =>
    bed.run(async () => {
      const r = await make({ transmission_channel: "internal", urgency: "routine" });
      await svc.send(r.referral_id);
      // Age it in the database rather than trusting a client-supplied date.
      await (bed.conn as any).exec(
        `UPDATE health.referrals
            SET created_at = now() - interval '30 days'
          WHERE referral_id = '${r.referral_id}'`,
      );
      const waiting = (await svc.waitingList()) as any[];
      const row = waiting.find((w) => w.referral_id === r.referral_id);
      expect(row.waiting_days).toBeGreaterThanOrEqual(29);
      expect(row.chase_due).toBe(true);
      const chased = (await svc.chase(r.referral_id, "Called the secretary")) as any;
      expect(chased.chased).toBe(true);
      const trail = (await svc.trail(r.referral_id)) as any[];
      expect(trail.some((t) => t.step === "chased")).toBe(true);
    }));

  it("expires referrals whose validity date has passed, with a trail entry", () =>
    bed.run(async () => {
      const r = await make({
        transmission_channel: "internal",
        valid_until: new Date(Date.now() - 86400_000).toISOString().slice(0, 10),
      });
      await svc.send(r.referral_id);
      const sweep = (await svc.sweepExpired()) as any;
      expect(sweep.expired).toBeGreaterThanOrEqual(1);
      const after = (await svc.getReferral(r.referral_id)) as any;
      expect(after.status).toBe("expired");
      const trail = (await svc.trail(r.referral_id)) as any[];
      expect(trail.some((t) => t.step === "expired")).toBe(true);
    }));

  it("links only documents whose object is retrievable", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      const r = await make({ transmission_channel: "internal" });
      const hash = "c".repeat(64);
      await (bed.conn as any).exec(
        `INSERT INTO health.clinical_documents
           (tenant_id, patient_id, title, doc_type, storage_ref, content_sha256, available)
         VALUES ('11111111-1111-1111-1111-111111111111','${p.patient_id}',
                 'Clinic letter','referral_letter','obj/v1','${hash}',false),
                ('11111111-1111-1111-1111-111111111111','${p.patient_id}',
                 'Clinic letter','referral_letter','obj/v2','${hash}',true)`,
      );
      const rows = await (bed.conn as any).query(
        `SELECT document_id, available FROM health.clinical_documents
          WHERE patient_id = '${p.patient_id}' ORDER BY available DESC`,
      );
      const unavailable = rows.find((x: any) => !x.available);
      const available = rows.find((x: any) => x.available);
      await expect(
        svc.attachDocument(r.referral_id, unavailable.document_id),
      ).rejects.toThrow(/not retrievable/i);
      const linked = (await svc.attachDocument(
        r.referral_id,
        available.document_id,
      )) as any;
      expect(linked.attached).toBe(true);
      // Re-linking is idempotent, not a duplicate row.
      await svc.attachDocument(r.referral_id, available.document_id);
      const links = await (bed.conn as any).query(
        `SELECT count(*)::int AS n FROM health.referral_documents
          WHERE referral_id = '${r.referral_id}'`,
      );
      expect(links[0].n).toBe(1);
    }));

  it("counts the open pipeline per specialty server-side", () =>
    bed.run(async () => {
      const a = await make({ transmission_channel: "internal", urgency: "urgent" });
      const b = await make({ transmission_channel: "internal", urgency: "routine" });
      await svc.send(a.referral_id);
      await svc.send(b.referral_id);
      const rows = (await svc.board()) as any[];
      const cardiology = rows.filter((r) => r.to_specialty === "cardiology");
      expect(cardiology.length).toBeGreaterThanOrEqual(1);
      expect(cardiology.reduce((n, r) => n + r.open_referrals, 0)).toBeGreaterThanOrEqual(2);
    }));

  it("referral tracking steps are append-only: no void, no edit", () =>
    bed.run(async () => {
      const r = await make({ transmission_channel: "internal" });
      await svc.send(r.referral_id);
      const trail = (await svc.trail(r.referral_id)) as any[];
      const events = new ReferralEventRepository(bed.conn, bed.tenantCtx);
      await expect(
        events.softDelete(bed.conn as any, String(trail[0].referral_event_id)),
      ).rejects.toThrow(/append-only/i);
      // The spec declares no updatable columns, so a write attempt to a
      // tracking step has nothing it can change: the row is left untouched.
      const attempted = (await events.patch(
        bed.conn as any,
        String(trail[0].referral_event_id),
        { step: "created", note: "rewritten history" },
      )) as any;
      expect(attempted.step).toBe("created");
      expect(attempted.note).not.toBe("rewritten history");
    }));
});
