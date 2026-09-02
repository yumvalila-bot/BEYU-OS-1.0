import { Injectable } from "@nestjs/common";
import { AmbulanceRepository } from "./ambulance.repository";
import { DomainError } from "../../common/errors/domain.error";
import { AuditService } from "../audit/audit.service";
import { Inject } from "@nestjs/common";
import { DbConnection, DB_CONNECTION } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { atomicWrite, atomicTransition } from "../../common/db/crud-factory";

const TRANSITIONS: Record<string, Set<string>> = {
  received: new Set(["dispatched", "cancelled"]),
  dispatched: new Set(["enroute", "cancelled"]),
  enroute: new Set(["on_scene", "cancelled"]),
  on_scene: new Set(["transporting", "no_transport"]),
  transporting: new Set(["delivered"]),
  delivered: new Set<string>(),
  cancelled: new Set<string>(),
  no_transport: new Set<string>(),
};
const STAMP: Record<string, string> = {
  dispatched: "dispatched_at",
  enroute: null as any,
  on_scene: "arrived_at",
  transporting: "departed_scene_at",
  delivered: "delivered_at",
  cancelled: "cancelled_at",
  no_transport: null as any,
};

@Injectable()
export class AmbulanceService {
  constructor(
    private readonly repo: AmbulanceRepository,
    private readonly audit: AuditService,
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly tenantCtx: TenantContext,
  ) {}
  listVehicles() {
    return this.repo.listVehicles();
  }
  registerVehicle(input: Record<string, unknown>) {
    if (!input.plate) throw DomainError.validation("plate required");
    return atomicWrite(
      this.db,
      this.tenantCtx,
      this.audit,
      "vehicle.register",
      "vehicle",
      (tx) => this.repo.registerVehicle(input, tx),
      (r) => r.vehicle_id,
    );
  }
  async createRequest(input: any) {
    if (!input.pickup_location)
      throw DomainError.validation("pickup_location required");
    if (input.idempotency_key) {
      const e = await this.repo.findByIdempotency(input.idempotency_key);
      if (e) return e;
    }
    return atomicWrite(
      this.db,
      this.tenantCtx,
      this.audit,
      "ambulance.request.create",
      "ambulance_request",
      (tx) => this.repo.createRequest(input, tx),
      (r) => r.request_id,
    );
  }
  async transition(
    id: string,
    to: string,
    patch: Record<string, unknown> = {},
  ) {
    const stampCol = STAMP[to];
    return atomicTransition(
      this.db,
      this.tenantCtx,
      this.audit,
      TRANSITIONS,
      (rid, tx) => this.repo.findRequest(rid, tx),
      async (rid, tto, tx) => {
        const p: Record<string, unknown> = { status: tto, ...patch };
        if (stampCol) p[stampCol] = new Date();
        return this.repo.updateRequest(rid, p, tx);
      },
      "ambulance.request.transition",
      "ambulance_request",
      id,
      to,
    );
  }
}
