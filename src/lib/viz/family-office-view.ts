/**
 * BEYU OS — FAMILY OFFICE SPATIAL VIEW (Holograph × Family Office).
 *
 * The governed spatial projection of the family-enterprise structure:
 *
 *   BEYU FAMILY TRUST
 *     → BEYU HOLDING COMPANY
 *       → Country Holding Companies
 *         → Sector LLCs / Sector Operating Companies
 *           → Assets / Investments / Properties / Programs (registry refs)
 *
 * INvariants
 * ──────────
 *   • READ PROJECTION ONLY. This view is assembled LIVE from the canonical
 *     registries (legal_entities, ownership_records, trust_instruments). It
 *     stores nothing, mutates nothing and owns no truth: ownership stays in
 *     Organization & Ownership, trust instruments stay in the Family Trust
 *     domain, sector data stays in each Sector OS.
 *   • VISIBILITY ≠ OWNERSHIP. The view separates the concepts the mission
 *     requires: ownership (canonical ownership_records), custody,
 *     administration, visibility and governance are different relations and
 *     are never collapsed. Rendering a node confers no authority over it.
 *   • CLASSIFICATION CARRIES. Entities are filtered by the principal's
 *     classification ceiling in SQL (defence in depth on top of RLS); trust
 *     instruments default to HIGHLY_RESTRICTED, so only cleared principals
 *     ever see them — a scene can never expose a restricted instrument by
 *     virtue of rendering the structure. Sensitive fields
 *     (registrationNumber, taxIdentifier, legal names of restricted
 *     instruments beyond their name/status) are EXCLUDED from this view by
 *     construction.
 *   • GATES. Requires the Holograph surface permission (viz:scene.read) AND
 *     the organization read boundary (organization:entity.read). Ownership
 *     edges additionally require organization:ownership.read; trust
 *     instrument summaries additionally require family:member.read. Each
 *     facet degrades to a count-only summary when its own permission is
 *     absent — never to a wider dataset.
 *   • NO PHISHING OF RESTRICTED EXISTENCE: when a facet is unavailable the
 *     response says the facet is UNAVAILABLE (with the required permission),
 *     it does not leak how many restricted objects exist.
 */
import { and, inArray } from "drizzle-orm";
import { db } from "@/db";
import { legalEntities, ownershipRecords, trustInstruments } from "@/db/schema";
import { can, type Principal } from "@/lib/authz";
import { classificationsAtOrBelow, type Classification } from "@/lib/constants";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { VizDomainError } from "./errors";

export type FamilyOfficeViewNode = {
  id: string;
  code: string;
  name: string;
  entityType: string;
  /** Deterministic hierarchy level for spatial layout (0 = trust). */
  level: number;
  countryCode: string;
  sectorCode: string | null;
  status: string;
  classification: Classification;
};

export type FamilyOfficeViewEdge = {
  id: string;
  ownerEntityId: string;
  ownedEntityId: string;
  ownershipType: string;
  economicPct: string;
  votingPct: string;
  effectiveFrom: string;
};

export type FamilyOfficeViewInstrument = {
  id: string;
  trustEntityId: string;
  instrumentName: string;
  instrumentType: string;
  version: number;
  status: string;
  legalReviewStatus: string;
  classification: Classification;
};

export type FamilyOfficeView = {
  generatedAt: string;
  /** The spatial view is a governed projection; it is never a grant. */
  authorityNote: string;
  nodes: FamilyOfficeViewNode[];
  edges: FamilyOfficeViewEdge[];
  instruments: FamilyOfficeViewInstrument[] | null;
  instrumentsAvailable: boolean;
  instrumentsUnavailableReason: string | null;
  summary: {
    entities: number;
    ownershipEdges: number;
    byEntityType: Record<string, number>;
    byCountry: Record<string, number>;
  };
};

const ENTITY_LEVELS: Record<string, number> = {
  TRUST: 0,
  HOLDING: 1,
  COUNTRY_HOLDING: 2,
  OPERATING_COMPANY: 3,
  SUBSIDIARY: 3,
  ASSOCIATE: 3,
  JOINT_VENTURE: 3,
  FOUNDATION: 3,
};

/**
 * The governed Family Office spatial view. Throws SCOPE (VizDomainError) when
 * the principal lacks the base gate; unavailable facets degrade to
 * count-free UNAVAILABLE reasons.
 */
export async function familyOfficeStructureView(principal: Principal): Promise<FamilyOfficeView> {
  const surfaceAllowed = can(principal, "viz:scene.read").allowed;
  const orgAllowed = can(principal, "organization:entity.read").allowed;
  if (!surfaceAllowed || !orgAllowed) {
    throw new VizDomainError(
      "SCOPE",
      "The Family Office spatial view requires both the Holograph surface (viz:scene.read) and the organization read boundary (organization:entity.read).",
    );
  }

  const scope = await tenantScopeIds(principal);
  if (scope.length === 0) {
    throw new VizDomainError("SCOPE", "No tenant scope resolves for this principal.");
  }
  const allowed = classificationsAtOrBelow(principal.clearance);

  // ── nodes: the entity topology, filtered in SQL (tenant + classification) ──
  const entityRows = await db
    .select({
      id: legalEntities.id,
      code: legalEntities.code,
      legalName: legalEntities.legalName,
      entityType: legalEntities.entityType,
      countryCode: legalEntities.countryCode,
      sectorCode: legalEntities.sectorCode,
      status: legalEntities.status,
      classification: legalEntities.classification,
    })
    .from(legalEntities)
    .where(and(inArray(legalEntities.tenantId, scope), inArray(legalEntities.classification, allowed as Classification[])))
    .limit(500);

  const visibleIds = new Set(entityRows.map((e) => e.id));
  const nodes: FamilyOfficeViewNode[] = entityRows.map((e) => ({
    id: e.id,
    code: e.code,
    name: e.legalName,
    entityType: e.entityType,
    level: ENTITY_LEVELS[e.entityType] ?? 4,
    countryCode: e.countryCode,
    sectorCode: e.sectorCode,
    status: e.status,
    classification: e.classification,
  }));

  // ── edges: canonical ownership records, both endpoints visible ───────────
  const ownershipRows = await db
    .select({
      id: ownershipRecords.id,
      ownerEntityId: ownershipRecords.ownerEntityId,
      ownedEntityId: ownershipRecords.ownedEntityId,
      ownershipType: ownershipRecords.ownershipType,
      economicPct: ownershipRecords.economicPct,
      votingPct: ownershipRecords.votingPct,
      effectiveFrom: ownershipRecords.effectiveFrom,
    })
    .from(ownershipRecords)
    .where(inArray(ownershipRecords.tenantId, scope))
    .limit(1000);

  let edges: FamilyOfficeViewEdge[] = [];
  const ownershipAllowed = can(principal, "organization:ownership.read").allowed;
  if (ownershipAllowed) {
    edges = ownershipRows
      .filter((r) => visibleIds.has(r.ownedEntityId) && (r.ownerEntityId === null || visibleIds.has(r.ownerEntityId)))
      .map((r) => ({
        id: r.id,
        ownerEntityId: r.ownerEntityId ?? "EXTERNAL_PARTY",
        ownedEntityId: r.ownedEntityId,
        ownershipType: r.ownershipType,
        economicPct: String(r.economicPct),
        votingPct: String(r.votingPct),
        effectiveFrom: typeof r.effectiveFrom === "string" ? r.effectiveFrom.slice(0, 10) : String(r.effectiveFrom),
      }));
  } else {
    // Count-free: without the ownership read grant we do not even leak how
    // many edges exist.
    edges = [];
  }

  // ── instruments: trust instruments (HIGHLY_RESTRICTED by default) ────────
  let instruments: FamilyOfficeViewInstrument[] | null = null;
  let instrumentsAvailable = false;
  let instrumentsUnavailableReason: string | null = null;
  const familyAllowed = can(principal, "family:member.read").allowed;
  if (!familyAllowed) {
    instrumentsUnavailableReason = "Trust instrument visibility requires family:member.read (the Family Office read boundary).";
  } else {
    const trustNodeIds = nodes.filter((n) => n.entityType === "TRUST").map((n) => n.id);
    if (trustNodeIds.length > 0) {
      const instrumentRows = await db
        .select({
          id: trustInstruments.id,
          trustEntityId: trustInstruments.trustEntityId,
          instrumentName: trustInstruments.instrumentName,
          instrumentType: trustInstruments.instrumentType,
          version: trustInstruments.version,
          status: trustInstruments.status,
          legalReviewStatus: trustInstruments.legalReviewStatus,
          classification: trustInstruments.classification,
        })
        .from(trustInstruments)
        .where(
          and(
            inArray(trustInstruments.tenantId, scope),
            inArray(trustInstruments.classification, allowed as Classification[]),
            inArray(trustInstruments.trustEntityId, trustNodeIds),
          ),
        )
        .limit(200);
      instruments = instrumentRows.map((r) => ({
        id: r.id,
        trustEntityId: r.trustEntityId,
        instrumentName: r.instrumentName,
        instrumentType: r.instrumentType,
        version: r.version,
        status: r.status,
        legalReviewStatus: r.legalReviewStatus,
        classification: r.classification,
      }));
      instrumentsAvailable = true;
    } else {
      instrumentsUnavailableReason = "No trust entity is visible within your authorized scope.";
    }
  }

  // ── summary (shape counts only — never row values) ───────────────────────
  const byEntityType: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  for (const n of nodes) {
    byEntityType[n.entityType] = (byEntityType[n.entityType] ?? 0) + 1;
    byCountry[n.countryCode] = (byCountry[n.countryCode] ?? 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    authorityNote:
      "Governed projection of the canonical Organization & Ownership, Family Trust and entity registries. Visibility only: this view confers no ownership, custody, administration, governance or decision authority over any node it renders.",
    nodes,
    edges,
    instruments,
    instrumentsAvailable,
    instrumentsUnavailableReason,
    summary: {
      entities: nodes.length,
      ownershipEdges: ownershipAllowed ? edges.length : -1, // -1 = facet unavailable (no count leaked)
      byEntityType,
      byCountry,
    },
  };
}
