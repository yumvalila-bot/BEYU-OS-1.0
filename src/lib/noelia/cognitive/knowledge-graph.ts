/**
 * NOELIA — INSTITUTIONAL KNOWLEDGE GRAPH.
 *
 * A bounded, permission-aware view over `noelia_kg_edges` plus the recorded
 * institutional graph that already exists relationally (legal_entities.parent).
 *
 * Design constraints honoured here:
 *   • Authorization and classification filtering happen IN THE QUERY, before any
 *     row leaves PostgreSQL. An unauthorized edge never reaches the model.
 *   • Traversal is bounded by depth AND breadth; there is no unbounded recursion.
 *   • The graph is derived evidence. An edge is never treated as authority, and
 *     an OBSERVED edge is still only as authoritative as its `provenance` record.
 *   • Write paths are proposal-only through the governed action path; nothing in
 *     this module mutates an authoritative record.
 */

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { noeliaKgEdges } from "@/db/schema";
import { legalEntities } from "@/db/schema";
import { knowledgeSources } from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { can } from "@/lib/authz";
import { classificationsAtOrBelow } from "@/lib/constants";
import { ID_PREFIX, newId } from "@/lib/ids";
import type { NoeliaAuthorizedScope } from "@/lib/noelia/types";

export const KG_RELATIONS = [
  "HAS_LEGAL_ENTITY",
  "PARENT_OF",
  "REGISTERED_IN",
  "OWNS_DOCUMENT",
  "CITES_DOCUMENT",
  "GOVERNS",
  "DELIVERS_PROJECT",
  "HOLDS_ASSET",
  "OWNS_RISK",
  "PURSUES_OBJECTIVE",
  "RECORDED_DECISION",
  "DECISION_CONCERNS",
  "SUPERSEDES",
] as const;
export type KgRelation = (typeof KG_RELATIONS)[number];

export type KgEdgeView = {
  id: string;
  fromType: string;
  fromRef: string;
  relation: string;
  toType: string;
  toRef: string;
  origin: "OBSERVED" | "DERIVED" | "SIMULATED";
  provenance: string;
  confidence: number | null;
  classification: string;
};

export type KgNeighbourhood = {
  root: { type: string; ref: string } | null;
  depth: number;
  edges: KgEdgeView[];
  nodes: Array<{ type: string; ref: string; label: string }>;
  /** Relations requested but not traversed because of authorization. */
  denied: Array<{ relation: string; reason: string }>;
  truncated: boolean;
};

function requireContext(): void {
  if (!hasDatabaseTransactionContext()) {
    throw new Error("NOELIA knowledge graph requires canonical transaction-scoped tenant context.");
  }
}

function requireRead(principal: Principal) {
  const decision = can(principal, "ai:noelia.query");
  if (!decision.allowed) throw new Error(`Knowledge graph read denied: ${decision.reason}`);
}

/**
 * Fetch the caller's authorized neighbourhood around a subject.
 *
 * Depth is capped at 3 by construction: each hop runs a separate bounded query
 * rather than a recursive CTE, so a pathological graph cannot exhaust resources.
 */
export async function neighbourhood(input: {
  principal: Principal;
  scope: NoeliaAuthorizedScope;
  subjectType: string;
  subjectRef: string;
  depth?: number;
  limit?: number;
}): Promise<KgNeighbourhood> {
  requireContext();
  requireRead(input.principal);

  const depth = Math.min(3, Math.max(1, Math.trunc(input.depth ?? 1)));
  const perHopLimit = Math.min(120, Math.max(1, Math.trunc(input.limit ?? 40)));
  const allowed = classificationsAtOrBelow(input.principal.clearance);
  const tenantIds = input.scope.tenantIds;

  if (tenantIds.length === 0) {
    return {
      root: { type: input.subjectType, ref: input.subjectRef },
      depth,
      edges: [],
      nodes: [],
      denied: [{ relation: "*", reason: "Caller has no authorized tenant scope." }],
      truncated: false,
    };
  }

  const seen = new Set<string>();
  const edgesById = new Map<string, KgEdgeView>();
  const nodes = new Map<string, { type: string; ref: string; label: string }>();
  let truncated = false;

  const frontier: Array<{ type: string; ref: string }> = [
    { type: input.subjectType, ref: input.subjectRef },
  ];
  nodes.set(`${input.subjectType}:${input.subjectRef}`, {
    type: input.subjectType,
    ref: input.subjectRef,
    label: input.subjectRef,
  });

  for (let hop = 0; hop < depth; hop += 1) {
    const next: Array<{ type: string; ref: string }> = [];
    for (const cursor of frontier) {
      const rows = await db
        .select({
          id: noeliaKgEdges.id,
          fromType: noeliaKgEdges.fromType,
          fromRef: noeliaKgEdges.fromRef,
          relation: noeliaKgEdges.relation,
          toType: noeliaKgEdges.toType,
          toRef: noeliaKgEdges.toRef,
          origin: noeliaKgEdges.origin,
          provenance: noeliaKgEdges.provenance,
          confidence: noeliaKgEdges.confidence,
          classification: noeliaKgEdges.classification,
        })
        .from(noeliaKgEdges)
        .where(
          and(
            inArray(noeliaKgEdges.tenantId, tenantIds),
            inArray(noeliaKgEdges.classification, allowed),
            isNull(noeliaKgEdges.effectiveTo),
            eq(noeliaKgEdges.fromType, cursor.type),
            eq(noeliaKgEdges.fromRef, cursor.ref),
          ),
        )
        .limit(perHopLimit);

      if (rows.length === perHopLimit) truncated = true;

      for (const row of rows) {
        if (edgesById.has(row.id)) continue;
        edgesById.set(row.id, {
          id: row.id,
          fromType: row.fromType,
          fromRef: row.fromRef,
          relation: row.relation,
          toType: row.toType,
          toRef: row.toRef,
          origin: (row.origin as KgEdgeView["origin"]) ?? "OBSERVED",
          provenance: row.provenance,
          confidence: row.confidence === null ? null : Number(row.confidence),
          classification: row.classification,
        });
        const key = `${row.toType}:${row.toRef}`;
        if (!nodes.has(key) && !seen.has(key)) {
          nodes.set(key, { type: row.toType, ref: row.toRef, label: row.toRef });
          next.push({ type: row.toType, ref: row.toRef });
          seen.add(key);
        }
      }
    }
    frontier.length = 0;
    frontier.push(...next);
    if (frontier.length === 0) break;
  }

  return {
    root: { type: input.subjectType, ref: input.subjectRef },
    depth,
    edges: [...edgesById.values()],
    nodes: [...nodes.values()],
    denied: [],
    truncated,
  };
}

/**
 * Project the RECORDED institutional graph from `legal_entities`.
 *
 * This is a DERIVED view: the edges are computed from the canonical parent
 * pointer. It is exposed so the Command Centre and the graph tool can show real
 * structure without requiring anyone to have hand-loaded `noelia_kg_edges`.
 */
export async function recordedEntityGraph(input: {
  principal: Principal;
  scope: NoeliaAuthorizedScope;
  limit?: number;
}): Promise<{ nodes: Array<{ id: string; label: string; type: string }>; edges: Array<{ fromId: string; toId: string; relation: string }> }> {
  requireContext();
  requireRead(input.principal);

  const allowed = classificationsAtOrBelow(input.principal.clearance);
  const tenantIds = input.scope.tenantIds;
  if (tenantIds.length === 0) return { nodes: [], edges: [] };

  const rows = await db
    .select({
      id: legalEntities.id,
      code: legalEntities.code,
      legalName: legalEntities.legalName,
      parentId: legalEntities.parentEntityId,
      entityType: legalEntities.entityType,
    })
    .from(legalEntities)
    .where(
      and(
        inArray(legalEntities.tenantId, tenantIds),
        inArray(legalEntities.classification, allowed),
        isNull(legalEntities.effectiveTo),
      ),
    )
    .limit(Math.min(300, Math.max(1, Math.trunc(input.limit ?? 120))));

  const ids = new Set(rows.map((r) => r.id));
  return {
    nodes: rows.map((r) => ({ id: r.id, label: `${r.code} — ${r.legalName}`, type: "ENTITY" })),
    edges: rows
      .filter((r) => r.parentId && ids.has(r.parentId))
      .map((r) => ({ fromId: r.parentId as string, toId: r.id, relation: "PARENT_OF" })),
  };
}

export type KgEdgeProposal = {
  tenantId: string;
  legalEntityId?: string | null;
  countryCode?: string | null;
  classification: string;
  fromType: string;
  fromRef: string;
  relation: KgRelation;
  toType: string;
  toRef: string;
  provenance: string;
  sourceRef?: string | null;
  origin: "OBSERVED" | "DERIVED";
  confidence?: number | null;
};

/**
 * Validate an edge PROPOSAL without persisting it.
 *
 * The governed action path (human approval → execute) is the only route that
 * writes `noelia_kg_edges`. This function exists so a caller can check a
 * proposal before requesting approval, and so the write path has exactly one
 * validator. It returns the row that WOULD be written.
 */
export function validateEdgeProposal(
  proposal: KgEdgeProposal,
): { ok: true; row: typeof noeliaKgEdges.$inferInsert } | { ok: false; reason: string } {
  if (!proposal.provenance || proposal.provenance.trim().length < 3) {
    return { ok: false, reason: "An edge must declare the authoritative provenance that asserts it." };
  }
  if (proposal.fromType === proposal.toType && proposal.fromRef === proposal.toRef) {
    return { ok: false, reason: "Self-edges carry no institutional meaning and are rejected." };
  }
  if (!(KG_RELATIONS as readonly string[]).includes(proposal.relation)) {
    return { ok: false, reason: `Relation '${proposal.relation}' is outside the closed relation vocabulary.` };
  }
  if (
    proposal.confidence !== undefined &&
    proposal.confidence !== null &&
    (proposal.confidence < 0 || proposal.confidence > 1)
  ) {
    return { ok: false, reason: "Edge confidence must lie in [0,1]." };
  }
  return {
    ok: true,
    row: {
      id: newId(ID_PREFIX.kgEdge),
      tenantId: proposal.tenantId,
      legalEntityId: proposal.legalEntityId ?? null,
      countryCode: proposal.countryCode ?? null,
      classification: proposal.classification as never,
      fromType: proposal.fromType,
      fromRef: proposal.fromRef,
      relation: proposal.relation,
      toType: proposal.toType,
      toRef: proposal.toRef,
      provenance: proposal.provenance,
      sourceRef: proposal.sourceRef ?? null,
      origin: proposal.origin,
      confidence: proposal.confidence === null || proposal.confidence === undefined
        ? null
        : String(proposal.confidence),
    },
  };
}

/** Bounded document lookup used by the graph tool to label DOCUMENT nodes. */
export async function documentLabels(input: {
  principal: Principal;
  scope: NoeliaAuthorizedScope;
  refs: string[];
}): Promise<Map<string, string>> {
  requireContext();
  requireRead(input.principal);
  if (input.refs.length === 0) return new Map();
  const allowed = classificationsAtOrBelow(input.principal.clearance);
  const rows = await db
    .select({ id: knowledgeSources.id, code: knowledgeSources.code, title: knowledgeSources.title })
    .from(knowledgeSources)
    .where(
      and(
        inArray(knowledgeSources.id, input.refs.slice(0, 100)),
        inArray(knowledgeSources.classification, allowed),
      ),
    );
  return new Map(rows.map((r) => [r.id, `${r.code} — ${r.title}`]));
}
