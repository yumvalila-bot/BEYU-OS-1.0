/**
 * BEYU Federation & Trust — TANZANIA profile data + deterministic seed mappers.
 *
 * This module is DATA and PURE MAPPING. It holds no secrets, no connectors,
 * and makes no connectivity/compliance claims. Seeding (src/db/seed.ts) maps
 * these rows into the 0071 federation tables; every record lands in
 * fail-closed states (REGISTERED/CLASSIFIED, UNVERIFIED, UNKNOWN_COST,
 * GOVESB_UNKNOWN, PENDING_RECONCILIATION) unless a field is explicitly
 * evidence-backed in the seed data itself.
 */
import { fixedId, ID_PREFIX } from "../../lib/ids";

export * from "./tz-jurisdiction";
export * from "./tz-domains";
export * from "./tz-authorities";
export * from "./tz-regions";
export * from "./tz-lgas";
export * from "./tz-services";
export * from "./tz-legal-bases";

import { TZ_CAPABILITIES } from "./tz-jurisdiction";
import type { TzAuthoritySeed } from "./tz-authorities";
import type { TzRegionSeed } from "./tz-regions";
import type { TzLgaSeed } from "./tz-lgas";
import type { TzServiceSeed } from "./tz-services";
import type { TzLegalBaseSeed } from "./tz-legal-bases";

/* ------------------------------------------------------------------ */
/* Directory baseline (program §15): documented, NOT live-fetched      */
/* ------------------------------------------------------------------ */

export const TZ_DIRECTORY_BASELINE = {
  mdas: 325,
  regions: 26,
  lgas: 126,
  note: "Official go.tz directory snapshot counts (2026-09-28 program baseline). Live fetch was not possible in the build environment; reconciliation against the current official extract is PENDING.",
} as const;

export const TZ_DIRECTORY_SOURCE = `Tanzania Government Directory (go.tz) — ${TZ_DIRECTORY_BASELINE.mdas} MDA / ${TZ_DIRECTORY_BASELINE.regions} regions / ${TZ_DIRECTORY_BASELINE.lgas} LGA baseline (documented 2026-09-28, not live-fetched)`;

/* ------------------------------------------------------------------ */
/* Row types (insert shapes for the 0071 federation tables)            */
/* ------------------------------------------------------------------ */

export interface AuthorityInsert {
  id: string;
  jurisdictionCode: string;
  code: string;
  domainCode: string;
  officialName: string;
  shortName: string | null;
  authorityType: string;
  parentAuthorityCode: string | null;
  legalMandate: string | null;
  officialWebsite: string | null;
  directorySource: string | null;
  jurisdictionScope: string;
  sectorDomains: string[];
  dataCategories: string[];
  consentRequired: "TRUE" | "FALSE" | "UNKNOWN";
  agreementRequired: "TRUE" | "FALSE" | "UNKNOWN";
  apiStatus: string;
  govesbStatus: string;
  verificationStatus: string;
  accessCostStatus: string;
  recordStatus: string;
  lifecycleStatus: string;
  reconciliationState: string;
  legacyAgencyCode: string | null;
  notes: string | null;
  createdBy: string;
}

export function toNationalAuthorityRow(s: TzAuthoritySeed): AuthorityInsert {
  return {
    id: fixedId(ID_PREFIX.fedAuthority, `TZ_${s.code}`),
    jurisdictionCode: "TZ",
    code: s.code,
    domainCode: s.domain,
    officialName: s.name,
    shortName: s.short ?? null,
    authorityType: s.type ?? "AGENCY",
    parentAuthorityCode: s.parent ?? null,
    legalMandate: s.mandate ?? null,
    officialWebsite: s.website ?? null,
    directorySource: TZ_DIRECTORY_SOURCE,
    jurisdictionScope: s.code === "EAC" || s.code === "SADC" ? "INTERNATIONAL" : "NATIONAL",
    sectorDomains: [s.domain],
    dataCategories: s.categories ?? [],
    consentRequired: s.consent ?? "UNKNOWN",
    agreementRequired: s.agreement ?? "UNKNOWN",
    apiStatus: s.apiStatus ?? "UNVERIFIED",
    govesbStatus: s.govesb ?? "GOVESB_UNKNOWN",
    verificationStatus: "REGISTERED",
    accessCostStatus: s.cost ?? "UNKNOWN_COST",
    recordStatus: s.uncertain ? "UNCERTAIN" : "REGISTERED",
    lifecycleStatus: "CLASSIFIED",
    reconciliationState: "PENDING_RECONCILIATION",
    legacyAgencyCode: s.legacy ?? null,
    notes: s.notes ?? null,
    createdBy: "SEED/FEDERATION_BOOTSTRAP",
  };
}

export function toRegionRow(s: TzRegionSeed): AuthorityInsert {
  return {
    id: fixedId(ID_PREFIX.fedAuthority, `TZ_REGION_${s.code}`),
    jurisdictionCode: "TZ",
    code: `TZ_REGION_${s.code}`,
    domainCode: "REGIONAL_ADMINISTRATION",
    officialName: s.name,
    shortName: s.short ?? s.name,
    authorityType: "REGIONAL_GOVERNMENT",
    parentAuthorityCode: "PRESIDENT_OFFICE",
    legalMandate: `Regional administration of ${s.name.replace(/ Region$/, "")} Region (regional commissioner and regional administration services)`,
    officialWebsite: null,
    directorySource: TZ_DIRECTORY_SOURCE,
    jurisdictionScope: "REGIONAL",
    sectorDomains: ["REGIONAL_ADMINISTRATION"],
    dataCategories: [],
    consentRequired: "UNKNOWN",
    agreementRequired: "UNKNOWN",
    apiStatus: "UNVERIFIED",
    govesbStatus: "GOVESB_UNKNOWN",
    verificationStatus: "REGISTERED",
    accessCostStatus: "UNKNOWN_COST",
    recordStatus: s.zanzibar ? "UNCERTAIN" : "REGISTERED",
    lifecycleStatus: "CLASSIFIED",
    reconciliationState: "PENDING_RECONCILIATION",
    legacyAgencyCode: null,
    notes: s.zanzibar
      ? "Zanzibar region: semi-autonomous government under the union structure. Recorded as a FEDERAL-INTERFACE authority — jurisdiction over Zanzibar administration is NOT claimed by the mainland registry; interface terms to be verified during reconciliation."
      : "Mainland regional administration authority (regional commissioner office and regional services).",
    createdBy: "SEED/FEDERATION_BOOTSTRAP",
  };
}

export function toLgaRow(s: TzLgaSeed): AuthorityInsert {
  const regionName = s.regionCode.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    id: fixedId(ID_PREFIX.fedAuthority, s.code),
    jurisdictionCode: "TZ",
    code: s.code,
    domainCode: "LOCAL_GOVERNMENT",
    officialName: s.name,
    shortName: s.unenumerated ? null : s.name.replace(/ District$/, ""),
    authorityType: "LOCAL_GOVERNMENT",
    parentAuthorityCode: `TZ_REGION_${s.regionCode}`,
    legalMandate: `Local government authority (district council) of ${regionName} Region — local service delivery, local development, local licensing as statutorily devolved`,
    officialWebsite: null,
    directorySource: TZ_DIRECTORY_SOURCE,
    jurisdictionScope: "LOCAL",
    sectorDomains: ["LOCAL_GOVERNMENT"],
    dataCategories: [],
    consentRequired: "UNKNOWN",
    agreementRequired: "UNKNOWN",
    apiStatus: "UNVERIFIED",
    govesbStatus: "GOVESB_UNKNOWN",
    verificationStatus: "REGISTERED",
    accessCostStatus: "UNKNOWN_COST",
    recordStatus: s.unenumerated ? "UNCERTAIN" : "REGISTERED",
    lifecycleStatus: "CLASSIFIED",
    reconciliationState: "PENDING_RECONCILIATION",
    legacyAgencyCode: null,
    notes: s.note ?? "Best-effort LGA baseline row — composition and counts vary across public sources; reconcile against the official directory extract.",
    createdBy: "SEED/FEDERATION_BOOTSTRAP",
  };
}

/* ------------------------------------------------------------------ */
/* Legal bases                                                         */
/* ------------------------------------------------------------------ */

const BASIS_TYPE_MAP: Record<TzLegalBaseSeed["kind"], string> = {
  ACT: "STATUTORY_AUTHORITY",
  REGULATION: "REGULATORY_REQUIREMENT",
  PROCLAMATION: "STATUTORY_AUTHORITY",
  DIRECTIVE: "JURISDICTION_SPECIFIC",
  TREATY: "JURISDICTION_SPECIFIC",
  OTHER: "JURISDICTION_SPECIFIC",
};

export interface LegalBasisInsert {
  id: string;
  jurisdictionCode: string;
  code: string;
  basisType: string;
  legalSource: string;
  legalReference: string | null;
  purpose: string;
  scope: string | null;
  effectiveDate: Date | null;
  status: string;
  notes: string | null;
}

export function toLegalBasisRow(s: TzLegalBaseSeed): LegalBasisInsert {
  return {
    id: fixedId(ID_PREFIX.fedLegalBasis, s.code),
    jurisdictionCode: "TZ",
    code: s.code,
    basisType: BASIS_TYPE_MAP[s.kind],
    legalSource: s.issuer,
    legalReference: s.name,
    purpose: s.federationRelevance,
    scope: s.subject,
    effectiveDate: s.effectiveDate ? new Date(s.effectiveDate) : null,
    status: "DRAFT",
    notes: s.notes ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Services (data_classification mapping: descriptive seed label →     */
/* EXTERNAL_DATA_CLASSIFICATION ladder value)                           */
/* ------------------------------------------------------------------ */

const CLASSIFICATION_MAP: Record<NonNullable<TzServiceSeed["classification"]>, string> = {
  PUBLIC_INFORMATION: "PUBLIC",
  PROTECTED_DATA: "PROTECTED",
  UNKNOWN: "UNVERIFIED",
};

export interface ServiceInsert {
  id: string;
  authorityId: string;
  code: string;
  name: string;
  dataClassification: string;
  consentRequired: "TRUE" | "FALSE" | "UNKNOWN";
  agreementRequired: "TRUE" | "FALSE" | "UNKNOWN";
  accessCostStatus: string;
  apiStatus: string;
  govesbStatus: string;
  verificationStatus: string;
  accessLevel: string;
  notes: string | null;
}

export function toServiceRow(s: TzServiceSeed, authorityId: string): ServiceInsert {
  return {
    id: fixedId(ID_PREFIX.fedService, `TZ_${s.code}`),
    authorityId,
    code: s.code,
    name: s.name,
    dataClassification: CLASSIFICATION_MAP[s.classification ?? "PUBLIC_INFORMATION"],
    consentRequired: s.consent ?? "UNKNOWN",
    agreementRequired: s.agreement ?? "UNKNOWN",
    accessCostStatus: s.cost ?? "UNKNOWN_COST",
    apiStatus: "UNVERIFIED",
    govesbStatus: s.govesb ?? "GOVESB_UNKNOWN",
    verificationStatus: "REGISTERED",
    accessLevel: "NOT_CONNECTED",
    notes: s.notes ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Capabilities                                                        */
/* ------------------------------------------------------------------ */

export interface CapabilityInsert {
  jurisdictionCode: string;
  capabilityCode: string;
  availability: string;
  legalBasisRef: string | null;
  connectorRef: string | null;
  dataResidency: string | null;
  costStatus: string;
  requiresHumanApproval: "TRUE" | "FALSE" | "UNKNOWN";
  notes: string | null;
}

export function toCapabilityRows(): CapabilityInsert[] {
  return TZ_CAPABILITIES.map((c) => ({
    jurisdictionCode: "TZ",
    capabilityCode: c.capabilityCode,
    availability: c.availability,
    legalBasisRef: c.legalBasisRef,
    connectorRef: c.connectorRef,
    dataResidency: c.dataResidency,
    costStatus: c.costStatus,
    requiresHumanApproval: c.requiresHumanApproval,
    notes: c.notes,
  }));
}
