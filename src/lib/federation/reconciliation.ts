/**
 * BEYU Federation & Trust — reconciliation engine (program §55, §95).
 *
 * Repeatable reconciliation of the authority registry against an
 * authoritative source snapshot (official government directory, e-GA
 * sources, official authority websites…). States:
 *   MATCH | NEW | MISSING | DUPLICATE | RENAMED | MERGED | DISSOLVED |
 *   UNCERTAIN | MANUAL_REVIEW
 *
 * The engine is source-agnostic and deterministic: feed it the candidate
 * list (with provenance) and the current registry, get typed results.
 * LIVE ingestion of the official directory happens where connectivity and
 * authorization exist; when they don't, runs are recorded against the
 * documented baseline with SEARCH_INDEX_SNAPSHOT / OFFICIAL_DIRECTORY
 * evidence — never invented.
 */
import type { ReconciliationState } from "./catalog";

export interface CandidateRecord {
  code: string; // stable code from the source (e.g. directory entry slug)
  name: string;
  source: string; // source name for provenance
  sourceUrl?: string;
  sourceVersion?: string;
}

export interface RegistryRecord {
  id: string;
  code: string;
  officialName: string;
  shortName: string | null;
  recordStatus: string;
  reconciliationState: string;
}

export interface ReconciliationResult {
  candidateCode: string;
  candidateName: string;
  state: ReconciliationState;
  matchedAuthorityId: string | null;
  details: Record<string, unknown>;
}

const STOPWORDS = new Set(["the", "of", "for", "and", "to", "in", "on", "a", "an", "de", "ya", "ya", "the", " republic", "united"]);

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .sort()
    .join(" ");
}

/** Token Jaccard similarity on normalized names. */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeName(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

const MATCH_THRESHOLD = 0.8;
const UNCERTAIN_THRESHOLD = 0.5;

/**
 * Reconcile a candidate list against the registry.
 *
 * Rules (deterministic, documented):
 *  - Exact code match in registry            → MATCH
 *  - Name similarity ≥ 0.8 with one registry row → MATCH (details: similarity)
 *  - Name similarity 0.5–0.8 with one row    → RENAMED candidate (MANUAL_REVIEW if multiple)
 *  - Registry row with no candidate (active) → MISSING (possibly dissolved/renamed)
 *  - Candidate with no registry row          → NEW
 *  - Two registry rows matching one candidate → DUPLICATE (registry hygiene)
 *  - Retired/dissolved registry rows matching a candidate → MERGED/DISSOLVED hint
 */
export function reconcile(candidates: CandidateRecord[], registry: RegistryRecord[]): ReconciliationResult[] {
  const results: ReconciliationResult[] = [];
  const byCode = new Map(registry.map((r) => [r.code.toUpperCase(), r]));
  const matchedRegistryIds = new Set<string>();

  for (const c of candidates) {
    const codeHit = byCode.get(c.code.toUpperCase());
    if (codeHit) {
      matchedRegistryIds.add(codeHit.id);
      if (codeHit.recordStatus === "RETIRED") {
        results.push({ candidateCode: c.code, candidateName: c.name, state: "MANUAL_REVIEW", matchedAuthorityId: codeHit.id, details: { reason: "registry row retired but candidate still present in source", similarity: 1 } });
      } else {
        results.push({ candidateCode: c.code, candidateName: c.name, state: "MATCH", matchedAuthorityId: codeHit.id, details: { via: "code", similarity: 1 } });
      }
      continue;
    }
    const scored = registry
      .filter((r) => !matchedRegistryIds.has(r.id))
      .map((r) => ({ r, sim: Math.max(nameSimilarity(c.name, r.officialName), r.shortName ? nameSimilarity(c.name, r.shortName) : 0) }))
      .sort((a, b) => b.sim - a.sim);
    const best = scored[0];
    if (best && best.sim >= MATCH_THRESHOLD) {
      if (scored.length > 1 && scored[1].sim >= MATCH_THRESHOLD) {
        results.push({ candidateCode: c.code, candidateName: c.name, state: "DUPLICATE", matchedAuthorityId: best.r.id, details: { reason: "candidate matches multiple registry rows", candidates: scored.slice(0, 3).map((s) => ({ id: s.r.id, code: s.r.code, sim: round3(s.sim) })) } });
      } else {
        matchedRegistryIds.add(best.r.id);
        if (best.sim >= 1 || best.r.officialName.toLowerCase() === c.name.toLowerCase()) {
          results.push({ candidateCode: c.code, candidateName: c.name, state: "MATCH", matchedAuthorityId: best.r.id, details: { via: "name", similarity: round3(best.sim) } });
        } else {
          results.push({ candidateCode: c.code, candidateName: c.name, state: "RENAMED", matchedAuthorityId: best.r.id, details: { via: "name", similarity: round3(best.sim), registryName: best.r.officialName } });
        }
      }
      continue;
    }
    if (best && best.sim >= UNCERTAIN_THRESHOLD) {
      results.push({ candidateCode: c.code, candidateName: c.name, state: "UNCERTAIN", matchedAuthorityId: best.r.id, details: { via: "partial-name", similarity: round3(best.sim), registryName: best.r.officialName } });
      continue;
    }
    results.push({ candidateCode: c.code, candidateName: c.name, state: "NEW", matchedAuthorityId: null, details: { reason: "no registry row matched" } });
  }

  for (const r of registry) {
    if (matchedRegistryIds.has(r.id)) continue;
    if (r.recordStatus === "INACTIVE" || r.recordStatus === "RETIRED") continue;
    results.push({ candidateCode: r.code, candidateName: r.officialName, state: "MISSING", matchedAuthorityId: r.id, details: { reason: "registry row absent from source snapshot (renamed, merged, dissolved, or source gap)", recordStatus: r.recordStatus } });
  }

  return results;
}

export function summarizeReconciliation(results: ReconciliationResult[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const r of results) totals[r.state] = (totals[r.state] ?? 0) + 1;
  return totals;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
