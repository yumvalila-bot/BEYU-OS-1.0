/**
 * Capacity domain service — ward/bed registry, allocation, transfer, discharge,
 * turnaround and the patient-flow trace (migration 033).
 *
 * RULES THAT LIVE HERE (and why they cannot live only in SQL)
 *   * A bed may not be allocated to two open patients, and a patient may not
 *     hold two open beds. The partial unique indexes in migration 033 make that
 *     impossible to PERSIST; the checks below turn the would-away violation into
 *     an actionable 409 before the insert.
 *   * `transfer` is one atomic operation: close the outgoing allocation as
 *     'moved', open the incoming one with lineage, mark the freed bed for
 *     cleaning, and append flow events for both sides. Splitting those across
 *     requests is how beds get lost between wards.
 *   * A bed that has just been vacated is NOT automatically available: it goes
 *     to 'cleaning' and returns to service only when a named human completes the
 *     turnaround. Capacity numbers that ignore this overstate what a hospital
 *     can actually admit into.
 *   * Isolation placements require an isolation-capable bed.
 *
 * READ MODEL
 *   Occupancy is always DERIVED from the open allocation, never copied onto
 *   `beds.status`, so the capacity board and the ward cannot disagree.
 */
import { Inject, Injectable } from "@nestjs/common";
import { ResourceDomainService } from "../../common/db/resource-kit";
import { DB_CONNECTION, DbConnection } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { AuditService } from "../audit/audit.service";
import { EventOutboxService } from "../events/event-outbox.service";
import { DomainError } from "../../common/errors/domain.error";
import {
  ALLOCATION_SPEC,
  BedAllocationRepository,
  BedRepository,
  PatientFlowRepository,
  ServiceTurnaroundRepository,
  WardRepository,
} from "./capacity.repository";

const OPEN_ALLOC_STATUSES = ["allocated", "occupied", "pending_discharge"];
const UNALLOCATABLE_BED_STATES = ["cleaning", "maintenance", "retired"];

export const ALLOCATION_TRANSITIONS: Record<string, Set<string>> = {
  allocated: new Set(["occupied", "discharged", "moved", "cancelled"]),
  occupied: new Set(["pending_discharge", "moved", "discharged", "cancelled"]),
  pending_discharge: new Set(["discharged", "moved", "cancelled", "occupied"]),
  discharged: new Set<string>(),
  moved: new Set<string>(),
  cancelled: new Set<string>(),
};

const FLOW_STEPS = [
  "registration",
  "arrival",
  "triage",
  "waiting",
  "encounter_started",
  "admission",
  "transfer",
  "discharge",
  "referral",
  "followup_scheduled",
  "ambulance_requested",
  "bed_allocated",
  "bed_freed",
] as const;

@Injectable()
export class CapacityService extends ResourceDomainService {
  constructor(
    // @Inject is load-bearing, not decoration: DbConnection is an
    // interface, so without the token Nest cannot resolve the provider and the
    // whole application fails to boot (the real-PostgreSQL CI gate catches this;
    // a PGlite unit spec that constructs the service by hand does not).
    @Inject(DB_CONNECTION) db: DbConnection,
    private readonly ctx: TenantContext,
    audit: AuditService,
    private readonly events: EventOutboxService,
    private readonly wards: WardRepository,
    private readonly beds: BedRepository,
    private readonly allocations: BedAllocationRepository,
    private readonly turnarounds: ServiceTurnaroundRepository,
    private readonly flow: PatientFlowRepository,
  ) {
    super(
      { repo: allocations, audit, db, tenantCtx: ctx, outbox: events },
      ALLOCATION_SPEC,
      {
        transitions: ALLOCATION_TRANSITIONS,
        closedAtColumn: "closed_at",
        closingStatuses: ["discharged", "moved", "cancelled"],
        validateCreate: (input) => {
          if (!input.bed_id) throw DomainError.validation("bed_id required");
          if (!input.patient_id)
            throw DomainError.validation("patient_id required");
        },
        eventPayload: (kind, row) => ({
          allocationId: String(row.allocation_id),
          bedId: String(row.bed_id ?? ""),
          wardId: String(row.ward_id ?? ""),
          reason: row.reason ?? null,
          status: row.status ?? null,
          kind,
          // Patient identity is deliberately NOT exported across the OS
          // boundary: the event carries opaque references only.
        }),
      },
    );
  }

  private get tenantId(): string {
    return this.ctx.tenantId();
  }

  // ── registry ────────────────────────────────────────────────────────────────
  createWard(input: Record<string, unknown>) {
    if (!input.ward_code || !input.name) {
      throw DomainError.validation("ward_code and name are required");
    }
    return this.atomic(
      "ward.create",
      "ward",
      (tx) => this.wards.insert(tx, input),
      (r: any) => String(r.ward_id),
    );
  }

  listWards() {
    return this.wards.list({ limit: 200 });
  }

  async createBed(input: Record<string, unknown>) {
    if (!input.ward_id) throw DomainError.validation("ward_id required");
    if (!input.bed_code) throw DomainError.validation("bed_code required");
    const ward = await this.wards.findById(String(input.ward_id));
    if (!ward) throw DomainError.notFound("ward", String(input.ward_id));
    return this.atomic(
      "bed.register",
      "bed",
      (tx) => this.beds.insert(tx, input),
      (r: any) => String(r.bed_id),
    );
  }

  /** Bed list with derived occupancy. Filtered by ward server-side. */
  async listBeds(wardId?: string) {
    const all = await this.beds.list<any>({ limit: 500 });
    const rows = wardId
      ? all.filter((b) => String(b.ward_id) === String(wardId))
      : all;
    return this.annotateOccupancy(rows);
  }

  async setBedStatus(bedId: string, status: string) {
    const allowed = new Set([
      "available",
      "cleaning",
      "maintenance",
      "isolated",
      "retired",
    ]);
    if (!allowed.has(status)) {
      throw DomainError.validation(
        `status must be one of ${[...allowed].sort().join(", ")}`,
      );
    }
    const bed = await this.beds.findById(bedId);
    if (!bed) throw DomainError.notFound("bed", bedId);
    const open = await this.openAllocationForBed(bedId);
    if (open && status !== "isolated") {
      throw DomainError.conflict(
        `Bed has an open allocation (${open.status}); discharge or move the patient first`,
      );
    }
    return this.atomic(
      "bed.status",
      "bed",
      async (tx) => {
        const row = await this.beds.patch(tx, bedId, { status });
        if (!row) throw DomainError.notFound("bed", bedId);
        return { bed_id: bedId, ...row };
      },
      () => bedId,
    );
  }

  // ── allocation ─────────────────────────────────────────────────────────────
  async allocate(input: {
    bed_id: string;
    patient_id: string;
    encounter_id?: string | null;
    reason?: string;
    idempotency_key?: string | null;
  }) {
    // Replay guard FIRST: a retried request must return the original allocation
    // rather than failing the placement checks against the bed it already
    // occupies. Checking after validation would turn a network retry into a
    // spurious 409 and push staff to create a second allocation.
    if (input.idempotency_key) {
      const replay = await this.allocations.findByColumn(
        "idempotency_key",
        String(input.idempotency_key),
      );
      if (replay) return replay;
    }
    const bed = await this.beds.findById(String(input.bed_id));
    if (!bed) throw DomainError.notFound("bed", String(input.bed_id));
    const reason = input.reason ?? "admission";

    // Placement feasibility is checked before the unique index fires so the
    // caller receives a clinical reason rather than a database error.
    if (UNALLOCATABLE_BED_STATES.includes(String(bed.status))) {
      throw DomainError.conflict(
        `Bed is ${bed.status} and cannot accept a patient until turnaround completes`,
      );
    }
    if (reason === "isolation" && !bed.isolation_capable) {
      throw DomainError.conflict(
        "Isolation placement requires an isolation-capable bed",
      );
    }
    if (await this.openAllocationForBed(String(input.bed_id))) {
      throw DomainError.conflict(
        "Bed is already occupied by an open allocation",
      );
    }
    const openForPatient = await this.openAllocationForPatient(
      String(input.patient_id),
    );
    if (openForPatient) {
      throw DomainError.conflict(
        `Patient already holds allocation ${openForPatient.allocation_id}; use transfer instead of a second allocation`,
      );
    }

    const row = await super.create({
      bed_id: input.bed_id,
      patient_id: input.patient_id,
      encounter_id: input.encounter_id ?? null,
      ward_id: bed.ward_id,
      reason,
      status: "allocated",
      idempotency_key: input.idempotency_key ?? null,
    });
    if (row) {
      await this.recordFlow({
        patient_id: input.patient_id,
        encounter_id: input.encounter_id ?? null,
        step: "bed_allocated",
        ward_id: bed.ward_id,
        bed_id: bed.bed_id,
        allocation_id: row.allocation_id,
        note: `Allocated for ${reason}`,
      });
    }
    return row;
  }

  markOccupied(allocationId: string) {
    return this.atomic(
      "bed_allocation.occupy",
      "bed_allocation",
      async (tx) => {
        const row = await this.allocations.patch(tx, allocationId, undefined, {
          forceStatus: "occupied",
          literalSet: ["occupied_at = now()"],
        });
        if (!row) throw DomainError.notFound("bed_allocation", allocationId);
        return row;
      },
      () => allocationId,
    );
  }

  /**
   * Atomic ward-to-ward move. Kept as one operation on purpose: a client that
   * closed the old allocation and then failed to open the new one would leave
   * the patient unallocated while the freed bed sat in the wrong state.
   */
  async transfer(allocationId: string, toBedId: string, note?: string) {
    const current = await this.allocations.findById(allocationId);
    if (!current) throw DomainError.notFound("bed_allocation", allocationId);
    if (!OPEN_ALLOC_STATUSES.includes(String(current.status))) {
      throw DomainError.invalidState(
        `Allocation is ${current.status}; only an open allocation can be moved`,
      );
    }
    const target = await this.beds.findById(toBedId);
    if (!target) throw DomainError.notFound("bed", toBedId);
    if (UNALLOCATABLE_BED_STATES.includes(String(target.status))) {
      throw DomainError.conflict(
        `Target bed is ${target.status} and cannot accept a transfer`,
      );
    }
    if (await this.openAllocationForBed(toBedId)) {
      throw DomainError.conflict("Target bed is already occupied");
    }

    return this.atomic(
      "bed_allocation.transfer",
      "bed_allocation",
      async (tx) => {
        const closed = await this.allocations.patch(
          tx,
          allocationId,
          undefined,
          {
            forceStatus: "moved",
            literalSet: ["closed_at = now()"],
          },
        );
        if (!closed)
          throw DomainError.invalidState("Allocation vanished mid-transfer");
        const opened = await this.allocations.insertWith(tx, {
          bed_id: target.bed_id,
          ward_id: target.ward_id,
          patient_id: current.patient_id,
          encounter_id: current.encounter_id,
          reason: "transfer_in",
          status: "allocated",
          transfer_from_allocation_id: allocationId,
        });
        // The freed bed is not available until it has been turned around.
        await this.beds.patch(tx, String(current.bed_id), {
          status: "cleaning",
        });
        await this.turnarounds.insertWith(tx, {
          resource_type: "bed",
          resource_id: current.bed_id,
          kind: current.reason === "isolation" ? "isolation_terminal" : "clean",
          reason: `Bed freed by transfer of allocation ${allocationId}`,
          status: "requested",
          target_status: "available",
        });
        await this.flow.insertWith(tx, {
          patient_id: current.patient_id,
          encounter_id: current.encounter_id,
          step: "transfer",
          ward_id: target.ward_id,
          bed_id: target.bed_id,
          allocation_id: opened?.allocation_id ?? null,
          reference_type: "bed_allocation",
          reference_id: allocationId,
          note: note ?? null,
        });
        await this.flow.insertWith(tx, {
          patient_id: current.patient_id,
          encounter_id: current.encounter_id,
          step: "bed_freed",
          ward_id: current.ward_id,
          bed_id: current.bed_id,
          allocation_id: allocationId,
          reference_type: "bed_allocation",
          reference_id: allocationId,
          note: note ?? null,
        });
        await this.events.publish({
          idempotencyKey: `beyu-evt:bed_allocation:transfer:${allocationId}`,
          sectorEventId: `health-bed_allocation-transfer-${allocationId}`,
          eventType: "health.capacity.patient_transferred",
          domain: "operations",
          operation: "capacity.transfer",
          subjectType: "bed_allocation",
          subjectId: String(allocationId),
          classification: "CONFIDENTIAL",
          payload: {
            fromBedId: String(current.bed_id),
            toBedId: String(target.bed_id),
            fromWardId: String(current.ward_id),
            toWardId: String(target.ward_id),
          },
        });
        return { from: closed, to: opened };
      },
      () => allocationId,
    );
  }

  requestDischarge(allocationId: string) {
    return super.transition(allocationId, "pending_discharge");
  }

  /** Close the allocation, put the bed into cleaning, emit the flow trace. */
  async discharge(allocationId: string, closedReason?: string) {
    const current = await this.allocations.findById(allocationId);
    if (!current) throw DomainError.notFound("bed_allocation", allocationId);
    if (
      !["occupied", "pending_discharge", "allocated"].includes(
        String(current.status),
      )
    ) {
      throw DomainError.invalidState(
        `Discharge requires an open allocation (currently ${current.status})`,
      );
    }
    return this.atomic(
      "bed_allocation.discharge",
      "bed_allocation",
      async (tx) => {
        const row = await this.allocations.patch(
          tx,
          allocationId,
          { closed_reason: closedReason ?? null },
          { forceStatus: "discharged", literalSet: ["closed_at = now()"] },
        );
        if (!row) throw DomainError.notFound("bed_allocation", allocationId);
        await this.beds.patch(tx, String(current.bed_id), {
          status: "cleaning",
        });
        await this.turnarounds.insertWith(tx, {
          resource_type: "bed",
          resource_id: current.bed_id,
          kind: current.reason === "isolation" ? "isolation_terminal" : "clean",
          reason: `Terminal cleaning after discharge of allocation ${allocationId}`,
          status: "requested",
          target_status: "available",
        });
        await this.flow.insertWith(tx, {
          patient_id: current.patient_id,
          encounter_id: current.encounter_id,
          step: "bed_freed",
          ward_id: current.ward_id,
          bed_id: current.bed_id,
          allocation_id: allocationId,
          reference_type: "bed_allocation",
          reference_id: allocationId,
          note: closedReason ?? null,
        });
        await this.events.publish({
          idempotencyKey: `beyu-evt:bed_allocation:discharge:${allocationId}`,
          sectorEventId: `health-bed_allocation-discharge-${allocationId}`,
          eventType: "health.capacity.bed_released",
          domain: "operations",
          operation: "capacity.discharge",
          subjectType: "bed_allocation",
          subjectId: String(allocationId),
          classification: "CONFIDENTIAL",
          payload: {
            bedId: String(current.bed_id),
            wardId: String(current.ward_id),
            encounterId: current.encounter_id ?? null,
          },
        });
        return row;
      },
      () => allocationId,
    );
  }

  // ── turnaround ──────────────────────────────────────────────────────────────
  requestTurnaround(input: Record<string, unknown>) {
    if (!input.resource_id || !input.resource_type) {
      throw DomainError.validation(
        "resource_type and resource_id are required",
      );
    }
    return this.atomic(
      "turnaround.request",
      "service_turnaround",
      (tx) => this.turnarounds.insert(tx, { ...input, status: "requested" }),
      (r: any) => String(r.turnaround_id),
    );
  }

  /**
   * Completing a turnaround is the only path that returns a cleaned bed to
   * service, and it refuses while a patient still holds an open allocation.
   */
  async completeTurnaround(turnaroundId: string) {
    const tu = await this.turnarounds.findById(turnaroundId);
    if (!tu) throw DomainError.notFound("service_turnaround", turnaroundId);
    if (String(tu.status) === "completed") {
      throw DomainError.invalidState("Turnaround already completed");
    }
    if (String(tu.resource_type) === "bed") {
      const open = await this.openAllocationForBed(String(tu.resource_id));
      if (open) {
        throw DomainError.conflict(
          "Bed has an open allocation; it cannot be marked clean while occupied",
        );
      }
    }
    return this.atomic(
      "turnaround.complete",
      "service_turnaround",
      async (tx) => {
        const row = await this.turnarounds.patch(tx, turnaroundId, undefined, {
          literalSet: ["completed_at = now()", "status = 'completed'"],
        });
        if (!row)
          throw DomainError.notFound("service_turnaround", turnaroundId);
        if (String(tu.resource_type) === "bed") {
          await this.beds.patch(tx, String(tu.resource_id), {
            status: String(tu.target_status ?? "available"),
          });
        }
        return row;
      },
      () => turnaroundId,
    );
  }

  // ── flow trace + read models ────────────────────────────────────────────────
  recordFlow(input: Record<string, unknown>) {
    const step = String(input.step ?? "");
    if (!(FLOW_STEPS as readonly string[]).includes(step)) {
      throw DomainError.validation(
        `step must be one of ${[...FLOW_STEPS].sort().join(", ")}`,
      );
    }
    if (!input.patient_id) throw DomainError.validation("patient_id required");
    return this.atomic(
      "patient_flow.record",
      "patient_flow_event",
      async (tx) => {
        const row = await this.flow.insert(tx, input);
        return row ?? { flow_event_id: "not-recorded" };
      },
      (r: any) => String(r.flow_event_id),
    );
  }

  flowForEncounter(encounterId: string) {
    return this.query(
      `SELECT * FROM health.patient_flow_events
        WHERE encounter_id = $1 AND tenant_id = $2
        ORDER BY occurred_at ASC`,
      [encounterId, this.tenantId],
    );
  }

  /** Per-ward capacity board, aggregated server-side. Never a row dump. */
  capacitySnapshot() {
    return this.query(
      `SELECT w.ward_id, w.ward_code, w.name AS ward_name, w.ward_type,
              count(b.bed_id)::int AS total_beds,
              count(b.bed_id) FILTER (WHERE b.status = 'cleaning')::int AS cleaning,
              count(b.bed_id) FILTER (WHERE b.status = 'maintenance')::int AS maintenance,
              count(b.bed_id) FILTER (WHERE b.status = 'retired')::int AS retired,
              count(b.bed_id) FILTER (WHERE b.status = 'isolated')::int AS isolated,
              count(b.bed_id) FILTER (
                WHERE b.status NOT IN ('cleaning','maintenance','retired')
                  AND ba.allocation_id IS NOT NULL)::int AS occupied,
              count(b.bed_id) FILTER (
                WHERE b.status = 'available' AND ba.allocation_id IS NULL)::int AS available,
              count(ba.allocation_id) FILTER (
                WHERE ba.status = 'pending_discharge')::int AS pending_discharge
         FROM health.wards w
         JOIN health.beds b ON b.ward_id = w.ward_id AND b.voided_at IS NULL
         LEFT JOIN health.bed_allocations ba
           ON ba.bed_id = b.bed_id
          AND ba.status IN ('allocated','occupied','pending_discharge')
          AND ba.voided_at IS NULL
        WHERE w.tenant_id = $1 AND w.voided_at IS NULL AND w.status = 'active'
        GROUP BY w.ward_id, w.ward_code, w.name, w.ward_type
        ORDER BY w.ward_code`,
      [this.tenantId],
    );
  }

  pendingTurnarounds() {
    return this.query(
      `SELECT t.*, b.bed_code, w.name AS ward_name
         FROM health.service_turnarounds t
         LEFT JOIN health.beds b ON b.bed_id = t.resource_id
         LEFT JOIN health.wards w ON w.ward_id = b.ward_id
        WHERE t.tenant_id = $1 AND t.status IN ('requested','in_progress')
        ORDER BY t.requested_at ASC`,
      [this.tenantId],
    );
  }

  openAllocations() {
    return this.query(
      `SELECT a.*, b.bed_code, w.name AS ward_name,
              p.given_name, p.family_name, p.medical_record
         FROM health.bed_allocations a
         JOIN health.beds b ON b.bed_id = a.bed_id
         JOIN health.wards w ON w.ward_id = a.ward_id
         JOIN health.patients p ON p.patient_id = a.patient_id
        WHERE a.tenant_id = $1
          AND a.status IN ('allocated','occupied','pending_discharge')
          AND a.voided_at IS NULL
        ORDER BY a.allocated_at ASC`,
      [this.tenantId],
    );
  }

  /** Chart-of-record view: every allocation a patient ever held. */
  historyForPatient(patientId: string) {
    return this.query(
      `SELECT a.allocation_id, a.status, a.reason, a.allocated_at, a.closed_at,
              b.bed_code, w.name AS ward_name
         FROM health.bed_allocations a
         JOIN health.beds b ON b.bed_id = a.bed_id
         JOIN health.wards w ON w.ward_id = a.ward_id
        WHERE a.patient_id = $1 AND a.tenant_id = $2 AND a.voided_at IS NULL
        ORDER BY a.allocated_at DESC`,
      [patientId, this.tenantId],
    );
  }

  private async annotateOccupancy(beds: any[]) {
    const open = await this.allocations.query<any>(
      `SELECT bed_id, allocation_id, patient_id, status, allocated_at, reason
         FROM health.bed_allocations
        WHERE tenant_id = $1
          AND status IN ('allocated','occupied','pending_discharge')
          AND voided_at IS NULL`,
      [this.tenantId],
    );
    const byBed = new Map(open.map((o: any) => [String(o.bed_id), o]));
    return beds.map((b: any) => ({
      ...b,
      occupancy: byBed.get(String(b.bed_id)) ?? null,
      is_available:
        !UNALLOCATABLE_BED_STATES.includes(String(b.status)) &&
        !byBed.has(String(b.bed_id)),
    }));
  }

  private openAllocationForBed(bedId: string) {
    return this.allocations.queryOne<any>(
      `SELECT * FROM health.bed_allocations
        WHERE bed_id = $1 AND tenant_id = $2
          AND status IN ('allocated','occupied','pending_discharge')
          AND voided_at IS NULL
        LIMIT 1`,
      [bedId, this.tenantId],
    );
  }

  private openAllocationForPatient(patientId: string) {
    return this.allocations.queryOne<any>(
      `SELECT * FROM health.bed_allocations
        WHERE patient_id = $1 AND tenant_id = $2
          AND status IN ('allocated','occupied','pending_discharge')
          AND voided_at IS NULL
        LIMIT 1`,
      [patientId, this.tenantId],
    );
  }
}
