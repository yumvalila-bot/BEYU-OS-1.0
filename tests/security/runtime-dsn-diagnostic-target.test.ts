/**
 * D2 — the runtime DSN diagnostic may send the runtime password only to a Supabase
 * connection pooler. Before the guard existed, DIAG_HOST was a free dispatch input.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assertDiagnosticTarget, DiagnosticTargetError } from "@/lib/release/diagnostic-target";

describe("assertDiagnosticTarget · accepted targets", () => {
  it.each([
    ["aws-0-eu-west-3.pooler.supabase.com", 6543],
    ["aws-0-eu-west-3.pooler.supabase.com", 5432],
    ["AWS-0-EU-WEST-3.POOLER.SUPABASE.COM", 6543],
    ["  aws-0-eu-west-3.pooler.supabase.com  ", 6543],
  ])("accepts %s:%s and normalises it", (host, port) => {
    const t = assertDiagnosticTarget(host, port);
    expect(t.host).toBe("aws-0-eu-west-3.pooler.supabase.com");
    expect(t.port).toBe(port);
  });
});

describe("assertDiagnosticTarget · refused hosts (credential exfiltration)", () => {
  it.each([
    "attacker.example",
    "pooler.supabase.com", // no label before the zone
    "aws-0-eu-west-3.pooler.supabase.com.attacker.example", // suffix trick
    "evil.example/.pooler.supabase.com", // path / separator trick
    "aws-0-eu-west-3.pooler.supabase.com@attacker.example", // userinfo trick
    "xn--aws.pooler.supabase.co", // wrong zone
    "db.siyzygezdmlxbvwttrdz.supabase.co", // direct database host is not a pooler
    "-bad.pooler.supabase.com", // label starts with a hyphen
    "a..pooler.supabase.com", // empty label
    "127.0.0.1", // loopback
    "169.254.169.254", // cloud metadata
    "",
    "   ",
    `${"a".repeat(250)}.pooler.supabase.com`, // over 253 characters
  ])("refuses %j", (host) => {
    expect(() => assertDiagnosticTarget(host, 6543)).toThrow(DiagnosticTargetError);
  });

  it("the refusal message names the rule, never the offending host", () => {
    try {
      assertDiagnosticTarget("secret-looking-host.attacker.example", 6543);
      throw new Error("expected refusal");
    } catch (e) {
      expect(e).toBeInstanceOf(DiagnosticTargetError);
      expect((e as Error).message).not.toContain("attacker");
      expect((e as Error).message).toContain("*.pooler.supabase.com");
    }
  });
});

describe("assertDiagnosticTarget · refused ports", () => {
  it.each([22, 80, 443, 5433, 6544, 0, -1, 5432.5, Number.NaN])("refuses port %s", (port) => {
    expect(() => assertDiagnosticTarget("aws-0-eu-west-3.pooler.supabase.com", port)).toThrow(DiagnosticTargetError);
  });
});

describe("scripts/diagnose-runtime-dsn.mts routes every connection through the guard", () => {
  const source = readFileSync(resolve(import.meta.dirname, "..", "..", "scripts", "diagnose-runtime-dsn.mts"), "utf8");

  it("imports the guard", () => {
    expect(source).toContain('from "../src/lib/release/diagnostic-target"');
  });

  it("asserts the target before any probe, and uses the normalised target for TLS and the DSN", () => {
    const guard = source.indexOf("assertDiagnosticTarget(HOST, PORT)");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(source.indexOf("tlsProbe(target.host, target.port)"));
    expect(guard).toBeLessThan(source.indexOf("process.env.DATABASE_URL = runtimeDsn"));
    expect(source).toContain("@${target.host}:${target.port}/");
    expect(source).not.toMatch(/@\$\{HOST\}/);
  });

  it("the runtime DSN is only built after the guard has run", () => {
    expect(source.indexOf("const runtimeDsn")).toBeGreaterThan(source.indexOf("assertDiagnosticTarget(HOST, PORT)"));
  });
});
