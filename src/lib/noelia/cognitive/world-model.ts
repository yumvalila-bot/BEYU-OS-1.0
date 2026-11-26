/**
 * NOELIA — BEYU WORLD MODEL.
 *
 * A governed representation of the institution, assembled ONLY from records the
 * caller is authorized to read. Every node and edge declares its epistemic
 * origin:
 *
 *   RECORDED  — read directly from an authoritative table/column.
 *   DERIVED   — computed by a documented rule over recorded data.
 *   ESTIMATED — a bounded estimate with an explicit method (stamped ESTIMATED).
 *   SIMULATED — produced by a scenario engine (never a record).
 *   PREDICTED — a forward projection (never a record).
 *
 * Hard rules enforced here:
 *   • No invented value. A field with no authorized source is `null` with status
 *     UNAVAILABLE — never a zero, never a guess, never sample data.
 *   • Classification ceiling is pushed into the SQL predicate, not applied after
 *     retrieval — unauthorized rows never enter the process.
 *   • Entity and tenant isolation use the resolved authorized scope.
 *   • The World Model is read-only. It cannot post, approve or mutate.
 *
 * This module deliberately reuses the relational database. A graph database is
 * NOT introduced (master prompt Part VIII): MCM/entity/ownership relationships
 * are already relational and are read with bounded depth.
 */

import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { legalEntities, tenants } from "@/db/schema";
import { knowledgeSources } from "@/db/schema";
import { noeliaDecisionRecords, noeliaKgEdges, noeliaSimulations } from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { can } from "@/lib/authz";
import { classificationsAtOrBelow, classificationRank, type Classification } from "@/lib/constants";
import type { NoeliaAuthorizedScope } from "@/lib/noelia/types";
import type { NoeliaClaim, NoeliaClaimKind } from "./reasoning";

export const WORLD_MODEL_NODE_TYPES = [
  "ENTITY",
  "COMPANY",
  "COUNTRY",
  "DOCUMENT",
  "DECISION",
  "PROJECT",
  "ASSET",
  "RISK",
  "OBJECTIVE",
  "TENANT",
] as const;
export type WorldModelNodeType = (typeof WORLD_MODEL_NODE_TYPES)[number];

export type WorldModelState = "RECORDED" | "DERIVED" | "ESTIMATED" | "SIMULATED" | "PREDICTED" | "UNAVAILABLE";

export type WorldModelNode = {
  id: string;
  type: WorldModelNodeType;
  label: string;
  state: WorldModelState;
  classification: Classification | null;
  /** Where this came from; for RECORDED nodes this is `table.column`. */
  provenance: string;
  /** Structured attributes, each carrying its own state. */
  attributes: Record<string, { value: string | number | null; state: WorldModelState }>;
};

export type WorldModelEdge = {
  fromId: string;
  relation: string;
  toId: string;
  state: WorldModelState;
  provenance: string;
};

export type WorldModel = {
  generatedAt: string;
  tenantIds: string[];
  countryCodes: string[];
  nodes: WorldModelNode[];
  edges: WorldModelEdge[];
  /** Recorded facts as typed claims — the only channel to the answer. */
  claims: NoeliaClaim[];
  /** What could NOT be represented, and why. Never silently omitted. */
  unavailable: Array<{ subject: string; reason: string }>;
  counts: {
    recorded: number;
    derived: number;
    estimated: number;
    simulated: number;
    predicted: number;
    unavailable: number;
  };
};

export type WorldModelQuery = {
  principal: Principal;
  scope: NoeliaAuthorizedScope;
  traceId: string;
  /** Optional focus: a single legal entity id. */
  legalEntityId?: string | null;
  /** Include recorded decision memory nodes. */
  includeDecisions?: boolean;
  /** Include registered knowledge documents. */
  includeDocuments?: boolean;
  /** Include simulation provenance nodes (always labelled SIMULATED). */
  includeSimulations?: boolean;
  /** Bounded fan-out. */
  limit?: number;
};

function requireContext(): void {
  if (!hasDatabaseTransactionContext()) {
    throw new Error("NOELIA world model requires canonical transaction-scoped tenant context.");
  }
}

function requireRead(principal: Principal) {
  const decision = can(principal, "ai:noelia.query");
  if (!decision.allowed) throw new Error(`World model read denied: ${decision.reason}`);
  return decision;
}

const clamp = (n: number) => Math.min(200, Math.max(1, Math.trunc(n)));

/**
 * Assemble the authorized slice of the BEYU world model.
 *
 * The caller receives recorded institutional structure, a bounded relationship
 * graph and typed claims. Nothing here asserts a financial value, a performance
 * indicator or an asset valuation — those live behind Finance OS reads and are
 * reached through the specialist capabilities, not invented here.
 */
export async function buildWorldModel(query: WorldModelQuery): Promise<WorldModel> {
  requireContext();
  requireRead(query.principal);

  const limit = clamp(query.limit ?? 60);
  const allowed = classificationsAtOrBelow(query.principal.clearance);
  const ceilingRank = classificationRank(query.principal.clearance);

  const tenantIds = query.scope.tenantIds;
  if (tenantIds.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      tenantIds: [],
      countryCodes: [],
      nodes: [],
      edges: [],
      claims: [],
      unavailable: [{ subject: "INSTITUTIONAL_STRUCTURE", reason: "Caller has no authorized tenant scope." }],
      counts: { recorded: 0, derived: 0, estimated: 0, simulated: 0, predicted: 0, unavailable: 1 },
    };
  }

  /* ------------------------------------------------------------- entities */
  const entityPredicate = query.legalEntityId
    ? and(
        inArray(legalEntities.tenantId, tenantIds),
        eq(legalEntities.id, query.legalEntityId),
        inArray(legalEntities.classification, allowed),
        isNull(legalEntities.effectiveTo),
      )
    : and(
        inArray(legalEntities.tenantId, tenantIds),
        inArray(legalEntities.classification, allowed),
        isNull(legalEntities.effectiveTo),
      );

  const entityRows = await db
    .select({
      id: legalEntities.id,
      code: legalEntities.code,
      legalName: legalEntities.legalName,
      entityType: legalEntities.entityType,
      parentId: legalEntities.parentEntityId,
      countryCode: legalEntities.countryCode,
      sectorCode: legalEntities.sectorCode,
      status: legalEntities.status,
      classification: legalEntities.classification,
      functionalCurrency: legalEntities.functionalCurrency,
      tenantId: legalEntities.tenantId,
    })
    .from(legalEntities)
    .where(entityPredicate)
    .limit(limit);

  /* --------------------------------------------------------------- tenants */
  const tenantRows = await db
    .select({
      id: tenants.id,
      code: tenants.code,
      name: tenants.name,
      type: tenants.type,
      countryCode: tenants.countryCode,
      classification: tenants.classification,
    })
    .from(tenants)
    .where(and(inArray(tenants.id, tenantIds), inArray(tenants.classification, allowed)))
    .limit(limit);

  const nodes: WorldModelNode[] = [];
  const edges: WorldModelEdge[] = [];
  const claims: NoeliaClaim[] = [];
  const unavailable: Array<{ subject: string; reason: string }> = [];
  const nodeIds = new Set<string>();

  const pushNode = (node: WorldModelNode) => {
    if (nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
  };

  for (const tenant of tenantRows) {
    pushNode({
      id: tenant.id,
      type: "TENANT",
      label: `${tenant.code} — ${tenant.name}`,
      state: "RECORDED",
      classification: tenant.classification,
      provenance: "tenants",
      attributes: {
        code: { value: tenant.code, state: "RECORDED" },
        tenantType: { value: tenant.type, state: "RECORDED" },
        countryCode: { value: tenant.countryCode, state: "RECORDED" },
      },
    });
  }

  for (const entity of entityRows) {
    pushNode({
      id: entity.id,
      type: "ENTITY",
      label: `${entity.code} — ${entity.legalName}`,
      state: "RECORDED",
      classification: entity.classification,
      provenance: "legal_entities",
      attributes: {
        entityType: { value: entity.entityType, state: "RECORDED" },
        status: { value: entity.status, state: "RECORDED" },
        countryCode: { value: entity.countryCode, state: "RECORDED" },
        functionalCurrency: { value: entity.functionalCurrency, state: "RECORDED" },
        // A sector CLASSIFICATION is recorded; a financial VALUE is not
        // available here and must never be implied by this model.
        sectorCode: {
          value: entity.sectorCode,
          state: entity.sectorCode ? "RECORDED" : "UNAVAILABLE",
        },
      },
    });

    edges.push({
      fromId: entity.tenantId,
      relation: "HAS_LEGAL_ENTITY",
      toId: entity.id,
      state: "RECORDED",
      provenance: "legal_entities.tenant_id",
    });

    if (entity.parentId) {
      edges.push({
        fromId: entity.parentId,
        relation: "PARENT_OF",
        toId: entity.id,
        state: "RECORDED",
        provenance: "legal_entities.parent_entity_id",
      });
    }

    if (entity.countryCode) {
      pushNode({
        id: `COUNTRY_${entity.countryCode}`,
        type: "COUNTRY",
        label: entity.countryCode,
        state: "RECORDED",
        classification: null,
        provenance: "countries.code",
        attributes: { code: { value: entity.countryCode, state: "RECORDED" } },
      });
      edges.push({
        fromId: entity.id,
        relation: "REGISTERED_IN",
        toId: `COUNTRY_${entity.countryCode}`,
        state: "RECORDED",
        provenance: "legal_entities.country_code",
      });
    }

    claims.push({
      id: `wm-entity-${entity.id}`,
      kind: "FACT",
      statement: `${entity.legalName} (${entity.code}) is recorded as ${entity.entityType} in status ${entity.status}.`,
      evidence: [`legal_entities:${entity.id}`],
      confidence: 1,
      brain: "INSTITUTIONAL",
    });
  }

  /* ------------------------------------------------------------- documents */
  if (query.includeDocuments !== false) {
    const docRows = await db
      .select({
        id: knowledgeSources.id,
        code: knowledgeSources.code,
        title: knowledgeSources.title,
        domain: knowledgeSources.domain,
        classification: knowledgeSources.classification,
        authorityStatus: knowledgeSources.authorityStatus,
        tenantId: knowledgeSources.tenantId,
      })
      .from(knowledgeSources)
      .where(
        and(
          inArray(knowledgeSources.classification, allowed),
          or(
            isNull(knowledgeSources.tenantId),
            inArray(knowledgeSources.tenantId, tenantIds),
          ),
        ),
      )
      .limit(limit);

    for (const doc of docRows) {
      pushNode({
        id: doc.id,
        type: "DOCUMENT",
        label: `${doc.code} — ${doc.title}`,
        state: "RECORDED",
        classification: doc.classification,
        provenance: "knowledge_sources",
        attributes: {
          domain: { value: doc.domain, state: "RECORDED" },
          authorityStatus: { value: doc.authorityStatus, state: "RECORDED" },
        },
      });
      if (doc.tenantId) {
        edges.push({
          fromId: doc.tenantId,
          relation: "OWNS_DOCUMENT",
          toId: doc.id,
          state: "RECORDED",
          provenance: "knowledge_sources.tenant_id",
        });
      }
    }
  }

  /* -------------------------------------------------------------- decisions */
  if (query.includeDecisions !== false) {
    const decisionRows = await db
      .select({
        id: noeliaDecisionRecords.id,
        code: noeliaDecisionRecords.decisionCode,
        title: noeliaDecisionRecords.title,
        status: noeliaDecisionRecords.status,
        decidedOn: noeliaDecisionRecords.decidedOn,
        classification: noeliaDecisionRecords.classification,
        tenantId: noeliaDecisionRecords.tenantId,
        legalEntityId: noeliaDecisionRecords.legalEntityId,
      })
      .from(noeliaDecisionRecords)
      .where(
        and(
          inArray(noeliaDecisionRecords.tenantId, tenantIds),
          inArray(noeliaDecisionRecords.classification, allowed),
        ),
      )
      .limit(limit);

    for (const decision of decisionRows) {
      pushNode({
        id: decision.id,
        type: "DECISION",
        label: `${decision.code} — ${decision.title}`,
        state: "RECORDED",
        classification: decision.classification,
        provenance: "noelia_decision_records",
        attributes: {
          status: { value: decision.status, state: "RECORDED" },
          decidedOn: { value: decision.decidedOn, state: "RECORDED" },
        },
      });
      edges.push({
        fromId: decision.tenantId,
        relation: "RECORDED_DECISION",
        toId: decision.id,
        state: "RECORDED",
        provenance: "noelia_decision_records.tenant_id",
      });
      if (decision.legalEntityId) {
        edges.push({
          fromId: decision.legalEntityId,
          relation: "DECISION_CONCERNS",
          toId: decision.id,
          state: "RECORDED",
          provenance: "noelia_decision_records.legal_entity_id",
        });
      }
    }
  }

  /* ------------------------------------------------------------ simulations */
  if (query.includeSimulations === true) {
    const simRows = await db
      .select({
        id: noeliaSimulations.id,
        objective: noeliaSimulations.objective,
        label: noeliaSimulations.scenarioLabel,
        tenantId: noeliaSimulations.tenantId,
        classification: noeliaSimulations.classification,
      })
      .from(noeliaSimulations)
      .where(
        and(
          inArray(noeliaSimulations.tenantId, tenantIds),
          inArray(noeliaSimulations.classification, allowed),
        ),
      )
      .limit(Math.min(limit, 20));

    for (const sim of simRows) {
      pushNode({
        id: sim.id,
        type: "OBJECTIVE",
        label: `SIMULATION · ${sim.label} — ${sim.objective}`,
        // The ONLY place a SIMULATED node may appear, and it is labelled.
        state: "SIMULATED",
        classification: sim.classification,
        provenance: "noelia_simulations",
        attributes: {
          resultClass: { value: "SIMULATION", state: "SIMULATED" },
        },
      });
    }
  }

  /* ---------------------------------------------------------- stored edges */
  const storedEdges = await db
    .select({
      fromType: noeliaKgEdges.fromType,
      fromRef: noeliaKgEdges.fromRef,
      relation: noeliaKgEdges.relation,
      toType: noeliaKgEdges.toType,
      toRef: noeliaKgEdges.toRef,
      origin: noeliaKgEdges.origin,
      provenance: noeliaKgEdges.provenance,
    })
    .from(noeliaKgEdges)
    .where(
      and(
        inArray(noeliaKgEdges.tenantId, tenantIds),
        inArray(noeliaKgEdges.classification, allowed),
        isNull(noeliaKgEdges.effectiveTo),
      ),
    )
    .limit(limit * 4);

  for (const edge of storedEdges) {
    if (!nodeIds.has(edge.fromRef) || !nodeIds.has(edge.toRef)) continue;
    edges.push({
      fromId: edge.fromRef,
      relation: edge.relation,
      toId: edge.toRef,
      state: edge.origin === "SIMULATED" ? "SIMULATED" : edge.origin === "DERIVED" ? "DERIVED" : "RECORDED",
      provenance: edge.provenance,
    });
  }

  /* ------------------------------------------------------------ unavailable */
  // Structural facts this model deliberately does NOT hold, stated explicitly
  // rather than approximated. This is the "never invent live enterprise data"
  // rule made visible to the reader.
  unavailable.push(
    {
      subject: "FINANCIAL_VALUES",
      reason:
        "Asset values, revenue and performance indicators are Finance OS records. Read them through finance.* capabilities; the world model does not estimate them.",
    },
    {
      subject: "PERSONAL_DATA",
      reason: "People and roles are represented only where an authorized institutional projection exists; personal records are not world-model material.",
    },
  );

  const counts = {
    recorded: nodes.filter((n) => n.state === "RECORDED").length,
    derived: nodes.filter((n) => n.state === "DERIVED").length,
    estimated: nodes.filter((n) => n.state === "ESTIMATED").length,
    simulated: nodes.filter((n) => n.state === "SIMULATED").length,
    predicted: nodes.filter((n) => n.state === "PREDICTED").length,
    unavailable: unavailable.length,
  };

  if (entityRows.length === 0) {
    claims.push({
      id: "wm-entity-none",
      kind: "UNKNOWN",
      statement: "No legal entity is visible within the caller's authorized and classification-bounded scope.",
      evidence: [],
      confidence: null,
      brain: "INSTITUTIONAL",
      limitation: "Absence within scope is not evidence that the institution has no entities.",
    });
  }

  void ceilingRank;

  return {
    generatedAt: new Date().toISOString(),
    tenantIds,
    countryCodes: query.scope.countryCodes,
    nodes,
    edges,
    claims,
    unavailable,
    counts,
  };
}

/**
 * Convert a world model into the tool-output envelope consumed by the existing
 * NOELIA runtime. Every line states its epistemic status; nothing is upgraded
 * to FACT unless it was RECORDED.
 */
export function worldModelToToolOutput(model: WorldModel): {
  findings: Array<{ label: string; value: string; kind: "FACT" | "INFERENCE" | "RECOMMENDATION" }>;
  sources: Array<{ kind: string; ref: string; label: string; authority: string }>;
  observedFacts: string[];
  derivedConclusions: string[];
  whatIsMissing: string[];
  limitations: string[];
  confidence: number;
  humanReviewRequired: boolean;
  metadata: Record<string, unknown>;
} {
  const stateToKind: Record<WorldModelState, NoeliaClaimKind> = {
    RECORDED: "FACT",
    DERIVED: "INFERENCE",
    ESTIMATED: "INFERENCE",
    SIMULATED: "SIMULATION",
    PREDICTED: "PREDICTION",
    UNAVAILABLE: "UNKNOWN",
  };

  const findings = model.nodes.map((node) => {
    const kind: "FACT" | "INFERENCE" | "RECOMMENDATION" =
      stateToKind[node.state] === "FACT"
        ? "FACT"
        : stateToKind[node.state] === "RECOMMENDATION"
          ? "RECOMMENDATION"
          : "INFERENCE";
    return {
      label: `${node.type} · ${node.state}`,
      value: node.label,
      kind,
    };
  });

  const sources = [
    ...new Set(model.nodes.map((n) => n.provenance)),
  ].map((ref) => ({
    kind: "TABLE",
    ref,
    label: `Institutional record: ${ref}`,
    authority: "BEYU_OS_CANONICAL",
  }));

  const observedFacts = model.nodes
    .filter((n) => n.state === "RECORDED")
    .map((n) => `${n.label} (${n.provenance})`);

  const derivedConclusions = [
    `${model.edges.length} recorded relationship(s) connect ${model.nodes.length} authorized node(s).`,
    `Graph contains ${model.counts.recorded} recorded, ${model.counts.derived} derived, ${model.counts.simulated} simulated node(s).`,
  ];

  const whatIsMissing = model.unavailable.map((u) => `${u.subject}: ${u.reason}`);

  return {
    findings,
    sources,
    observedFacts,
    derivedConclusions,
    whatIsMissing,
    limitations: [
      "World model is read-only and reflects authorized records at the request time; it is not a live feed.",
      "Simulated and predicted node states are never institutional records.",
    ],
    confidence: model.nodes.length === 0 ? 0.2 : model.counts.recorded > 0 ? 0.75 : 0.4,
    humanReviewRequired: false,
    metadata: {
      counts: model.counts,
      nodeTypes: WORLD_MODEL_NODE_TYPES,
      generatedAt: model.generatedAt,
    },
  };
}
