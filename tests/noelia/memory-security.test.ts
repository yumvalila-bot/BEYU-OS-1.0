import { describe, expect, it } from "vitest";
import { decideMemoryVisibility, type MemoryVisibilityRecord } from "../../src/lib/noelia/memory";
import type { NoeliaAuthorizedScope } from "../../src/lib/noelia/types";
import { principal } from "./fixtures";

const AS_OF = "2026-08-23";
const record: MemoryVisibilityRecord = {
  scopeType: "TENANT",
  tenantId: "TEN_A",
  legalEntityId: null,
  countryCode: null,
  classification: "CONFIDENTIAL",
  authorityStatus: "AUTHORITATIVE",
  effectiveFrom: "2026-01-01",
  reviewDate: "2027-01-01",
  expiresAt: null,
};
const sectorScope: NoeliaAuthorizedScope = {
  tenantIds: ["TEN_A"],
  legalEntityIds: ["LEN_A"],
  countryCodes: ["TZ"],
  entities: [{ id: "LEN_A", tenantId: "TEN_A", countryCode: "TZ" }],
  tenantCountries: [{ tenantId: "TEN_A", countryCode: "TZ" }],
  enterprise: false,
};
const enterpriseScope: NoeliaAuthorizedScope = {
  tenantIds: ["TEN_A", "TEN_CHILD"],
  legalEntityIds: ["LEN_A", "LEN_CHILD"],
  countryCodes: ["TZ", "KE"],
  entities: [
    { id: "LEN_A", tenantId: "TEN_A", countryCode: "TZ" },
    { id: "LEN_CHILD", tenantId: "TEN_CHILD", countryCode: "KE" },
  ],
  tenantCountries: [
    { tenantId: "TEN_A", countryCode: "TZ" },
    { tenantId: "TEN_CHILD", countryCode: "KE" },
  ],
  enterprise: true,
};

function decision(overrides: Partial<MemoryVisibilityRecord>, scope = sectorScope) {
  return decideMemoryVisibility(principal(), scope, { ...record, ...overrides }, AS_OF);
}

describe("Noelia memory/RAG authorization", () => {
  it("DENY: Tenant A cannot read Tenant B memory", () => {
    expect(decision({ tenantId: "TEN_B" })).toMatchObject({ allowed: false, code: "TENANT_DENIED" });
  });

  it("ALLOW: authorized tenant memory remains readable", () => {
    expect(decision({})).toMatchObject({ allowed: true, code: "ALLOWED" });
  });

  it("ALLOW: canonical global memory is readable within clearance", () => {
    expect(decision({ scopeType: "GLOBAL", tenantId: null })).toMatchObject({ allowed: true, code: "ALLOWED" });
  });

  it("ALLOW: an enterprise principal can read enterprise memory in its explicit subtree", () => {
    expect(decision({ scopeType: "ENTERPRISE", tenantId: "TEN_A" }, enterpriseScope))
      .toMatchObject({ allowed: true, code: "ALLOWED" });
  });

  it("DENY: enterprise memory is not accidentally global to a sector principal", () => {
    expect(decision({ scopeType: "ENTERPRISE", tenantId: "TEN_A" }))
      .toMatchObject({ allowed: false, code: "ENTERPRISE_DENIED" });
  });

  it("DENY: an enterprise principal cannot cross into an unrelated enterprise", () => {
    expect(decision({ scopeType: "ENTERPRISE", tenantId: "TEN_B" }, enterpriseScope))
      .toMatchObject({ allowed: false, code: "ENTERPRISE_DENIED" });
  });

  it("ALLOW: authorized entity memory is readable", () => {
    expect(decision({ scopeType: "ENTITY", tenantId: "TEN_A", legalEntityId: "LEN_A" }))
      .toMatchObject({ allowed: true, code: "ALLOWED" });
  });

  it("DENY: unauthorized entity memory is withheld", () => {
    expect(decision({ scopeType: "ENTITY", tenantId: "TEN_A", legalEntityId: "LEN_B" }))
      .toMatchObject({ allowed: false, code: "ENTITY_DENIED" });
  });

  it("ALLOW: authorized country memory is readable", () => {
    expect(decision({ scopeType: "COUNTRY", tenantId: "TEN_A", countryCode: "TZ" }))
      .toMatchObject({ allowed: true, code: "ALLOWED" });
  });

  it("DENY: unauthorized country memory is withheld", () => {
    expect(decision({ scopeType: "COUNTRY", tenantId: "TEN_A", countryCode: "KE" }))
      .toMatchObject({ allowed: false, code: "COUNTRY_DENIED" });
  });

  it("DENY: data above the principal's classification ceiling", () => {
    expect(decision({ classification: "HIGHLY_RESTRICTED" }))
      .toMatchObject({ allowed: false, code: "CLASSIFICATION_DENIED" });
  });

  it("DENY: unknown principal clearance fails closed", () => {
    const result = decideMemoryVisibility(
      principal({ clearance: "NOT_A_CLEARANCE" as "PUBLIC" }),
      sectorScope,
      record,
      AS_OF,
    );
    expect(result).toMatchObject({ allowed: false, code: "CLASSIFICATION_DENIED" });
  });

  it("DENY: unknown source classification fails closed", () => {
    expect(decision({ classification: "MYSTERY" })).toMatchObject({ allowed: false, code: "CLASSIFICATION_DENIED" });
  });

  it("DENY: non-authoritative memory", () => {
    expect(decision({ authorityStatus: "UNDER_REVIEW" })).toMatchObject({ allowed: false, code: "AUTHORITY_DENIED" });
  });

  it("DENY: expired, future or overdue-review memory", () => {
    expect(decision({ effectiveFrom: "2027-01-01" }).code).toBe("WINDOW_DENIED");
    expect(decision({ reviewDate: "2026-01-01" }).code).toBe("WINDOW_DENIED");
    expect(decision({ expiresAt: "2026-01-01" }).code).toBe("WINDOW_DENIED");
  });

  it("DENY: unknown scope type fails closed", () => {
    expect(decision({ scopeType: "UNBOUNDED" })).toMatchObject({ allowed: false, code: "SCOPE_UNKNOWN" });
  });
});
