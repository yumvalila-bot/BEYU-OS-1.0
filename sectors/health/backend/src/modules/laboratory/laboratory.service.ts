import { Injectable } from "@nestjs/common";
import { LaboratoryRepository } from "./laboratory.repository";
import { DomainError } from "../../common/errors/domain.error";
import { AuditService } from "../audit/audit.service";

const ORDER_TRANSITIONS: Record<string, Set<string>> = {
  ordered: new Set(["collected", "cancelled", "rejected"]),
  collected: new Set(["received", "cancelled"]),
  received: new Set(["in_progress", "cancelled"]),
  in_progress: new Set(["completed", "cancelled"]),
  completed: new Set<string>(),
  cancelled: new Set<string>(),
  rejected: new Set<string>(),
};
const STAMP: Record<string, string> = {
  collected: "collected_at",
  received: "received_at",
  completed: "completed_at",
  cancelled: "cancelled_at",
};

@Injectable()
export class LaboratoryService {
  constructor(
    private readonly repo: LaboratoryRepository,
    private readonly audit: AuditService,
  ) {}

  listTests() { return this.repo.listTests(); }
  async createTest(input: Record<string, unknown>) {
    if (!input.name) throw DomainError.validation("name required");
    return this.repo.withIsolation(async (tx) => {
      const t = await this.repo.createTest(input, tx);
      await this.audit.record(tx, { operation: "lab.test.create", resourceType: "lab_test", resourceId: t.test_id as string, after: t });
      return t;
    });
  }
  listOrders(patientId?: string) { return this.repo.listOrders(patientId); }
  async createOrder(input: any) {
    if (!input.test_ids?.length) throw DomainError.validation("test_ids required");
    if (input.idempotency_key) {
      const e = await this.repo.findByIdempotency(input.idempotency_key);
      if (e) return e;
    }
    return this.repo.withIsolation(async (tx) => {
      const o = await this.repo.createOrder(input, tx);
      await this.audit.record(tx, { operation: "lab.order.create", resourceType: "lab_order", resourceId: o.order_id, after: o });
      return o;
    });
  }
  async transition(id: string, to: string) {
    return this.repo.withIsolation(async (tx) => {
      const cur = await this.repo.findOrder(id, tx);
      if (!cur) throw DomainError.notFound("LabOrder", id);
      if (!ORDER_TRANSITIONS[cur.status]?.has(to)) throw DomainError.invalidState(`Cannot transition lab order from ${cur.status} to ${to}`);
      const o = await this.repo.transitionOrder(id, to, STAMP[to], tx);
      await this.audit.record(tx, { operation: "lab.order.transition", resourceType: "lab_order", resourceId: id, metadata: { to } });
      return o;
    });
  }
  async enterResult(itemId: string, result: any) {
    return this.repo.withIsolation(async (tx) => {
      const r = await this.repo.enterResult(itemId, result, tx);
      if (!r) throw DomainError.invalidState("Result cannot be entered (item already verified or missing)");
      await this.audit.record(tx, { operation: "lab.result.enter", resourceType: "lab_result", resourceId: itemId, after: r });
      return r;
    });
  }
  async verifyResult(itemId: string) {
    return this.repo.withIsolation(async (tx) => {
      const r = await this.repo.verifyResult(itemId, tx);
      if (!r) throw DomainError.invalidState("Result cannot be verified (no entered result or already verified)");
      await this.audit.record(tx, { operation: "lab.result.verify", resourceType: "lab_result", resourceId: itemId, after: r });
      return r;
    });
  }

  async listOrderItems(orderId: string) {
    return this.repo.withIsolation((tx) => this.repo.listOrderItems(orderId, tx));
  }
}
