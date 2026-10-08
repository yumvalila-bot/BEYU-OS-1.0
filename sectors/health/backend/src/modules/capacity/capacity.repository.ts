/**
 * Capacity domain — wards, beds, bed allocation, service turnaround and the
 * patient-flow trace (migration 033).
 *
 * Repository classes here are thin `ResourceRepository` subclasses whose ONLY
 * job is to pin the column whitelist for one table. The whitelist is the
 * security surface: a body key that is not listed is dropped before it reaches
 * SQL, so `tenant_id`, `voided_at` and the audit columns can never be supplied
 * by a caller.
 */
import { Injectable } from "@nestjs/common";
import { ResourceRepository, ResourceSpec } from "../../common/db/resource-kit";
import { DbConnection, DB_CONNECTION } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { Inject } from "@nestjs/common";

export const WARD_SPEC: ResourceSpec = {
  table: "health.wards",
  pk: "ward_id",
  insertColumns: [
    "facility_id",
    "department_id",
    "ward_code",
    "name",
    "ward_type",
    "floor_level",
    "default_length_of_stay_days",
    "staff_ratio",
    "status",
    "metadata",
  ],
  updateColumns: [
    "facility_id",
    "department_id",
    "ward_type",
    "floor_level",
    "default_length_of_stay_days",
    "staff_ratio",
    "status",
    "metadata",
    "name",
  ],
  resourceType: "ward",
  auditPrefix: "ward",
  listOrder: "health.wards.ward_code",
};

export const BED_SPEC: ResourceSpec = {
  table: "health.beds",
  pk: "bed_id",
  insertColumns: [
    "ward_id",
    "bed_code",
    "label",
    "bed_type",
    "isolation_capable",
    "oxygen_outlet",
    "suction_available",
    "status",
    "notes",
  ],
  updateColumns: [
    "label",
    "bed_type",
    "isolation_capable",
    "oxygen_outlet",
    "suction_available",
    "status",
    "notes",
  ],
  resourceType: "bed",
  auditPrefix: "bed",
  listOrder: "health.beds.bed_code",
};

export const ALLOCATION_SPEC: ResourceSpec = {
  table: "health.bed_allocations",
  pk: "allocation_id",
  insertColumns: [
    "bed_id",
    "ward_id",
    "patient_id",
    "encounter_id",
    "reason",
    "status",
    "transfer_from_allocation_id",
    "allocated_at",
    "idempotency_key",
  ],
  updateColumns: ["encounter_id", "closed_reason", "notes"],
  resourceType: "bed_allocation",
  auditPrefix: "bed_allocation",
  listOrder: "health.bed_allocations.allocated_at DESC",
  idempotencyColumn: "idempotency_key",
  event: {
    eventType: "health.capacity.bed_allocated",
    domain: "operations",
    operation: "capacity.bed",
    subjectType: "bed_allocation",
    classification: "CONFIDENTIAL",
  },
};

export const TURNAROUND_SPEC: ResourceSpec = {
  table: "health.service_turnarounds",
  pk: "turnaround_id",
  insertColumns: [
    "resource_type",
    "resource_id",
    "kind",
    "reason",
    "target_status",
    "idempotency_key",
  ],
  updateColumns: ["reason", "target_status"],
  resourceType: "service_turnaround",
  auditPrefix: "turnaround",
  listOrder: "health.service_turnarounds.requested_at DESC",
  idempotencyColumn: "idempotency_key",
};

export const FLOW_SPEC: ResourceSpec = {
  table: "health.patient_flow_events",
  pk: "flow_event_id",
  insertColumns: [
    "patient_id",
    "encounter_id",
    "step",
    "occurred_at",
    "ward_id",
    "bed_id",
    "allocation_id",
    "reference_type",
    "reference_id",
    "note",
  ],
  updateColumns: [],
  resourceType: "patient_flow_event",
  auditPrefix: "patient_flow",
  listOrder: "health.patient_flow_events.occurred_at DESC",
  softDeletable: false,
  tracksUpdater: false,
};

@Injectable()
export class WardRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, WARD_SPEC);
  }
}

@Injectable()
export class BedRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, BED_SPEC);
  }
}

@Injectable()
export class BedAllocationRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, ALLOCATION_SPEC);
  }
}

@Injectable()
export class ServiceTurnaroundRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, TURNAROUND_SPEC);
  }
}

@Injectable()
export class PatientFlowRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, FLOW_SPEC);
  }
}
