/**
 * Transaction envelope matrix — enumerates the mandatory fields every
 * auditable transaction must carry. Fails closed if any mandatory field is
 * null. Writes coverage/transaction-envelope-matrix.json.
 */
import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import { buildTestBed } from "../../../common/testing/test-bed";
import { TransactionEnvelopeBuilder } from "./transaction-envelope";

const MANDATORY_FIELDS = [
  "globalUserId", "tenantId", "countryCode",
  "timestamp", "correlationId", "requestId", "action", "resourceType",
] as const;

describe("Transaction envelope — fail-closed mandatory fields", () => {
  let bed: any;
  beforeAll(async () => { bed = await buildTestBed(); });

  it("envelope builder populates mandatory identity/request fields from actor context", async () => {
    await bed.run(async () => {
      const builder = new TransactionEnvelopeBuilder(bed.tenantCtx);
      const env = builder.build({ action: "test.action", resourceType: "test" });
      for (const k of MANDATORY_FIELDS) {
        expect((env as any)[k]).not.toBeNull();
        expect((env as any)[k]).not.toBeUndefined();
      }
      expect(env.resultStatus).toBe("pending");
    });
  });

  it("writes matrix artifact", () => {
    const outDir = path.resolve(__dirname, "..", "..", "..", "..", "coverage");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "transaction-envelope-matrix.json"), JSON.stringify({
      generated: new Date().toISOString(),
      mandatoryFields: MANDATORY_FIELDS,
      optionalFields: ["entityCode", "professionalLicenseNumber", "practitionerId",
        "facilityId", "ward", "department", "room", "servicePoint", "timezone",
        "sessionId", "causationId", "idempotencyKey", "signatureRef",
        "classification", "retentionPolicyId", "legalHold"],
      failClosedWhenMissing: MANDATORY_FIELDS,
    }, null, 2));
  });
});
