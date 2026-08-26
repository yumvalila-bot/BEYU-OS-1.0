/**
 * Phase 3A event contracts — integrity and purity tests.
 * Pure; no database; no emission.
 */
import { describe, expect, it } from "vitest";
// Type-only import: audit.ts pulls the DB client at module scope, so the
// type must not be a runtime import (this suite is pure by design).
import type { EventInput } from "../../../src/lib/audit";
import {
  FAMILY_EVENT_TYPES,
  FAMILY_METRIC_NAMES,
  UNGATED_FAMILY_EVENT_TYPES,
  buildPolicyGateDeniedEvent,
  isFamilyEventType,
  isUngatedFamilyEventType,
  summariseDenials,
} from "../../../src/lib/family/phase3/events";
import { FC1_CONSEQUENCES } from "../../../src/lib/family/phase3/fail-closed";

describe("the family event catalogue", () => {
  it("has the 28 spec §28.2 event names, unique", () => {
    expect(FAMILY_EVENT_TYPES).toHaveLength(28);
    expect(new Set(FAMILY_EVENT_TYPES).size).toBe(28);
    for (const name of FAMILY_EVENT_TYPES) expect(isFamilyEventType(name)).toBe(true);
    expect(isFamilyEventType("FAMILY_MADE_UP_EVENT")).toBe(false);
  });

  it("has exactly ONE ungated event: the fail-closed denial record (KDD-7)", () => {
    expect(UNGATED_FAMILY_EVENT_TYPES).toEqual(["FAMILY_POLICY_GATE_DENIED"]);
    for (const name of FAMILY_EVENT_TYPES) {
      if (name === "FAMILY_POLICY_GATE_DENIED") {
        expect(isUngatedFamilyEventType(name)).toBe(true);
      } else {
        expect(isUngatedFamilyEventType(name), name).toBe(false);
      }
    }
  });

  it("declares only metric names (no telemetry store)", () => {
    expect(FAMILY_METRIC_NAMES.length).toBeGreaterThanOrEqual(4);
    for (const name of FAMILY_METRIC_NAMES) expect(name.startsWith("family.")).toBe(true);
  });
});

describe("buildPolicyGateDeniedEvent", () => {
  const input = {
    operation: "member-verification",
    objectType: "family_member",
    objectId: "FM_T_001",
    actorType: "HUMAN" as const,
    actorUserId: "USR_T_001",
    firRefs: ["FIR-004", "FIR-020"] as const,
    traceId: "trace-0001",
    correlationId: "corr-0001",
    tenantId: "TEN_TEST",
  };

  it("produces a canonical EventInput-shaped denial event", () => {
    const event = buildPolicyGateDeniedEvent(input);
    expect(event.type).toBe("FAMILY_POLICY_GATE_DENIED");
    expect(event.source).toBe("family-institution");
    expect(event.domain).toBe("family");
    expect(event.operation).toBe("member-verification");
    expect(event.destinationDomain).toBeNull();
    expect(event.tenantId).toBe("TEN_TEST");
    expect(event.subjectType).toBe("family_member");
    expect(event.subjectId).toBe("FM_T_001");
    expect(event.actorType).toBe("HUMAN");
    expect(event.traceId).toBe("trace-0001");
    expect(event.correlationId).toBe("corr-0001");
    expect(event.causationId).toBeNull();
    // A policy-gated denial has no ratified authority to cite and no ratified
    // policy version — both null by construction.
    expect(event.authorityContext).toBeNull();
    expect(event.policyVersion).toBeNull();
    expect(event.payload).toEqual({
      code: "POLICY_DECISION_REQUIRED",
      firRefs: ["FIR-004", "FIR-020"],
      consequences: FC1_CONSEQUENCES,
    });
  });

  it("defaults optional refs to null without inventing values", () => {
    const event = buildPolicyGateDeniedEvent({
      operation: "op",
      objectType: "obj",
      objectId: "o1",
      actorType: "HUMAN",
      actorUserId: null,
      firRefs: ["FIR-001"],
      traceId: "t",
      correlationId: "c",
    });
    expect(event.tenantId).toBeNull();
    expect(event.legalEntityId).toBeNull();
    expect(event.actorUserId).toBeNull();
  });

  it("is deterministic", () => {
    expect(buildPolicyGateDeniedEvent(input)).toEqual(buildPolicyGateDeniedEvent(input));
  });
});

describe("summariseDenials (observability contract)", () => {
  it("counts denials by FIR and operation, ignoring non-denial events", () => {
    const otherEvent: EventInput = {
      type: "SOME_OTHER_EVENT",
      source: "x",
      domain: "family",
      operation: "ignored",
      destinationDomain: null,
      tenantId: null,
      legalEntityId: null,
      subjectType: "s",
      subjectId: "i",
      classification: "INTERNAL",
      traceId: "t4",
      correlationId: "c4",
      causationId: null,
      authorityContext: null,
      policyVersion: null,
    };
    const events = [
      buildPolicyGateDeniedEvent({
        operation: "member-verification",
        objectType: "family_member",
        objectId: "FM_1",
        actorType: "HUMAN",
        actorUserId: null,
        firRefs: ["FIR-004"],
        traceId: "t1",
        correlationId: "c1",
      }),
      buildPolicyGateDeniedEvent({
        operation: "member-verification",
        objectType: "family_member",
        objectId: "FM_2",
        actorType: "HUMAN",
        actorUserId: null,
        firRefs: ["FIR-004", "FIR-020"],
        traceId: "t2",
        correlationId: "c2",
      }),
      buildPolicyGateDeniedEvent({
        operation: "capital-submit",
        objectType: "family_capital_instruction",
        objectId: "FCI_1",
        actorType: "HUMAN",
        actorUserId: null,
        firRefs: ["FIR-012"],
        traceId: "t3",
        correlationId: "c3",
      }),
      otherEvent,
    ];
    const summary = summariseDenials(events);
    expect(summary.total).toBe(3);
    expect(summary.byFir).toEqual({ "FIR-004": 2, "FIR-020": 1, "FIR-012": 1 });
    expect(summary.byOperation).toEqual({ "member-verification": 2, "capital-submit": 1 });
  });

  it("is deterministic and pure", () => {
    const events = [
      buildPolicyGateDeniedEvent({
        operation: "op",
        objectType: "o",
        objectId: "i",
        actorType: "HUMAN",
        actorUserId: null,
        firRefs: ["FIR-014"],
        traceId: "t",
        correlationId: "c",
      }),
    ];
    expect(summariseDenials(events)).toEqual(summariseDenials(events));
  });
});
