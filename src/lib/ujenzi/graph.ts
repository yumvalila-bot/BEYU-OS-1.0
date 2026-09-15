import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";

export async function traverseTwin(tenantId: string, projectId: string, startKind: string, startId: string, maxDepth = 8) {
  const edges = await db
    .select()
    .from(s.ujenziTwinEdges)
    .where(and(eq(s.ujenziTwinEdges.tenantId, tenantId), eq(s.ujenziTwinEdges.projectId, projectId)));
  const visited = new Set<string>();
  const path: { kind: string; id: string; depth: number }[] = [];
  function walk(kind: string, id: string, depth: number) {
    const key = `${kind}:${id}`;
    if (visited.has(key) || depth > maxDepth) return;
    visited.add(key);
    path.push({ kind, id, depth });
    for (const e of edges) {
      if (e.fromKind === kind && e.fromId === id) walk(e.toKind, e.toId, depth + 1);
    }
  }
  walk(startKind, startId, 0);
  return { nodes: path, edgeCount: edges.length };
}

export async function detectOrphans(tenantId: string, projectId: string) {
  const buildings = await db
    .select()
    .from(s.ujenziBuildings)
    .where(and(eq(s.ujenziBuildings.tenantId, tenantId), eq(s.ujenziBuildings.projectId, projectId)));
  const edges = await db
    .select()
    .from(s.ujenziTwinEdges)
    .where(and(eq(s.ujenziTwinEdges.tenantId, tenantId), eq(s.ujenziTwinEdges.projectId, projectId)));
  const linked = new Set(edges.filter((e) => e.toKind === "BUILDING").map((e) => e.toId));
  const orphanBuildings = buildings.filter((b) => !linked.has(b.id) && !b.siteId);
  return { orphanBuildings: orphanBuildings.map((b) => b.id) };
}

/** Directed cycle detection on CONTAINS-style twin edges. */
export async function detectTwinCycles(tenantId: string, projectId: string) {
  const edges = await db
    .select()
    .from(s.ujenziTwinEdges)
    .where(and(eq(s.ujenziTwinEdges.tenantId, tenantId), eq(s.ujenziTwinEdges.projectId, projectId)));
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const a = `${e.fromKind}:${e.fromId}`;
    const b = `${e.toKind}:${e.toId}`;
    adj.set(a, [...(adj.get(a) ?? []), b]);
  }
  const vis = new Map<string, number>();
  let cyclic = false;
  function dfs(n: string) {
    vis.set(n, 1);
    for (const m of adj.get(n) ?? []) {
      const st = vis.get(m) ?? 0;
      if (st === 1) cyclic = true;
      else if (st === 0) dfs(m);
    }
    vis.set(n, 2);
  }
  for (const k of adj.keys()) if ((vis.get(k) ?? 0) === 0) dfs(k);
  return { cyclic, edgeCount: edges.length };
}
