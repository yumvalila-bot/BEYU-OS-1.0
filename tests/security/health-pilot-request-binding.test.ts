import { describe, expect, it } from "vitest";
import { bindHealthPilotRequest } from "@/lib/health/pilot-request-binding";

const approved = "/internal/health/pilot"; // test fixture, NOT an approved endpoint
const empty = new Uint8Array();

describe("isolated Health pilot request binding", () => {
  it("binds an exact GET and the SHA-256 of the transmitted empty body", () => {
    expect(bindHealthPilotRequest(approved, approved, "GET", empty)).toEqual({
      method: "GET",
      target: approved,
      body_sha256: "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU",
    });
  });

  it.each([
    "/internal/health/pilot?", "/internal/health/pilot?a=1", "/internal/health/pilot/",
    "/internal//health/pilot", "/internal/health/../health/pilot", "/internal/health/%70ilot",
    "/internal/health/pilot%2F", "//internal/health/pilot", "/internal\\health/pilot",
    "https://health.example/internal/health/pilot", "/internal/health/pilot#fragment",
  ])("rejects non-identical or ambiguous raw target %s", (raw) => {
    expect(bindHealthPilotRequest(approved, raw, "GET", empty)).toBeNull();
  });

  it.each(["get", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"])("rejects method %s", (method) => {
    expect(bindHealthPilotRequest(approved, approved, method, empty)).toBeNull();
  });

  it("rejects even a one-byte GET body", () => {
    expect(bindHealthPilotRequest(approved, approved, "GET", new Uint8Array([0]))).toBeNull();
  });

  it.each(["/", "/internal//pilot", "/internal/../pilot", "/internal/%70ilot", "/internal/pilot?", "/internal/pilot/", "https://example.test/pilot"])("rejects invalid configured path %s", (path) => {
    expect(bindHealthPilotRequest(path, path, "GET", empty)).toBeNull();
  });
});
