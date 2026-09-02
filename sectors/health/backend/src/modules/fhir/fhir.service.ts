import { Injectable } from "@nestjs/common";
import { FhirRepository } from "./fhir.repository";
import { DomainError } from "../../common/errors/domain.error";

/**
 * FHIR R4 resource mappers.
 *
 * These are deterministic maps from the native Health OS data model to FHIR R4.
 * They NEVER bypass authorization — the controller is protected by @RequirePermission
 * and RLS filters rows by tenant before mapping occurs. Canonical identifiers
 * use the Health OS UUIDs as resource.id, with a tenant-scoped identifier
 * (system = "https://beyu.health/fhir/Id/{tenant}") to preserve global
 * uniqueness. External FHIR exchange endpoints must be explicitly configured
 * per integration (no fabricated endpoints).
 */
@Injectable()
export class FhirService {
  constructor(private readonly repo: FhirRepository) {}

  private urn(patient: any) {
    return `https://beyu.health/fhir/Id/${patient.tenant_id}`;
  }

  async patient(id: string) {
    const p = await this.repo.getPatient(id);
    if (!p) throw DomainError.notFound("Patient", id);
    return {
      resourceType: "Patient",
      id: p.patient_id,
      identifier: [{ system: this.urn(p), value: p.medical_record }],
      name: [
        {
          use: "official",
          family: p.family_name,
          given: [p.given_name, p.middle_name].filter(Boolean),
        },
      ],
      gender:
        p.sex === "male" ? "male" : p.sex === "female" ? "female" : "unknown",
      birthDate: p.dob ?? undefined,
      telecom: p.phone ? [{ system: "phone", value: p.phone }] : undefined,
      active: p.status === "active",
      meta: {
        lastUpdated: p.updated_at,
        versionId: p.updated_at ? String(p.updated_at) : undefined,
      },
    };
  }

  async encounter(id: string) {
    const e = await this.repo.getEncounter(id);
    if (!e) throw DomainError.notFound("Encounter", id);
    return {
      resourceType: "Encounter",
      id: e.encounter_id,
      status: e.status === "in_progress" ? "in-progress" : e.status,
      class: {
        system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
        code:
          e.kind === "emergency"
            ? "EMER"
            : e.kind === "inpatient"
              ? "IMP"
              : "AMB",
      },
      subject: { reference: `Patient/${e.patient_id}` },
      appointment: e.appointment_id
        ? [{ reference: `Appointment/${e.appointment_id}` }]
        : undefined,
      period: { start: e.started_at, end: e.ended_at ?? undefined },
      meta: { lastUpdated: e.updated_at },
    };
  }

  async conditions(pid: string) {
    const rows = await this.repo.listPatientConditions(pid);
    return rows.map((r: any) => ({
      resourceType: "Condition",
      id: r.problem_id,
      clinicalStatus: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
            code: r.status === "resolved" ? "resolved" : "active",
          },
        ],
      },
      code: {
        coding: r.code
          ? [
              {
                system: `http://${r.code_system}.org`,
                code: r.code,
                display: r.description,
              },
            ]
          : undefined,
        text: r.description,
      },
      subject: { reference: `Patient/${r.patient_id}` },
      onsetDateTime: r.onset_date ?? undefined,
      recordedDate: r.created_at,
    }));
  }

  async observations(pid: string) {
    const rows = await this.repo.listPatientObservations(pid);
    return rows.map((r: any) => ({
      resourceType: "Observation",
      id: r.observation_id,
      status: r.signed_at ? "final" : "preliminary",
      category: [
        {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/observation-category",
              code: r.category,
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system:
              r.code_system === "LOINC"
                ? "http://loinc.org"
                : "http://beyu.health/fhir/CodeSystem/local",
            code: r.code,
            display: r.display,
          },
        ],
      },
      subject: { reference: `Patient/${r.patient_id}` },
      effectiveDateTime: r.observed_at,
      valueQuantity:
        r.value_numeric != null
          ? { value: Number(r.value_numeric), unit: r.value_units ?? undefined }
          : undefined,
      valueString: r.value_text ?? undefined,
      interpretation: r.abnormal_flag
        ? [
            {
              coding: [
                {
                  system:
                    "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
                  code:
                    r.abnormal_flag === "high" ||
                    r.abnormal_flag === "critical_high"
                      ? "H"
                      : r.abnormal_flag === "low" ||
                          r.abnormal_flag === "critical_low"
                        ? "L"
                        : "N",
                },
              ],
            },
          ]
        : undefined,
    }));
  }

  async medicationRequests(pid: string) {
    const rows = await this.repo.listPatientMedicationRequests(pid);
    return rows.map((r: any) => ({
      resourceType: "MedicationRequest",
      id: r.medication_id,
      status: r.status === "active" ? "active" : r.status,
      intent: "order",
      medicationCodeableConcept: { text: r.name },
      subject: { reference: `Patient/${r.patient_id}` },
      dosageInstruction: [
        {
          text: `${r.dose} ${r.route ?? ""} ${r.frequency ?? ""}`.trim(),
          timing: r.frequency ? { code: { text: r.frequency } } : undefined,
        },
      ],
      authoredOn: r.prescribed_at,
    }));
  }

  async allergyIntolerances(pid: string) {
    const rows = await this.repo.listPatientAllergies(pid);
    return rows.map((r: any) => ({
      resourceType: "AllergyIntolerance",
      id: r.allergy_id,
      clinicalStatus: {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
            code: r.status === "active" ? "active" : "resolved",
          },
        ],
      },
      category: [r.category],
      criticality:
        r.severity === "life_threatening"
          ? "high"
          : r.severity === "severe"
            ? "high"
            : r.severity === "moderate"
              ? "low"
              : "low",
      code: { text: r.substance_name },
      patient: { reference: `Patient/${r.patient_id}` },
      reaction: r.reaction
        ? [
            {
              description: r.reaction,
              severity:
                r.severity === "life_threatening" ? "severe" : r.severity,
            },
          ]
        : undefined,
    }));
  }

  async bundle(patientId: string) {
    const entries: any[] = [];
    const p = await this.patient(patientId);
    entries.push({ resource: p });
    for (const c of await this.conditions(patientId))
      entries.push({ resource: c });
    for (const o of await this.observations(patientId))
      entries.push({ resource: o });
    for (const m of await this.medicationRequests(patientId))
      entries.push({ resource: m });
    for (const a of await this.allergyIntolerances(patientId))
      entries.push({ resource: a });
    return {
      resourceType: "Bundle",
      type: "searchset",
      total: entries.length,
      entry: entries,
    };
  }
}
