import { describe, it, expect } from "@jest/globals";
import { JsonLogger } from "./json-logger";

function capture(fn: () => void): { out: string; err: string } {
  const out: string[] = [];
  const err: string[] = [];
  const oldOut = process.stdout.write;
  const oldErr = process.stderr.write;
  process.stdout.write = ((chunk: any) => {
    out.push(String(chunk));
    return true;
  }) as any;
  process.stderr.write = ((chunk: any) => {
    err.push(String(chunk));
    return true;
  }) as any;
  try {
    fn();
  } finally {
    process.stdout.write = oldOut;
    process.stderr.write = oldErr;
  }
  return { out: out.join(""), err: err.join("") };
}

describe("JsonLogger", () => {
  it("emits one JSON object per log line", () => {
    const { out } = capture(() =>
      new JsonLogger().log("hello", { reqId: "abc" }),
    );
    const parsed = JSON.parse(out.trim());
    expect(parsed).toMatchObject({ level: "info", msg: "hello", reqId: "abc" });
    expect(typeof parsed.ts).toBe("number");
  });

  it("redacts secret-key fields", () => {
    const { out } = capture(() =>
      new JsonLogger().log("ok", {
        refresh_token: "rt-123",
        password: "pw",
        api_key: "k",
        reqId: "abc",
      }),
    );
    const parsed = JSON.parse(out.trim());
    expect(parsed.refresh_token).toBe("[REDACTED]");
    expect(parsed.password).toBe("[REDACTED]");
    expect(parsed.api_key).toBe("[REDACTED]");
    expect(parsed.reqId).toBe("abc");
    expect(out).not.toMatch(/rt-123|"pw"|"k"/);
  });

  it("writes error level to stderr", () => {
    const { err } = capture(() => new JsonLogger().error("boom"));
    expect(JSON.parse(err.trim())).toMatchObject({
      level: "error",
      msg: "boom",
    });
  });
});
