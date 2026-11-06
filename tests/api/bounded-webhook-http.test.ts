import { describe, expect, it } from "vitest";
import { baseUrl, serverAvailable } from "../helpers/http";

const available = await serverAvailable();
describe.skipIf(!available)("public webhook byte limits over HTTP", () => {
  for (const kind of ["payments", "communications"]) {
    it(`${kind} refuses an oversized request before ingestion`, async () => {
      const response = await fetch(`${baseUrl()}/api/v1/${kind}/webhook/TEST_PROVIDER`, {
        method: "POST", headers: { "content-type": "application/json" }, body: '"' + 'x'.repeat(256 * 1024) + '"',
      });
      expect(response.status).toBe(413);
      expect(await response.json()).toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE" } });
    });
  }
});
