/**
 * Payment DR, fixture, reset and demo tooling may only touch a local disposable
 * database (audit H-3). The guard is exercised directly, and every guarded entry
 * point is checked statically, so a new tool cannot silently skip it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertDisposablePaymentsTarget, DisposableTargetError } from "@/lib/payments/disposable-target";

const ROOT = join(__dirname, "..", "..");
const SECRET = "p4ss-w0rd-must-not-leak";

describe("disposable payments target guard", () => {
  it("accepts a loopback PostgreSQL target in a non-production environment", () => {
    expect(assertDisposablePaymentsTarget(`postgresql://postgres:${SECRET}@127.0.0.1:5432/beyu_os`, "t", {})).toEqual({
      host: "127.0.0.1",
      database: "beyu_os",
    });
    expect(assertDisposablePaymentsTarget("postgres://u:x@localhost/beyu_dr", "t", { NODE_ENV: "test" }).host).toBe("localhost");
    expect(assertDisposablePaymentsTarget("postgresql://u:x@[::1]:5432/scratch", "t", {}).host).toBe("[::1]");
  });

  it("refuses a remote host, whatever the database is called", () => {
    for (const url of [
      `postgresql://u:${SECRET}@db.example.test:5432/beyu_scratch`,
      `postgresql://u:${SECRET}@10.0.0.5:5432/beyu_os`,
      `postgresql://u:${SECRET}@127.0.0.1.nip.io:5432/beyu_os`,
    ]) {
      expect(() => assertDisposablePaymentsTarget(url, "payments test", {})).toThrow(DisposableTargetError);
    }
  });

  it("refuses production by NODE_ENV or BEYU_ENV, even for a loopback target", () => {
    expect(() => assertDisposablePaymentsTarget("postgresql://u:x@127.0.0.1/beyu_os", "t", { NODE_ENV: "production" })).toThrow(
      /production/,
    );
    expect(() => assertDisposablePaymentsTarget("postgresql://u:x@127.0.0.1/beyu_os", "t", { BEYU_ENV: "PRODUCTION" })).toThrow(
      /production/,
    );
  });

  it("refuses a missing, unparseable or non-PostgreSQL URL without echoing it", () => {
    expect(() => assertDisposablePaymentsTarget(undefined, "t", {})).toThrow(/no admin database URL/);
    expect(() => assertDisposablePaymentsTarget("   ", "t", {})).toThrow(/no admin database URL/);
    let message = "";
    try {
      assertDisposablePaymentsTarget(`not a url ${SECRET}`, "t", {});
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/not parseable/);
    expect(message).not.toContain(SECRET);
    expect(() => assertDisposablePaymentsTarget(`mysql://u:x@127.0.0.1/beyu_os`, "t", {})).toThrow(/not a PostgreSQL URL/);
  });

  it("never includes the connection string in any refusal", () => {
    for (const url of [`postgresql://u:${SECRET}@db.example.test:5432/beyu`, `postgresql://u:${SECRET}@[::2]/beyu`]) {
      try {
        assertDisposablePaymentsTarget(url, "t", {});
        throw new Error("expected refusal");
      } catch (e) {
        expect((e as Error).message).not.toContain(SECRET);
        expect((e as Error).message).not.toContain("db.example.test");
      }
    }
  });
});

describe("every payment DR, fixture, reset and demo entry point applies the guard", () => {
  const GUARDED: Array<[string, string]> = [
    ["scripts/payments-dr-fixture.ts", "payments DR fixture"],
    ["scripts/payments-demo.ts", "payments demonstration"],
    ["scripts/payments-perf-probe.ts", "payments performance probe"],
    ["scripts/payments-dr-replay.ts", "payments DR replay"],
    ["src/lib/payments/fixture-reset.ts", "payment fixture reset"],
  ];
  for (const [file, purpose] of GUARDED) {
    it(`${file} calls assertDisposablePaymentsTarget`, () => {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source).toContain("assertDisposablePaymentsTarget(");
      expect(source).toContain(purpose);
    });
  }
});
