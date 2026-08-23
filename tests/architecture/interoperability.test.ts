import { describe, expect, it } from "vitest";
import {
  assertInteroperabilityEnvelope,
  rootCorrelation,
} from "@/lib/interoperability/contract";
import { DOMAIN_CODES, domainRegistry } from "@/lib/interoperability/domains";
import { CONNECTIVITY_GRAPH, connectivityNodes } from "@/lib/interoperability/connectivity";
import {
  SERVICE_CONTINUITY,
  simulateContinuityFailure,
} from "@/lib/interoperability/continuity";

describe("one common interoperability contract", () => {
  const valid = {
    messageId: "EVT_12345678",
    messageType: "DOMAIN_EVENT" as const,
    eventType: "TEST_EVENT",
    eventVersion: "1",
    schemaVersion: "1",
    sourceDomain: "GOVERNANCE",
    destinationDomain: "FINANCE",
    operation: "TEST_OPERATION",
    globalUserId: "USR_12345678",
    principalId: "USR_12345678",
    actorType: "HUMAN" as const,
    tenantId: "TEN_12345678",
    legalEntityId: "ENT_12345678",
    traceId: "EVT_TRACE_1234",
    correlationId: "EVT_CORR_1234",
    causationId: null,
    occurredAt: "2026-08-23T00:00:00.000Z",
    classification: "RESTRICTED" as const,
    authorityContext: null,
    policyVersion: null,
    payload: { test: true },
  };

  it("accepts a fully attributed root event", () => {
    expect(() => assertInteroperabilityEnvelope(valid)).not.toThrow();
    expect(rootCorrelation(valid.traceId)).toEqual({ correlationId: valid.traceId, causationId: null });
  });

  it("rejects missing correlation and malformed trace identifiers", () => {
    expect(() => assertInteroperabilityEnvelope({ ...valid, correlationId: "" })).toThrow(/correlationId/);
    expect(() => assertInteroperabilityEnvelope({ ...valid, traceId: "bad" })).toThrow(/traceId/);
  });

  it("rejects unknown classification and non-string authority context", () => {
    expect(() => assertInteroperabilityEnvelope({ ...valid, classification: "UNKNOWN" as never })).toThrow(/classification/);
    expect(() => assertInteroperabilityEnvelope({
      ...valid,
      authorityContext: { authorityId: 42 } as never,
    })).toThrow(/authorityContext/);
  });
});

describe("one domain and connectivity registry", () => {
  it("has one entry per canonical domain code", () => {
    const rows = domainRegistry();
    expect(new Set(rows.map((row) => row.domainCode)).size).toBe(rows.length);
    for (const code of DOMAIN_CODES) expect(rows.some((row) => row.domainCode === code)).toBe(true);
  });

  it("connects existing control-plane seams without creating a second bus", () => {
    const keys = CONNECTIVITY_GRAPH.map((edge) => `${edge.source}->${edge.destination}:${edge.contract}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(connectivityNodes()).toContain("HCM");
    expect(connectivityNodes()).toContain("FINANCE");
    expect(CONNECTIVITY_GRAPH.some((edge) => edge.source === "GOVERNANCE" && edge.destination === "AUTHORITY")).toBe(true);
    expect(CONNECTIVITY_GRAPH.some((edge) => edge.source === "HCM" && edge.destination === "FINANCE")).toBe(true);
  });
});

describe("continuity is safe simulation, not a second execution engine", () => {
  it("registers no numeric RTO/RPO without authority/data", () => {
    expect(SERVICE_CONTINUITY.every((service) =>
      ["REQUIRES_AUTHORITY", "DATA_NOT_AVAILABLE"].includes(service.rtoClass) &&
      ["REQUIRES_AUTHORITY", "DATA_NOT_AVAILABLE"].includes(service.rpoClass),
    )).toBe(true);
  });

  it.each(["AUTHORITY_UNAVAILABLE", "IDENTITY_UNAVAILABLE", "AUDIT_UNAVAILABLE", "MALFORMED_DEPENDENCY"] as const)(
    "fails closed when %s is unavailable",
    (failure) => {
      const result = simulateContinuityFailure("governance.mutation", failure);
      expect(result.classification).toBe("SIMULATION");
      expect(result.decision).toBe("FAIL_CLOSED");
      expect(result.mutatesProductionState).toBe(false);
    },
  );

  it("keeps duplicate analysis retries non-mutating", () => {
    const result = simulateContinuityFailure("finance.analysis", "DUPLICATE_REQUEST");
    expect(result.classification).toBe("SIMULATION");
    expect(result.mutatesProductionState).toBe(false);
    expect(result.preservesTrace).toBe(true);
  });
});
