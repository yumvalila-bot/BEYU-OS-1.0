/**
 * REAL INFERENCE ACCEPTANCE — executes against a live runtime, or fails loudly.
 *
 * This script is the Phase 2 acceptance requirement made executable:
 *
 *   "Execute an actual inference request against a running local model."
 *
 * It drives the REAL `BeyuOllamaProvider` — the same class production uses —
 * against whatever is serving the Ollama contract at NOELIA_OLLAMA_BASE_URL.
 * That may be Ollama itself, or the tiny-neural harness in this directory.
 *
 * It exits non-zero if inference does not actually happen. A run that cannot
 * reach a runtime is a FAILED verification, never a skipped one: the whole point
 * of this script is that "not attempted" must not be able to masquerade as
 * "verified".
 *
 * Usage:
 *   NOELIA_OLLAMA_BASE_URL=http://127.0.0.1:11434 \
 *   NOELIA_OLLAMA_MODEL=noelia-tiny-neural:mechanism-test \
 *   npx tsx scripts/noelia/tiny-inference/verify-live-inference.ts
 *
 * Never prints a prompt, a response body or a credential — only status,
 * shape-derived counts and non-identifying evidence tags.
 */
import { BeyuOllamaProvider } from "../../../src/lib/noelia/ollama-provider";
import { resolveOllamaRuntimeConfig } from "../../../src/lib/noelia/ollama-config";

const BASE_URL = process.env.NOELIA_OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const MODEL = process.env.NOELIA_OLLAMA_MODEL ?? "noelia-tiny-neural:mechanism-test";

type Check = { name: string; ok: boolean; detail: string };

const checks: Check[] = [];
function record(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(34)} ${detail}`);
}

function configFor(overrides: Record<string, string>) {
  return resolveOllamaRuntimeConfig({
    NOELIA_MODEL_PROVIDER: "OLLAMA",
    NOELIA_OLLAMA_BASE_URL: BASE_URL,
    NOELIA_OLLAMA_MODEL: MODEL,
    NOELIA_OLLAMA_TIMEOUT_MS: "20000",
    ...overrides,
  } as unknown as NodeJS.ProcessEnv);
}

async function main() {
  console.log(`live inference acceptance — ${BASE_URL} model=${MODEL}\n`);

  // 1. Configuration is valid and scoped to the local process.
  const config = configFor({});
  record("configuration valid", config.valid && config.enabled, `scope=${config.endpointScope}`);

  const provider = new BeyuOllamaProvider(config);

  // 2. Discovery — the runtime lists models and the configured one is present.
  const health = await provider.health({} as never);
  record("health CONNECTED", health.status === "CONNECTED", `status=${health.status} reachable=${health.reachable}`);

  // 3. REAL INFERENCE — a bounded round-trip that only VERIFIED can satisfy.
  const verification = await provider.verifyInference();
  record(
    "verifyInference VERIFIED",
    verification.ok && verification.status === "VERIFIED",
    `status=${verification.status} evidence=${verification.evidence.length} tag(s)`,
  );

  // 4. The governed generation path returns a usable response.
  const run = await provider.run({
    requestId: "REQ_LIVE_ACCEPTANCE",
    routingId: "ART_LIVE_ACCEPTANCE",
    tenantId: "TEN_SYNTHETIC_ACCEPTANCE",
    legalEntityId: null,
    countryCode: null,
    osId: null,
    task: "live-acceptance",
    capability: "governed-analysis",
    classification: "INTERNAL",
    riskLevel: "LOW",
    selectedModelId: config.model,
    selectedProviderId: config.providerId,
    traceId: "TRACE_LIVE_ACCEPTANCE",
    prompt: "Reply with the single word OK",
    systemPolicy: "Answer with the requested literal text only.",
    temperature: 0,
    maxTokens: 8,
  });
  record(
    "governed run COMPLETED",
    run.status === "COMPLETED" && run.output?.generativeInference === true,
    `status=${run.status} inferenceCount=${run.usage?.inferenceCount ?? 0}`,
  );
  record("provider identity preserved", run.providerId === config.providerId, `providerId=${run.providerId}`);

  // 5. FAILURE MODE — an endpoint that is not serving the runtime must FAIL,
  //    and must never be reported as CONNECTED.
  const downProvider = new BeyuOllamaProvider(configFor({ NOELIA_OLLAMA_BASE_URL: "http://127.0.0.1:1" }));
  const down = await downProvider.health({} as never);
  record("unavailable endpoint FAILED", down.status === "FAILED" && down.reachable === false, `status=${down.status}`);

  // 6. FAILURE MODE — reachable runtime, missing model: DEGRADED, not VERIFIED.
  const missingProvider = new BeyuOllamaProvider(
    configFor({ NOELIA_OLLAMA_MODEL: "definitely-not-installed:latest" }),
  );
  const missing = await missingProvider.health({} as never);
  record("missing model DEGRADED", missing.status === "DEGRADED", `status=${missing.status}`);

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length > 0) {
    console.error("\nINFERENCE ACCEPTANCE FAILED — do not report this as verified.");
    process.exit(1);
  }
  console.log("INFERENCE ACCEPTANCE PASSED — real inference executed against a live runtime.");
}

main().catch((e) => {
  console.error(`INFERENCE ACCEPTANCE ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
