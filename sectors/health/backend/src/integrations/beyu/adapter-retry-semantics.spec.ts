/**
 * Locks in the retry-classification semantics of the governed BEYU adapter.
 *
 * Retry is implemented HERE, in BeyuBaseAdapter.execute(), not in the circuit
 * breaker. The circuit breaker only fails fast, counts failures and opens at
 * threshold; it re-throws and never retries. That separation is deliberate:
 * retrying is a caller-level decision that has to reason about idempotency.
 *
 * The classification that drives it is the module-local isRetryable() helper:
 * only transport failures, 429 and 5xx are retryable. Notably CIRCUIT_OPEN *is*
 * retryable, and 4xx is *not*.
 *
 * A previous, unused copy of this logic lived in circuit-breaker.ts and had the
 * CIRCUIT_OPEN polarity exactly backwards
 * (`code === "CIRCUIT_OPEN" === false`, which parses as
 * `(code === "CIRCUIT_OPEN") === false`) plus an unbounded `status >= 500`. Had
 * it ever been wired in, authorization failures would have been retried and
 * circuit-open failures would not. These tests make that mistake fail CI.
 */
import "reflect-metadata";
import { BeyuBaseAdapter } from "./adapters/beyu-base.adapter";
import { CircuitBreaker } from "../../modules/integrations/circuit-breaker";
import { AuditService } from "../../modules/audit/audit.service";
import { buildTestBed } from "../../common/testing/test-bed";

const ENDPOINT_ENV = "TEST_ADAPTER_ENDPOINT";

/**
 * Minimal adapter whose outbound call we control, so the retry loop is reachable.
 *
 * Each instance gets a UNIQUE provider name: the circuit breaker keys its state
 * on `provider:action` per tenant, so sharing one name would let the failure
 * count from an earlier test open the circuit for a later one and the later test
 * would observe CIRCUIT_OPEN instead of its own error.
 */
class ProbeAdapter extends BeyuBaseAdapter {
  protected readonly config: {
    provider: string;
    endpointEnv: string;
    credentialEnvs: string[];
    defaultTimeoutMs: number;
    maxRetries: number;
    baseBackoffMs: number;
  };

  attempts = 0;

  constructor(
    db: any,
    tenantCtx: any,
    circuit: CircuitBreaker,
    cfg: any,
    auditService: AuditService,
    private readonly tag: string,
    private readonly behaviour: () => Promise<unknown>,
  ) {
    super(db, tenantCtx, circuit, cfg, auditService);
    this.config = {
      provider: `probe-${tag}`,
      endpointEnv: ENDPOINT_ENV,
      credentialEnvs: [],
      defaultTimeoutMs: 2000,
      maxRetries: 3,
      baseBackoffMs: 1,
    };
  }

  call() {
    return this.execute(this.tag, { ping: true }, async () => {
      this.attempts += 1;
      return this.behaviour();
    });
  }
}

function failing(err: Record<string, unknown>) {
  return async () => {
    throw Object.assign(new Error("downstream failure"), err);
  };
}

describe("BEYU adapter retry classification (no retry amplification)", () => {
  let bed: any;
  let circuit: CircuitBreaker;
  const cfg = {
    get: (k: string) =>
      k === ENDPOINT_ENV ? "https://example.invalid" : undefined,
  };

  beforeAll(async () => {
    bed = await buildTestBed();
    circuit = new CircuitBreaker(bed.conn, bed.tenantCtx);
  });

  let seq = 0;
  function build(behaviour: () => Promise<unknown>) {
    seq += 1;
    return new ProbeAdapter(
      bed.conn,
      bed.tenantCtx,
      circuit,
      cfg,
      bed.audit,
      `t${seq}`,
      behaviour,
    );
  }

  function outboxCount(provider: string) {
    return bed.conn.query(
      `SELECT count(*)::int AS n FROM health.beyu_outbox WHERE provider=$1`,
      [provider],
    );
  }

  it("does NOT retry a non-retryable authorization failure (HTTP 403)", async () => {
    const a = build(failing({ status: 403 }));
    await bed.run(() => a.call()).catch(() => undefined);
    expect(a.attempts).toBe(1);
  });

  it("does NOT retry a validation failure (HTTP 422)", async () => {
    const a = build(failing({ status: 422 }));
    await bed.run(() => a.call()).catch(() => undefined);
    expect(a.attempts).toBe(1);
  });

  it("does NOT retry an authentication failure (HTTP 401)", async () => {
    const a = build(failing({ code: "ERR_BAD_REQUEST", status: 401 }));
    await bed.run(() => a.call()).catch(() => undefined);
    expect(a.attempts).toBe(1);
  });

  it("retries a retryable 5xx, bounded by maxRetries", async () => {
    const a = build(failing({ status: 503 }));
    await bed.run(() => a.call()).catch(() => undefined);
    // maxRetries = 3 -> 1 initial attempt + 3 retries, never more.
    expect(a.attempts).toBe(4);
  });

  it("retries a transport failure (ECONNREFUSED), bounded by maxRetries", async () => {
    const a = build(failing({ code: "ECONNREFUSED" }));
    await bed.run(() => a.call()).catch(() => undefined);
    expect(a.attempts).toBe(4);
  });

  it("treats CIRCUIT_OPEN as retryable (polarity regression guard)", async () => {
    const a = build(failing({ code: "CIRCUIT_OPEN" }));
    await bed.run(() => a.call()).catch(() => undefined);
    expect(a.attempts).toBeGreaterThan(1);
  });

  it("does not treat an out-of-range status such as 700 as retryable", async () => {
    const a = build(failing({ status: 700 }));
    await bed.run(() => a.call()).catch(() => undefined);
    expect(a.attempts).toBe(1);
  });

  it("writes exactly ONE outbox row per logical call despite retries (no duplicate transaction record)", async () => {
    const a = build(failing({ status: 503 }));
    const before = (await outboxCount((a as any).config.provider))[0].n;
    await bed.run(() => a.call()).catch(() => undefined);
    expect(a.attempts).toBeGreaterThan(1);
    const after = (await outboxCount((a as any).config.provider))[0].n;
    expect(after - before).toBe(1);
  });

  it("succeeds on the first attempt without retrying", async () => {
    const a = build(async () => ({ ok: true }));
    const res = await bed.run(() => a.call());
    expect(res).toEqual({ ok: true });
    expect(a.attempts).toBe(1);
  });
});
