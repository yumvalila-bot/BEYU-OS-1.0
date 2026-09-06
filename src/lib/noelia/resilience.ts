import { hasDatabaseTransactionContext } from "@/db";
import type { Principal } from "@/lib/authz";
import { can } from "@/lib/authz";
import { BeyuNoeliaObservabilityService, type TelemetryInput } from "./observability";

/**
 * Phase 5 production resilience.
 *
 * The guard does two things:
 *   1. Wraps a provider/router call in a fail-closed circuit breaker that
 *      refuses to keep hitting a failing upstream and never fails on an
 *      unapproved side of the governing boundary.
 *   2. Records non-sensitive resilience telemetry (status, latency, model id)
 *      without persisting prompts, outputs or credentials.
 *
 * It is intentionally small. It does not implement retry-with-authority,
 * provider switching without registry review, or silent degradation.
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export type ResiliencePolicy = {
  failureThreshold?: number;
  recoveryAttempts?: number;
  openMs?: number;
  allowHalfOpen?: boolean;
};

export type ResilienceCall<T> = {
  principal: Principal;
  traceId: string;
  requestId: string;
  spanId?: string;
  tenantId?: string | null;
  countryCode?: string | null;
  osId?: string | null;
  task: string;
  capability: string;
  modelId: string;
  modelVersion: string;
  providerId: string | null;
  dryRun?: boolean;
  operation: () => Promise<T>;
};

export type ResilienceCallResult<T> = {
  ok: true;
  value: T;
  attempts: number;
  circuit: CircuitState;
  failClosed: false;
} | {
  ok: false;
  value: null;
  attempts: number;
  circuit: CircuitState;
  failClosed: true;
  reason: string;
};

function requireContext(): void {
  if (!hasDatabaseTransactionContext()) throw new Error("Noelia resilience requires canonical transaction-scoped tenant context");
}

function requireMetrics(principal: Principal): void {
  const decision = can(principal, "ai:compliance.metrics");
  if (!decision.allowed) throw new Error(`Resilience telemetry denied: ${decision.reason}`);
}

export class BeyuNoeliaCircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private state: CircuitState = "CLOSED";
  private readonly failureThreshold: number;
  private readonly openMs: number;
  private readonly allowHalfOpen: boolean;

  constructor(policy: ResiliencePolicy = {}) {
    this.failureThreshold = policy.failureThreshold ?? 3;
    this.openMs = policy.openMs ?? 30_000;
    this.allowHalfOpen = policy.allowHalfOpen ?? true;
  }

  get status(): CircuitState {
    if (this.state === "OPEN" && Date.now() - this.openedAt >= this.openMs) return this.allowHalfOpen ? "HALF_OPEN" : "OPEN";
    return this.state;
  }

  beforeCall(): { allowed: boolean; state: CircuitState; reason: string } {
    const state = this.status;
    if (state === "OPEN") return { allowed: false, state, reason: "Circuit open; refusing to call a failing upstream." };
    if (state === "HALF_OPEN") {
      // A single probe is permitted; concurrent requests are rejected until the
      // probe resolves. This is the bounded-recovery property of HALF_OPEN.
      if (this.probeInFlight) return { allowed: false, state, reason: "Recovery probe already in flight." };
      this.probeInFlight = true;
    }
    return { allowed: true, state, reason: "allowed" };
  }

  private probeInFlight = false;

  onSuccess(): void {
    this.failures = 0;
    this.probeInFlight = false;
    this.state = "CLOSED";
    this.openedAt = 0;
  }

  onFailure(): void {
    this.probeInFlight = false;
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.state = "OPEN";
      this.openedAt = Date.now();
    }
  }
}

export class BeyuNoeliaProductionResilience {
  private readonly observability = new BeyuNoeliaObservabilityService();
  private readonly breaker = new BeyuNoeliaCircuitBreaker();

  async guardedCall<T>(input: ResilienceCall<T>): Promise<ResilienceCallResult<T>> {
    requireContext();
    requireMetrics(input.principal);
    const startedAt = Date.now();
    const preflight = this.breaker.beforeCall();

    const baseTelemetry: Omit<TelemetryInput, "principal" | "task" | "capability" | "status"> = {
      traceId: input.traceId,
      requestId: input.requestId,
      spanId: input.spanId ?? null,
      tenantId: input.tenantId ?? null,
      countryCode: input.countryCode ?? null,
      osId: input.osId ?? null,
      modelId: input.modelId,
      modelVersion: input.modelVersion,
      providerId: input.providerId,
    };

    if (!preflight.allowed) {
      await this.observability
        .recordTelemetry({
          principal: input.principal,
          traceId: input.traceId,
          requestId: input.requestId,
          spanId: input.spanId ?? null,
          tenantId: input.tenantId ?? null,
          countryCode: input.countryCode ?? null,
          osId: input.osId ?? null,
          task: input.task,
          capability: input.capability,
          modelId: input.modelId,
          modelVersion: input.modelVersion,
          providerId: input.providerId,
          status: "FAIL_CLOSED",
          latencyMs: Date.now() - startedAt,
          payload: { circuit: preflight.state, dryRun: input.dryRun ?? false },
        })
        .catch(() => undefined);
      return { ok: false, value: null, attempts: this.breakerStatusAttempts(), circuit: preflight.state, failClosed: true, reason: preflight.reason };
    }

    if (input.dryRun) {
      try {
        const value = await input.operation();
        this.breaker.onSuccess();
        return { ok: true, value, attempts: 1, circuit: "CLOSED", failClosed: false };
      } catch (err) {
        this.breaker.onFailure();
        const reason = err instanceof Error ? err.message : "Unknown resilience guard failure.";
        await this.recordFailure(input, baseTelemetry, reason, Date.now() - startedAt);
        return { ok: false, value: null, attempts: this.breakerStatusAttempts(), circuit: this.breaker.status, failClosed: true, reason };
      }
    }

    let attempts = 0;
    let lastReason = "Unknown provider failure.";
    while (this.breaker.beforeCall().allowed) {
      attempts += 1;
      try {
        const value = await input.operation();
        this.breaker.onSuccess();
        await this.recordSuccess(input, baseTelemetry, Date.now() - startedAt);
        return { ok: true, value, attempts, circuit: "CLOSED", failClosed: false };
      } catch (err) {
        lastReason = err instanceof Error ? err.message : "Unknown provider failure.";
        this.breaker.onFailure();
        if (this.breaker.status === "OPEN") break;
      }
    }
    await this.recordFailure(input, baseTelemetry, lastReason, Date.now() - startedAt);
    return { ok: false, value: null, attempts, circuit: this.breaker.status, failClosed: true, reason: lastReason };
  }

  private breakerStatusAttempts(): number {
    return this.breaker.status === "CLOSED" ? 0 : 1;
  }

  private async recordSuccess(input: ResilienceCall<unknown>, base: Omit<TelemetryInput, "principal" | "task" | "capability" | "status">, latencyMs: number): Promise<void> {
    await this.observability
      .recordTelemetry({
        ...base,
        principal: input.principal,
        task: input.task,
        capability: input.capability,
        status: "SUCCESS",
        latencyMs,
        payload: { resilience: "guarded" },
      })
      .catch(() => undefined);
  }

  private async recordFailure(input: ResilienceCall<unknown>, base: Omit<TelemetryInput, "principal" | "task" | "capability" | "status">, reason: string, latencyMs: number): Promise<void> {
    await this.observability
      .recordTelemetry({
        ...base,
        principal: input.principal,
        task: input.task,
        capability: input.capability,
        status: "ERROR",
        latencyMs,
        payload: { resilience: "guard", reason },
      })
      .catch(() => undefined);
  }

  /** Honest runtime health summary. `REAL_GENERATIVE_INFERENCE` stays blocked when no provider is mounted. */
  async healthSummary(principal: Principal): Promise<{
    circuit: CircuitState;
    databaseContextBound: boolean;
    realGenerativeInference: "ENVIRONMENT_LIMITED" | "BLOCKED" | "AVAILABLE";
    note: string;
  }> {
    requireContext();
    requireMetrics(principal);
    const configured = Boolean(process.env.NOELIA_GENERATIVE_ENDPOINT && process.env.NOELIA_GENERATIVE_CREDENTIAL_REF);
    return {
      circuit: this.breaker.status,
      databaseContextBound: hasDatabaseTransactionContext(),
      realGenerativeInference: configured ? "AVAILABLE" : "BLOCKED",
      note: configured
        ? "A real generative endpoint and credential reference are present; registry/approval still governs execution."
        : "No real generative endpoint or credential reference is present; inference remains BLOCKED/ENVIRONMENT_LIMITED.",
    };
  }
}
