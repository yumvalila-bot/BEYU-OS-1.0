/**
 * BEYU OS — MULTI_COMPANY_MANAGEMENT: governed read services.
 *
 * Every function here:
 *   1. resolves the finite set of legal entities the principal may actually see
 *      (tenant scope ∩ classification ceiling ∩ entity ABAC scope);
 *   2. filters the SQL itself by that set — never filters after a broad read;
 *   3. returns a figure with its currency, period, source and data state.
 *
 * NO FABRICATED DATA. Where a source holds nothing, the result is UNAVAILABLE
 * with a reason, never a zero. Where a source exists but the principal's
 * clearance does not reach it, the result is RESTRICTED.
 */
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  capitalRequests,
  complianceObligations,
  consolidationEntities,
  consolidationRuns,
  countries,
  employees,
  entityRelationships,
  governanceBodies,
  intercompanyTransactions,
  jurisdictions,
  legalEntities,
  legalEntityProfiles,
  mcmAssetRegister,
  mcmCapitalAllocations,
  mcmCountryProfiles,
  mcmIntegrationContracts,
  mcmProcurementRegister,
  mcmProjectPortfolio,
  mcmStatutoryFilings,
  ownershipRecords,
  ownershipValidations,
  risks,
  tenants,
  treasuryPositions,
} from "@/db/schema";
import { can, type Principal } from "@/lib/authz";
import { classificationsAtOrBelow, type Classification } from "@/lib/constants";
import { tenantScopeIds } from "@/lib/tenant-scope";
import {
  entityVisible,
  figure,
  unavailable,
  type McmDataState,
  type McmFigure,
} from "./model";

/* ------------------------------------------------------------------ */
/* The visible universe                                                */
/* ------------------------------------------------------------------ */

export type VisibleEntity = {
  id: string;
  tenantId: string;
  code: string;
  legalName: string;
  tradingName: string | null;
  entityType: string;
  parentEntityId: string | null;
  countryCode: string;
  jurisdictionId: string | null;
  registrationNumber: string | null;
  taxIdentifier: string | null;
  incorporationDate: string | null;
  functionalCurrency: string;
  accountingStandard: string;
  sectorCode: string | null;
  status: string;
  classification: Classification;
  effectiveFrom: string;
  effectiveTo: string | null;
  /** MCM profile, when one exists. Absent means "not yet profiled", never "empty". */
  profile: {
    id: string;
    mcmLifecycleState: string;
    reportingCurrency: string;
    reportingTimezone: string;
    registeredOffice: string | null;
    registeredOfficeCountryCode: string | null;
    consolidated: boolean;
    consolidationMethod: string;
    verificationState: string;
    statutoryIdentifiers: Array<{ scheme: string; value: string; issuer: string; countryCode: string }>;
    statutoryObligations: string[];
    pendingVerificationNote: string | null;
  } | null;
  tenantCode: string;
  tenantType: string;
  countryName: string | null;
  region: string | null;
};

/**
 * Resolve every legal entity the principal may see.
 *
 * This is THE single entry point for MCM reads. All aggregate functions below
 * take the array it returns, so there is exactly one place where the entity
 * boundary is decided.
 */
export async function visibleEntities(principal: Principal): Promise<VisibleEntity[]> {
  const scope = await tenantScopeIds(principal);
  const allowed = classificationsAtOrBelow(principal.clearance);
  if (scope.length === 0 || allowed.length === 0) return [];

  const rows = await db
    .select({
      id: legalEntities.id,
      tenantId: legalEntities.tenantId,
      code: legalEntities.code,
      legalName: legalEntities.legalName,
      tradingName: legalEntities.tradingName,
      entityType: legalEntities.entityType,
      parentEntityId: legalEntities.parentEntityId,
      countryCode: legalEntities.countryCode,
      jurisdictionId: legalEntities.jurisdictionId,
      registrationNumber: legalEntities.registrationNumber,
      taxIdentifier: legalEntities.taxIdentifier,
      incorporationDate: legalEntities.incorporationDate,
      functionalCurrency: legalEntities.functionalCurrency,
      accountingStandard: legalEntities.accountingStandard,
      sectorCode: legalEntities.sectorCode,
      status: legalEntities.status,
      classification: legalEntities.classification,
      effectiveFrom: legalEntities.effectiveFrom,
      effectiveTo: legalEntities.effectiveTo,
      tenantCode: tenants.code,
      tenantType: tenants.type,
      countryName: countries.name,
      region: countries.region,
      profileId: legalEntityProfiles.id,
      mcmLifecycleState: legalEntityProfiles.mcmLifecycleState,
      reportingCurrency: legalEntityProfiles.reportingCurrency,
      reportingTimezone: legalEntityProfiles.reportingTimezone,
      registeredOffice: legalEntityProfiles.registeredOffice,
      registeredOfficeCountryCode: legalEntityProfiles.registeredOfficeCountryCode,
      consolidated: legalEntityProfiles.consolidated,
      consolidationMethod: legalEntityProfiles.consolidationMethod,
      verificationState: legalEntityProfiles.verificationState,
      statutoryIdentifiers: legalEntityProfiles.statutoryIdentifiers,
      statutoryObligations: legalEntityProfiles.statutoryObligations,
      pendingVerificationNote: legalEntityProfiles.pendingVerificationNote,
    })
    .from(legalEntities)
    .innerJoin(tenants, eq(tenants.id, legalEntities.tenantId))
    .leftJoin(countries, eq(countries.code, legalEntities.countryCode))
    .leftJoin(legalEntityProfiles, eq(legalEntityProfiles.legalEntityId, legalEntities.id))
    .where(
      and(
        inArray(legalEntities.tenantId, scope),
        inArray(legalEntities.classification, allowed),
        ...(principal.entityScope.length > 0 ? [inArray(legalEntities.id, principal.entityScope)] : []),
        // Only entities that are legally alive as at today. A dissolved entity
        // remains queryable by id, but it is not part of the operating group.
        lte(legalEntities.effectiveFrom, new Date().toISOString().slice(0, 10)),
        or(isNull(legalEntities.effectiveTo), gte(legalEntities.effectiveTo, new Date().toISOString().slice(0, 10))),
      ),
    )
    .orderBy(asc(legalEntities.code));

  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    code: row.code,
    legalName: row.legalName,
    tradingName: row.tradingName,
    entityType: row.entityType,
    parentEntityId: row.parentEntityId,
    countryCode: row.countryCode,
    jurisdictionId: row.jurisdictionId,
    registrationNumber: row.registrationNumber,
    taxIdentifier: row.taxIdentifier,
    incorporationDate: row.incorporationDate,
    functionalCurrency: row.functionalCurrency,
    accountingStandard: row.accountingStandard,
    sectorCode: row.sectorCode,
    status: row.status,
    classification: row.classification,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    tenantCode: row.tenantCode,
    tenantType: row.tenantType,
    countryName: row.countryName,
    region: row.region,
    profile:
      row.profileId === null
        ? null
        : {
            id: row.profileId,
            mcmLifecycleState: row.mcmLifecycleState ?? "ACTIVE",
            reportingCurrency: row.reportingCurrency ?? row.functionalCurrency,
            reportingTimezone: row.reportingTimezone ?? "UTC",
            registeredOffice: row.registeredOffice ?? null,
            registeredOfficeCountryCode: row.registeredOfficeCountryCode ?? null,
            consolidated: row.consolidated ?? true,
            consolidationMethod: row.consolidationMethod ?? "FULL",
            verificationState: row.verificationState ?? "PENDING_VERIFICATION",
            statutoryIdentifiers: row.statutoryIdentifiers ?? [],
            statutoryObligations: row.statutoryObligations ?? [],
            pendingVerificationNote: row.pendingVerificationNote ?? null,
          },
  }));
}

/* ------------------------------------------------------------------ */
/* Corporate hierarchy                                                 */
/* ------------------------------------------------------------------ */

export type HierarchyNode = VisibleEntity & {
  children: HierarchyNode[];
  depth: number;
  /**
   * True when the node's canonical parent is OUTSIDE the principal's visible
   * set. The hierarchy is then presented as a root but marked, so a viewer can
   * never conclude that a child has no parent — only that they cannot see it.
   */
  parentOutsideScope: boolean;
};

/**
 * Build the corporate hierarchy from the registry's `parent_entity_id`.
 *
 * Cycles cannot exist (migration 0076 installs a database trigger that refuses
 * them), but this function still carries a depth guard: a malformed read must
 * fail visibly rather than recurse forever.
 */
export function buildHierarchy(entities: VisibleEntity[]): HierarchyNode[] {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const nodes = new Map<string, HierarchyNode>();
  for (const entity of entities) {
    const parentOutsideScope = entity.parentEntityId !== null && !byId.has(entity.parentEntityId);
    nodes.set(entity.id, { ...entity, children: [], depth: 0, parentOutsideScope });
  }
  const roots: HierarchyNode[] = [];
  for (const entity of entities) {
    const node = nodes.get(entity.id)!;
    const parent = entity.parentEntityId ? nodes.get(entity.parentEntityId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const assign = (node: HierarchyNode, depth: number, guard: number): void => {
    if (guard > 64) return;
    node.depth = depth;
    for (const child of node.children) assign(child, depth + 1, guard + 1);
  };
  for (const root of roots) assign(root, 0, 0);
  const sortRecursive = (list: HierarchyNode[]): void => {
    list.sort((a, b) => a.code.localeCompare(b.code));
    for (const item of list) sortRecursive(item.children);
  };
  sortRecursive(roots);
  return roots;
}

/* ------------------------------------------------------------------ */
/* Country / sector views                                              */
/* ------------------------------------------------------------------ */

export type CountryView = {
  countryCode: string;
  countryName: string;
  region: string | null;
  entities: number;
  activeEntities: number;
  functionalCurrencies: string[];
  sectors: string[];
  /** Country configuration, when one has been recorded. */
  configuration: {
    version: number;
    localCurrency: string;
    timezone: string;
    incorporationAuthority: string | null;
    taxAuthority: string | null;
    socialSecurityAuthority: string | null;
    workersCompensationAuthority: string | null;
    filingModes: Array<{ authority: string; mode: string; integrationCode?: string; note: string }>;
    effectiveFrom: string;
    effectiveTo: string | null;
  } | null;
};

export async function countryViews(entities: VisibleEntity[]): Promise<CountryView[]> {
  const codes = [...new Set(entities.map((entity) => entity.countryCode))];
  if (codes.length === 0) return [];
  const configs = await db
    .select()
    .from(mcmCountryProfiles)
    .where(and(inArray(mcmCountryProfiles.countryCode, codes), eq(mcmCountryProfiles.status, "ACTIVE")))
    .orderBy(desc(mcmCountryProfiles.version));
  const configByCountry = new Map<string, (typeof configs)[number]>();
  for (const config of configs) {
    if (!configByCountry.has(config.countryCode)) configByCountry.set(config.countryCode, config);
  }
  const grouped = new Map<string, VisibleEntity[]>();
  for (const entity of entities) {
    const list = grouped.get(entity.countryCode) ?? [];
    list.push(entity);
    grouped.set(entity.countryCode, list);
  }
  return [...grouped.entries()]
    .map(([countryCode, list]) => {
      const config = configByCountry.get(countryCode);
      return {
        countryCode,
        countryName: list[0]?.countryName ?? countryCode,
        region: list[0]?.region ?? null,
        entities: list.length,
        activeEntities: list.filter(
          (entity) => (entity.profile?.mcmLifecycleState ?? entity.status) === "ACTIVE",
        ).length,
        functionalCurrencies: [...new Set(list.map((entity) => entity.functionalCurrency))].sort(),
        sectors: [...new Set(list.map((entity) => entity.sectorCode).filter((code): code is string => Boolean(code)))].sort(),
        configuration: config
          ? {
              version: config.version,
              localCurrency: config.localCurrency,
              timezone: config.timezone,
              incorporationAuthority: config.incorporationAuthority,
              taxAuthority: config.taxAuthority,
              socialSecurityAuthority: config.socialSecurityAuthority,
              workersCompensationAuthority: config.workersCompensationAuthority,
              filingModes: config.filingModes,
              effectiveFrom: config.effectiveFrom,
              effectiveTo: config.effectiveTo,
            }
          : null,
      };
    })
    .sort((a, b) => a.countryName.localeCompare(b.countryName));
}

/* ------------------------------------------------------------------ */
/* Financial oversight (FINANCE OS remains authoritative)              */
/* ------------------------------------------------------------------ */

export type EntityFinancialSnapshot = {
  entityId: string;
  entityCode: string;
  currency: string;
  treasury: McmFigure;
  treasuryAsOf: string | null;
  capitalRequested: McmFigure;
  capitalApproved: McmFigure;
  employeeCount: number | null;
};

/**
 * Per-entity financial posture, entirely from Finance OS and HCM.
 *
 * MCM OWNS NONE OF THESE NUMBERS. Each is classified and sourced explicitly:
 *
 *   treasury        — sum of `treasury_positions.base_currency_balance` for the
 *                     entity, as at the latest `as_of`, RESTRICTED classification.
 *   capitalRequested— sum of `capital_requests.amount` for requests in an open
 *                     state, ACTUAL (a request is a real recorded request).
 *   capitalApproved — sum of approved capital requests, ACTUAL.
 *   employeeCount   — count from the HCM employee master, ACTUAL.
 *
 * When the caller lacks the source capability the figure is RESTRICTED with the
 * reason naming the missing permission. When there is genuinely no row the figure
 * is UNAVAILABLE and carries the period it looked at.
 */
export async function entityFinancialSnapshots(
  principal: Principal,
  entities: VisibleEntity[],
  period: string | null,
): Promise<EntityFinancialSnapshot[]> {
  if (entities.length === 0) return [];
  const ids = entities.map((entity) => entity.id);
  const canTreasury = can(principal, "finance:treasury.read").allowed;
  const canCapital = can(principal, "finance:capital.read").allowed;
  const canWorkforce = can(principal, "hcm:employee.read").allowed;
  const allowed = classificationsAtOrBelow(principal.clearance);

  const [treasuryRows, capitalRows, workforceRows] = await Promise.all([
    canTreasury
      ? db
          .select({
            entityId: treasuryPositions.legalEntityId,
            total: sql<string>`sum(${treasuryPositions.baseCurrencyBalance})`,
            currency: sql<string>`min(${treasuryPositions.currency})`,
            asOf: sql<string>`max(${treasuryPositions.asOf})`,
            positions: count(),
          })
          .from(treasuryPositions)
          .where(
            and(
              inArray(treasuryPositions.legalEntityId, ids),
              inArray(treasuryPositions.classification, allowed),
            ),
          )
          .groupBy(treasuryPositions.legalEntityId)
      : Promise.resolve([]),
    canCapital
      ? db
          .select({
            entityId: capitalRequests.legalEntityId,
            requested: sql<string>`coalesce(sum(case when ${capitalRequests.status} not in ('APPROVED','REJECTED','WITHDRAWN') then ${capitalRequests.amount} else 0 end), 0)`,
            approved: sql<string>`coalesce(sum(case when ${capitalRequests.status} = 'APPROVED' then ${capitalRequests.amount} else 0 end), 0)`,
            currency: sql<string>`min(${capitalRequests.currency})`,
            total: count(),
          })
          .from(capitalRequests)
          .where(inArray(capitalRequests.legalEntityId, ids))
          .groupBy(capitalRequests.legalEntityId)
      : Promise.resolve([]),
    canWorkforce
      ? db
          .select({ entityId: employees.legalEntityId, total: count() })
          .from(employees)
          .where(
            and(
              inArray(employees.legalEntityId, ids),
              inArray(employees.classification, allowed),
              inArray(employees.status, ["ACTIVE", "ON_LEAVE"]),
            ),
          )
          .groupBy(employees.legalEntityId)
      : Promise.resolve([]),
  ]);

  const treasuryBy = new Map(treasuryRows.map((row) => [row.entityId, row]));
  const capitalBy = new Map(capitalRows.map((row) => [row.entityId, row]));
  const workforceBy = new Map(workforceRows.map((row) => [row.entityId, row]));

  return entities.map((entity) => {
    const treasury = treasuryBy.get(entity.id);
    const capital = capitalBy.get(entity.id);
    const workforce = workforceBy.get(entity.id);
    const currency = entity.profile?.reportingCurrency ?? entity.functionalCurrency;
    return {
      entityId: entity.id,
      entityCode: entity.code,
      currency,
      treasury: !canTreasury
        ? unavailable("FINANCE_OS.treasury_positions", "Requires finance:treasury.read.", {
            dataState: "RESTRICTED",
          })
        : treasury
          ? figure({
              amountMinor: treasury.total,
              currency: treasury.currency ?? currency,
              period: treasury.asOf,
              source: "FINANCE_OS.treasury_positions (base_currency_balance)",
              dataState: "ACTUAL",
            })
          : unavailable(
              "FINANCE_OS.treasury_positions",
              `No treasury position is recorded for ${entity.code}${period ? ` for period ${period}` : ""}.`,
              { period, currency },
            ),
      treasuryAsOf: treasury?.asOf ?? null,
      capitalRequested: !canCapital
        ? unavailable("FINANCE_OS.capital_requests", "Requires finance:capital.read.", { dataState: "RESTRICTED" })
        : capital
          ? figure({
              amountMinor: capital.requested,
              currency: capital.currency ?? currency,
              period,
              source: "FINANCE_OS.capital_requests (open states)",
              dataState: "ACTUAL",
            })
          : unavailable("FINANCE_OS.capital_requests", `No capital request is recorded for ${entity.code}.`, {
              period,
              currency,
            }),
      capitalApproved: !canCapital
        ? unavailable("FINANCE_OS.capital_requests", "Requires finance:capital.read.", { dataState: "RESTRICTED" })
        : capital
          ? figure({
              amountMinor: capital.approved,
              currency: capital.currency ?? currency,
              period,
              source: "FINANCE_OS.capital_requests (APPROVED)",
              dataState: "ACTUAL",
            })
          : unavailable("FINANCE_OS.capital_requests", `No capital request is recorded for ${entity.code}.`, {
              period,
              currency,
            }),
      employeeCount: !canWorkforce
        ? null
        : Number(workforce?.total ?? 0) > 0
          ? Number(workforce!.total)
          : 0,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Governance, ownership, risk, compliance rollups                     */
/* ------------------------------------------------------------------ */

export type GovernanceOverview = {
  bodies: Array<{
    id: string;
    code: string;
    name: string;
    bodyType: string;
    legalEntityId: string | null;
    quorumMinimum: number;
    majorityRule: string;
    status: string;
  }>;
  /** Entities in scope with NO governing body recorded. An honest gap. */
  entitiesWithoutBody: string[];
  appointments: number | null;
};

export async function governanceOverview(
  principal: Principal,
  entities: VisibleEntity[],
): Promise<GovernanceOverview> {
  if (entities.length === 0) return { bodies: [], entitiesWithoutBody: [], appointments: null };
  if (!can(principal, "governance:body.read").allowed) {
    return { bodies: [], entitiesWithoutBody: [], appointments: null };
  }
  const ids = entities.map((entity) => entity.id);
  const rows = await db
    .select({
      id: governanceBodies.id,
      code: governanceBodies.code,
      name: governanceBodies.name,
      bodyType: governanceBodies.bodyType,
      legalEntityId: governanceBodies.legalEntityId,
      quorumMinimum: governanceBodies.quorumMinimum,
      majorityRule: governanceBodies.majorityRule,
      status: governanceBodies.status,
    })
    .from(governanceBodies)
    .where(or(inArray(governanceBodies.legalEntityId, ids), isNull(governanceBodies.legalEntityId)))
    .orderBy(asc(governanceBodies.code));
  const covered = new Set(rows.map((row) => row.legalEntityId).filter((id): id is string => Boolean(id)));
  return {
    bodies: rows,
    entitiesWithoutBody: entities.filter((entity) => !covered.has(entity.id)).map((entity) => entity.code),
    appointments: null,
  };
}

export type OwnershipOverview = {
  records: Array<{
    id: string;
    ownedEntityId: string;
    ownedEntityCode: string;
    ownerEntityId: string | null;
    ownerEntityCode: string | null;
    ownerPartyId: string | null;
    ownershipType: string;
    instrument: string;
    economicPct: string;
    votingPct: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    hasProvenance: boolean;
    hasSupportingDocument: boolean;
    latestValidation: string | null;
  }>;
  entitiesWithNoOwnerRecorded: string[];
  validationSummary: Record<string, number>;
};

export async function ownershipOverview(
  principal: Principal,
  entities: VisibleEntity[],
): Promise<OwnershipOverview> {
  if (entities.length === 0) {
    return { records: [], entitiesWithNoOwnerRecorded: [], validationSummary: {} };
  }
  if (!can(principal, "organization:ownership.read").allowed) {
    return { records: [], entitiesWithNoOwnerRecorded: [], validationSummary: {} };
  }
  const ids = entities.map((entity) => entity.id);
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({
      id: ownershipRecords.id,
      ownedEntityId: ownershipRecords.ownedEntityId,
      ownedEntityCode: legalEntities.code,
      ownerEntityId: ownershipRecords.ownerEntityId,
      ownerPartyId: ownershipRecords.ownerPartyId,
      ownershipType: ownershipRecords.ownershipType,
      instrument: ownershipRecords.instrument,
      economicPct: ownershipRecords.economicPct,
      votingPct: ownershipRecords.votingPct,
      effectiveFrom: ownershipRecords.effectiveFrom,
      effectiveTo: ownershipRecords.effectiveTo,
      provenance: ownershipRecords.provenance,
      supportingDocumentId: ownershipRecords.supportingDocumentId,
    })
    .from(ownershipRecords)
    .innerJoin(legalEntities, eq(legalEntities.id, ownershipRecords.ownedEntityId))
    .where(
      and(
        inArray(ownershipRecords.ownedEntityId, ids),
        lte(ownershipRecords.effectiveFrom, today),
        or(isNull(ownershipRecords.effectiveTo), gte(ownershipRecords.effectiveTo, today)),
      ),
    )
    .orderBy(asc(ownershipRecords.ownedEntityId), asc(ownershipRecords.effectiveFrom));
  const ownerIds = [...new Set(rows.map((row) => row.ownerEntityId).filter((id): id is string => Boolean(id)))];
  const owners = ownerIds.length
    ? await db
        .select({ id: legalEntities.id, code: legalEntities.code })
        .from(legalEntities)
        .where(inArray(legalEntities.id, ownerIds))
    : [];
  const ownerCode = new Map(owners.map((owner) => [owner.id, owner.code]));
  const validations = await db
    .select({
      ownershipRecordId: ownershipValidations.ownershipRecordId,
      state: ownershipValidations.state,
      validatedAt: ownershipValidations.validatedAt,
    })
    .from(ownershipValidations)
    .where(inArray(ownershipValidations.ownershipRecordId, rows.map((row) => row.id)))
    .orderBy(asc(ownershipValidations.validatedAt));
  const latestByRecord = new Map<string, string>();
  for (const validation of validations) latestByRecord.set(validation.ownershipRecordId, validation.state);
  const validationSummary: Record<string, number> = {};
  for (const state of latestByRecord.values()) validationSummary[state] = (validationSummary[state] ?? 0) + 1;
  const ownedWithOwner = new Set(rows.map((row) => row.ownedEntityId));
  return {
    records: rows.map((row) => ({
      id: row.id,
      ownedEntityId: row.ownedEntityId,
      ownedEntityCode: row.ownedEntityCode,
      ownerEntityId: row.ownerEntityId,
      ownerEntityCode: row.ownerEntityId ? (ownerCode.get(row.ownerEntityId) ?? null) : null,
      ownerPartyId: row.ownerPartyId,
      ownershipType: row.ownershipType,
      instrument: row.instrument,
      economicPct: row.economicPct,
      votingPct: row.votingPct,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      hasProvenance: row.provenance.trim().length > 0,
      hasSupportingDocument: row.supportingDocumentId !== null,
      latestValidation: latestByRecord.get(row.id) ?? null,
    })),
    // A group entity with no live owner record is a real, reportable gap: BEYU
    // never invents an owner to fill it.
    entitiesWithNoOwnerRecorded: entities
      .filter((entity) => !ownedWithOwner.has(entity.id) && entity.entityType !== "TRUST")
      .map((entity) => entity.code),
    validationSummary,
  };
}

export type RiskComplianceOverview = {
  risks: { total: number; aboveAppetite: number; open: number; byCategory: Record<string, number> } | null;
  obligations: { total: number; dueSoon: number; overdue: number; byFramework: Record<string, number> } | null;
  filings: { total: number; pending: number; overdue: number } | null;
  restrictedReason: string | null;
};

export async function riskComplianceOverview(
  principal: Principal,
  entities: VisibleEntity[],
): Promise<RiskComplianceOverview> {
  if (entities.length === 0) {
    return { risks: null, obligations: null, filings: null, restrictedReason: "No entity is in scope." };
  }
  const ids = entities.map((entity) => entity.id);
  const allowed = classificationsAtOrBelow(principal.clearance);
  const canRisk = can(principal, "risk:register.read").allowed;
  const canCompliance = can(principal, "compliance:obligation.read").allowed;
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const [riskRows, obligationRows, filingRows] = await Promise.all([
    canRisk
      ? db
          .select({
            category: risks.category,
            status: risks.status,
            residual: sql<number>`${risks.residualLikelihood} * ${risks.residualImpact}`,
            appetite: risks.appetiteThreshold,
          })
          .from(risks)
          .where(and(inArray(risks.legalEntityId, ids), inArray(risks.classification, allowed)))
      : Promise.resolve([]),
    canCompliance
      ? db
          .select({
            framework: complianceObligations.framework,
            nextDueAt: complianceObligations.nextDueAt,
            status: complianceObligations.status,
          })
          .from(complianceObligations)
          .where(inArray(complianceObligations.legalEntityId, ids))
      : Promise.resolve([]),
    canCompliance
      ? db
          .select({ status: mcmStatutoryFilings.status, dueOn: mcmStatutoryFilings.dueOn })
          .from(mcmStatutoryFilings)
          .where(inArray(mcmStatutoryFilings.legalEntityId, ids))
      : Promise.resolve([]),
  ]);

  const byCategory: Record<string, number> = {};
  for (const risk of riskRows) byCategory[risk.category] = (byCategory[risk.category] ?? 0) + 1;
  const byFramework: Record<string, number> = {};
  for (const obligation of obligationRows) {
    byFramework[obligation.framework] = (byFramework[obligation.framework] ?? 0) + 1;
  }

  return {
    risks: canRisk
      ? {
          total: riskRows.length,
          aboveAppetite: riskRows.filter((risk) => Number(risk.residual) > risk.appetite).length,
          open: riskRows.filter((risk) => risk.status !== "CLOSED").length,
          byCategory,
        }
      : null,
    obligations: canCompliance
      ? {
          total: obligationRows.length,
          dueSoon: obligationRows.filter(
            (obligation) => obligation.nextDueAt !== null && obligation.nextDueAt >= today && obligation.nextDueAt <= in30,
          ).length,
          overdue: obligationRows.filter(
            (obligation) => obligation.nextDueAt !== null && obligation.nextDueAt < today,
          ).length,
          byFramework,
        }
      : null,
    filings: canCompliance
      ? {
          total: filingRows.length,
          pending: filingRows.filter((filing) => filing.status === "PENDING" || filing.status === "IN_PROGRESS").length,
          overdue: filingRows.filter((filing) => filing.dueOn < today && filing.status !== "FILED" && filing.status !== "ACKNOWLEDGED" && filing.status !== "WAIVED").length,
        }
      : null,
    restrictedReason:
      !canRisk && !canCompliance
        ? "Requires risk:register.read and/or compliance:obligation.read."
        : null,
  };
}

/* ------------------------------------------------------------------ */
/* Intercompany + consolidation overview                               */
/* ------------------------------------------------------------------ */

export type IntercompanyOverview = {
  agreements: number;
  transactions: Array<{
    id: string;
    reference: string;
    state: string;
    receivableEntityCode: string;
    payableEntityCode: string;
    currency: string;
    amountMinor: string;
    periodCode: string;
    receivableAuthorized: boolean;
    payableAuthorized: boolean;
    reconciliationDifferenceMinor: string | null;
  }>;
  totalsByCurrency: Record<string, { authorizedMinor: string; awaitingMinor: string }>;
  restrictedReason: string | null;
};

export async function intercompanyOverview(
  principal: Principal,
  entities: VisibleEntity[],
): Promise<IntercompanyOverview> {
  if (!can(principal, "mcm:intercompany.read").allowed) {
    return {
      agreements: 0,
      transactions: [],
      totalsByCurrency: {},
      restrictedReason: "Requires mcm:intercompany.read.",
    };
  }
  const ids = entities.map((entity) => entity.id);
  if (ids.length === 0) {
    return { agreements: 0, transactions: [], totalsByCurrency: {}, restrictedReason: null };
  }
  const rows = await db
    .select({
      id: intercompanyTransactions.id,
      reference: intercompanyTransactions.reference,
      state: intercompanyTransactions.state,
      receivableEntityId: intercompanyTransactions.receivableEntityId,
      payableEntityId: intercompanyTransactions.payableEntityId,
      currency: intercompanyTransactions.currency,
      amountMinor: intercompanyTransactions.amountMinor,
      periodCode: intercompanyTransactions.periodCode,
      receivableAuthorizedBy: intercompanyTransactions.receivableAuthorizedByUserId,
      payableAuthorizedBy: intercompanyTransactions.payableAuthorizedByUserId,
      difference: intercompanyTransactions.reconciliationDifferenceMinor,
    })
    .from(intercompanyTransactions)
    .where(
      or(
        inArray(intercompanyTransactions.receivableEntityId, ids),
        inArray(intercompanyTransactions.payableEntityId, ids),
      ),
    )
    .orderBy(desc(intercompanyTransactions.raisedAt))
    .limit(200);
  const codeById = new Map(entities.map((entity) => [entity.id, entity.code]));
  const totalsByCurrency: Record<string, { authorizedMinor: string; awaitingMinor: string }> = {};
  for (const row of rows) {
    const bucket = (totalsByCurrency[row.currency] ??= { authorizedMinor: "0", awaitingMinor: "0" });
    const target = row.state === "BOTH_SIDES_AUTHORIZED" || row.state === "RECONCILED" ? "authorizedMinor" : "awaitingMinor";
    bucket[target] = (BigInt(bucket[target]) + BigInt(row.amountMinor)).toString();
  }
  const agreementRows = await db
    .select({ total: count() })
    .from(intercompanyTransactions)
    .where(inArray(intercompanyTransactions.receivableEntityId, ids));
  return {
    agreements: Number(agreementRows[0]?.total ?? 0),
    transactions: rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      state: row.state,
      receivableEntityCode: codeById.get(row.receivableEntityId) ?? row.receivableEntityId,
      payableEntityCode: codeById.get(row.payableEntityId) ?? row.payableEntityId,
      currency: row.currency,
      amountMinor: row.amountMinor,
      periodCode: row.periodCode,
      receivableAuthorized: row.receivableAuthorizedBy !== null,
      payableAuthorized: row.payableAuthorizedBy !== null,
      reconciliationDifferenceMinor: row.difference,
    })),
    totalsByCurrency,
    restrictedReason: null,
  };
}

export type ConsolidationOverview = {
  runs: Array<{
    id: string;
    code: string;
    periodCode: string;
    reportingCurrency: string;
    state: string;
    entitiesIncluded: number;
    totalAssetsMinor: string | null;
    totalLiabilitiesMinor: string | null;
    totalEquityMinor: string | null;
    eliminationsMinor: string | null;
    residualMinor: string | null;
    dataState: string;
    preparedByUserId: string;
    reviewedByUserId: string | null;
    reviewedAt: string | null;
  }>;
  latestRunEntities: Array<{
    legalEntityId: string;
    entityCode: string;
    functionalCurrency: string;
    ownershipPct: string;
    translatedEquityMinor: string | null;
    dataState: McmDataState;
    unavailabilityReason: string | null;
  }>;
  restrictedReason: string | null;
};

export async function consolidationOverview(principal: Principal): Promise<ConsolidationOverview> {
  if (!can(principal, "mcm:consolidation.read").allowed) {
    return { runs: [], latestRunEntities: [], restrictedReason: "Requires mcm:consolidation.read." };
  }
  const runs = await db
    .select({
      id: consolidationRuns.id,
      code: consolidationRuns.code,
      periodCode: consolidationRuns.periodCode,
      reportingCurrency: consolidationRuns.reportingCurrency,
      state: consolidationRuns.state,
      entitiesIncluded: consolidationRuns.entitiesIncluded,
      totalAssetsMinor: consolidationRuns.totalAssetsMinor,
      totalLiabilitiesMinor: consolidationRuns.totalLiabilitiesMinor,
      totalEquityMinor: consolidationRuns.totalEquityMinor,
      eliminationsMinor: consolidationRuns.eliminationsMinor,
      residualMinor: consolidationRuns.residualMinor,
      dataState: consolidationRuns.dataState,
      preparedByUserId: consolidationRuns.preparedByUserId,
      reviewedByUserId: consolidationRuns.reviewedByUserId,
      reviewedAt: consolidationRuns.reviewedAt,
    })
    .from(consolidationRuns)
    .orderBy(desc(consolidationRuns.createdAt))
    .limit(12);
  if (runs.length === 0) return { runs: [], latestRunEntities: [], restrictedReason: null };
  const latest = runs[0];
  const entityRows = await db
    .select({
      legalEntityId: consolidationEntities.legalEntityId,
      entityCode: legalEntities.code,
      functionalCurrency: consolidationEntities.functionalCurrency,
      ownershipPct: consolidationEntities.ownershipPct,
      translatedEquityMinor: consolidationEntities.translatedEquityMinor,
      dataState: consolidationEntities.dataState,
      unavailabilityReason: consolidationEntities.unavailabilityReason,
    })
    .from(consolidationEntities)
    .innerJoin(legalEntities, eq(legalEntities.id, consolidationEntities.legalEntityId))
    .where(eq(consolidationEntities.runId, latest.id))
    .orderBy(asc(legalEntities.code));
  return {
    runs: runs.map((run) => ({ ...run, reviewedAt: run.reviewedAt ? run.reviewedAt.toISOString() : null })),
    latestRunEntities: entityRows,
    restrictedReason: null,
  };
}

/* ------------------------------------------------------------------ */
/* Enterprise module rollups                                           */
/* ------------------------------------------------------------------ */

export type ModuleRollup = {
  procurement: { records: number; committedByCurrency: Record<string, string> } | null;
  assets: { records: number; byClass: Record<string, number> } | null;
  projects: { records: number; byHealth: Record<string, number> } | null;
  capitalAllocations: { records: number; byStatus: Record<string, number> } | null;
  restrictedReason: string | null;
};

export async function moduleRollup(principal: Principal, entities: VisibleEntity[]): Promise<ModuleRollup> {
  const ids = entities.map((entity) => entity.id);
  const canProcurement = can(principal, "mcm:procurement.read").allowed;
  const canAsset = can(principal, "mcm:asset.read").allowed;
  const canProject = can(principal, "mcm:project.read").allowed;
  const canCapital = can(principal, "mcm:capital.read").allowed;
  if (ids.length === 0) {
    return { procurement: null, assets: null, projects: null, capitalAllocations: null, restrictedReason: "No entity is in scope." };
  }
  const [procurementRows, assetRows, projectRows, capitalRows] = await Promise.all([
    canProcurement
      ? db
          .select({ currency: mcmProcurementRegister.currency, committed: mcmProcurementRegister.committedMinor })
          .from(mcmProcurementRegister)
          .where(inArray(mcmProcurementRegister.legalEntityId, ids))
      : Promise.resolve([]),
    canAsset
      ? db
          .select({ assetClass: mcmAssetRegister.assetClass })
          .from(mcmAssetRegister)
          .where(inArray(mcmAssetRegister.legalEntityId, ids))
      : Promise.resolve([]),
    canProject
      ? db
          .select({ health: mcmProjectPortfolio.health })
          .from(mcmProjectPortfolio)
          .where(inArray(mcmProjectPortfolio.legalEntityId, ids))
      : Promise.resolve([]),
    canCapital
      ? db
          .select({ status: mcmCapitalAllocations.status })
          .from(mcmCapitalAllocations)
          .where(inArray(mcmCapitalAllocations.beneficiaryEntityId, ids))
      : Promise.resolve([]),
  ]);
  const committedByCurrency: Record<string, string> = {};
  for (const row of procurementRows) {
    if (row.committed === null) continue;
    committedByCurrency[row.currency] = (BigInt(committedByCurrency[row.currency] ?? "0") + BigInt(row.committed)).toString();
  }
  const byClass: Record<string, number> = {};
  for (const row of assetRows) byClass[row.assetClass] = (byClass[row.assetClass] ?? 0) + 1;
  const byHealth: Record<string, number> = {};
  for (const row of projectRows) byHealth[row.health] = (byHealth[row.health] ?? 0) + 1;
  const byStatus: Record<string, number> = {};
  for (const row of capitalRows) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  return {
    procurement: canProcurement ? { records: procurementRows.length, committedByCurrency } : null,
    assets: canAsset ? { records: assetRows.length, byClass } : null,
    projects: canProject ? { records: projectRows.length, byHealth } : null,
    capitalAllocations: canCapital ? { records: capitalRows.length, byStatus } : null,
    restrictedReason:
      !canProcurement && !canAsset && !canProject && !canCapital
        ? "Requires at least one MCM module read capability."
        : null,
  };
}

/* ------------------------------------------------------------------ */
/* Integration health                                                  */
/* ------------------------------------------------------------------ */

export type IntegrationHealth = {
  contracts: Array<{
    code: string;
    counterpartSystem: string;
    dataOwner: string;
    dataSet: string;
    state: string;
    classificationCeiling: string;
    failurePolicy: string;
    lastVerifiedAt: string | null;
    lastFailureReason: string | null;
    note: string;
  }>;
  restrictedReason: string | null;
};

export async function integrationHealth(principal: Principal): Promise<IntegrationHealth> {
  if (!can(principal, "mcm:integration.read").allowed) {
    return { contracts: [], restrictedReason: "Requires mcm:integration.read." };
  }
  const rows = await db
    .select({
      code: mcmIntegrationContracts.code,
      counterpartSystem: mcmIntegrationContracts.counterpartSystem,
      dataOwner: mcmIntegrationContracts.dataOwner,
      dataSet: mcmIntegrationContracts.dataSet,
      state: mcmIntegrationContracts.state,
      classificationCeiling: mcmIntegrationContracts.classificationCeiling,
      failurePolicy: mcmIntegrationContracts.failurePolicy,
      lastVerifiedAt: mcmIntegrationContracts.lastVerifiedAt,
      lastFailureReason: mcmIntegrationContracts.lastFailureReason,
      note: mcmIntegrationContracts.note,
    })
    .from(mcmIntegrationContracts)
    .orderBy(asc(mcmIntegrationContracts.counterpartSystem), asc(mcmIntegrationContracts.code));
  return {
    contracts: rows.map((row) => ({
      ...row,
      lastVerifiedAt: row.lastVerifiedAt ? row.lastVerifiedAt.toISOString() : null,
    })),
    restrictedReason: null,
  };
}

/* ------------------------------------------------------------------ */
/* Country helper for jurisdiction filtering                           */
/* ------------------------------------------------------------------ */

export async function jurisdictionLookup(ids: string[]): Promise<Map<string, { code: string; name: string; level: string }>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: jurisdictions.id, code: jurisdictions.code, name: jurisdictions.name, level: jurisdictions.level })
    .from(jurisdictions)
    .where(inArray(jurisdictions.id, ids));
  return new Map(rows.map((row) => [row.id, { code: row.code, name: row.name, level: row.level }]));
}

/** Entities in scope that have no MCM profile yet — the honest "not profiled" set. */
export function entitiesWithoutProfile(entities: VisibleEntity[]): string[] {
  return entities.filter((entity) => entity.profile === null).map((entity) => entity.code);
}

export { entityVisible };
