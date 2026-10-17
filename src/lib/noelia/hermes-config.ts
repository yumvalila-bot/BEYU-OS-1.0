import { isKnownClassification, type Classification } from "@/lib/constants";

/**
 * Governed configuration for the RESTRICTED Hermes agent runtime.
 *
 * WHY THIS IS NOT AN AIModelProvider CONFIG
 *   Hermes Agent (Nous Research) is an agent-execution CLI, not a chat
 *   completion endpoint. Its whole purpose is to run tools. Everything below is
 *   therefore written to make the DANGEROUS parts of an agent runtime
 *   impossible by configuration rather than optional by convention.
 *
 * WHAT THE FIRST INCREMENT ALLOWS
 *   Exactly one non-interactive operation: a single bounded query with EVERY
 *   toolset disabled and no autonomous loop of any consequence. This adapter
 *   never enables a toolset. If an operator configures one, the runtime REFUSES
 *   to execute (fail closed) instead of silently running with tools, because
 *   enabling agent tools requires a governed capability dispatch plus an
 *   accountable human approval path that does not exist for agents yet.
 *
 * FAIL-CLOSED
 *   Every value is validated; a single invalid value makes the whole runtime
 *   unusable (`valid: false`), and the runtime then performs ZERO process
 *   spawns. There is no permissive default and no partial configuration.
 *
 * SECRETS
 *   No credential is ever placed in this configuration, in a process argument
 *   or in the child environment. The child environment is an explicit allowlist
 *   (see hermes-runtime.ts): everything else — database DSNs, API keys, cloud
 *   credentials — is withheld from the agent process.
 */

export const ENV_HERMES_ENABLED = "NOELIA_HERMES_ENABLED";
export const ENV_HERMES_EXECUTABLE = "NOELIA_HERMES_EXECUTABLE";
export const ENV_HERMES_MODEL = "NOELIA_HERMES_MODEL";
export const ENV_HERMES_TIMEOUT_MS = "NOELIA_HERMES_TIMEOUT_MS";
export const ENV_HERMES_MAX_OUTPUT_BYTES = "NOELIA_HERMES_MAX_OUTPUT_BYTES";
export const ENV_HERMES_MAX_PROMPT_CHARS = "NOELIA_HERMES_MAX_PROMPT_CHARS";
export const ENV_HERMES_MAX_TURNS = "NOELIA_HERMES_MAX_TURNS";
export const ENV_HERMES_MAX_CLASSIFICATION = "NOELIA_HERMES_MAX_CLASSIFICATION";
/**
 * Toolset allowlist. Accepted values are validated, but a NON-EMPTY value makes
 * the runtime refuse to execute until a governed agent-tool capability exists.
 */
export const ENV_HERMES_ALLOWED_TOOLSETS = "NOELIA_HERMES_ALLOWED_TOOLSETS";

/** Default executable name, resolved from PATH (never a shell string). */
export const HERMES_DEFAULT_EXECUTABLE = "hermes-agent";
export const HERMES_RUNTIME_ID = "PROV_HERMES_AGENT";
export const HERMES_RUNTIME_NAME = "hermes-restricted-agent-runtime";

export const HERMES_LIMITS = {
  minTimeoutMs: 1_000,
  maxTimeoutMs: 600_000,
  defaultTimeoutMs: 120_000,
  minOutputBytes: 1_024,
  maxOutputBytes: 1_048_576,
  defaultOutputBytes: 65_536,
  minPromptChars: 1,
  maxPromptChars: 8_000,
  defaultPromptChars: 4_000,
  minTurns: 1,
  /**
   * A bounded agent loop. The first increment deliberately caps this at 2: an
   * unbounded agent is exactly the failure mode this runtime exists to avoid.
   */
  maxTurns: 2,
  defaultTurns: 1,
  maxExecutableLength: 260,
  maxToolsetEntries: 8,
} as const;

export type HermesRuntimeConfig = {
  /** True only when NOELIA_HERMES_ENABLED is explicitly "1". */
  enabled: boolean;
  runtimeId: string;
  runtimeName: string;
  /** Bare CLI name (resolved from PATH) or an absolute path. Never a shell string. */
  executable: string;
  /** Optional model selection passed as a single bounded argument. */
  model: string | null;
  timeoutMs: number;
  maxOutputBytes: number;
  maxPromptChars: number;
  maxTurns: number;
  maxClassification: Classification;
  /** Operator-declared toolset allowlist. Non-empty => execution is refused. */
  allowedToolsets: string[];
  invalidReasons: string[];
  valid: boolean;
};

function readEnv(env: NodeJS.ProcessEnv, name: string): string | null {
  const raw = env[name];
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parsePositiveInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
  label: string,
  invalidReasons: string[],
): number {
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
 * An executable is either a bare command name resolved from PATH or an absolute
 * path. It must never carry shell syntax, quoting, whitespace, an argument, a
 * glob or a parent-directory hop: the process is always spawned with
 * `shell: false`, and this is the second line of defence behind that.
 */
export function isValidHermesExecutable(value: string): boolean {
  if (value.length === 0 || value.length > HERMES_LIMITS.maxExecutableLength) return false;
  if (value.includes("..")) return false;
  const isAbsolutePosix = value.startsWith("/");
  const isAbsoluteWindows = /^[A-Za-z]:[\\/]/.test(value);
  // A backslash is accepted only as a Windows path separator; everywhere else it
  // is an escape character and must be refused.
  const forbidden = isAbsoluteWindows
    ? /[\s"'`$;&|<>(){}[\]*?!~#]/
    : /[\s"'`$;&|<>(){}[\]*?!~#\\]/;
  if (forbidden.test(value)) return false;
  if (isAbsolutePosix || isAbsoluteWindows) return true;
  // Bare command name: letters, digits, dot, underscore and hyphen only.
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

/**
 * A model identifier is passed as a single argument. It must not be able to
 * smuggle whitespace (a second argument) or shell syntax.
 */
export function isValidHermesModelId(value: string): boolean {
  if (value.length === 0 || value.length > 128) return false;
  if (value.includes("..") || /\s/.test(value)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value);
}

function parseToolsets(raw: string | null, invalidReasons: string[]): string[] {
  if (raw === null) return [];
  const toolsets: string[] = [];
  for (const entry of raw.split(",")) {
    const name = entry.trim().toLowerCase();
    if (name.length === 0) continue;
    if (toolsets.length >= HERMES_LIMITS.maxToolsetEntries) {
      invalidReasons.push(`${ENV_HERMES_ALLOWED_TOOLSETS} must not declare more than ${HERMES_LIMITS.maxToolsetEntries} toolsets.`);
      break;
    }
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(name)) {
      invalidReasons.push(`${ENV_HERMES_ALLOWED_TOOLSETS} contains an invalid toolset entry.`);
      continue;
    }
    if (name === "all" || name.includes("*")) {
      invalidReasons.push(`${ENV_HERMES_ALLOWED_TOOLSETS} must not request every toolset.`);
      continue;
    }
    toolsets.push(name);
  }
  return toolsets;
}

/**
 * Resolve + validate the Hermes runtime configuration.
 *
 * Pure function of the injected environment: no I/O, no process spawn, no
 * network. Callable from tests and operator diagnostics without side effects.
 */
export function resolveHermesRuntimeConfig(env: NodeJS.ProcessEnv = process.env): HermesRuntimeConfig {
  const invalidReasons: string[] = [];

  const rawEnabled = readEnv(env, ENV_HERMES_ENABLED);
  const enabled = rawEnabled !== null && rawEnabled.toLowerCase() === "1";
  if (rawEnabled !== null && !["1", "0"].includes(rawEnabled)) {
    invalidReasons.push(`${ENV_HERMES_ENABLED} must be 1 (enabled) or 0 (disabled).`);
  }

  const executable = readEnv(env, ENV_HERMES_EXECUTABLE) ?? HERMES_DEFAULT_EXECUTABLE;
  if (!isValidHermesExecutable(executable)) {
    invalidReasons.push(`${ENV_HERMES_EXECUTABLE} must be a bare command name or an absolute path with no shell syntax.`);
  }

  const rawModel = readEnv(env, ENV_HERMES_MODEL);
  if (rawModel !== null && !isValidHermesModelId(rawModel)) {
    invalidReasons.push(`${ENV_HERMES_MODEL} is not a valid model identifier.`);
  }

  const timeoutMs = parsePositiveInt(
    readEnv(env, ENV_HERMES_TIMEOUT_MS),
    HERMES_LIMITS.defaultTimeoutMs,
    HERMES_LIMITS.minTimeoutMs,
    HERMES_LIMITS.maxTimeoutMs,
    ENV_HERMES_TIMEOUT_MS,
    invalidReasons,
  );
  const maxOutputBytes = parsePositiveInt(
    readEnv(env, ENV_HERMES_MAX_OUTPUT_BYTES),
    HERMES_LIMITS.defaultOutputBytes,
    HERMES_LIMITS.minOutputBytes,
    HERMES_LIMITS.maxOutputBytes,
    ENV_HERMES_MAX_OUTPUT_BYTES,
    invalidReasons,
  );
  const maxPromptChars = parsePositiveInt(
    readEnv(env, ENV_HERMES_MAX_PROMPT_CHARS),
    HERMES_LIMITS.defaultPromptChars,
    HERMES_LIMITS.minPromptChars,
    HERMES_LIMITS.maxPromptChars,
    ENV_HERMES_MAX_PROMPT_CHARS,
    invalidReasons,
  );
  const maxTurns = parsePositiveInt(
    readEnv(env, ENV_HERMES_MAX_TURNS),
    HERMES_LIMITS.defaultTurns,
    HERMES_LIMITS.minTurns,
    HERMES_LIMITS.maxTurns,
    ENV_HERMES_MAX_TURNS,
    invalidReasons,
  );

  const rawMaxClassification = readEnv(env, ENV_HERMES_MAX_CLASSIFICATION) ?? "INTERNAL";
  let maxClassification: Classification = "INTERNAL";
  if (!isKnownClassification(rawMaxClassification)) {
    invalidReasons.push(`${ENV_HERMES_MAX_CLASSIFICATION} must be a known data classification.`);
  } else {
    maxClassification = rawMaxClassification;
  }

  const allowedToolsets = parseToolsets(readEnv(env, ENV_HERMES_ALLOWED_TOOLSETS), invalidReasons);

  return {
    enabled,
    runtimeId: HERMES_RUNTIME_ID,
    runtimeName: HERMES_RUNTIME_NAME,
    executable,
    model: rawModel,
    timeoutMs,
    maxOutputBytes,
    maxPromptChars,
    maxTurns,
    maxClassification,
    allowedToolsets,
    invalidReasons,
    valid: invalidReasons.length === 0,
  };
}

/**
 * Non-sensitive summary for diagnostics.
 *
 * Contains the executable NAME (configuration, never a secret) but never a
 * DSN, a key, a token or any part of a prompt.
 */
export function describeHermesRuntimeConfig(config: HermesRuntimeConfig): Record<string, unknown> {
  return {
    enabled: config.enabled,
    runtimeId: config.runtimeId,
    executable: config.executable,
    model: config.model,
    timeoutMs: config.timeoutMs,
    maxOutputBytes: config.maxOutputBytes,
    maxPromptChars: config.maxPromptChars,
    maxTurns: config.maxTurns,
    maxClassification: config.maxClassification,
    // Declared, but never used to run with tools in this increment.
    allowedToolsetCount: config.allowedToolsets.length,
    toolsEnabled: false,
    valid: config.valid,
    invalidReasons: config.invalidReasons,
  };
}
