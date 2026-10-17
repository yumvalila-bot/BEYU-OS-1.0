import { spawn } from "node:child_process";
import { classificationRank } from "@/lib/constants";
import type { AIError, AIProviderStatus } from "./model-provider";
import {
  HERMES_LIMITS,
  resolveHermesRuntimeConfig,
  type HermesRuntimeConfig,
} from "./hermes-config";

/**
 * RESTRICTED Hermes agent runtime (Nous Research `hermes-agent` CLI).
 *
 * WHY THIS IS NOT AN `AIModelProvider`
 *   `AIModelProvider` is the NOELIA model-runtime contract: a request in, model
 *   text out, with no execution authority. Hermes is a separate concern — an
 *   agent process that can run tools — so it deliberately does NOT implement
 *   that interface and is deliberately NOT mounted in the model gateway's
 *   provider set. Treating an agent as "just another provider" is the mistake
 *   this boundary exists to prevent.
 *
 * THE FIRST INCREMENT IS STRICTLY NON-EXECUTING
 *   - Every toolset is disabled on every invocation (`--disabled-toolsets all`).
 *   - If an operator declares a toolset allowlist, the runtime REFUSES to
 *     execute: enabling agent tools needs a governed capability dispatch and a
 *     human approval path that does not exist for agents yet.
 *   - The process is spawned with `shell: false` and a FIXED argument vector.
 *     Untrusted text is a single argv element, never a shell fragment.
 *   - The child environment is an explicit allowlist: no DSN, no API key, no
 *     bearer token, no NOELIA/Ollama configuration is inherited.
 *   - stdout/stderr, duration and prompt size are bounded; the process tree is
 *     terminated on timeout.
 *   - Raw stderr, executable paths, prompts and environment contents are NEVER
 *     returned to a caller. Failures are stable machine codes.
 *
 * WHAT THE OUTPUT IS
 *   Prose, marked `untrusted: true` and `actionExecuted: false`. It is never an
 *   action receipt, never evidence that an OS action ran, never an
 *   authorization, and never a tool invocation. Reporting that an action was
 *   completed requires the governed tool registry to have executed it and
 *   verified the result — an agent's sentence is not that.
 */

/* --------------------------------------------------------------------------
 * Process surface (injectable, so no test needs a real Hermes installation)
 * ------------------------------------------------------------------------ */

export type HermesInvocation = {
  /** Fixed executable. Never a shell string; always spawned with shell:false. */
  file: string;
  /** Fixed argument vector. Untrusted text appears as ONE element at most. */
  args: readonly string[];
  /** Explicit allowlisted child environment (never the full parent env). */
  env: Record<string, string>;
  shell: false;
  timeoutMs: number;
  maxOutputBytes: number;
};

export type HermesProcessOutcome = {
  /** Node error code only (e.g. ENOENT). Never a message, never a path. */
  spawnErrorCode: string | null;
  exitCode: number | null;
  stdout: string;
  /** Measured only. NEVER returned to a caller. */
  stderrBytes: number;
  timedOut: boolean;
  truncated: boolean;
};

export type HermesProcessRunner = (invocation: HermesInvocation) => Promise<HermesProcessOutcome>;

/** Environment keys the child may inherit. Everything else is withheld. */
const HERMES_CHILD_ENV_ALLOWLIST = [
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "windir",
  "COMSPEC",
  "TEMP",
  "TMP",
  "TMPDIR",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "LANG",
  "LC_ALL",
] as const;

/**
 * Build the child environment.
 *
 * The agent process runs with the shell/runtime basics it needs to start and
 * NOTHING else: no DATABASE_URL, no OLLAMA/cloud credential, no NOELIA_*
 * configuration, no CI token. `HERMES_NONINTERACTIVE=1` and `NO_COLOR=1` keep
 * a scripted run from blocking on a prompt or emitting control sequences.
 */
export function hermesChildEnv(parent: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {
    HERMES_NONINTERACTIVE: "1",
    NO_COLOR: "1",
    PYTHONUNBUFFERED: "1",
    PYTHONIOENCODING: "utf-8",
  };
  for (const key of HERMES_CHILD_ENV_ALLOWLIST) {
    const value = parent[key];
    if (typeof value === "string" && value.length > 0) env[key] = value;
  }
  return env;
}

/** Terminate a child and its descendants without a shell. */
function terminateTree(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined) return;
  if (process.platform === "win32") {
    // taskkill is addressed by PID only; no user-supplied string is involved.
    const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { shell: false, stdio: "ignore" });
    killer.on("error", () => undefined);
    return;
  }
  try {
    // Negative PID targets the process group created by `detached: true`.
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Already gone: nothing to terminate.
    }
  }
}

/**
 * Default runner. Fixed executable, fixed argv, `shell: false`, bounded output,
 * bounded duration, and a terminated process tree on timeout.
 */
export const defaultHermesProcessRunner: HermesProcessRunner = (invocation) =>
  new Promise<HermesProcessOutcome>((resolve) => {
    let settled = false;
    let stdout = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;
    let timedOut = false;
    let timer: NodeJS.Timeout | null = null;

    const finish = (outcome: HermesProcessOutcome): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(outcome);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(invocation.file, [...invocation.args], {
        shell: false,
        // `spawn` types env as ProcessEnv; this runtime passes an EXPLICIT,
        // fully-resolved allowlist instead of inheriting the parent's.
        env: { ...invocation.env } as unknown as NodeJS.ProcessEnv,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        // Detached on POSIX so the whole group can be terminated on timeout.
        detached: process.platform !== "win32",
      });
    } catch (err) {
      finish({
        spawnErrorCode: (err as { code?: string })?.code ?? "SPAWN_FAILED",
        exitCode: null,
        stdout: "",
        stderrBytes: 0,
        timedOut: false,
        truncated: false,
      });
      return;
    }

    const kill = (): void => {
      terminateTree(child.pid, "SIGTERM");
      const hardKill = setTimeout(() => terminateTree(child.pid, "SIGKILL"), 2_000);
      hardKill.unref?.();
    };

    timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, invocation.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > invocation.maxOutputBytes) {
        truncated = true;
        kill();
        return;
      }
      stdout += chunk.toString("utf8");
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      // stderr content is measured, never accumulated and never returned.
      stderrBytes += chunk.byteLength;
      if (stderrBytes > invocation.maxOutputBytes) {
        truncated = true;
        kill();
      }
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      finish({
        spawnErrorCode: err.code ?? "SPAWN_FAILED",
        exitCode: null,
        stdout: "",
        stderrBytes,
        timedOut: false,
        truncated: false,
      });
    });

    child.on("close", (code) => {
      finish({ spawnErrorCode: null, exitCode: code, stdout, stderrBytes, timedOut, truncated });
    });
  });

/* --------------------------------------------------------------------------
 * Invocation construction (pure, unit-tested)
 * ------------------------------------------------------------------------ */

export type HermesInvocationKind = "VERSION" | "QUERY";

/**
 * Build the exact process invocation.
 *
 * The returned `args` are FIXED flags plus, at most, one argv element carrying
 * the untrusted prompt. Shell metacharacters inside that element are inert:
 * `shell: false` means no shell ever parses them. `--disabled-toolsets all` is
 * unconditional in this increment, and this buildRefusal() path prevents a
 * configured toolset allowlist from ever reaching the process.
 */
export function buildHermesInvocation(
  config: HermesRuntimeConfig,
  kind: HermesInvocationKind,
  prompt: string | null,
  parentEnv: NodeJS.ProcessEnv = process.env,
): HermesInvocation {
  const args: string[] = [];
  if (kind === "VERSION") {
    args.push("--version");
  } else {
    if (prompt === null) throw new Error("HERMES_PROMPT_REQUIRED");
    args.push("--query", prompt);
    // Every toolset is disabled, unconditionally. An agent that runs tools is
    // not reachable from this increment, by construction.
    args.push("--disabled-toolsets", "all");
    args.push("--max-turns", String(config.maxTurns));
    if (config.model !== null) args.push("--model", config.model);
  }
  return {
    file: config.executable,
    args,
    env: hermesChildEnv(parentEnv),
    shell: false,
    timeoutMs: config.timeoutMs,
    maxOutputBytes: config.maxOutputBytes,
  };
}

/* --------------------------------------------------------------------------
 * Runtime
 * ------------------------------------------------------------------------ */

export type HermesAvailability = {
  ok: boolean;
  status: AIProviderStatus;
  detail: string;
  evidence: string[];
  checkedAt: string;
};

export type HermesQueryRequest = {
  requestId: string;
  tenantId: string;
  /** Already-authorized classification of the requesting principal. */
  classification: string;
  /** The requesting human's own bounded request. Untrusted DATA. */
  prompt: string;
};

export type HermesUntrustedOutput = {
  text: string;
  outputClass: "INFERENCE";
  untrusted: true;
  /**
   * Structurally false, always. Agent prose is not a receipt that an OS action
   * ran; only the governed tool registry can establish that.
   */
  actionExecuted: false;
  runtime: "HERMES_AGENT";
  /** Always none in this increment. */
  toolAuthority: "NONE";
};

export type HermesQueryResult = {
  requestId: string;
  status: "COMPLETED" | "FAIL_CLOSED" | "BLOCKED" | "DENIED";
  detail: string;
  error: { code: string; category: AIError["category"]; retryable: boolean } | null;
  output: HermesUntrustedOutput | null;
  metadata: Record<string, unknown>;
  executedAt: string;
};

const HERMES_ERROR = {
  DISABLED: "HERMES_RUNTIME_DISABLED",
  CONFIGURATION_INVALID: "HERMES_RUNTIME_CONFIGURATION_INVALID",
  TOOLSETS_NOT_SUPPORTED: "HERMES_AGENT_TOOLSETS_NOT_SUPPORTED",
  CLASSIFICATION_LIMIT: "HERMES_CLASSIFICATION_LIMIT_EXCEEDED",
  PROMPT_SIZE: "HERMES_PROMPT_SIZE_LIMIT_EXCEEDED",
  REQUEST_INVALID: "HERMES_REQUEST_INVALID",
  CLI_UNAVAILABLE: "HERMES_AGENT_CLI_UNAVAILABLE",
  EXIT: "HERMES_AGENT_EXIT",
  TIMEOUT: "HERMES_AGENT_TIMEOUT",
  OUTPUT_LIMIT: "HERMES_AGENT_OUTPUT_LIMIT_EXCEEDED",
  EMPTY_OUTPUT: "HERMES_AGENT_EMPTY_OUTPUT",
} as const;

const VERSION_HINT = /\b(\d+\.\d+\.\d+)\b/;

export class BeyuNoeliaHermesAgentRuntime {
  readonly id: string;
  readonly runtimeName: string;
  /**
   * Documented, testable statement of this runtime's authority. An agent
   * runtime that executes tools would report a different value — this one can
   * only ever report NONE.
   */
  readonly agentAuthority = "NONE" as const;
  readonly executesTools = false as const;

  private readonly config: HermesRuntimeConfig;
  private readonly invokeAgent: HermesProcessRunner;
  private readonly env: NodeJS.ProcessEnv;
  private readonly now: () => Date;

  constructor(
    config: HermesRuntimeConfig = resolveHermesRuntimeConfig(),
    dependencies: { runner?: HermesProcessRunner; env?: NodeJS.ProcessEnv; now?: () => Date } = {},
  ) {
    this.config = config;
    this.invokeAgent = dependencies.runner ?? defaultHermesProcessRunner;
    this.env = dependencies.env ?? process.env;
    this.now = dependencies.now ?? (() => new Date());
    this.id = config.runtimeId;
    this.runtimeName = config.runtimeName;
  }

  /** Non-sensitive status. Never claims connectivity without a real probe. */
  async providerStatus(): Promise<{ status: AIProviderStatus; detail: string; checkedAt: string; evidence: string[] }> {
    const checkedAt = this.now().toISOString();
    if (!this.config.enabled) {
      return {
        status: "NOT_CONNECTED",
        detail: "Hermes runtime is not enabled: NOELIA_HERMES_ENABLED is not 1.",
        checkedAt,
        evidence: ["runtime-not-enabled"],
      };
    }
    if (!this.config.valid) {
      return {
        status: "NOT_CONNECTED",
        detail: `Hermes runtime configuration is invalid (${this.config.invalidReasons.length} problem(s)); fail closed.`,
        checkedAt,
        evidence: [...this.config.invalidReasons],
      };
    }
    if (this.config.allowedToolsets.length > 0) {
      return {
        status: "NOT_CONNECTED",
        detail: `${HERMES_ERROR.TOOLSETS_NOT_SUPPORTED}: a toolset allowlist is configured, but agent tool execution is not supported by this increment.`,
        checkedAt,
        evidence: ["toolsets-declared", "tools-not-supported"],
      };
    }
    return {
      status: "CONFIGURED",
      detail: "Hermes runtime is configured with every toolset disabled. Availability has not been proven by this process.",
      checkedAt,
      evidence: ["configuration-valid", "toolsets-disabled"],
    };
  }

  /**
   * REAL availability probe: runs the CLI's version command with fixed
   * arguments. VERIFIED requires a non-zero exit-free run AND a recognisable
   * version in stdout — a mock test asserts the ladder, the operator must run
   * the same probe locally to reach VERIFIED on their machine.
   */
  async verifyAvailability(): Promise<HermesAvailability> {
    const checkedAt = this.now().toISOString();
    const status = await this.providerStatus();
    if (status.status !== "CONFIGURED") {
      return { ok: false, status: status.status, detail: `${status.detail} Verification was not attempted.`, evidence: status.evidence, checkedAt };
    }

    const outcome = await this.invokeAgent(buildHermesInvocation(this.config, "VERSION", null, this.env));
    if (outcome.spawnErrorCode !== null) {
      return {
        ok: false,
        status: "FAILED",
        detail: `${HERMES_ERROR.CLI_UNAVAILABLE}: the Hermes executable could not be started.`,
        evidence: ["version-probe:spawn-failed", `version-probe:code:${outcome.spawnErrorCode}`],
        checkedAt,
      };
    }
    if (outcome.timedOut) {
      return {
        ok: false,
        status: "FAILED",
        detail: `${HERMES_ERROR.TIMEOUT}: the version probe did not answer within the configured timeout.`,
        evidence: ["version-probe:timeout"],
        checkedAt,
      };
    }
    if (outcome.exitCode !== 0) {
      return {
        ok: false,
        status: "FAILED",
        detail: `${HERMES_ERROR.EXIT}_${outcome.exitCode ?? "UNKNOWN"}: the version probe failed.`,
        evidence: ["version-probe:non-zero-exit"],
        checkedAt,
      };
    }

    const match = VERSION_HINT.exec(outcome.stdout);
    if (!match) {
      return {
        ok: false,
        status: "DEGRADED",
        detail: "The Hermes CLI answered but did not report a recognisable version.",
        evidence: ["version-probe:exit-0", "version-probe:unrecognised-output"],
        checkedAt,
      };
    }
    return {
      ok: true,
      status: "VERIFIED",
      detail: `Hermes CLI available (version ${match[1]}) with every toolset disabled.`,
      evidence: ["version-probe:exit-0", `version-probe:version:${match[1]}`, "toolsets-disabled"],
      checkedAt,
    };
  }

  /**
   * Run ONE bounded, tool-disabled query.
   *
   * Refusals happen BEFORE any process is created: disabled runtime, invalid
   * configuration, a declared toolset allowlist, a classification above the
   * ceiling, an oversized/empty prompt or an incomplete request all return
   * without spawning anything.
   */
  async execute(request: HermesQueryRequest): Promise<HermesQueryResult> {
    const executedAt = this.now().toISOString();
    const base = { requestId: typeof request?.requestId === "string" ? request.requestId : "UNKNOWN", executedAt };

    const blocked = (status: HermesQueryResult["status"], code: string, category: AIError["category"], detail: string, metadata: Record<string, unknown> = {}): HermesQueryResult => ({
      ...base,
      status,
      detail,
      error: { code, category, retryable: false },
      output: null,
      metadata: { ...metadata, agentAuthority: this.agentAuthority, executesTools: false },
    });

    if (!request || typeof request.requestId !== "string" || request.requestId.length === 0 || typeof request.tenantId !== "string" || request.tenantId.length === 0) {
      return blocked("BLOCKED", HERMES_ERROR.REQUEST_INVALID, "POLICY", "The agent request is missing a request id or a tenant identity.", { blockedBy: "REQUEST_VALIDATION" });
    }
    if (!this.config.enabled) {
      return blocked("BLOCKED", HERMES_ERROR.DISABLED, "POLICY", "Hermes runtime is not enabled: NOELIA_HERMES_ENABLED is not 1.", { blockedBy: "RUNTIME_DISABLED" });
    }
    if (!this.config.valid) {
      return blocked("BLOCKED", HERMES_ERROR.CONFIGURATION_INVALID, "POLICY", `Hermes runtime configuration is invalid (${this.config.invalidReasons.length} problem(s)); no process was started.`, { blockedBy: "RUNTIME_CONFIGURATION_INVALID" });
    }
    if (this.config.allowedToolsets.length > 0) {
      // Fail closed rather than run an agent with tools. Enabling agent tools
      // requires a governed capability + approval path that does not exist yet.
      return blocked("BLOCKED", HERMES_ERROR.TOOLSETS_NOT_SUPPORTED, "POLICY", `${HERMES_ERROR.TOOLSETS_NOT_SUPPORTED}: agent tool execution is not supported by this increment.`, { blockedBy: "TOOLSETS_DECLARED", declaredToolsets: this.config.allowedToolsets.length });
    }
    if (classificationRank(request.classification) > classificationRank(this.config.maxClassification)) {
      return blocked("DENIED", HERMES_ERROR.CLASSIFICATION_LIMIT, "POLICY", `${HERMES_ERROR.CLASSIFICATION_LIMIT}: requested ${request.classification} exceeds the configured ceiling ${this.config.maxClassification}.`, { blockedBy: "CLASSIFICATION_LIMIT" });
    }

    const prompt = typeof request.prompt === "string" ? request.prompt : "";
    if (prompt.trim().length === 0) {
      return blocked("DENIED", HERMES_ERROR.REQUEST_INVALID, "POLICY", "The agent prompt is empty.", { blockedBy: "PROMPT_VALIDATION" });
    }
    if (prompt.length > this.config.maxPromptChars) {
      return blocked("DENIED", HERMES_ERROR.PROMPT_SIZE, "POLICY", `${HERMES_ERROR.PROMPT_SIZE}: the prompt exceeds the ${this.config.maxPromptChars} character limit.`, { blockedBy: "PROMPT_SIZE_LIMIT" });
    }

    const outcome = await this.invokeAgent(buildHermesInvocation(this.config, "QUERY", prompt, this.env));
    const metadata: Record<string, unknown> = {
      agentAuthority: this.agentAuthority,
      executesTools: false,
      toolsetsDisabled: true,
      timeoutMs: this.config.timeoutMs,
      maxTurns: this.config.maxTurns,
      stderrBytes: outcome.stderrBytes,
    };

    if (outcome.spawnErrorCode !== null) {
      return blocked("FAIL_CLOSED", HERMES_ERROR.CLI_UNAVAILABLE, "NETWORK", `${HERMES_ERROR.CLI_UNAVAILABLE}: the Hermes executable could not be started.`, { ...metadata, blockedBy: "CLI_UNAVAILABLE", spawnErrorCode: outcome.spawnErrorCode });
    }
    if (outcome.timedOut) {
      return blocked("FAIL_CLOSED", HERMES_ERROR.TIMEOUT, "TIMEOUT", `${HERMES_ERROR.TIMEOUT}: the agent did not answer within the configured timeout and was terminated.`, { ...metadata, blockedBy: "AGENT_TIMEOUT" });
    }
    if (outcome.truncated) {
      return blocked("FAIL_CLOSED", HERMES_ERROR.OUTPUT_LIMIT, "MALFORMED_RESPONSE", `${HERMES_ERROR.OUTPUT_LIMIT}: the agent produced more output than the accepted limit.`, { ...metadata, blockedBy: "OUTPUT_LIMIT" });
    }
    if (outcome.exitCode !== 0) {
      // Raw stderr is never returned: only the exit code is reported.
      return blocked("FAIL_CLOSED", `${HERMES_ERROR.EXIT}_${outcome.exitCode ?? "UNKNOWN"}`, "INTERNAL", `${HERMES_ERROR.EXIT}_${outcome.exitCode ?? "UNKNOWN"}: the agent exited without completing.`, { ...metadata, blockedBy: "AGENT_EXIT" });
    }
    const text = outcome.stdout.trim();
    if (text.length === 0) {
      return blocked("FAIL_CLOSED", HERMES_ERROR.EMPTY_OUTPUT, "MALFORMED_RESPONSE", `${HERMES_ERROR.EMPTY_OUTPUT}: the agent returned no output.`, { ...metadata, blockedBy: "EMPTY_OUTPUT" });
    }

    return {
      ...base,
      status: "COMPLETED",
      detail: "The agent returned prose. It is untrusted data, not an action receipt.",
      error: null,
      output: {
        text,
        outputClass: "INFERENCE",
        untrusted: true,
        actionExecuted: false,
        runtime: "HERMES_AGENT",
        toolAuthority: "NONE",
      },
      metadata: { ...metadata, outputChars: text.length },
      executedAt,
    };
  }
}

export { HERMES_LIMITS };
