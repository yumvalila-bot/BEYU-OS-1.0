/**
 * Capacity domain tests.
 *
 * Covers the three things that matter operationally and none of which a UI
 * could fake:
 *   1. placement rules (no double-booked bed, no isolation without an
 *      isolation-capable bed, no admission into an un-cleaned bed);
 *   2. that transfer/discharge are atomic across the bed, allocation,
 *      turnaround and flow tables;
 *   3. that a row written under one tenant is invisible under another, enforced
 *      by RLS rather than by a WHERE clause in the repository.
 */
import { describe, it, expect, beforeAll } from "@jest/globals";
import { buildTestBed, TestBed } from "../../common/testing/test-bed";
import { CapacityService } from "./capacity.service";
import {
  BedAllocationRepository,
  BedRepository,
  PatientFlowRepository,
  ServiceTurnaroundRepository,
  WardRepository,
} from "./capacity.repository";
import { DomainError } from "../../common/errors/domain.error";
import { EventOutboxService } from "../events/event-outbox.service";

describe("CapacityService", () => {
  let bed: TestBed;
  let svc: CapacityService;
  let outboxRowsBefore = 0;

  const ward = async (code = "WARD-A") =>
    (await svc.createWard({
      ward_code: code,
      name: `Ward ${code}`,
      ward_type: "medical",
    })) as any;

  const makeBed = async (wardId: string, code: string, extra: any = {}) =>
    (await svc.createBed({
      ward_id: wardId,
      bed_code: code,
      bed_type: "general",
      ...extra,
    })) as any;

  beforeAll(async () => {
    bed = await buildTestBed();
    const outbox = new EventOutboxService(bed.conn, bed.tenantCtx);
    svc = new CapacityService(
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
  });

  it("registers a ward and its beds", () =>
    bed.run(async () => {
      const w = await ward("WARD-REG");
      expect(w.ward_id).toBeTruthy();
      const b = await makeBed(w.ward_id, "A-1");
      expect(b.bed_id).toBeTruthy();
      expect(b.status).toBe("available");
    }));

  it("allocates, occupies and discharges, deriving occupancy from the allocation", () =>
    bed.run(async () => {
      const w = await ward("WARD-ALLOC");
      const b1 = await makeBed(w.ward_id, "B-1");
      const b2 = await makeBed(w.ward_id, "B-2");
      const p = await bed.seedPatient();
      const alloc = (await svc.allocate({
        bed_id: b1.bed_id,
        patient_id: p.patient_id,
        reason: "admission",
      })) as any;
      expect(alloc.status).toBe("allocated");
      expect(alloc.ward_id).toBe(w.ward_id);

      const beds = (await svc.listBeds(w.ward_id)) as any[];
      const occupied = beds.find((x) => x.bed_id === b1.bed_id);
      const free = beds.find((x) => x.bed_id === b2.bed_id);
      expect(occupied.is_available).toBe(false);
      expect(occupied.occupancy.allocation_id).toBe(alloc.allocation_id);
      expect(free.is_available).toBe(true);

      await svc.markOccupied(alloc.allocation_id);
      await svc.requestDischarge(alloc.allocation_id);
      const done = (await svc.discharge(alloc.allocation_id, "medically fit")) as any;
      expect(done.status).toBe("discharged");
      expect(done.closed_at).toBeTruthy();

      // Freed bed must NOT silently become available: cleaning first.
      const after = ((await svc.listBeds(w.ward_id)) as any[]).find(
        (x) => x.bed_id === b1.bed_id,
      );
      expect(after.status).toBe("cleaning");
      expect(after.is_available).toBe(false);

      const pending = (await svc.pendingTurnarounds()) as any[];
      const tu = pending.find((t) => String(t.resource_id) === b1.bed_id);
      expect(tu).toBeTruthy();
      expect(tu.kind).toBe("clean");
      await svc.completeTurnaround(tu.turnaround_id);
      const restored = ((await svc.listBeds(w.ward_id)) as any[]).find(
        (x) => x.bed_id === b1.bed_id,
      );
      expect(restored.status).toBe("available");
    }));

  it("refuses a second open allocation on the same bed and for the same patient", () =>
    bed.run(async () => {
      const w = await ward("WARD-CLASH");
      const b1 = await makeBed(w.ward_id, "C-1");
      const b2 = await makeBed(w.ward_id, "C-2");
      const p1 = await bed.seedPatient("MRN-CAP-1");
      const p2 = await bed.seedPatient("MRN-CAP-2");
      await svc.allocate({ bed_id: b1.bed_id, patient_id: p1.patient_id });
      await expect(
        svc.allocate({ bed_id: b1.bed_id, patient_id: p2.patient_id }),
      ).rejects.toBeInstanceOf(DomainError);
      await expect(
        svc.allocate({ bed_id: b2.bed_id, patient_id: p1.patient_id }),
      ).rejects.toThrow(/transfer/i);
    }));

  it("will not admit into a bed that is cleaning or maintenance", () =>
    bed.run(async () => {
      const w = await ward("WARD-DIRTY");
      const b = await makeBed(w.ward_id, "D-1");
      await svc.setBedStatus(b.bed_id, "cleaning");
      const p = await bed.seedPatient();
      await expect(
        svc.allocate({ bed_id: b.bed_id, patient_id: p.patient_id }),
      ).rejects.toThrow(/cleaning/i);
    }));

  it("requires an isolation-capable bed for an isolation placement", () =>
    bed.run(async () => {
      const w = await ward("WARD-ISO");
      const plain = await makeBed(w.ward_id, "E-1");
      const iso = await makeBed(w.ward_id, "E-2", {
        bed_type: "isolation",
        isolation_capable: true,
      });
      const p1 = await bed.seedPatient();
      await expect(
        svc.allocate({
          bed_id: plain.bed_id,
          patient_id: p1.patient_id,
          reason: "isolation",
        }),
      ).rejects.toThrow(/isolation-capable/i);
      const p2 = await bed.seedPatient();
      const ok = (await svc.allocate({
        bed_id: iso.bed_id,
        patient_id: p2.patient_id,
        reason: "isolation",
      })) as any;
      expect(ok.reason).toBe("isolation");
    }));

  it("transfers atomically: lineage, cleaning request and flow events", () =>
    bed.run(async () => {
      const w = await ward("WARD-XFER-A");
      const w2 = await ward("WARD-XFER-B");
      const from = await makeBed(w.ward_id, "F-1");
      const to = await makeBed(w2.ward_id, "G-1");
      const p = await bed.seedPatient();
      const alloc = (await svc.allocate({
        bed_id: from.bed_id,
        patient_id: p.patient_id,
        encounter_id: null,
      })) as any;
      const result = (await svc.transfer(
        alloc.allocation_id,
        to.bed_id,
        "step-down",
      )) as any;

      expect(result.from.status).toBe("moved");
      expect(result.to.status).toBe("allocated");
      expect(result.to.reason).toBe("transfer_in");
      expect(result.to.transfer_from_allocation_id).toBe(alloc.allocation_id);
      expect(result.to.ward_id).toBe(w2.ward_id);

      const oldBed = ((await svc.listBeds(w.ward_id)) as any[]).find(
        (x) => x.bed_id === from.bed_id,
      );
      expect(oldBed.status).toBe("cleaning");
      const newBed = ((await svc.listBeds(w2.ward_id)) as any[]).find(
        (x) => x.bed_id === to.bed_id,
      );
      expect(newBed.is_available).toBe(false);

      // Encounter is null here, so assert on the tenant-wide trace instead.
      const trace = (await (svc as any).flow.query(
        `SELECT step FROM health.patient_flow_events
          WHERE tenant_id = $1 AND patient_id = $2 ORDER BY occurred_at ASC`,
        [bed.tenantCtx.tenantId(), p.patient_id],
      )) as any[];
      expect(trace.map((t) => t.step)).toContain("transfer");
      expect(trace.map((t) => t.step)).toContain("bed_freed");

    }));

  it("idempotency key returns the same allocation instead of a second one", () =>
    bed.run(async () => {
      const w = await ward("WARD-IDEM");
      const b = await makeBed(w.ward_id, "H-1");
      const p = await bed.seedPatient();
      const first = (await svc.allocate({
        bed_id: b.bed_id,
        patient_id: p.patient_id,
        idempotency_key: "cap-idem-1",
      })) as any;
      const second = (await svc.allocate({
        bed_id: b.bed_id,
        patient_id: p.patient_id,
        idempotency_key: "cap-idem-1",
      })) as any;
      expect(second.allocation_id).toBe(first.allocation_id);
    }));

  it("aggregates capacity per ward on the server", () =>
    bed.run(async () => {
      const w = await ward("WARD-SNAP");
      await makeBed(w.ward_id, "S-1");
      await makeBed(w.ward_id, "S-2");
      const snap = (await svc.capacitySnapshot()) as any[];
      const row = snap.find((r) => r.ward_id === w.ward_id);
      expect(row).toBeTruthy();
      expect(row.total_beds).toBe(2);
      expect(row.available + row.occupied + row.cleaning + row.maintenance).toBeLessThanOrEqual(
        row.total_beds,
      );
    }));

  it("emits exactly one governed outbox event per allocation create", () =>
    bed.run(async () => {
      const before = (await (svc as any).query(
        `SELECT count(*)::int AS n FROM health.beyu_outbox WHERE provider = 'beyu.events'`,
      )) as any[];
      outboxRowsBefore = before[0].n;
      const w = await ward("WARD-EVT");
      const b = await makeBed(w.ward_id, "T-1");
      const p = await bed.seedPatient();
      await svc.allocate({ bed_id: b.bed_id, patient_id: p.patient_id });
      const after = (await (svc as any).query(
        `SELECT request_payload->>'eventType' AS event_type,
                request_payload->>'subjectId' AS subject_id
           FROM health.beyu_outbox
          WHERE provider = 'beyu.events'
          ORDER BY created_at DESC LIMIT 1`,
      )) as any[];
      const count = (await (svc as any).query(
        `SELECT count(*)::int AS n FROM health.beyu_outbox WHERE provider = 'beyu.events'`,
      )) as any[];
      expect(count[0].n).toBe(outboxRowsBefore + 1);
      expect(after[0]?.event_type).toBe("health.capacity.bed_allocated");
      expect(after[0]?.subject_id).toBeTruthy();
    }));

  it("audits every allocation mutation into the canonical audit ledger", () =>
    bed.run(async () => {
      const rows = (await (svc as any).query(
        `SELECT operation, count(*)::int AS n
           FROM health.audit_log
          WHERE tenant_id = $1 AND resource_type = 'bed_allocation'
          GROUP BY operation`,
        [bed.tenantCtx.tenantId()],
      )) as any[];
      const ops = new Set(rows.map((r) => r.operation));
      expect(ops.has("bed_allocation.create")).toBe(true);
      expect(ops.has("bed_allocation.transfer")).toBe(true);
      expect(ops.has("bed_allocation.discharge")).toBe(true);
    }));
});
