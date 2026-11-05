import { describe, expect, it } from "vitest";
import { baseUrl, serverAvailable } from "../helpers/http";

const available = await serverAvailable();
const endpoints = ["/api/v1/auth/login", "/api/v1/auth/mobile/login", "/api/v1/auth/recovery/request", "/api/v1/auth/bootstrap/begin", "/api/v1/auth/bootstrap/verify-mfa"];

describe.skipIf(!available)("credential boundary over production HTTP", () => {
  for (const path of endpoints) {
    it(`${path} refuses oversized, malformed and wrong-type requests without echoing data`, async () => {
      for (const [body, contentType, expected] of [
        ['{"password":"' + 'x'.repeat(17_000) + '"}', "application/json", 413],
        ['{"password":', "application/json", 400],
        ['private-payload', "text/plain", 415],
      ] as const) {
        const response = await fetch(`${baseUrl()}${path}`, { method: "POST", headers: { "content-type": contentType }, body });
        expect(response.status).toBe(expected);
        expect(await response.text()).not.toContain("private-payload");
      }
    });
  }
});
