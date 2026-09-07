/**
 * BEYU OS — Performance Benchmarks
 *
 * LOCAL BENCHMARKS ONLY. These measure performance in the test environment
 * and DO NOT represent production capacity. Results are environment-dependent.
 *
 * Measurements:
 * - Throughput (operations per second)
 * - Latency (p50, p95, p99)
 * - Error rate
 * - Concurrency behavior
 *
 * Safety:
 * - Controlled limits to prevent environment destabilization
 * - All test data cleaned after each suite
 * - Repeatable and deterministic
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";

const TENANT = "TEN_PERF_TEST";
const ENTITY = "LE_PERF_TEST";

async function cleanup() {
  await db.execute(sql`delete from payment_transactions where id like 'PAY_PERF_%'`);
  await db.execute(sql`delete from payment_risk_signals where id like 'EVD_PERF_%'`);
  await db.execute(sql`delete from agriculture_farms where id like 'FARM_PERF_%'`);
  await db.execute(sql`delete from agriculture_fields where id like 'FIELD_PERF_%'`);
  await db.execute(sql`delete from legal_entities where id = ${ENTITY}`);
  await db.execute(sql`delete from tenants where id = ${TENANT}`);
}

beforeEach(async () => {
  await cleanup();

  await db.execute(sql`
    insert into tenants (id, code, name, type) values (${TENANT}, 'PERF_TEST', 'Performance Test Tenant', 'ENTERPRISE')
  `);

  await db.execute(sql`
    insert into legal_entities (id, tenant_id, code, legal_name, entity_type, country_code, effective_from) values
    (${ENTITY}, ${TENANT}, 'PERF_ENTITY', 'Performance Test Entity', 'OPERATING_COMPANY', 'TZ', '2026-01-01')
  `);
});

afterAll(cleanup);

/**
 * Measure operation latency and throughput.
 */
async function benchmark<T>(
  name: string,
  operation: () => Promise<T>,
  iterations: number,
  concurrency: number = 1,
): Promise<{
  name: string;
  iterations: number;
  concurrency: number;
  totalMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  throughputPerSec: number;
  errors: number;
}> {
  const latencies: number[] = [];
  let errors = 0;

  const startTime = Date.now();

  if (concurrency === 1) {
    // Sequential execution
    for (let i = 0; i < iterations; i++) {
      const opStart = Date.now();
      try {
        await operation();
        latencies.push(Date.now() - opStart);
      } catch (err) {
        errors++;
        latencies.push(Date.now() - opStart);
      }
    }
  } else {
    // Concurrent execution
    const batches = Math.ceil(iterations / concurrency);
    for (let batch = 0; batch < batches; batch++) {
      const promises = [];
      for (let i = 0; i < concurrency && batch * concurrency + i < iterations; i++) {
        promises.push(
          (async () => {
            const opStart = Date.now();
            try {
              await operation();
              latencies.push(Date.now() - opStart);
            } catch (err) {
              errors++;
              latencies.push(Date.now() - opStart);
            }
          })(),
        );
      }
      await Promise.all(promises);
    }
  }

  const totalMs = Date.now() - startTime;
  latencies.sort((a, b) => a - b);

  const avgMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p50Ms = latencies[Math.floor(latencies.length * 0.5)];
  const p95Ms = latencies[Math.floor(latencies.length * 0.95)];
  const p99Ms = latencies[Math.floor(latencies.length * 0.99)];
  const throughputPerSec = (iterations / totalMs) * 1000;

  return {
    name,
    iterations,
    concurrency,
    totalMs,
    avgMs,
    p50Ms,
    p95Ms,
    p99Ms,
    throughputPerSec,
    errors,
  };
}

describe("database operations performance", () => {
  it("SELECT performance - single row by ID", async () => {
    // Insert test data
    await db.execute(sql`
      insert into agriculture_farms (id, tenant_id, legal_entity_id, code, name, country_code)
      values ('FARM_PERF_1', ${TENANT}, ${ENTITY}, 'FARM-PERF-1', 'Test Farm', 'TZ')
    `);

    const result = await benchmark(
      "SELECT by ID",
      async () => {
        await db.execute(sql`select * from agriculture_farms where id = 'FARM_PERF_1'`);
      },
      100,
      1,
    );

    expect(result.errors).toBe(0);
    expect(result.p95Ms).toBeLessThan(50); // p95 < 50ms
    console.log("SELECT by ID performance:", result);
  });

  it("INSERT performance - single row", async () => {
    let counter = 0;
    const result = await benchmark(
      "INSERT single row",
      async () => {
        counter++;
        // Values are bound as parameters (never interpolated inside a string
        // literal) so the statement stays valid SQL.
        const id = `FARM_PERF_INS_${counter}`;
        const code = `FARM-INS-${counter}`;
        await db.execute(sql`
          insert into agriculture_farms (id, tenant_id, legal_entity_id, code, name, country_code)
          values (${id}, ${TENANT}, ${ENTITY}, ${code}, ${`Farm ${counter}`}, 'TZ')
          on conflict (id) do nothing
        `);
      },
      50,
      1,
    );

    expect(result.errors).toBe(0);
    expect(result.p95Ms).toBeLessThan(100); // p95 < 100ms
    console.log("INSERT performance:", result);

    // Cleanup
    await db.execute(sql`delete from agriculture_farms where id like 'FARM_PERF_INS_%'`);
  });

  it("concurrent SELECT performance", async () => {
    // Insert test data
    for (let i = 0; i < 10; i++) {
      const id = `FARM_PERF_CONC_${i}`;
      const code = `FARM-CONC-${i}`;
      await db.execute(sql`
        insert into agriculture_farms (id, tenant_id, legal_entity_id, code, name, country_code)
        values (${id}, ${TENANT}, ${ENTITY}, ${code}, ${`Farm ${i}`}, 'TZ')
        on conflict (id) do nothing
      `);
    }

    const result = await benchmark(
      "Concurrent SELECT",
      async () => {
        await db.execute(sql`select * from agriculture_farms where tenant_id = ${TENANT} limit 1`);
      },
      100,
      10, // 10 concurrent
    );

    expect(result.errors).toBe(0);
    expect(result.p95Ms).toBeLessThan(100); // p95 < 100ms under concurrency
    console.log("Concurrent SELECT performance:", result);

    // Cleanup
    await db.execute(sql`delete from agriculture_farms where id like 'FARM_PERF_CONC_%'`);
  });
});

describe("agriculture API domain operations performance", () => {
  it("farm creation throughput", async () => {
    let counter = 0;
    const result = await benchmark(
      "Farm creation",
      async () => {
        counter++;
        const id = `FARM_PERF_THR_${counter}`;
        const code = `FARM-THR-${counter}`;
        await db.execute(sql`
          insert into agriculture_farms (id, tenant_id, legal_entity_id, code, name, country_code)
          values (${id}, ${TENANT}, ${ENTITY}, ${code}, ${`Throughput Farm ${counter}`}, 'TZ')
          on conflict (id) do nothing
        `);
      },
      50,
      5, // 5 concurrent
    );

    expect(result.errors).toBe(0);
    expect(result.throughputPerSec).toBeGreaterThan(10); // >10 ops/sec
    console.log("Farm creation throughput:", result);

    // Cleanup
    await db.execute(sql`delete from agriculture_farms where id like 'FARM_PERF_THR_%'`);
  });

  it("field creation with farm FK", async () => {
    // Create parent farm
    await db.execute(sql`
      insert into agriculture_farms (id, tenant_id, legal_entity_id, code, name, country_code)
      values ('FARM_PERF_FK', ${TENANT}, ${ENTITY}, 'FARM-FK', 'FK Test Farm', 'TZ')
      on conflict (id) do nothing
    `);

    let counter = 0;
    const result = await benchmark(
      "Field creation with FK",
      async () => {
        counter++;
        const id = `FIELD_PERF_${counter}`;
        const code = `FIELD-${counter}`;
        await db.execute(sql`
          insert into agriculture_fields (id, tenant_id, farm_id, code, name, area_ha)
          values (${id}, ${TENANT}, 'FARM_PERF_FK', ${code}, ${`Field ${counter}`}, ${counter})
          on conflict (id) do nothing
        `);
      },
      30,
      3,
    );

    expect(result.errors).toBe(0);
    expect(result.p95Ms).toBeLessThan(150); // p95 < 150ms
    console.log("Field creation with FK performance:", result);

    // Cleanup
    await db.execute(sql`delete from agriculture_fields where id like 'FIELD_PERF_%'`);
    await db.execute(sql`delete from agriculture_farms where id = 'FARM_PERF_FK'`);
  });
});

describe("authorization check performance", () => {
  it("tenant isolation check throughput", async () => {
    // Insert test data
    await db.execute(sql`
      insert into agriculture_farms (id, tenant_id, legal_entity_id, code, name, country_code)
      values ('FARM_PERF_AUTH', ${TENANT}, ${ENTITY}, 'FARM-AUTH', 'Auth Test Farm', 'TZ')
      on conflict (id) do nothing
    `);

    const result = await benchmark(
      "Tenant isolation check",
      async () => {
        // Simulate RLS check
        await db.execute(sql`
          select * from agriculture_farms
          where id = 'FARM_PERF_AUTH' and tenant_id = ${TENANT}
        `);
      },
      200,
      10,
    );

    expect(result.errors).toBe(0);
    expect(result.p95Ms).toBeLessThan(50); // p95 < 50ms
    expect(result.throughputPerSec).toBeGreaterThan(50); // >50 ops/sec
    console.log("Tenant isolation check performance:", result);

    // Cleanup
    await db.execute(sql`delete from agriculture_farms where id = 'FARM_PERF_AUTH'`);
  });
});

describe("reconciliation performance", () => {
  it("treasury query performance with multiple positions", async () => {
    // This tests the reconciliation query pattern
    const result = await benchmark(
      "Treasury aggregation",
      async () => {
        await db.execute(sql`
          select
            count(*)::int as total,
            coalesce(sum(base_currency_balance), 0)::text as total_balance
          from treasury_positions
          where tenant_id = ${TENANT}
        `);
      },
      100,
      5,
    );

    expect(result.errors).toBe(0);
    expect(result.p95Ms).toBeLessThan(100); // p95 < 100ms
    console.log("Treasury aggregation performance:", result);
  });
});

describe("performance summary", () => {
  it("generates performance report", async () => {
    // This test just documents the performance characteristics
    console.log("\n=== PERFORMANCE BENCHMARK SUMMARY ===");
    console.log("Environment: LOCAL (test database)");
    console.log("NOTE: These results DO NOT represent production capacity.");
    console.log("Production performance depends on infrastructure, network, and load.\n");

    const summary = {
      environment: "LOCAL",
      database: "PostgreSQL (test instance)",
      timestamp: new Date().toISOString(),
      note: "Local benchmarks only. Not indicative of production capacity.",
    };

    console.log(summary);
    expect(true).toBe(true);
  });
});
