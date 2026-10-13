import { isKnownClassification, type Classification } from "@/lib/constants";

/**
 * Governed configuration for the Ollama model runtime.
 *
 * SCOPE
 *   This is the ONLY place Ollama configuration is resolved. It does not add a
 *   second provider registry: the governed registry (noelia_providers +
 *   model_registry, read by BeyuNoeliaAiPlatformService.route()) remains the
 *   authority that decides whether a routed request may reach any runtime. This
 *   module only decides whether the *adapter* is mounted at all, and with which
 *   bounded parameters.
 *
 * FAIL-CLOSED
 *   Every value is validated. An invalid value produces `valid: false` plus a
 *   non-sensitive reason; the adapter then reports NOT_CONNECTED and refuses to
 *   make any call. Configuration never degrades silently to a permissive
 *   default.
 *
 * SSRF / EGRESS
 *   The endpoint is server-side configuration. It is never taken from a
 *   request, a prompt, a database row or a user-supplied URL. Only `http:` and
 *   `https:` are accepted, credentials in the URL are rejected, and a
 *   non-loopback host is only accepted when it is EXPLICITLY named in
 *   NOELIA_OLLAMA_ALLOWED_HOSTS (no wildcards). This prevents a configuration
 *   mistake from turning the adapter into a request-forwarding proxy for
 *   arbitrary/internal hosts.
 *
 * LOCALHOST SEMANTICS
 *   `localhost` here means loopback of the process running the BEYU backend.
 *   It is NOT the operator's Windows PC when BEYU runs on Vercel or any other
 *   remote host. See docs/noelia/NOELIA_OLLAMA_LOCAL_DEVELOPMENT.md.
 */

/* --------------------------------------------------------------------------
 * Accepted environment variable names (existing NOELIA_* convention).
 * ------------------------------------------------------------------------ */

/** Selects the governed model runtime: "DETERMINISTIC" (default) | "OLLAMA". */
export const ENV_MODEL_PROVIDER = "NOELIA_MODEL_PROVIDER";
export const ENV_OLLAMA_BASE_URL = "NOELIA_OLLAMA_BASE_URL";
export const ENV_OLLAMA_MODEL = "NOELIA_OLLAMA_MODEL";
export const ENV_OLLAMA_TIMEOUT_MS = "NOELIA_OLLAMA_TIMEOUT_MS";
export const ENV_OLLAMA_MAX_ATTEMPTS = "NOELIA_OLLAMA_MAX_ATTEMPTS";
export const ENV_OLLAMA_MAX_CLASSIFICATION = "NOELIA_OLLAMA_MAX_CLASSIFICATION";
export const ENV_OLLAMA_ALLOWED_HOSTS = "NOELIA_OLLAMA_ALLOWED_HOSTS";

export const OLLAMA_RUNTIME_PROVIDER_ID = "PROV_OLLAMA_LOCAL";
export const OLLAMA_RUNTIME_PROVIDER_NAME = "ollama-self-hosted-runtime";
export const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434";
/** The operator's locally verified DEVELOPMENT model. Configurable. */
export const OLLAMA_DEFAULT_MODEL = "qwen2.5:0.5b";

export const OLLAMA_LIMITS = {
  minTimeoutMs: 1_000,
  maxTimeoutMs: 600_000,
  defaultTimeoutMs: 60_000,
  minAttempts: 1,
  maxAttempts: 3,
  defaultAttempts: 2,
  /** Bounded request size actually accepted for a governed generation. */
  defaultPromptCharLimit: 12_000,
  /** Bounded response size actually parsed from the runtime. */
  defaultResponseByteLimit: 1_048_576,
  maxModelIdLength: 128,
} as const;

/** Where the runtime actually executes relative to this backend process. */
export type OllamaEndpointScope = "LOCAL_PROCESS" | "CONFIGURED_REMOTE_HOST";

export type OllamaRuntimeConfig = {
  /** True only when NOELIA_MODEL_PROVIDER is explicitly "OLLAMA". */
  enabled: boolean;
  providerId: string;
  providerName: string;
  /** Normalized base URL (no trailing slash, no credentials). */
  baseUrl: string;
  host: string;
  endpointScope: OllamaEndpointScope;
  model: string;
  modelVersion: string;
  timeoutMs: number;
  maxAttempts: number;
  /** Highest data classification this runtime may receive. */
  maxClassification: Classification;
  promptCharLimit: number;
  responseByteLimit: number;
  allowedHosts: string[];
  /** Non-sensitive configuration problems. Non-empty => valid === false. */
  invalidReasons: string[];
  valid: boolean;
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function readEnv(env: NodeJS.ProcessEnv, name: string): string | null {
  const raw = env[name];
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parsePositiveInt(raw: string | null, fallback: number, min: number, max: number, label: string, invalidReasons: string[]): number {
  if (raw === null) return fallback;
  if (!/^\d{1,9}$/.test(raw)) {
    invalidReasons.push(`${label} must be an integer between ${min} and ${max}.`);
    return fallback;
  }
  const value = Number(raw);
  if (value < min || value > max) {
    invalidReasons.push(`${label} must be between ${min} and ${max}.`);
    return fallback;
  }
  return value;
}

/**
 * A model identifier ends up in request bodies and in bounded diagnostics. It
 * must never be able to smuggle a path segment, query or control character.
 */
function isValidModelId(value: string): boolean {
  if (value.length === 0 || value.length > OLLAMA_LIMITS.maxModelIdLength) return false;
  if (value.includes("..") || /\s/.test(value)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value);
}

function parseAllowedHosts(raw: string | null, invalidReasons: string[]): string[] {
  if (raw === null) return [];
  const hosts: string[] = [];
  for (const entry of raw.split(",")) {
    const host = entry.trim().toLowerCase().replace(/\.$/, "");
    if (host.length === 0) continue;
    if (host.includes("*")) {
      invalidReasons.push(`${ENV_OLLAMA_ALLOWED_HOSTS} must not contain wildcard entries.`);
      continue;
    }
    if (!/^[a-z0-9.[\]:-]+$/.test(host)) {
      invalidReasons.push(`${ENV_OLLAMA_ALLOWED_HOSTS} contains an invalid host entry.`);
      continue;
    }
    hosts.push(host);
  }
  return hosts;
}

function normalizeHost(hostname: string): string {
  const lower = hostname.toLowerCase();
  return lower.startsWith("[") ? lower : lower;
}

/** True when a host is loopback OF THE PROCESS RUNNING THIS BACKEND. */
export function isLoopbackHost(host: string): boolean {
  const normalized = normalizeHost(host);
  if (LOOPBACK_HOSTS.has(normalized)) return true;
  // 127.0.0.0/8 is entirely loopback.
  if (/^127(\.\d{1,3}){3}$/.test(normalized)) return true;
  return false;
}

function modelVersionFromTag(model: string): string {
  const idx = model.lastIndexOf(":");
  if (idx < 0 || idx === model.length - 1) return "latest";
  return model.slice(idx + 1);
}

/**
 * Resolve + validate the Ollama runtime configuration.
 *
 * Pure function of the injected environment: no I/O, no network, no database.
 * Callable from tests and from operator diagnostics without side effects.
 */
export function resolveOllamaRuntimeConfig(env: NodeJS.ProcessEnv = process.env): OllamaRuntimeConfig {
  const invalidReasons: string[] = [];

  const providerSelection = readEnv(env, ENV_MODEL_PROVIDER);
  const enabled = providerSelection !== null && providerSelection.toUpperCase() === "OLLAMA";
  if (providerSelection !== null && !["OLLAMA", "DETERMINISTIC"].includes(providerSelection.toUpperCase())) {
    invalidReasons.push(`${ENV_MODEL_PROVIDER} must be OLLAMA or DETERMINISTIC.`);
  }

  const allowedHosts = parseAllowedHosts(readEnv(env, ENV_OLLAMA_ALLOWED_HOSTS), invalidReasons);

  const rawBaseUrl = readEnv(env, ENV_OLLAMA_BASE_URL) ?? OLLAMA_DEFAULT_BASE_URL;
  let baseUrl = rawBaseUrl.replace(/\/+$/, "");
  let host = "";
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      invalidReasons.push(`${ENV_OLLAMA_BASE_URL} must use http: or https:.`);
    }
    if (parsed.username || parsed.password) {
      invalidReasons.push(`${ENV_OLLAMA_BASE_URL} must not embed credentials.`);
    }
    if (!parsed.hostname) {
      invalidReasons.push(`${ENV_OLLAMA_BASE_URL} must include a host.`);
    }
    if (parsed.search || parsed.hash) {
      invalidReasons.push(`${ENV_OLLAMA_BASE_URL} must not include a query string or fragment.`);
    }
    host = normalizeHost(parsed.hostname);
    // Rebuild from parsed components so nothing unparsed is ever used for a
    // call. A non-http(s) or host-less value is never rebuilt into a usable URL.
    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.host) {
      baseUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, "")}`;
    }
  } catch {
    invalidReasons.push(`${ENV_OLLAMA_BASE_URL} is not a valid absolute URL.`);
  }

  if (host && !isLoopbackHost(host) && !allowedHosts.includes(host)) {
    invalidReasons.push(
      `Non-loopback Ollama host is not allowlisted: add it to ${ENV_OLLAMA_ALLOWED_HOSTS} to authorise it explicitly.`,
    );
  }

  const model = readEnv(env, ENV_OLLAMA_MODEL) ?? OLLAMA_DEFAULT_MODEL;
  if (!isValidModelId(model)) {
    invalidReasons.push(`${ENV_OLLAMA_MODEL} is not a valid Ollama model identifier.`);
  }

  const timeoutMs = parsePositiveInt(
    readEnv(env, ENV_OLLAMA_TIMEOUT_MS),
    OLLAMA_LIMITS.defaultTimeoutMs,
    OLLAMA_LIMITS.minTimeoutMs,
    OLLAMA_LIMITS.maxTimeoutMs,
    ENV_OLLAMA_TIMEOUT_MS,
    invalidReasons,
  );
  const maxAttempts = parsePositiveInt(
    readEnv(env, ENV_OLLAMA_MAX_ATTEMPTS),
    OLLAMA_LIMITS.defaultAttempts,
    OLLAMA_LIMITS.minAttempts,
    OLLAMA_LIMITS.maxAttempts,
    ENV_OLLAMA_MAX_ATTEMPTS,
    invalidReasons,
  );

  const rawMaxClassification = readEnv(env, ENV_OLLAMA_MAX_CLASSIFICATION) ?? "INTERNAL";
  let maxClassification: Classification = "INTERNAL";
  if (!isKnownClassification(rawMaxClassification)) {
    invalidReasons.push(`${ENV_OLLAMA_MAX_CLASSIFICATION} must be a known data classification.`);
  } else {
    maxClassification = rawMaxClassification;
  }

  return {
    enabled,
    providerId: OLLAMA_RUNTIME_PROVIDER_ID,
    providerName: OLLAMA_RUNTIME_PROVIDER_NAME,
    baseUrl,
    host,
    endpointScope: isLoopbackHost(host) ? "LOCAL_PROCESS" : "CONFIGURED_REMOTE_HOST",
    model,
    modelVersion: modelVersionFromTag(model),
    timeoutMs,
    maxAttempts,
    maxClassification,
    promptCharLimit: OLLAMA_LIMITS.defaultPromptCharLimit,
    responseByteLimit: OLLAMA_LIMITS.defaultResponseByteLimit,
    allowedHosts,
    invalidReasons,
    valid: invalidReasons.length === 0,
  };
}

/** Non-sensitive summary for diagnostics. Contains no secret and no prompt data. */
export function describeOllamaRuntimeConfig(config: OllamaRuntimeConfig): Record<string, unknown> {
  return {
    enabled: config.enabled,
    providerId: config.providerId,
    endpointScope: config.endpointScope,
    // The host is configuration, never a credential; it is shown so an operator
    // can see WHICH machine would receive the data.
    host: config.host,
    scheme: config.baseUrl.split(":")[0],
    model: config.model,
    timeoutMs: config.timeoutMs,
    maxAttempts: config.maxAttempts,
    maxClassification: config.maxClassification,
    valid: config.valid,
    invalidReasons: config.invalidReasons,
  };
}
