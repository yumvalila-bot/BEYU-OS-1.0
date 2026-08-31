import { describe, it, expect, beforeAll } from "@jest/globals";
import { buildTestBed, TestBed } from "../../common/testing/test-bed";
import { AmbulanceRepository } from "./ambulance.repository";
import { AmbulanceService } from "./ambulance.service";
import { DomainError } from "../../common/errors/domain.error";

describe("AmbulanceService", () => {
  let bed: TestBed;
  let svc: AmbulanceService;

  beforeAll(async () => {
    bed = await buildTestBed();
    const repo = new AmbulanceRepository(bed.conn, bed.tenantCtx);
    svc = new AmbulanceService(repo, bed.audit, bed.conn, bed.tenantCtx);
  });

  it("registers a vehicle and creates a request with full state machine timestamps", () =>
    bed.run(async () => {
      const v = (await svc.registerVehicle({ plate: "T-1001", vehicle_type: "ambulance", capacity_crew: 2 })) as any;
      expect(v.vehicle_id).toBeTruthy();
      const p = await bed.seedPatient();
      const r = (await svc.createRequest({
        patient_id: p.patient_id, priority: "emergency",
        pickup_location: "Mwananyamala", destination: "Muhimbili",
        chief_complaint: "Chest pain", vehicle_id: v.vehicle_id,
      })) as any;
      expect(r.request_id).toBeTruthy();
      expect(r.status).toBe("received");
      expect(r.created_at).toBeTruthy();
      const d = (await svc.transition(r.request_id, "dispatched")) as any;
      expect(d.dispatched_at).toBeTruthy();
      await svc.transition(r.request_id, "enroute");
      const on = (await svc.transition(r.request_id, "on_scene")) as any;
      expect(on.arrived_at).toBeTruthy();
      const tp = (await svc.transition(r.request_id, "transporting")) as any;
      expect(tp.departed_scene_at).toBeTruthy();
      const fin = (await svc.transition(r.request_id, "delivered")) as any;
      expect(fin.delivered_at).toBeTruthy();
    }));

  it("rejects invalid state transitions", () =>
    bed.run(async () => {
      const v = (await svc.registerVehicle({ plate: "T-1002", vehicle_type: "ambulance" })) as any;
      const p = await bed.seedPatient();
      const r = (await svc.createRequest({
        patient_id: p.patient_id, priority: "routine", pickup_location: "A", destination: "B",
        chief_complaint: "fall", vehicle_id: v.vehicle_id,
      })) as any;
      await expect(svc.transition(r.request_id, "on_scene")).rejects.toBeInstanceOf(DomainError);
    }));

  it("idempotency key prevents duplicate request", () =>
    bed.run(async () => {
      const v = (await svc.registerVehicle({ plate: "T-1003", vehicle_type: "ambulance" })) as any;
      const p = await bed.seedPatient();
      const r1 = (await svc.createRequest({
        patient_id: p.patient_id, priority: "urgent", pickup_location: "X", destination: "Y",
        chief_complaint: "fever", vehicle_id: v.vehicle_id, idempotency_key: "idem-amb-1",
      })) as any;
      const r2 = (await svc.createRequest({
        patient_id: p.patient_id, priority: "urgent", pickup_location: "X", destination: "Y",
        chief_complaint: "fever", vehicle_id: v.vehicle_id, idempotency_key: "idem-amb-1",
      })) as any;
      expect(r2.request_id).toBe(r1.request_id);
    }));
});
