/**
 * Continuity-of-care repositories (migration 034): care plans, plan tasks,
 * discharge summaries, follow-up schedules and the clinical-document registry.
 *
 * Each class pins one column whitelist. Anything a caller sends that is not
 * listed is dropped before it reaches SQL — which is how `tenant_id`,
 * `voided_at`, `created_by` and the audit columns stay server-owned.
 */
import { Inject, Injectable } from "@nestjs/common";
import { ResourceRepository, ResourceSpec } from "../../common/db/resource-kit";
import { DbConnection, DB_CONNECTION } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";

export const CARE_PLAN_SPEC: ResourceSpec = {
  table: "health.care_plans",
  pk: "plan_id",
  insertColumns: [
    "patient_id",
    "encounter_id",
    "title",
    "category",
    "problem_summary",
    "goal",
    "target_date",
    "review_due_at",
    "status",
    "idempotency_key",
  ],
  updateColumns: [
    "encounter_id",
    "title",
    "category",
    "problem_summary",
    "goal",
    "target_date",
    "review_due_at",
  ],
  resourceType: "care_plan",
  auditPrefix: "care_plan",
  idempotencyColumn: "idempotency_key",
  listOrder: "health.care_plans.created_at DESC",
  listWhere: "health.care_plans.status IN ('draft','active','paused')",
  event: {
    eventType: "health.continuity.care_plan_created",
    domain: "clinical",
    operation: "continuity.care_plan",
    subjectType: "care_plan",
    classification: "CONFIDENTIAL",
  },
};

export const CARE_TASK_SPEC: ResourceSpec = {
  table: "health.care_plan_tasks",
  pk: "task_id",
  insertColumns: [
    "plan_id",
    "patient_id",
    "encounter_id",
    "ward_id",
    "task_type",
    "title",
    "instruction",
    "priority",
    "recurrence",
    "interval_minutes",
    "due_at",
    "assigned_to",
    "assigned_role",
    "status",
    "idempotency_key",
  ],
  updateColumns: [
    "title",
    "instruction",
    "priority",
    "recurrence",
    "interval_minutes",
    "due_at",
    "assigned_to",
    "assigned_role",
    "ward_id",
    "outcome_note",
    "skip_reason",
  ],
  resourceType: "care_plan_task",
  auditPrefix: "care_plan_task",
  idempotencyColumn: "idempotency_key",
  listOrder: "health.care_plan_tasks.due_at ASC NULLS LAST",
  event: {
    eventType: "health.continuity.care_plan_task_updated",
    domain: "clinical",
    operation: "continuity.care_plan_task",
    subjectType: "care_plan_task",
    classification: "CONFIDENTIAL",
  },
};

export const DISCHARGE_SUMMARY_SPEC: ResourceSpec = {
  table: "health.discharge_summaries",
  pk: "summary_id",
  insertColumns: [
    "encounter_id",
    "patient_id",
    "ward_id",
    "diagnosis_summary",
    "procedures_done",
    "course_in_hospital",
    "condition_at_discharge",
    "dischargemeds_note",
    "follow_up_plan",
    "disposition",
    "admitted_at",
    "discharged_at",
    "length_of_stay_days",
    "idempotency_key",
  ],
  updateColumns: [
    "ward_id",
    "diagnosis_summary",
    "procedures_done",
    "course_in_hospital",
    "condition_at_discharge",
    "dischargemeds_note",
    "follow_up_plan",
    "disposition",
    "admitted_at",
    "discharged_at",
    "length_of_stay_days",
  ],
  resourceType: "discharge_summary",
  auditPrefix: "discharge_summary",
  idempotencyColumn: "idempotency_key",
  listOrder: "health.discharge_summaries.created_at DESC",
  event: {
    eventType: "health.continuity.discharge_summary_updated",
    domain: "clinical",
    operation: "continuity.discharge_summary",
    subjectType: "discharge_summary",
    classification: "CONFIDENTIAL",
  },
};

export const FOLLOWUP_SPEC: ResourceSpec = {
  table: "health.followups",
  pk: "followup_id",
  insertColumns: [
    "patient_id",
    "encounter_id",
    "source",
    "channel",
    "reason",
    "due_date",
    "window_days",
    "status",
    "appointment_id",
    "note",
    "idempotency_key",
  ],
  updateColumns: [
    "source",
    "channel",
    "reason",
    "due_date",
    "window_days",
    "appointment_id",
    "note",
  ],
  resourceType: "followup",
  auditPrefix: "followup",
  idempotencyColumn: "idempotency_key",
  listOrder: "health.followups.due_date ASC",
  defaultLimit: 100,
  event: {
    eventType: "health.continuity.followup_updated",
    domain: "clinical",
    operation: "continuity.followup",
    subjectType: "followup",
    classification: "INTERNAL",
  },
};

export const CLINICAL_DOCUMENT_SPEC: ResourceSpec = {
  table: "health.clinical_documents",
  pk: "document_id",
  insertColumns: [
    "patient_id",
    "encounter_id",
    "title",
    "doc_type",
    "mime_type",
    "size_bytes",
    "content_sha256",
    "storage_backend",
    "storage_ref",
    "source_system",
    "classification",
    "status",
    "available",
    "parent_document_id",
    "idempotency_key",
  ],
  updateColumns: [
    "title",
    "doc_type",
    "mime_type",
    "size_bytes",
    "content_sha256",
    "storage_backend",
    "storage_ref",
    "source_system",
    "classification",
    "available",
  ],
  resourceType: "clinical_document",
  auditPrefix: "clinical_document",
  idempotencyColumn: "idempotency_key",
  listOrder: "health.clinical_documents.created_at DESC",
  event: {
    eventType: "health.continuity.document_filed",
    domain: "clinical",
    operation: "continuity.clinical_document",
    subjectType: "clinical_document",
    classification: "RESTRICTED",
  },
};

@Injectable()
export class CarePlanRepository extends ResourceRepository {
  constructor(
    @Inject(DB_CONNECTION) db: DbConnection,
    ctx: TenantContext,
  ) {
    super(db, ctx, CARE_PLAN_SPEC);
  }
}

@Injectable()
export class CareTaskRepository extends ResourceRepository {
  constructor(
    @Inject(DB_CONNECTION) db: DbConnection,
    ctx: TenantContext,
  ) {
    super(db, ctx, CARE_TASK_SPEC);
  }
}

@Injectable()
export class DischargeSummaryRepository extends ResourceRepository {
  constructor(
    @Inject(DB_CONNECTION) db: DbConnection,
    ctx: TenantContext,
  ) {
    super(db, ctx, DISCHARGE_SUMMARY_SPEC);
  }
}

@Injectable()
export class FollowupRepository extends ResourceRepository {
  constructor(
    @Inject(DB_CONNECTION) db: DbConnection,
    ctx: TenantContext,
  ) {
    super(db, ctx, FOLLOWUP_SPEC);
  }
}

@Injectable()
export class ClinicalDocumentRepository extends ResourceRepository {
  constructor(
    @Inject(DB_CONNECTION) db: DbConnection,
    ctx: TenantContext,
  ) {
    super(db, ctx, CLINICAL_DOCUMENT_SPEC);
  }
}
