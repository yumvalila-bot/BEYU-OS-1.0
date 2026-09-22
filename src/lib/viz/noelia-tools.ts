/**
 * BEYU Universal Dimensional Graphics Foundation — HIVE tool registration.
 *
 * ONE shared capability, NOT an OS: these tools extend the canonical Noelia
 * identity with governed, read-only visualization intelligence. Invariants:
 *
 *   • sideEffects NONE — Noelia can explain the dimension registry and
 *     summarize an authorized scene, but it can NEVER create scenes, register
 *     twins, export data, mutate sector records or post anything. CAP_POSTING
 *     stays LOCKED; material actions remain human-governed through the
 *     governed UI/API paths.
 *   • The registry enforces RBAC/ABAC + tenant/entity/country checks BEFORE
 *     any handler runs; the handlers re-authorize through the SAME adapter
 *     path the UI uses (no second data channel).
 *   • Outputs are honest: counts and statuses are FACT findings; anything the
 *     adapter could not supply is reported UNAVAILABLE / surfaced as a
 *     limitation — never fabricated, never imputed.
 *   • Summaries contain no row-level sector values: the scene summary is
 *     shape/status metadata (counts per dimension, epistemic status mix,
 *     declared limitations), so a tool response can never become a leak
 *     channel wider than the governed screen.
 */
import { z } from "zod";
import type { NoeliaToolRegistry } from "@/lib/noelia/tool-registry";
import { noeliaToolOutputSchema } from "@/lib/noelia/default-tools";
import type { NoeliaToolOutput } from "@/lib/noelia/types";
import type { ToolInvocationContext } from "@/lib/noelia/types";
import { CANONICAL_DIMENSIONS, VIZ_SECTOR_CODES, parseDimensionCode, type VizSectorCode } from "./dimensions";
import { assertSectorAccess } from "./authorization";
import type { NoeliaFinding } from "@/lib/noelia/types";
import { registryFor, buildGovernedManifest } from "./service";
import { getAdapter } from "./adapters";

const EXPLAIN_SCHEMA = z
  .object({
    sector: z.enum(VIZ_SECTOR_CODES as unknown as [string, ...string[]]).optional(),
  })
  .passthrough()
  .optional();

const SUMMARIZE_SCHEMA = z
  .object({
    sector: z.enum(VIZ_SECTOR_CODES as unknown as [string, ...string[]]),
    dimensions: z.array(z.string()).optional(),
  })
  .passthrough()
  .optional();

const AUDIT = { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" } as const;

export function registerVizTools(registry: NoeliaToolRegistry): void {
  registry.register({
    name: "viz.dimensions.explain",
    permission: "viz:registry.read",
    classification: "INTERNAL",
    risk: "LOW",
    description:
      "Explain the Universal Dimension Registry (1D–8D, governed 9D+ extensions, XD): what each dimension means, what activates it, and which sector adapter supplies it today. Read-only; creates no scene and grants no sector access.",
    metadata: {
      stableId: "cap-viz-dimensions-explain",
      version: "1.0.0",
      ownerRole: "PLATFORM_ADMIN",
      domain: "VISUALIZATION",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: AUDIT,
      inputSchema: EXPLAIN_SCHEMA,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context: ToolInvocationContext, input: unknown): Promise<NoeliaToolOutput> => explainDimensions(context, input),
  });

  registry.register({
    name: "viz.scene.summarize",
    permission: "viz:scene.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description:
      "Summarize the governed visualization scene for one sector through the authorized adapter path: object/time/measurement/risk counts per dimension and the epistemic status mix. Shape and status metadata only — no row-level sector values, no export, no mutation.",
    metadata: {
      stableId: "cap-viz-scene-summarize",
      version: "1.0.0",
      ownerRole: "PLATFORM_ADMIN",
      domain: "VISUALIZATION",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 15000,
      retryPolicy: { maxRetries: 1, backoffMs: 500 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: AUDIT,
      inputSchema: SUMMARIZE_SCHEMA,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context: ToolInvocationContext, input: unknown): Promise<NoeliaToolOutput> => summarizeScene(context, input),
  });
}

/* ─────────────────────────── handlers ─────────────────────────── */

async function explainDimensions(context: ToolInvocationContext, input?: unknown): Promise<NoeliaToolOutput> {
  const parsed = EXPLAIN_SCHEMA.safeParse(input);
  const sector = parsed.success ? (parsed.data?.sector as VizSectorCode | undefined) : undefined;
  const registry = await registryFor(context.principal);

  const findings: NoeliaFinding[] = registry.dimensions.map((d) => ({
    label: `${d.id} — ${d.name}`,
    value: `[${d.lifecycleState}/${d.status}] ${d.description}`,
    kind: "FACT" as const,
    status: "OBSERVED",
  }));

  const limitations: string[] = [];
  const sources = [
    { kind: "registry", ref: "src/lib/viz/dimensions.ts", label: "Universal Dimension Registry (canonical code registry)", authority: "BEYU OS Kernel" },
  ];

  if (sector) {
    const adapter = getAdapter(sector);
    if (adapter) {
      const descriptor = adapter.describe();
      findings.push({
        label: `${descriptor.sector} adapter`,
        value: `status ${descriptor.status}; supplies ${descriptor.suppliedDimensions.length > 0 ? descriptor.suppliedDimensions.join(", ") : "no dimensions yet"}; system of record: ${descriptor.systemOfRecord}`,
        kind: "FACT" as const,
        status: "OBSERVED",
      });
      for (const item of descriptor.notImplemented) limitations.push(`${descriptor.sector}: ${item}`);
      sources.push({ kind: "adapter", ref: `src/lib/viz/adapters/${descriptor.sector.toLowerCase()}.ts`, label: `${descriptor.sector} visualization adapter descriptor`, authority: "BEYU OS Kernel" });
    } else {
      limitations.push(`No adapter is registered for sector '${String(sector)}'.`);
    }
  } else {
    limitations.push("No sector filter given — adapter supply matrix omitted.");
  }

  return {
    headline: `Universal Dimension Registry: ${CANONICAL_DIMENSIONS.length} canonical dimensions (1D–8D + XD), ${registry.extensionCount} governed tenant extension(s).`,
    narrative:
      "The registry is a closed code contract: 1D–8D are canonical, 9D+ exist only as governed, audited tenant extensions, and XD marks the extensibility seam. Activation is capability metadata — it never grants sector data. Every dataset is re-authorized through the sector's own boundary at read time.",
    findings,
    sources,
    limitations,
    confidence: 1,
    humanReviewRequired: false,
  };
}

async function summarizeScene(context: ToolInvocationContext, input: unknown): Promise<NoeliaToolOutput> {
  const parsed = SUMMARIZE_SCHEMA.safeParse(input);
  if (!parsed.success || !parsed.data) {
    return {
      headline: "Scene summary requires a sector.",
      limitations: [`Input did not validate: sector must be one of ${VIZ_SECTOR_CODES.join(", ")}.`],
      confidence: 1,
      humanReviewRequired: false,
    };
  }
  const sector = parsed.data.sector as (typeof VIZ_SECTOR_CODES)[number];

  // Explicit sector refusal BEFORE any collection: adapters answer an
  // unauthorized sector with an honest-empty dataset, but a Noelia response
  // must DISTINGUISH "you may not look" from "there is nothing to see".
  const sectorAccess = await assertSectorAccess(context.principal, sector);
  if (!sectorAccess.allowed) {
    return {
      headline: `Scene summary refused for ${sector}.`,
      limitations: [sectorAccess.reason],
      requiresHumanDecision: ["Whether the requesting principal should hold the sector read boundary."],
      confidence: 1,
      humanReviewRequired: false,
    };
  }

  const requested = (parsed.data.dimensions ?? ["1D", "2D", "4D", "5D", "7D", "8D"])
    .map((d) => d.trim().toUpperCase())
    .filter((d) => parseDimensionCode(d).ok);
  const dimensions = requested.length > 0 ? requested : ["1D"];

  // SAME governed path as the UI/API: adapter authorization + classification
  // ceiling + RLS all re-checked here. A DENIED sector surfaces as an honest
  // refusal, never as an empty "OK".
  let manifest;
  try {
    manifest = await buildGovernedManifest(context.principal, { sector, dimensions, sceneName: `Noelia summary — ${sector}` });
  } catch (err) {
    return {
      headline: `Scene summary refused for ${sector}.`,
      limitations: [err instanceof Error ? err.message : "Authorization or scope error."],
      requiresHumanDecision: ["Whether the requesting principal should hold the sector read boundary."],
      confidence: 1,
      humanReviewRequired: false,
    };
  }

  const statusMix: Record<string, number> = {};
  for (const obj of manifest.objects) {
    for (const reading of Object.values(obj.values)) {
      statusMix[reading.status] = (statusMix[reading.status] ?? 0) + 1;
    }
  }

  const findings: NoeliaFinding[] = [
    { label: "Objects", value: String(manifest.objects.length), kind: "FACT" as const, status: "OBSERVED" },
    { label: "Dimensions activated", value: manifest.dimensions.join(", "), kind: "FACT" as const, status: "OBSERVED" },
    ...manifest.layers.map((l): NoeliaFinding => ({
      label: `Layer ${l.label}`,
      value: `${manifest.objects.filter((o) => o.layerId === l.id).length} object(s)`,
      kind: "FACT",
      status: "OBSERVED",
    })),
    ...Object.entries(statusMix).map(([status, count]): NoeliaFinding => ({
      label: `Epistemic status ${status}`,
      value: `${count} projected value(s)`,
      kind: "FACT",
      status: status as NoeliaFinding["status"],
    })),
  ];

  const adapter = getAdapter(sector);
  const descriptor = adapter?.describe();

  return {
    headline: `${sector} scene: ${manifest.objects.length} governed object(s) across ${manifest.layers.length} layer(s).`,
    narrative:
      "Shape and status metadata only — this summary never carries row-level sector values. The governed screen (/os/viz) and the audited export path remain the only surfaces for values, each re-authorized per request.",
    findings,
    sources: [
      { kind: "adapter", ref: descriptor?.systemOfRecord ?? sector, label: `${sector} adapter collection`, authority: "BEYU OS Kernel" },
    ],
    limitations: descriptor ? [...descriptor.notImplemented.map((n) => `${sector}: ${n}`)] : [],
    confidence: 1,
    humanReviewRequired: false,
  };
}
