/**
 * FHIR R4/R5 resource model primitives for internal Health OS mapping.
 *
 * Only internal-safe primitives are defined. Terminology codes are validated
 * against the TerminologyRegistry; unknown/invalid codes fail closed.
 */

export type FhirResourceType =
  | "Patient"
  | "Practitioner"
  | "Organization"
  | "Location"
  | "Encounter"
  | "Appointment"
  | "Condition"
  | "Observation"
  | "MedicationRequest"
  | "AllergyIntolerance"
  | "DiagnosticReport"
  | "ServiceRequest"
  | "Procedure"
  | "Medication"
  | "ImagingStudy"
  | "Device"
  | "Provenance"
  | "AuditEvent"
  | "Consent"
  | "Bundle";

export interface FhirCoding {
  system: string;
  code: string;
  display?: string;
  version?: string;
}

export interface FhirIdentifier {
  system?: string;
  value: string;
  type?: { coding: FhirCoding[] };
}

export interface FhirReference {
  reference: string;
  type?: FhirResourceType;
  display?: string;
  identifier?: FhirIdentifier;
}

export interface FhirMeta {
  versionId?: string;
  lastUpdated?: string;
  source?: string;
  profile?: string[];
  tag?: FhirCoding[];
  security?: FhirCoding[];
}

export interface FhirResourceBase {
  resourceType: FhirResourceType;
  id?: string;
  meta?: FhirMeta;
  implicitRules?: string;
  language?: string;
  extension?: unknown[];
  modifierExtension?: unknown[];
}

export interface FhirCodeableConcept {
  coding?: FhirCoding[];
  text?: string;
}

export interface FhirBundle<
  T extends FhirResourceBase = FhirResourceBase,
> extends FhirResourceBase {
  resourceType: "Bundle";
  type:
    | "searchset"
    | "transaction"
    | "batch"
    | "collection"
    | "document"
    | "message"
    | "history";
  total?: number;
  entry?: Array<{ resource: T; fullUrl?: string }>;
}
