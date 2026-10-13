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
/**
 * Credential for a NON-LOOPBACK Ollama endpoint (Ollama Cloud or an
 * operator-controlled remote host).
 *
 * NOELIA_OLLAMA_API_KEY must NEVER be set for a loopback endpoint: a local
 * Ollama has no credential, and a stray key in the environment would otherwise
 * be attached to a local request. The value is read at the single call site
 * (`readOllamaCredential`) and is deliberately NOT stored on the configuration
 * object, so no diagnostic/log dump of configuration can ever contain it.
 */
export const ENV_OLLAMA_API_KEY = "NOELIA_OLLAMA_API_KEY";
/**
 * Explicit opt-in for the Ollama Cloud host. Cloud inference is DISABLED unless
 * this is exactly "1" AND the host is explicitly allowlisted AND a key exists.
 * There is no automatic activation and no cloud fallback after a local failure.
 */
export const ENV_OLLAMA_CLOUD_OPT_IN = "NOELIA_OLLAMA_CLOUD_OPT_IN";
/** The only host treated as Ollama Cloud (and the only one with a cost note). */
export const OLLAMA_CLOUD_HOST = "ollama.com";
/** Minimum plausible length of an Ollama API key (value is never inspected/sent elsewhere). */
const MIN_API_KEY_LENGTH = 16;

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

/**
 * Which governed runtime KIND the endpoint is.
 *
 * OLLAMA_CLOUD is a distinct kind because it carries a COST surface that a local
 * runtime does not: it also requires explicit opt-in, an allowlisted host and a
 * credential, and it is never used as a fallback.
 */
export type OllamaRuntimeKind = "LOCAL_LOOPBACK" | "SELF_HOSTED_REMOTE_HOST" | "OLLAMA_CLOUD";

export type OllamaRuntimeConfig = {
  /** True only when NOELIA_MODEL_PROVIDER is explicitly "OLLAMA". */
  enabled: boolean;
  providerId: string;
  providerName: string;
  /** Normalized base URL (no trailing slash, no credentials). */
  baseUrl: string;
  host: string;
  endpointScope: OllamaEndpointScope;
  runtimeKind: OllamaRuntimeKind;
  /**
   * True only for an allowlisted non-loopback https host, i.e. the only case in
   * which a credential MAY be attached. For the Ollama Cloud host a credential
   * is additionally mandatory (see the validation rules).
   */
  credentialEligible: boolean;
  /** True only for the explicitly opted-in Ollama Cloud host. */
  cloudMode: boolean;
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

/** True when a host is the Ollama Cloud service (or one of its subdomains). */
export function isOllamaCloudHost(host: string): boolean {
  const normalized = normalizeHost(host);
  return normalized === OLLAMA_CLOUD_HOST || normalized.endsWith(`.${OLLAMA_CLOUD_HOST}`);
}

/**
 * Read the credential for a non-loopback endpoint.
 *
 * THIS IS THE ONLY PLACE THE SECRET IS READ. It is returned to the single call
 * site that builds an HTTP header and is never stored on configuration, never
 * logged, never returned in a status/detail/evidence string and never attached
 * to a loopback request. Callers must treat a null return as "no credential".
 */
export function readOllamaCredential(env: NodeJS.ProcessEnv = process.env): string | null {
  return readEnv(env, ENV_OLLAMA_API_KEY);
}

/** Cheap plausibility check. The value itself is never echoed anywhere. */
function isPlausibleApiKey(value: string): boolean {
  if (value.length < MIN_API_KEY_LENGTH || value.length > 512) return false;
  return /^[A-Za-z0-9._~+/=-]+$/.test(value);
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
    const cloudHint = isOllamaCloudHost(host)
      ? ` An Ollama Cloud endpoint additionally requires ${ENV_OLLAMA_CLOUD_OPT_IN}=1 and ${ENV_OLLAMA_API_KEY}; cloud inference is disabled by default.`
      : "";
    invalidReasons.push(
      `Non-loopback Ollama host is not allowlisted: add it to ${ENV_OLLAMA_ALLOWED_HOSTS} to authorise it explicitly.${cloudHint}`,
    );
  }

  // ---- Endpoint-kind rules (local vs self-hosted remote vs cloud) ----------
  // A loopback runtime is plaintext by design and MUST NOT receive a credential.
  // A non-loopback runtime is a network service holding an API key and MUST be
  // TLS-protected. The Ollama Cloud host additionally requires an explicit
  // opt-in (cost surface) and a credential, and is never reached implicitly.
  const loopback = host !== "" && isLoopbackHost(host);
  const cloudMode = host !== "" && isOllamaCloudHost(host);
  const credential = readOllamaCredential(env);
  const hostAuthorised = host !== "" && !loopback && allowedHosts.includes(host);
  const schemeIsHttps = baseUrl.startsWith("https://");

  if (loopback) {
    if (!baseUrl.startsWith("http://")) {
      invalidReasons.push(`${ENV_OLLAMA_BASE_URL} must use http: for a loopback endpoint.`);
    }
    if (credential !== null) {
      invalidReasons.push(
        `${ENV_OLLAMA_API_KEY} must not be set for a loopback endpoint: a local Ollama runtime has no credential.`,
      );
    }
  } else if (host !== "") {
    if (!schemeIsHttps) {
      invalidReasons.push(`${ENV_OLLAMA_BASE_URL} must use https: for a non-loopback endpoint.`);
    }
    if (cloudMode) {
      if (readEnv(env, ENV_OLLAMA_CLOUD_OPT_IN) !== "1") {
        invalidReasons.push(
          `Ollama Cloud is disabled by default: set ${ENV_OLLAMA_CLOUD_OPT_IN}=1 explicitly to authorise a cloud endpoint.`,
        );
      }
      if (credential === null) {
        invalidReasons.push(`${ENV_OLLAMA_API_KEY} is required for the Ollama Cloud endpoint.`);
      } else if (!isPlausibleApiKey(credential)) {
        invalidReasons.push(`${ENV_OLLAMA_API_KEY} is not a plausible Ollama API key.`);
      }
    }
  }

  // A credential is only ever acceptable for an authorised non-loopback https
  // host. Anywhere else it is a configuration error, not a value to send.
  if (credential !== null && !(hostAuthorised && schemeIsHttps)) {
    invalidReasons.push(
      `${ENV_OLLAMA_API_KEY} is set but the configured endpoint is not an allowlisted https remote host; the credential was not sent.`,
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
    endpointScope: loopback ? "LOCAL_PROCESS" : "CONFIGURED_REMOTE_HOST",
    runtimeKind: loopback ? "LOCAL_LOOPBACK" : cloudMode ? "OLLAMA_CLOUD" : "SELF_HOSTED_REMOTE_HOST",
    credentialEligible: hostAuthorised,
    cloudMode,
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
    runtimeKind: config.runtimeKind,
    cloudMode: config.cloudMode,
    // Whether the configuration would allow a credential to be attached. The
    // credential VALUE is never part of configuration and never printed.
    credentialAttachmentAllowed: config.credentialEligible,
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
