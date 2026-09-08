/**
 * BEYU Foundation OS — structure simulator (pure, deterministic).
 *
 * Compares a CURRENT structure graph against a PROPOSED graph and derives
 * before/after deltas plus impact prompts across legal, governance, tax,
 * funding, workforce and compliance dimensions. The simulator NEVER executes
 * changes — it produces review tasks and required approvals.
 */

export type StructureNode = {
  id: string;
  kind: string; // HOLDING | COMPANY | FOUNDATION | TRUST | NONPROFIT | BRANCH | PROGRAM
  label: string;
  jurisdiction: string;
  attributes?: Record<string, string>;
};

export type StructureEdge = {
  from: string;
  to: string;
  relation: string; // OWNS | CONTROLS | FUNDS | GOVERNS | EMPLOYS | CONTRACTS
  detail?: string;
};

export type StructureGraph = { nodes: StructureNode[]; edges: StructureEdge[] };

export type StructureDiff = {
  addedNodes: StructureNode[];
  removedNodes: StructureNode[];
  changedNodes: Array<{ before: StructureNode; after: StructureNode; fields: string[] }>;
  addedEdges: StructureEdge[];
  removedEdges: StructureEdge[];
};

export type StructureImpact = {
  dimension: "LEGAL" | "GOVERNANCE" | "TAX" | "FUNDING" | "WORKFORCE" | "COMPLIANCE" | "RISK";
  finding: string;
  severity: "INFO" | "REVIEW" | "BLOCKER";
};

export type SimulationResult = {
  question: string;
  diff: StructureDiff;
  impacts: StructureImpact[];
  requiredApprovals: string[];
  implementationTasks: string[];
};

function edgeKey(e: StructureEdge): string {
  return `${e.from}>${e.to}:${e.relation}`;
}

export function diffStructures(before: StructureGraph, after: StructureGraph): StructureDiff {
  const beforeNodes = new Map(before.nodes.map((n) => [n.id, n]));
  const afterNodes = new Map(after.nodes.map((n) => [n.id, n]));
  const addedNodes = after.nodes.filter((n) => !beforeNodes.has(n.id));
  const removedNodes = before.nodes.filter((n) => !afterNodes.has(n.id));
  const changedNodes: StructureDiff["changedNodes"] = [];
  for (const [id, a] of afterNodes) {
    const b = beforeNodes.get(id);
    if (!b) continue;
    const fields: string[] = [];
    if (a.kind !== b.kind) fields.push("kind");
    if (a.label !== b.label) fields.push("label");
    if (a.jurisdiction !== b.jurisdiction) fields.push("jurisdiction");
    if (JSON.stringify(a.attributes ?? {}) !== JSON.stringify(b.attributes ?? {})) fields.push("attributes");
    if (fields.length > 0) changedNodes.push({ before: b, after: a, fields });
  }
  const beforeEdges = new Set(before.edges.map(edgeKey));
  const afterEdges = new Set(after.edges.map(edgeKey));
  return {
    addedNodes,
    removedNodes,
    changedNodes,
    addedEdges: after.edges.filter((e) => !beforeEdges.has(edgeKey(e))),
    removedEdges: before.edges.filter((e) => !afterEdges.has(edgeKey(e))),
  };
}

export function simulateStructureChange(question: string, before: StructureGraph, after: StructureGraph): SimulationResult {
  const diff = diffStructures(before, after);
  const impacts: StructureImpact[] = [];
  const requiredApprovals: string[] = [];
  const implementationTasks: string[] = [];

  const addedFoundations = diff.addedNodes.filter((n) => n.kind === "FOUNDATION" || n.kind === "NONPROFIT" || n.kind === "TRUST");
  const removedEntities = diff.removedNodes;
  const crossBorder = diff.addedEdges.filter((e) => {
    const from = after.nodes.find((n) => n.id === e.from);
    const to = after.nodes.find((n) => n.id === e.to);
    return from && to && from.jurisdiction !== to.jurisdiction;
  });
  const fundingEdges = diff.addedEdges.filter((e) => e.relation === "FUNDS");

  if (addedFoundations.length > 0) {
    impacts.push({
      dimension: "LEGAL",
      severity: "REVIEW",
      finding: `${addedFoundations.length} new nonprofit vehicle(s) (${addedFoundations.map((n) => n.label).join(", ")}) require registration, regulator approval and constituent documents.`,
    });
    impacts.push({
      dimension: "GOVERNANCE",
      severity: "REVIEW",
      finding: "New vehicle(s) need a constituted board, authority matrix and conflict-of-interest coverage before activation.",
    });
    impacts.push({
      dimension: "TAX",
      severity: "REVIEW",
      finding: "Tax status of each new vehicle starts UNDER_REVIEW; exemption must be evidenced, never assumed.",
    });
    impacts.push({
      dimension: "COMPLIANCE",
      severity: "REVIEW",
      finding: "Registration triggers new filing calendars; obligations must be entered in the compliance registry before operations begin.",
    });
    requiredApprovals.push("Board resolution approving the new vehicle(s)");
    implementationTasks.push("Open formation case(s) for each new vehicle");
  }
  if (removedEntities.length > 0) {
    impacts.push({
      dimension: "LEGAL",
      severity: "BLOCKER",
      finding: `${removedEntities.length} entit(y/ies) removed (${removedEntities.map((n) => n.label).join(", ")}): dissolution/merger requires counsel sign-off, creditor treatment and asset succession.`,
    });
    impacts.push({
      dimension: "RISK",
      severity: "REVIEW",
      finding: "Entity removal concentrates liability and contract novation risk; map every contract, asset and workforce link first.",
    });
    requiredApprovals.push("Board resolution + counsel opinion for dissolution/merger");
    implementationTasks.push("Produce dissolution/merger plan with creditor and asset treatment");
  }
  if (crossBorder.length > 0) {
    impacts.push({
      dimension: "TAX",
      severity: "REVIEW",
      finding: `${crossBorder.length} new cross-border relationship(s): withholding, transfer-pricing and donor-benefit positions need review.`,
    });
    impacts.push({
      dimension: "COMPLIANCE",
      severity: "REVIEW",
      finding: "Cross-border flows add licensing, sanctions-screening and foreign-funding reporting duties.",
    });
    implementationTasks.push("Record cross-border flows in the tax and compliance review queues");
  }
  if (fundingEdges.length > 0) {
    impacts.push({
      dimension: "FUNDING",
      severity: "INFO",
      finding: `${fundingEdges.length} new funding relationship(s): trace each to a fund with explicit restrictions.`,
    });
    implementationTasks.push("Create fund records and restriction rules for new funding lines");
  }
  const movedJurisdiction = diff.changedNodes.filter((c) => c.fields.includes("jurisdiction"));
  if (movedJurisdiction.length > 0) {
    impacts.push({
      dimension: "LEGAL",
      severity: "BLOCKER",
      finding: `${movedJurisdiction.length} entit(y/ies) changed jurisdiction: re-registration, re-licensing and tax re-determination are mandatory.`,
    });
    requiredApprovals.push("Board resolution + counsel opinions in both jurisdictions");
  }
  if (impacts.length === 0) {
    impacts.push({ dimension: "RISK", severity: "INFO", finding: "No structural delta detected; before and after graphs are identical." });
  }
  requiredApprovals.push("Foundation Director sign-off on the simulation review");
  implementationTasks.push("Convert approved simulation into governed formation/restructuring tasks");

  return { question, diff, impacts, requiredApprovals: [...new Set(requiredApprovals)], implementationTasks };
}
