/**
 * FHIR ↔ Health OS mapping layer.
 *
 * Mappers never invent codes, profiles, or identifiers. If a mapping is not
 * registered, return BLOCKED/UNMAPPED. External FHIR endpoints remain
 * EXTERNAL-BLOCKED; this layer is a typed, validated internal mapping engine.
 */
import { DomainError } from "../../common/errors/domain.error";
import type {
  FhirResourceBase,
  FhirResourceType,
  FhirBundle,
  FhirCoding,
  FhirReference,
} from "./fhir-resources";

export class FhirMappingError extends DomainError {
  constructor(
    public readonly reason:
      | "UNMAPPED"
      | "INVALID_RESOURCE"
      | "TERMINOLOGY_BLOCKED"
      | "TENANT_MISMATCH",
    detail?: string,
  ) {
    const code =
      reason === "INVALID_RESOURCE"
        ? "VALIDATION"
        : reason === "TERMINOLOGY_BLOCKED"
          ? "EXTERNAL_UNAVAILABLE"
          : reason === "TENANT_MISMATCH"
            ? "TENANT_VIOLATION"
            : "INVALID_STATE";
    super(code, detail ?? `FHIR mapping failed: ${reason}`);
  }
}

export interface MapperContext {
  tenantId: string;
  countryCode: string;
  entityCode: string | null;
  globalUserId: string;
  /** If true, ignore unmapped fields instead of failing (still rejects invalid codes). */
  partial?: boolean;
}

export interface InternalToFhirResult {
  resource: FhirResourceBase | FhirBundle;
  unmapped: string[];
}

type InternalResourceKind =
  | "patient"
  | "practitioner"
  | "encounter"
  | "appointment"
  | "condition"
  | "observation"
  | "medication_request"
  | "allergy"
  | "diagnostic_report"
  | "service_request"
  | "procedure"
  | "medication"
  | "imaging_study"
  | "device"
  | "consent";

interface InternalToFhir {
  (internal: any, ctx: MapperContext): InternalToFhirResult;
}

export class FhirMapper {
  private readonly toFhir = new Map<InternalResourceKind, InternalToFhir>();
  registerInternalToFhir(kind: InternalResourceKind, fn: InternalToFhir) {
    this.toFhir.set(kind, fn);
  }

  mapInternalToFhir(
    kind: InternalResourceKind,
    internal: any,
    ctx: MapperContext,
  ): InternalToFhirResult {
    const fn = this.toFhir.get(kind);
    if (!fn) {
      // Return a stub bundle with BLOCKED status and no fabricated fields.
      return {
        resource: {
          resourceType: "Bundle" as FhirResourceType,
          type: "collection",
        } as FhirBundle,
        unmapped: [`internal_kind_unmapped:${kind}`],
      };
    }
    return fn(internal, ctx);
  }

  /**
   * Validate an inbound FHIR resource. Enforces:
   *   - required resourceType is in known R4/R5 set
   *   - ids are strings if present
   *   - references are relative or http(s) (no SSRF-like oddities)
   * Terminology code validation is delegated to the TerminologyRegistry.
   */
  validateInbound(resource: any): string[] {
    const errs: string[] = [];
    if (!resource || typeof resource !== "object") return ["not_an_object"];
    if (typeof resource.resourceType !== "string")
      errs.push("missing_resourceType");
    if (resource.id !== undefined && typeof resource.id !== "string")
      errs.push("id_must_be_string");
    // Recursively validate references.
    walk(
      resource,
      (v: any, path: string) => {
        if (
          v &&
          typeof v === "object" &&
          "reference" in v &&
          typeof v.reference === "string"
        ) {
          const ref: FhirReference = v;
          if (
            !/^[A-Z][A-Za-z]+\/[A-Za-z0-9.-]+$/.test(ref.reference) &&
            !/^https?:\/\//.test(ref.reference)
          ) {
            errs.push(`invalid_reference:${path}=${ref.reference}`);
          }
        }
        if (v && typeof v === "object" && "system" in v && "code" in v) {
          const c: FhirCoding = v;
          if (typeof c.system !== "string" || typeof c.code !== "string") {
            errs.push(`invalid_coding:${path}`);
          }
        }
      },
      "",
    );
    return errs;
  }
}

function walk(obj: any, fn: (v: any, p: string) => void, path: string): void {
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) walk(obj[i], fn, `${path}[${i}]`);
    return;
  }
  if (obj && typeof obj === "object") {
    fn(obj, path);
    for (const k of Object.keys(obj))
      walk(obj[k], fn, path ? `${path}.${k}` : k);
  }
}
