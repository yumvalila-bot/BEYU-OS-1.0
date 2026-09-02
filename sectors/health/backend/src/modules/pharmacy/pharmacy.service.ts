import { Injectable } from "@nestjs/common";
import { PharmacyRepository } from "./pharmacy.repository";
import { DomainError } from "../../common/errors/domain.error";
import { AuditService } from "../audit/audit.service";
import { TenantContext } from "../../common/security/tenant-context";

@Injectable()
export class PharmacyService {
  constructor(
    private readonly repo: PharmacyRepository,
    private readonly audit: AuditService,
    private readonly tenantCtx: TenantContext,
  ) {}

  listItems() {
    return this.repo.listItems();
  }

  async createCatalogItem(input: Record<string, unknown>) {
    if (!input.sku || !input.name)
      throw DomainError.validation("sku and name required");
    return this.repo.withIsolation(async (tx) => {
      const existing = await this.repo.findItemBySku(input.sku as string, tx);
      if (existing)
        throw DomainError.conflict(`SKU '${input.sku}' already exists`);
      const item = await this.repo.createItem(input, tx);
      await this.audit.record(tx, {
        operation: "pharmacy.item.create",
        resourceType: "pharmacy_item",
        resourceId: item.item_id as string,
        after: item,
      });
      return item;
    });
  }

  async receiveStock(input: Record<string, unknown>) {
    if (Number(input.qty) <= 0)
      throw DomainError.validation("qty must be positive");
    return this.repo.withIsolation(async (tx) => {
      const item = await this.repo.findItemById(input.item_id as string, tx);
      if (!item)
        throw DomainError.notFound("PharmacyItem", input.item_id as string);
      const batch = await this.repo.receiveStock(input, tx);
      const mv = await this.repo.recordMovement(
        {
          item_id: input.item_id,
          batch_id: batch.batch_id,
          movement_type: "receive",
          qty: input.qty,
          reference_type: "batch",
          reference_id: batch.batch_id,
        },
        tx,
      );
      await this.audit.record(tx, {
        operation: "pharmacy.stock.receive",
        resourceType: "stock_movement",
        resourceId: mv.movement_id,
        after: mv,
      });
      return {
        batch,
        on_hand: await this.repo.getStockLevel(input.item_id as string, tx),
      };
    });
  }

  async dispense(input: Record<string, unknown>) {
    if (Number(input.qty) <= 0)
      throw DomainError.validation("qty must be positive");
    if (input.idempotency_key) {
      const existing = await this.repo.findDispenseByIdempotency(
        input.idempotency_key as string,
      );
      if (existing) return existing;
    }
    const actor = this.tenantCtx.current();
    if (!actor?.permissions?.includes("rx:dispense"))
      throw DomainError.forbidden("rx:dispense required");
    return this.repo.withIsolation(async (tx) => {
      const med = await this.repo.findMedicationById(
        input.medication_id as string,
        tx,
      );
      if (!med || med.patient_id !== input.patient_id)
        throw DomainError.notFound("Medication", input.medication_id as string);
      try {
        await this.repo.recordMovement(
          {
            item_id: input.item_id,
            movement_type: "dispense",
            qty: input.qty,
            reference_type: "medication",
            reference_id: input.medication_id,
            idempotency_key: input.idempotency_key
              ? `mv:${input.idempotency_key}`
              : undefined,
          },
          tx,
        );
      } catch (e: any) {
        if (/negative|check|inventor/i.test(e.message || ""))
          throw DomainError.conflict("Insufficient stock to dispense");
        throw e;
      }
      const dispense = await this.repo.createDispense(input, tx);
      await this.audit.record(tx, {
        operation: "pharmacy.dispense",
        resourceType: "dispense",
        resourceId: dispense.dispense_id,
        after: dispense,
      });
      return {
        dispense,
        on_hand: await this.repo.getStockLevel(input.item_id as string, tx),
      };
    });
  }

  listPatientDispenses(patientId: string) {
    return this.repo.listDispensesForPatient(patientId);
  }
}
